import { copyFileSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  mergeApiLock,
  mergeFrontendLocks,
  verifyAppResolutions,
  verifyFrontendResolutions,
} from "./lockfile.ts";
import { mergeWorkspace } from "./workspace.ts";
import { renameStandalone } from "./standalone.ts";
import type { PnpmRunner } from "./pnpm.ts";
import { writeHarness } from "./harness.ts";
import { CreateError } from "./errors.ts";
import type { Template } from "./arguments.ts";
import { backendOf, backends, type Backend } from "./backends.ts";
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
  readonly template: Exclude<Template, Backend>;
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
  const backend = backendOf(api);
  const descriptor = backends[backend];
  renameStandalone(api, descriptor.template, name, `${name}-api`);
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
  if (descriptor.ownsPackageJson) {
    const packagePath = join(api, "package.json");
    const apiPackage = JSON.parse(readFileSync(packagePath, "utf8")) as Record<string, unknown>;
    apiPackage.name = "api";
    json(packagePath, apiPackage);
  } else
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
    if (
      path.startsWith("apps/api/Dockerfile.nestjs") &&
      descriptor.apiDockerfile !== "root-context"
    )
      continue;
    const destinationPath = path.replace(/^apps\/api\/Dockerfile\.nestjs/, "apps/api/Dockerfile");
    const destination = join(root, destinationPath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      backendAsset(path, content, backend).replace(
        /\{\{(\w+)\}\}/g,
        (whole: string, key: string) => variables[key] ?? whole,
      ),
    );
  }
  copyFileSync(join(frontend, ".prettierrc.json"), join(root, ".prettierrc.json"));
  writeFrontendConfiguration(
    root,
    frontends.map((app) => app.name),
  );
  if (backend === "nestjs") {
    const workflow = join(root, ".github/workflows/ci.yml");
    writeFileSync(
      workflow,
      readFileSync(workflow, "utf8").replace(
        "docker build apps/api",
        "docker build -f apps/api/Dockerfile .",
      ),
    );
  }
  writeHarness(root, ["api", ...frontends.map((app) => app.name)]);
  const sources = (file: string) =>
    frontends.map((app) => ({
      app: app.name,
      source: readFileSync(join(root, "apps", app.name, file), "utf8"),
    }));
  const workspaces = sources("pnpm-workspace.yaml");
  const apiWorkspace = descriptor.ownsPackageJson
    ? { app: "api", source: readFileSync(join(api, "pnpm-workspace.yaml"), "utf8") }
    : undefined;
  const locks = sources("pnpm-lock.yaml");
  const apiLock = descriptor.ownsPackageJson
    ? { app: "api", source: readFileSync(join(api, "pnpm-lock.yaml"), "utf8") }
    : undefined;
  writeFileSync(
    join(root, "pnpm-workspace.yaml"),
    mergeWorkspace(workspaces, typescript, undefined, { includeApi: !descriptor.ownsPackageJson }),
  );
  writeFileSync(join(root, "pnpm-lock.yaml"), mergeFrontendLocks(locks));
  for (const app of [...frontends, ...(descriptor.ownsPackageJson ? [{ name: "api" }] : [])])
    for (const file of ["pnpm-lock.yaml", "pnpm-workspace.yaml"])
      rmSync(join(root, "apps", app.name, file));
  pnpm(root, ["install", "--lockfile-only"]);
  if (apiLock) {
    const resolved = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
    for (const lock of locks) verifyFrontendResolutions(lock.source, resolved, lock.app);
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      mergeWorkspace(workspaces, typescript, apiWorkspace),
    );
    writeFileSync(
      join(root, "pnpm-lock.yaml"),
      mergeApiLock({ app: first.name, source: resolved }, apiLock, typescript),
    );
    locks.push(apiLock);
  }
  for (const lock of locks)
    (descriptor.ownsPackageJson ? verifyAppResolutions : verifyFrontendResolutions)(
      lock.source,
      readFileSync(join(root, "pnpm-lock.yaml"), "utf8"),
      lock.app,
      descriptor.ownsPackageJson ? typescript : undefined,
    );
  pnpm(root, ["install", "--frozen-lockfile"]);
  if (descriptor.ownsPackageJson)
    for (const lock of locks)
      verifyAppResolutions(
        lock.source,
        readFileSync(join(root, "pnpm-lock.yaml"), "utf8"),
        lock.app,
        typescript,
      );
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

function backendAsset(path: string, content: string, backend: Backend): string {
  if (backend === "nestjs") {
    if (path === "scripts/setup.mjs")
      return content.replace(
        'backend !== "nestjs" || tool !== "uv"',
        'backend !== "nestjs" || ' +
          JSON.stringify(backends.nestjs.setupTools).replaceAll(",", ", ") +
          ".includes(tool)",
      );
    if (path === ".github/workflows/ci.yml") {
      content = content.replace(
        / {6}- uses: astral-sh\/setup-uv[^\n]*\n {8}with:\n {10}version: "0\.12\.19"\n {10}working-directory: apps\/api\n/,
        "",
      );
      return content;
    }
    if (["README.md", "AGENTS.md"].includes(path))
      return content
        .replaceAll("FastAPI", "NestJS")
        .replaceAll("Python 잠금 파일", "Node 잠금 파일")
        .replaceAll("pnpm 12.6.0과 uv", "pnpm 12.6.0")
        .replaceAll("Docker·uv·", "Docker·");
    return content;
  }
  // 기존 FastAPI 생성물은 런타임 분기 도입 전의 파일 바이트를 보존한다.
  if (path === "scripts/setup.mjs")
    return content
      .replace('import { existsSync } from "node:fs";\n', "")
      .replace(
        'export function backendOf(apiFolder) {\n  return existsSync(resolve(apiFolder, "pyproject.toml")) ? "fastapi" : "nestjs";\n}\n\n',
        "",
      )
      .replace('    backend = "fastapi",\n', "")
      .replace('.filter(([tool]) => backend !== "nestjs" || tool !== "uv")', "")
      .replace(
        'if (isMain(import.meta.url)) {\n  const root = resolve(import.meta.dirname, "..");\n  const backend = backendOf(resolve(root, "apps/api"));\n  process.exitCode = runnerMain(() => setup(root, { backend }));\n}',
        'if (isMain(import.meta.url))\n  process.exitCode = runnerMain(() => setup(resolve(import.meta.dirname, "..")));',
      );
  if (path === "scripts/frontend-e2e.mjs")
    return content
      .replace('import { backendOf } from "./setup.mjs";\n', "")
      .replace('E2E_TARGET: source.E2E_TARGET ?? "fastapi",', 'E2E_TARGET: "fastapi",')
      .replace(
        '    const root = resolve(import.meta.dirname, "..");\n    process.exitCode = frontendE2e(root, app, {\n      ...process.env,\n      E2E_TARGET: backendOf(resolve(root, "apps/api")),\n    });',
        '    process.exitCode = frontendE2e(resolve(import.meta.dirname, ".."), app);',
      );
  return content;
}
