import { cpSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { comboFixture, lock } from "./combo-fixture.ts";
import { git, write } from "./helpers.ts";

export const manager = lock.slice(0, lock.indexOf("---", 3));
export const apiLock =
  manager +
  "---\n" +
  stringify({
    lockfileVersion: "9.0",
    settings: {},
    overrides: { typescript: "6.0.3" },
    importers: {
      ".": {
        dependencies: { api: { specifier: "1.0.0", version: "1.0.0" } },
        devDependencies: { typescript: { specifier: "6.0.3", version: "6.0.3" } },
      },
    },
    packages: {
      "api@1.0.0": { resolution: { integrity: "api-fixture" } },
      "typescript@6.0.3": { resolution: { integrity: "ts-fixture" } },
    },
    snapshots: { "api@1.0.0": {}, "typescript@6.0.3": {} },
  });

export function nestjsFixture() {
  const root = comboFixture();
  for (const template of ["nextjs", "nextjs-admin"]) {
    if (template === "nextjs-admin") {
      cpSync(join(root, "templates/nextjs"), join(root, "templates", template), {
        recursive: true,
      });
      for (const file of ["untracked.txt", "contract/untracked.txt"])
        rmSync(join(root, "templates", template, file));
    }
    write(
      root,
      `templates/${template}/pnpm-workspace.yaml`,
      "packages: [contract/*]\nminimumReleaseAge: 1440\nallowBuilds: {lefthook: false}\noverrides: {typescript: 6.0.3}\n",
    );
    write(
      root,
      `templates/${template}/pnpm-lock.yaml`,
      lock
        .replace(
          "importers:\n  .:\n    dependencies:",
          "settings: {}\noverrides: {typescript: 6.0.3}\nimporters:\n  .:\n    dependencies:",
        )
        .replace("packages:\n", "packages:\n  hono@4.0.0: {resolution: {integrity: hono}}\n")
        .replace("snapshots:\n", "snapshots:\n  hono@4.0.0: {}\n"),
    );
  }
  cpSync(join(root, "templates/fastapi"), join(root, "templates/nestjs"), { recursive: true });
  for (const file of ["pyproject.toml", "uv.lock"]) rmSync(join(root, "templates/nestjs", file));
  write(
    root,
    "templates/nestjs/package.json",
    JSON.stringify(
      {
        name: "nestjs-template",
        private: true,
        type: "module",
        scripts: { setup: "node scripts/setup.mjs", build: "nest build" },
        dependencies: { api: "1.0.0" },
        devDependencies: { typescript: "6.0.3" },
      },
      null,
      2,
    ) + "\n",
  );
  write(
    root,
    "templates/nestjs/pnpm-workspace.yaml",
    "minimumReleaseAge: 1440\noverrides: {typescript: 6.0.3}\nallowBuilds: {argon2: true, lefthook: false}\n",
  );
  write(root, "templates/nestjs/pnpm-lock.yaml", apiLock);
  write(root, "templates/nestjs/Dockerfile", "# 앱 문맥\nCOPY package.json ./\n");
  write(root, "templates/nestjs/.dockerignore", "node_modules\n.env\n");
  git(
    root,
    "add",
    "templates/nestjs",
    "templates/nextjs/pnpm-lock.yaml",
    "templates/nextjs/pnpm-workspace.yaml",
    "templates/nextjs-admin",
  );
  git(
    root,
    "update-index",
    "--chmod=+x",
    "templates/nextjs-admin/bin/start.sh",
    "templates/nextjs-admin/contract/mock/bin/start.sh",
  );
  git(root, "commit", "-m", "test: NestJS 생성 입력을 고정한다");
  return root;
}

export function sourceText(root: string, file: string): string {
  return readFileSync(join(root, file), "utf8");
}
