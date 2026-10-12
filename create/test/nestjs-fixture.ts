import { cpSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseAllDocuments, stringify } from "yaml";
import { comboFixture, lock } from "./combo-fixture.ts";
import { git, write } from "./helpers.ts";

export function nestjsFixture(): string {
  const root = comboFixture();
  cpSync(join(root, "templates/nextjs"), join(root, "templates/nextjs-admin"), { recursive: true });
  for (const file of ["untracked.txt", "contract/untracked.txt"])
    rmSync(join(root, "templates/nextjs-admin", file));
  cpSync(join(root, "templates/fastapi"), join(root, "templates/nestjs"), { recursive: true });
  for (const file of ["pyproject.toml", "uv.lock"]) rmSync(join(root, "templates/nestjs", file));
  write(root, "templates/nestjs/README.md", "# NestJS\n\n내용\n");
  write(
    root,
    "templates/nestjs/package.json",
    JSON.stringify(
      {
        name: "nestjs-prototype",
        private: true,
        type: "module",
        packageManager: "pnpm@12.6.0",
        engines: { node: ">=24.15 <25" },
        dependencies: { core: "1.0.0" },
        devDependencies: { typescript: "6.0.3" },
        scripts: {
          setup: "node scripts/setup.js",
          check: "node scripts/check.js",
          build: "node scripts/build.js",
          gen: "node scripts/gen.js",
          "e2e:serve": "node scripts/e2e.js",
        },
      },
      null,
      2,
    ) + "\n",
  );
  write(
    root,
    "templates/nestjs/pnpm-workspace.yaml",
    "minimumReleaseAge: 1440\nallowBuilds:\n  lefthook: false\n  argon2: true\n",
  );
  const tool = parseAllDocuments(lock)[0]?.toJS() as unknown;
  const frontend = {
    lockfileVersion: "9.0",
    importers: {
      ".": {
        dependencies: { react: { specifier: "19.3.0", version: "19.3.0" } },
        devDependencies: { typescript: { specifier: "6.0.3", version: "6.0.3" } },
      },
      "contract/mock": { dependencies: { hono: { specifier: "4.0.0", version: "4.0.0" } } },
    },
    packages: {
      "react@19.3.0": { resolution: { integrity: "fixture" } },
      "hono@4.0.0": { resolution: { integrity: "fixture" } },
      "shared@1.0.0": { resolution: { integrity: "shared" } },
      "typescript@6.0.3": { resolution: { integrity: "fixture-typescript" } },
    },
    snapshots: {
      "typescript@6.0.3": {},
      "react@19.3.0": { dependencies: { shared: "1.0.0" } },
      "hono@4.0.0": {},
      "shared@1.0.0": {},
    },
  };
  const api = {
    lockfileVersion: "9.0",
    importers: {
      ".": {
        dependencies: { core: { specifier: "1.0.0", version: "1.0.0" } },
        devDependencies: { typescript: { specifier: "6.0.3", version: "6.0.3" } },
      },
    },
    packages: {
      "core@1.0.0": { resolution: { integrity: "core" } },
      "shared@1.0.0": { resolution: { integrity: "shared" } },
      "typescript@6.0.3": { resolution: { integrity: "fixture-typescript" } },
    },
    snapshots: {
      "typescript@6.0.3": {},
      "core@1.0.0": { optionalDependencies: { shared: "1.0.0" } },
      "shared@1.0.0": { optional: true },
    },
  };
  for (const template of ["nextjs", "nextjs-admin"])
    write(
      root,
      `templates/${template}/pnpm-lock.yaml`,
      "---\n" + stringify(tool) + "---\n" + stringify(frontend),
    );
  write(
    root,
    "templates/nestjs/pnpm-lock.yaml",
    "---\n" + stringify(tool) + "---\n" + stringify(api),
  );
  const repository = resolve(import.meta.dirname, "../..");
  for (const file of git(
    repository,
    "ls-files",
    "-z",
    "--",
    "contract/conformance/test/flows/*.test.ts",
  )
    .split("\0")
    .filter(Boolean)) {
    const leaf = file.split("/").at(-1);
    if (!leaf) throw Error("Missing tracked flow filename.");
    write(
      root,
      "templates/nestjs/test/fixtures/conformance-flows/" + leaf + ".txt",
      readFileSync(join(repository, file), "utf8"),
    );
  }
  write(
    root,
    "templates/nestjs/test/conformance-selection.test.ts",
    readFileSync(join(repository, "prototypes/nestjs/test/conformance-selection.test.ts"), "utf8"),
  );
  git(root, "add", "templates/nestjs", "templates/nextjs/pnpm-lock.yaml", "templates/nextjs-admin");
  git(root, "commit", "-m", "chore: NestJS inert fixtures");
  return root;
}
