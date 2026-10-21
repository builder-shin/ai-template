import { copyFileSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { mergeFrontendLocks, verifyAppResolutions, verifyFrontendResolutions } from "./lockfile.ts";
import {
  apiProxyWorkspace,
  apiProxyLock,
  configureApiProxy,
  installApiBoundary,
  verifyApiBoundary,
} from "./nestjs-api-workspace.ts";
import { mergeWorkspace } from "./workspace.ts";
import { renameStandalone } from "./standalone.ts";
import type { PnpmRunner } from "./pnpm.ts";
import { writeHarness } from "./harness.ts";
import { CreateError } from "./errors.ts";
import type { Template } from "./arguments.ts";
import { writeFrontendConfiguration } from "./frontend-config.ts";
import { trackedContents } from "./repository.ts";
import { BACKENDS, backendOf } from "./backends.ts";
import { applyAssetEdits, NESTJS_ASSET_EDITS } from "./asset-edits.ts";
import { parse, stringify } from "yaml";
import type { WorkspaceDocument } from "./workspace.ts";

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
  readonly template: Exclude<Template, "fastapi" | "nestjs">;
}

export function writeCombo(
  root: string,
  name: string,
  inputs: ComboInput[],
  pnpm: PnpmRunner,
  frontends: readonly ComboFrontend[],
): void {
  const api = join(root, "apps/api");
  const backend = backendOf(api),
    descriptor = BACKENDS[backend];
  const apiLock = descriptor.ownsPackageJson
    ? readFileSync(join(api, "pnpm-lock.yaml"), "utf8")
    : undefined;
  const apiWorkspaceSource = descriptor.ownsPackageJson
    ? readFileSync(join(api, "pnpm-workspace.yaml"), "utf8")
    : undefined;
  const apiWorkspace = apiWorkspaceSource
    ? (parse(apiWorkspaceSource) as WorkspaceDocument)
    : undefined;
  const first = frontends[0];
  if (!first) throw new CreateError("조합 프론트 앱이 없다", "프론트 앱을 하나 이상 지정한다.");
  const frontend = join(root, "apps", first.name);
  renameStandalone(api, backend, name, `${name}-api`);
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
  json(
    join(api, "package.json"),
    descriptor.ownsPackageJson
      ? {
          ...(JSON.parse(readFileSync(join(api, "package.json"), "utf8")) as Record<
            string,
            unknown
          >),
          name: "api",
        }
      : {
          name: "api",
          private: true,
          scripts: Object.fromEntries(
            commands.map((command) => [command, `uv run poe ${command}`]),
          ),
        },
  );
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
  const hasWeb = frontends.some(({ name: app }) => app === "web");
  const hasAdmin = frontends.some(({ name: app }) => app === "admin");
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
    FRONTEND_E2E_PORTS: frontends
      .map(({ name: app }) => `${app} ${app === "admin" ? "3101" : "3100"}`)
      .join(", "),
    FRONTEND_APP_ORIGINS: frontends
      .map(
        ({ name: app }) => `${app} 예: \`http://127.0.0.1:${app === "admin" ? "3201" : "3200"}\``,
      )
      .join(", "),
    FRONTEND_CHECK_NOTES: hasWeb
      ? " web check는 gen-feature 테스트의 설치 때문에 패키지 레지스트리 접속이 필요하다."
      : "",
    FRONTEND_E2E_FLOW: [
      `gen은 api 뒤에 각 프론트를 차례로 실행한다. E2E는 api 뒤에 ${frontends
        .map(({ name: app }) => app)
        .sort()
        .join(", ")} 순서로 실행하며 첫 실패에서 멈춘다.`,
      ...(frontends.length > 1
        ? ["두 프론트는 같은 루트 계약 생성물을 같은 바이트로 만든다."]
        : []),
      ...(hasAdmin ? ["admin은 E2E_SEED_ADMIN_EMAIL·E2E_SEED_ADMIN_PASSWORD를 요구한다."] : []),
      ...(hasWeb ? ["web은 E2E_OAUTH_URL을 요구한다."] : []),
    ].join(" "),
    FRONTEND_HEALTHCHECK: hasAdmin
      ? "admin은 로그인 화면으로 이동한다. healthcheck는 이동을 따라가며 200 또는 303을 받아들인다."
      : "",
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
    if (path.startsWith("nestjs-only/")) {
      if (backend === "nestjs") {
        const destination = join(root, path.slice("nestjs-only/".length));
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, content);
      }
      continue;
    }
    if (path.startsWith("apps/api/Dockerfile.nestjs")) {
      if (backend === "nestjs") {
        const destination = join(root, path.replace("Dockerfile.nestjs", "Dockerfile"));
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, content);
      }
      continue;
    }
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
  if (backend === "nestjs")
    for (const path of Object.keys(NESTJS_ASSET_EDITS)) {
      const app = /^apps\/([^/]+)\//.exec(path)?.[1];
      if (app && !frontends.some((item) => item.name === app)) continue;
      const destination = join(root, path);
      writeFileSync(destination, applyAssetEdits(path, readFileSync(destination, "utf8"), backend));
    }
  if (backend === "nestjs") configureApiProxy(root);
  writeHarness(root, ["api", ...frontends.map((app) => app.name)]);
  const sources = (file: string) =>
    frontends.map((app) => ({
      app: app.name,
      source: readFileSync(join(root, "apps", app.name, file), "utf8"),
    }));
  const frontendWorkspaces = sources("pnpm-workspace.yaml").map(({ app, source }) => {
    const doc = parse(source) as WorkspaceDocument;
    return { ...doc, packages: [`apps/${app}`, ...(doc.packages ?? [])] };
  });
  // 설치 경계는 나누되 기존 정책 충돌은 생성 전에 계속 거절한다.
  if (apiWorkspace) mergeWorkspace({ frontends: frontendWorkspaces, api: apiWorkspace });
  const workspacePath = join(root, "pnpm-workspace.yaml");
  writeFileSync(
    workspacePath,
    apiWorkspace
      ? stringify(
          apiProxyWorkspace(mergeWorkspace({ frontends: frontendWorkspaces, includeApi: false })),
        )
      : mergeWorkspace(sources("pnpm-workspace.yaml"), typescript),
  );
  const locks = sources("pnpm-lock.yaml");
  const frontendLock = mergeFrontendLocks(locks);
  writeFileSync(join(root, "pnpm-lock.yaml"), apiLock ? apiProxyLock(frontendLock) : frontendLock);
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
  const verify = () => {
    verifyAppResolutions(locks, readFileSync(join(root, "pnpm-lock.yaml"), "utf8"), {
      typescriptPin: typescript,
    });
  };
  if (apiLock) verify();
  if (apiLock && apiWorkspaceSource) verifyApiBoundary(root, apiLock, apiWorkspaceSource);
  pnpm(root, ["install", "--frozen-lockfile"]);
  if (apiLock && apiWorkspaceSource) {
    verify();
    installApiBoundary(root, apiLock, apiWorkspaceSource, pnpm);
  }
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
