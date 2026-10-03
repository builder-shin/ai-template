import { readFileSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

interface AppSettings {
  permissions: { allow: string[]; deny: string[] };
}

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

export function mergeSettings(api: AppSettings, web: AppSettings) {
  const rules = (kind: "allow" | "deny") =>
    [api, web].flatMap((settings, index) =>
      settings.permissions[kind].map((rule) =>
        rule.replace(
          /^(Read|Edit|Write|Glob|Grep)\(\.\//,
          `$1(./apps/${index === 0 ? "api" : "web"}/`,
        ),
      ),
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

export function mergeLefthook(api: string, web: string): string {
  const jobs = [api, web].flatMap((source, index) => {
    const app = index === 0 ? "api" : "web";
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
          run: "pnpm --filter web run -s tool betterleaks git ../.. --pre-commit --staged --no-banner --redact --config ../../.betterleaks.toml",
        },
      ],
    },
    "pre-push": { jobs: [{ name: "check", run: "pnpm check" }] },
  });
}

export function mergeBetterleaks(api: string, web: string): string {
  const paths = [api, web].flatMap((source, index) => {
    const app = index === 0 ? "api" : "web";
    const config = parseToml(source) as { prefilter?: string; allowlists?: { paths: string[] }[] };
    const patterns = [
      ...[...(config.prefilter ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? ""),
      ...(config.allowlists ?? []).flatMap((list) => list.paths),
    ];
    return patterns.map((pattern) => {
      // 루트 앵커와 경로 경계를 앱의 상대 경로 기준으로 옮긴다.
      const local = pattern.replace(/^\^/, "").replace(/\(\^\|\/\)/g, "(?:|.*/)");
      return `^apps/${app}/${pattern.startsWith("^") ? "" : ".*"}(?:${local})`;
    });
  });
  return (
    "# 앱의 생성물 예외만 합친다. 루트와 수기 코드는 계속 검사한다.\n" +
    stringifyToml({ extend: { useDefault: true }, allowlists: [{ paths: [...new Set(paths)] }] })
  );
}

export function writeHarness(root: string): void {
  const source = (app: string, file: string) =>
    readFileSync(join(root, `apps/${app}`, file), "utf8");
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(
    join(root, ".claude/settings.json"),
    JSON.stringify(
      mergeSettings(
        JSON.parse(source("api", ".claude/settings.json")) as AppSettings,
        JSON.parse(source("web", ".claude/settings.json")) as AppSettings,
      ),
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(root, "lefthook.yml"),
    mergeLefthook(source("api", "lefthook.yml"), source("web", "lefthook.yml")),
  );
  writeFileSync(
    join(root, ".betterleaks.toml"),
    mergeBetterleaks(source("api", ".betterleaks.toml"), source("web", ".betterleaks.toml")),
  );
  copyFileSync(join(root, "apps/web/.mcp.json"), join(root, ".mcp.json"));
}
