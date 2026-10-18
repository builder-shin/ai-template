import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { CreateError } from "./errors.ts";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

const vocabulary = [
  "setup",
  "dev",
  "check",
  "fix",
  "test",
  "test:e2e",
  "gen",
  "db:migrate",
  "db:reset",
];

export function mergeSettings(apps: Record<string, unknown>) {
  const permissions = Object.entries(apps).map(([app, settings]) => {
    const invalid = () =>
      new CreateError(
        `${app} 앱 권한 설정이 잘못되었다`,
        ".claude/settings.json의 permissions와 allow·deny 문자열 목록을 확인한다.",
      );
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw invalid();
    const value = "permissions" in settings ? settings.permissions : undefined;
    if (value === undefined) return { app, allow: [], deny: [] };
    if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
    const declared = value as Record<string, unknown>;
    const list = (kind: "allow" | "deny"): string[] => {
      const rules = declared[kind];
      if (rules === undefined) return [];
      if (!Array.isArray(rules)) throw invalid();
      const values: unknown[] = rules;
      if (!values.every((rule): rule is string => typeof rule === "string")) throw invalid();
      return values;
    };
    return { app, allow: list("allow"), deny: list("deny") };
  });
  const rules = (kind: "allow" | "deny") =>
    permissions.flatMap(({ app, ...settings }) =>
      settings[kind].flatMap((rule) => {
        // 프론트의 계약 경로는 앱 밖의 루트 계약으로 옮긴다.
        if (app !== "api" && /^(Read|Edit|Write|Glob|Grep)\(\.\/contract\//.test(rule))
          return [rule];
        const moved = rule.replace(/^(Read|Edit|Write|Glob|Grep)\(\.\//, `$1(./apps/${app}/`);
        if (
          app !== "api" &&
          kind === "deny" &&
          /^(Edit|Write)\(\.\/\*\*\/generated\/\*\*\)$/.test(rule)
        )
          return [moved, rule.replace("./**/", "./contract/**/")];
        return [moved];
      }),
    );
  const allow = rules("allow");
  for (const shell of ["Bash", "PowerShell"]) {
    for (const command of vocabulary) allow.push(`${shell}(pnpm ${command} *)`);
    for (const command of ["status", "log", "diff", "show"])
      allow.push(`${shell}(git ${command} *)`);
  }
  const hook = (file: string, timeout: number, matcher?: string) => [
    {
      ...(matcher ? { matcher } : {}),
      hooks: [
        {
          type: "command",
          command: "node",
          args: [`\${CLAUDE_PROJECT_DIR}/.claude/hooks/${file}.mjs`],
          timeout,
        },
      ],
    },
  ];
  return {
    permissions: { allow: [...new Set(allow)], deny: [...new Set(rules("deny"))] },
    hooks: {
      PostToolUse: hook("post-tool-use", 120, "Edit|Write|MultiEdit"),
      Stop: hook("stop-check", 1800),
      // api의 커밋된 마이그레이션 편집 검사도 루트에서 유지한다.
      PreToolUse: hook("pre-tool-use", 90, "Bash|PowerShell|Edit|Write|MultiEdit"),
      SessionStart: hook("session-start", 180),
    },
  };
}

interface Job {
  name: string;
  glob?: string;
  run: string;
  [key: string]: unknown;
}

export function mergeLefthook(apps: Record<string, string>): string {
  const frontend = Object.keys(apps).find((app) => app !== "api");
  if (!frontend)
    throw new CreateError("비밀 검사에 쓸 프론트 앱이 없다", "프론트 앱을 하나 이상 지정한다.");
  const jobs = Object.entries(apps).flatMap(([app, source]) => {
    const config = parse(source) as { "pre-commit": { jobs: Job[] } };
    return config["pre-commit"].jobs
      .filter((job) => job.name !== "secrets")
      .map((job) => ({
        ...job,
        name: `${app}-${job.name}`,
        root: `apps/${app}/`,
        ...(job.glob ? { glob: `apps/${app}/${job.glob}` } : {}),
      }));
  });
  return stringify({
    "pre-commit": {
      jobs: [
        ...jobs,
        { name: "root-format", run: "node scripts/staged-format.mjs" },
        {
          name: "secrets",
          run: `pnpm --filter ${frontend} run -s tool betterleaks git ../.. --pre-commit --staged --no-banner --redact --config ../../.betterleaks.toml`,
        },
      ],
    },
    "pre-push": { jobs: [{ name: "check", run: "pnpm check" }] },
  });
}

export function mergeBetterleaks(apps: Record<string, string>): string {
  const paths = Object.entries(apps).flatMap(([app, source]) => {
    const config = parseToml(source) as { prefilter?: string; allowlists?: { paths: string[] }[] };
    const patterns = [
      ...[...(config.prefilter ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? ""),
      ...(config.allowlists ?? []).flatMap((list) => list.paths),
    ];
    return patterns.map((pattern) => {
      if (app !== "api" && pattern.startsWith("^contract/")) return pattern;
      // 루트 앵커와 경로 경계를 앱의 상대 경로 기준으로 옮긴다.
      const local = pattern.replace(/^\^/, "").replace(/\(\^\|\/\)/g, "(?:|.*/)");
      const anchored = pattern.startsWith("^") || pattern.startsWith("(^|/)");
      return `^apps/${app}/${anchored ? "" : ".*"}(?:${local})`;
    });
  });
  return (
    "# 앱의 생성물과 루트 계약 예외만 합친다. 나머지 수기 코드는 계속 검사한다.\n" +
    stringifyToml({ extend: { useDefault: true }, allowlists: [{ paths: [...new Set(paths)] }] })
  );
}

export function mergeMcp(apps: Record<string, string>) {
  const servers = new Map<string, unknown>();
  for (const source of Object.values(apps)) {
    const config = JSON.parse(source) as { mcpServers?: Record<string, unknown> };
    for (const [name, settings] of Object.entries(config.mcpServers ?? {})) {
      if (servers.has(name) && !isDeepStrictEqual(servers.get(name), settings))
        throw new CreateError(
          `MCP 서버 설정이 다르다: ${name}`,
          "앱의 같은 이름 서버 설정을 맞추고 다시 생성한다.",
        );
      servers.set(name, settings);
    }
  }
  return { mcpServers: Object.fromEntries(servers) };
}

export function writeHarness(root: string, apps: readonly string[]): void {
  const sources = (file: string) =>
    Object.fromEntries(
      apps.map((app) => [app, readFileSync(join(root, `apps/${app}`, file), "utf8")]),
    );
  mkdirSync(join(root, ".claude"), { recursive: true });
  const settings = Object.fromEntries(
    Object.entries(sources(".claude/settings.json")).map(([app, source]) => [
      app,
      JSON.parse(source) as unknown,
    ]),
  );
  writeFileSync(
    join(root, ".claude/settings.json"),
    JSON.stringify(mergeSettings(settings), null, 2) + "\n",
  );
  writeFileSync(join(root, "lefthook.yml"), mergeLefthook(sources("lefthook.yml")));
  writeFileSync(join(root, ".betterleaks.toml"), mergeBetterleaks(sources(".betterleaks.toml")));
  // MCP 설정이 있는 앱의 서버를 이름으로 합친다.
  writeFileSync(
    join(root, ".mcp.json"),
    JSON.stringify(
      mergeMcp(
        Object.fromEntries(
          apps
            .filter((app) => existsSync(join(root, `apps/${app}/.mcp.json`)))
            .map((app) => [app, readFileSync(join(root, `apps/${app}/.mcp.json`), "utf8")]),
        ),
      ),
      null,
      2,
    ) + "\n",
  );
}
