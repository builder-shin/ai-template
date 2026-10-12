import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { it, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { parse as parseToml } from "smol-toml";
import { parseArguments } from "../src/arguments.ts";
import { createProject } from "../src/create.ts";
import { git, temporaryFolder } from "./helpers.ts";

const source = resolve(import.meta.dirname, "../..");
const requiredInputs = [".claude/settings.json", "lefthook.yml", ".betterleaks.toml"];
interface Settings {
  permissions: { allow: string[]; deny: string[] };
}
interface Job {
  name: string;
  glob?: string;
  root?: string;
  run: string;
  stage_fixed?: boolean;
}
interface Hooks {
  "pre-commit": { jobs: Job[] };
  "pre-push": { jobs: Job[] };
}

// Removing a required tracked API config must break real combo generation here.
// No FastAPI/combo fixture supplies the API files, manifests, locks or permissions.
function trackedFixture(frontends: readonly string[]) {
  const root = temporaryFolder();
  const copied: { path: string; destination: string; mode: string }[] = [];
  for (const prefix of [
    "prototypes/nestjs",
    "create/assets/combo",
    ".gitattributes",
    ".editorconfig",
    ...frontends.map((app) => `templates/${app === "web" ? "nextjs" : "nextjs-admin"}`),
  ]) {
    for (const row of git(source, "ls-files", "--stage", "-z", "--", prefix)
      .split("\0")
      .filter(Boolean)) {
      const tab = row.indexOf("\t");
      const path = row.slice(tab + 1);
      const mode = row.slice(0, 6);
      if (!["100644", "100755"].includes(mode)) throw Error("Unsupported tracked mode");
      const destination = path.replace(/^prototypes\/nestjs\//, "templates/nestjs/");
      const target = join(root, destination);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(join(source, path)));
      if (process.platform !== "win32") chmodSync(target, mode === "100755" ? 0o755 : 0o644);
      copied.push({ path, destination, mode });
    }
  }
  writeFileSync(
    join(root, "templates/nestjs/template.json"),
    JSON.stringify({
      name: "nestjs",
      kind: "backend",
      runner: "pnpm",
      goldenModule: "src/modules/posts",
    }) + "\n",
  );
  git(root, "init", "-b", "main");
  git(root, "add", "-f", "--", "templates", "create", ".gitattributes", ".editorconfig");
  for (const file of copied.filter((file) => file.mode === "100755"))
    git(root, "update-index", "--chmod=+x", "--", file.destination);
  git(root, "commit", "-m", "chore: materialize actual tracked harness inputs");
  for (const file of copied)
    expect(readFileSync(join(root, file.destination))).toEqual(
      readFileSync(join(source, file.path)),
    );
  expect(git(root, "status", "--porcelain")).toBe("");
  return root;
}

it.each([
  { variant: "standalone", frontends: [] },
  { variant: "web", frontends: ["web"] },
  { variant: "admin", frontends: ["admin"] },
  { variant: "both", frontends: ["web", "admin"] },
])("actual tracked NestJS harness survives $variant generation", ({ frontends }) => {
  const root = trackedFixture(frontends);
  const target = join(temporaryFolder(), "harness-result");
  const options = parseArguments(
    [
      target,
      ...(frontends.length
        ? ["--api", "nestjs", ...frontends.map((app) => `--${app}`)]
        : ["--template", "nestjs"]),
      "--name",
      "harness-probe",
    ],
    {},
  );
  if (options === "help") throw Error("Unexpected help");
  const result = createProject(options, root, {
    // This test measures Git/file generation, never a package install or runtime.
    pnpm: () => {
      // Intentionally inert: no installs, generated commands or runtime.
    },
  });
  const api = frontends.length ? join(target, "apps/api") : target;
  for (const file of requiredInputs) {
    expect(readFileSync(join(api, file))).toEqual(
      readFileSync(join(source, "prototypes/nestjs", file)),
    );
    expect(git(root, "ls-files", "--", `templates/nestjs/${file}`).trim()).toBe(
      `templates/nestjs/${file}`,
    );
    expect(
      git(target, "ls-files", "--", frontends.length ? `apps/api/${file}` : file).trim(),
    ).not.toBe("");
  }
  const settings = JSON.parse(readFileSync(join(api, ".claude/settings.json"), "utf8")) as Settings;
  expect(settings.permissions.allow).toContain("Bash(pnpm check *)");
  expect(settings.permissions.allow).toContain("Bash(pnpm build *)");
  expect(settings.permissions.deny).toEqual(
    expect.arrayContaining([
      "Read(./.env)",
      "Read(./**/.env)",
      "Edit(./**/generated/**)",
      "Write(./**/generated/**)",
      "Edit(./openapi.json)",
      "Write(./openapi.json)",
    ]),
  );
  expect(settings.permissions.allow.some((rule) => /uv|python|Bash\(\*\)/.test(rule))).toBe(false);
  const hooks = parseYaml(readFileSync(join(api, "lefthook.yml"), "utf8")) as Hooks;
  expect(hooks["pre-commit"].jobs).toEqual([
    {
      name: "format",
      glob: "*.{ts,js,mjs,json,md,yaml,yml}",
      run: "pnpm exec prettier --write --ignore-unknown {staged_files}",
      stage_fixed: true,
    },
    {
      name: "lint",
      glob: "*.{ts,js,mjs}",
      run: "pnpm exec eslint --no-warn-ignored {staged_files}",
    },
  ]);
  expect(hooks["pre-push"].jobs).toEqual([{ name: "check", run: "pnpm check" }]);
  expect(parseToml(readFileSync(join(api, ".betterleaks.toml"), "utf8"))).toEqual({
    extend: { useDefault: true },
  });
  if (frontends.length) {
    const firstFrontend = frontends[0];
    if (!firstFrontend) throw Error("Missing selected frontend");
    const merged = parseYaml(readFileSync(join(target, "lefthook.yml"), "utf8")) as Hooks;
    expect(merged["pre-commit"].jobs).toEqual(
      expect.arrayContaining([
        {
          ...hooks["pre-commit"].jobs[0],
          name: "api-format",
          root: "apps/api/",
          glob: "apps/api/*.{ts,js,mjs,json,md,yaml,yml}",
        },
        {
          ...hooks["pre-commit"].jobs[1],
          name: "api-lint",
          root: "apps/api/",
          glob: "apps/api/*.{ts,js,mjs}",
        },
        { name: "root-format", run: "node scripts/staged-format.mjs" },
        {
          name: "secrets",
          run: `pnpm --filter ${firstFrontend} run -s tool betterleaks git ../.. --pre-commit --staged --no-banner --redact --config ../../.betterleaks.toml`,
        },
      ]),
    );
    expect(merged["pre-commit"].jobs.filter((job) => job.name === "secrets")).toHaveLength(1);
    expect(merged["pre-push"].jobs).toEqual([{ name: "check", run: "pnpm check" }]);
    const permissions = (
      JSON.parse(readFileSync(join(target, ".claude/settings.json"), "utf8")) as Settings
    ).permissions;
    expect(permissions.deny).toEqual(
      expect.arrayContaining([
        "Read(./apps/api/.env)",
        "Read(./apps/api/**/.env)",
        "Edit(./apps/api/**/generated/**)",
        "Write(./apps/api/**/generated/**)",
        "Edit(./apps/api/openapi.json)",
        "Write(./apps/api/openapi.json)",
      ]),
    );
    const scanner = parseToml(readFileSync(join(target, ".betterleaks.toml"), "utf8"));
    expect(scanner.extend).toEqual({ useDefault: true });
    expect(scanner.prefilter).toBeUndefined();
    const allowlists = scanner.allowlists as { paths: string[] }[];
    expect(
      allowlists.flatMap((list) => list.paths).some((path) => path.startsWith("^apps/api/")),
    ).toBe(false);
    for (const frontend of frontends) {
      expect(merged["pre-commit"].jobs.some((job) => job.name === `${frontend}-format`)).toBe(true);
      expect(merged["pre-commit"].jobs.some((job) => job.name === `${frontend}-lint`)).toBe(true);
    }
  }
  expect(existsSync(join(api, ".mcp.json"))).toBe(false);
  expect(result.committed).toBe(true);
  expect(git(target, "branch", "--show-current").trim()).toBe("main");
  expect(git(target, "rev-list", "--count", "HEAD").trim()).toBe("1");
  expect(git(target, "status", "--porcelain")).toBe("");
  expect(git(root, "status", "--porcelain")).toBe("");
});
