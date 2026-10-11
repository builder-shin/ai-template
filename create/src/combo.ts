import { copyFileSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { mergeFrontendLocks, verifyFrontendResolutions } from "./lockfile.ts";
import { mergeWorkspace } from "./workspace.ts";
import { renameStandalone } from "./standalone.ts";
import type { PnpmRunner } from "./pnpm.ts";
import { writeHarness } from "./harness.ts";
import { CreateError } from "./errors.ts";
import type { Template } from "./arguments.ts";
import { writeFrontendConfiguration } from "./frontend-config.ts";
import { trackedContents } from "./repository.ts";

export interface ComboTools {
  readonly assets?: string;
  readonly pnpm?: PnpmRunner;
}

const commands = [
  "setup",
  "dev",
  "check",
  "fix",
  "test",
  "test:e2e",
  "gen",
  "db:migrate",
  "db:reset",
  "e2e:serve",
];

export interface ComboInput {
  readonly path: string;
  readonly content: string;
}

export function readComboInputs(repository: string, assets: string): ComboInput[] {
  const assetPath = resolve(assets);
  const prefix = relative(repository, assetPath).split(sep).join("/");
  if (isAbsolute(prefix) || prefix === ".." || prefix.startsWith("../"))
    throw new CreateError("조합 자산이 저장소 밖에 있다", "저장소 안의 추적 자산 경로를 지정한다.");
  const inputs = trackedContents(repository, [prefix, ".gitattributes", ".editorconfig"]);
  for (const file of [".gitattributes", ".editorconfig"])
    if (!inputs.some((input) => input.path === file))
      throw new CreateError(`${file}의 추적 원본이 없다`, "루트 설정을 커밋하고 다시 실행한다.");
  return inputs.map(({ path, content }) => ({
    path: path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : path,
    content,
  }));
}

export interface ComboFrontend {
  readonly name: string;
  readonly template: Exclude<Template, "fastapi">;
}

export function writeCombo(
  root: string,
  name: string,
  inputs: ComboInput[],
  pnpm: PnpmRunner,
  frontends: readonly ComboFrontend[],
): void {
  const api = join(root, "apps/api");
  const first = frontends[0];
  if (!first) throw new CreateError("조합 프론트 앱이 없다", "프론트 앱을 하나 이상 지정한다.");
  const frontend = join(root, "apps", first.name);
  renameStandalone(api, "fastapi", name, `${name}-api`);
  for (const app of frontends)
    renameStandalone(join(root, "apps", app.name), app.template, app.name);
  for (const app of ["api", ...frontends.map((item) => item.name)]) {
    const folder = join(root, "apps", app);
    const path = join(folder, "README.md");
    writeFileSync(path, readFileSync(path, "utf8").replace(/^[^\r\n]*/, `# ${name} ${app}`));
    rmSync(join(folder, ".github"), { recursive: true, force: true });
  }
  const json = (path: string, value: unknown) => {
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  };
  json(join(api, "package.json"), {
    name: "api",
    private: true,
    scripts: Object.fromEntries(commands.map((command) => [command, `uv run poe ${command}`])),
  });
  for (const app of frontends) {
    const folder = join(root, "apps", app.name);
    writeFileSync(
      join(folder, "gen.config.json"),
      '{ "openapi": "../api/openapi.json", "contract": "../../contract" }\n',
    );
    const env = join(folder, ".env.example");
    let example = readFileSync(env, "utf8");
    for (const [key, value] of Object.entries({
      API_BASE_URL: "http://127.0.0.1:8000/api/v1",
      NEXT_PUBLIC_REALTIME_URL: "http://127.0.0.1:8000",
    })) {
      const pattern = new RegExp(`^${key}=[^\\s#]+`, "m");
      if (!pattern.test(example))
        throw new CreateError(
          `기본값이 없다: ${key}`,
          `${app.name} .env.example에 키와 기본값을 넣고 커밋한다.`,
        );
      example = example.replace(pattern, `${key}=${value}`);
    }
    writeFileSync(env, example);
  }
  const pkg = JSON.parse(readFileSync(join(frontend, "package.json"), "utf8")) as {
    engines?: { node?: string };
    devDependencies?: Record<string, string>;
  };
  const required = (value: string | undefined, key: string): string => {
    if (typeof value !== "string" || !value.trim())
      throw new CreateError(
        `${first.name} package.json에 ${key} 값이 없다`,
        `${first.name} package.json의 엔진·도구 버전을 채우고 커밋한다.`,
      );
    return value;
  };
  const typescript = required(pkg.devDependencies?.typescript, "devDependencies.typescript");
  const variables: Record<string, string> = {
    NAME: name,
    NODE: required(pkg.engines?.node, "engines.node"),
    LEFTHOOK: required(pkg.devDependencies?.lefthook, "devDependencies.lefthook"),
    PRETTIER: required(pkg.devDependencies?.prettier, "devDependencies.prettier"),
    NODE_TYPES: required(pkg.devDependencies?.["@types/node"], "devDependencies.@types/node"),
    VITEST: required(pkg.devDependencies?.vitest, "devDependencies.vitest"),
    YAML: required(pkg.devDependencies?.yaml, "devDependencies.yaml"),
    FRONTEND_ROWS: frontends
      .map(({ name: app }) => `| apps/${app}/ | Next.js ${app} BFF, 화면·HTTP 통합·E2E |`)
      .join("\n"),
    FRONTEND_GUIDES: frontends
      .map(({ name: app }) => `[${app} 지침](apps/${app}/AGENTS.md)`)
      .join("·"),
    FRONTEND_PATHS: frontends.map(({ name: app }) => `\`apps/${app}/\``).join(", "),
    FRONTEND_URLS: frontends
      .map(({ name: app }) => `${app} http://localhost:${app === "admin" ? "3001" : "3000"}`)
      .join(", "),
    FRONTEND_PORT_ROWS: frontends
      .map(
        ({ name: app }) =>
          `| ${app} dev·목, E2E·목 | ${app === "admin" ? "3001·4011, 3101·4111" : "3000·4010, 3100·4110"} |`,
      )
      .join("\n"),
    FRONTEND_IMAGES: frontends
      .map(({ name: app }) => {
        const port = app === "admin" ? "3001" : "3000";
        const host = app === "admin" ? "3201" : "3200";
        return `\`\`\`sh\nDOCKER_BUILDKIT=1 docker build -f apps/${app}/Dockerfile . --tag ${name}-${app}\ndocker run --rm --publish 127.0.0.1:${host}:${port} \\\n  --env API_BASE_URL --env APP_URL --env NEXT_PUBLIC_REALTIME_URL \\\n  --env TIME_ZONE --env SESSION_SECRET ${name}-${app}\n\`\`\``;
      })
      .join("\n\n"),
  };
  for (const { path, content } of inputs) {
    const app = /^apps\/([^/]+)\//.exec(path)?.[1];
    if (app && app !== "api" && !frontends.some((item) => item.name === app)) continue;
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      content.replace(/\{\{(\w+)\}\}/g, (whole: string, key: string) => variables[key] ?? whole),
    );
  }
  copyFileSync(join(frontend, ".prettierrc.json"), join(root, ".prettierrc.json"));
  writeFrontendConfiguration(
    root,
    frontends.map((app) => app.name),
  );
  writeHarness(root, ["api", ...frontends.map((app) => app.name)]);
  const sources = (file: string) =>
    frontends.map((app) => ({
      app: app.name,
      source: readFileSync(join(root, "apps", app.name, file), "utf8"),
    }));
  writeFileSync(
    join(root, "pnpm-workspace.yaml"),
    mergeWorkspace(sources("pnpm-workspace.yaml"), typescript),
  );
  const locks = sources("pnpm-lock.yaml");
  writeFileSync(join(root, "pnpm-lock.yaml"), mergeFrontendLocks(locks));
  for (const app of frontends)
    for (const file of ["pnpm-lock.yaml", "pnpm-workspace.yaml"])
      rmSync(join(root, "apps", app.name, file));
  pnpm(root, ["install", "--lockfile-only"]);
  for (const lock of locks)
    verifyFrontendResolutions(
      lock.source,
      readFileSync(join(root, "pnpm-lock.yaml"), "utf8"),
      lock.app,
    );
  pnpm(root, ["install", "--frozen-lockfile"]);
  pnpm(root, [
    "exec",
    "prettier",
    "--write",
    ".claude/settings.json",
    "lefthook.yml",
    ".mcp.json",
    "package.json",
    "turbo.json",
    ".github/workflows/ci.yml",
    "AGENTS.md",
    "README.md",
  ]);
  for (const app of frontends) pnpm(root, ["--filter", app.name, "run", "gen"]);
}
