import { copyFileSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseDocument } from "yaml";
import { rewriteImporters, verifyWebResolutions } from "./lockfile.ts";
import { renameStandalone } from "./standalone.ts";
import type { PnpmRunner } from "./pnpm.ts";
import { writeHarness } from "./harness.ts";
import { CreateError } from "./errors.ts";
import { trackedContents } from "./repository.ts";

export interface ComboTools {
  readonly assets?: string;
  readonly pnpm?: PnpmRunner;
  readonly interrupted?: () => boolean;
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

export function writeCombo(
  root: string,
  name: string,
  inputs: ComboInput[],
  pnpm: PnpmRunner,
  checkInterrupted: () => void = () => undefined,
): void {
  const api = join(root, "apps/api");
  const web = join(root, "apps/web");
  renameStandalone(api, "fastapi", name, `${name}-api`);
  renameStandalone(web, "nextjs", "web");
  for (const [folder, app] of [
    [api, "api"],
    [web, "web"],
  ] as const) {
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
  writeFileSync(join(web, "gen.config.json"), '{ "openapi": "../api/openapi.json" }\n');
  const env = join(web, ".env.example");
  let example = readFileSync(env, "utf8");
  for (const [key, value] of Object.entries({
    API_BASE_URL: "http://127.0.0.1:8000/api/v1",
    NEXT_PUBLIC_REALTIME_URL: "http://127.0.0.1:8000",
  })) {
    const pattern = new RegExp(`^${key}=[^\\s#]+`, "m");
    if (!pattern.test(example))
      throw new CreateError(
        `${key}의 기본값이 없다`,
        "web .env.example에 키와 기본값을 넣고 커밋한다.",
      );
    example = example.replace(pattern, `${key}=${value}`);
  }
  writeFileSync(env, example);
  const pkg = JSON.parse(readFileSync(join(web, "package.json"), "utf8")) as {
    engines?: { node?: string };
    devDependencies?: { lefthook?: string; prettier?: string; typescript?: string };
  };
  const required = (value: string | undefined, key: string): string => {
    if (typeof value !== "string" || !value.trim())
      throw new CreateError(
        `web package.json에 ${key} 값이 없다`,
        "web package.json의 엔진·도구 버전을 채우고 커밋한다.",
      );
    return value;
  };
  const typescript = required(pkg.devDependencies?.typescript, "devDependencies.typescript");
  const variables: Record<string, string> = {
    NAME: name,
    NODE: required(pkg.engines?.node, "engines.node"),
    LEFTHOOK: required(pkg.devDependencies?.lefthook, "devDependencies.lefthook"),
    PRETTIER: required(pkg.devDependencies?.prettier, "devDependencies.prettier"),
  };
  for (const { path, content } of inputs) {
    checkInterrupted();
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      content.replace(/\{\{(\w+)\}\}/g, (whole: string, key: string) => variables[key] ?? whole),
    );
  }
  copyFileSync(join(web, ".prettierrc.json"), join(root, ".prettierrc.json"));
  writeHarness(root);
  const workspace = parseDocument(readFileSync(join(web, "pnpm-workspace.yaml"), "utf8"));
  workspace.set("packages", ["apps/api", "apps/web", "apps/web/contract/*"]);
  // workspace 이동 뒤에도 계약 패키지의 TypeScript peer를 템플릿 버전으로 유지한다.
  workspace.setIn(["overrides", "typescript"], typescript);
  writeFileSync(join(root, "pnpm-workspace.yaml"), workspace.toString());
  const lock = readFileSync(join(web, "pnpm-lock.yaml"), "utf8");
  writeFileSync(join(root, "pnpm-lock.yaml"), rewriteImporters(lock));
  for (const file of ["pnpm-lock.yaml", "pnpm-workspace.yaml"]) rmSync(join(web, file));
  pnpm(root, ["install", "--lockfile-only"]);
  verifyWebResolutions(lock, readFileSync(join(root, "pnpm-lock.yaml"), "utf8"));
  pnpm(root, ["install", "--frozen-lockfile"]);
  pnpm(root, ["exec", "prettier", "--write", ".claude/settings.json", "lefthook.yml", ".mcp.json"]);
  pnpm(root, ["--filter", "web", "run", "gen"]);
}
