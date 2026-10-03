import { copyFileSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseDocument } from "yaml";
import { rewriteImporters, verifyWebResolutions } from "./lockfile.ts";
import { renameStandalone } from "./standalone.ts";
import type { PnpmRunner } from "./pnpm.ts";
import { writeHarness } from "./harness.ts";

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

export function writeCombo(
  root: string,
  repository: string,
  name: string,
  assets: string,
  pnpm: PnpmRunner,
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
  writeFileSync(
    env,
    readFileSync(env, "utf8")
      .replace(/^API_BASE_URL=\S+/m, "API_BASE_URL=http://127.0.0.1:8000/api/v1")
      .replace(/^NEXT_PUBLIC_REALTIME_URL=\S+/m, "NEXT_PUBLIC_REALTIME_URL=http://127.0.0.1:8000"),
  );
  const pkg = JSON.parse(readFileSync(join(web, "package.json"), "utf8")) as {
    engines: { node: string };
    devDependencies: { lefthook: string; prettier: string; typescript: string };
  };
  const variables: Record<string, string> = {
    NAME: name,
    NODE: pkg.engines.node,
    LEFTHOOK: pkg.devDependencies.lefthook,
    PRETTIER: pkg.devDependencies.prettier,
  };
  for (const entry of readdirSync(assets, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const destination = join(root, entry.parentPath.slice(assets.length), entry.name);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      readFileSync(join(entry.parentPath, entry.name), "utf8").replace(
        /\{\{(\w+)\}\}/g,
        (whole: string, key: string) => variables[key] ?? whole,
      ),
    );
  }
  for (const file of [".gitattributes", ".editorconfig"])
    copyFileSync(join(repository, file), join(root, file));
  copyFileSync(join(web, ".prettierrc.json"), join(root, ".prettierrc.json"));
  writeHarness(root);
  const workspace = parseDocument(readFileSync(join(web, "pnpm-workspace.yaml"), "utf8"));
  workspace.set("packages", ["apps/api", "apps/web", "apps/web/contract/*"]);
  // workspace 이동 뒤에도 계약 패키지의 TypeScript peer를 템플릿 버전으로 유지한다.
  workspace.setIn(["overrides", "typescript"], pkg.devDependencies.typescript);
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
