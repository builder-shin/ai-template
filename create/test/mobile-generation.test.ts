import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parse, parseAllDocuments } from "yaml";
import type { WorkspaceDocument } from "../src/workspace.ts";
import { createProject } from "../src/create.ts";
import { parseArguments } from "../src/arguments.ts";
import { comboFixture } from "./combo-fixture.ts";
import { nestjsFixture } from "./nestjs-fixture.ts";
import { git, temporaryFolder, write } from "./helpers.ts";

function repository(backend = "fastapi") {
  const root = backend === "nestjs" ? nestjsFixture() : comboFixture();
  cpSync(join(root, "templates/nextjs"), join(root, "templates/expo"), { recursive: true });
  for (const file of ["untracked.txt", "contract/untracked.txt", "Dockerfile"])
    rmSync(join(root, "templates/expo", file));
  const original = readFileSync(join(root, "templates/nextjs/pnpm-lock.yaml"), "utf8");
  const source = (
    original.includes("hono@4.0.0:")
      ? original
      : original
          .replace(
            "  react@19.3.0: {resolution: {integrity: fixture}}",
            "  react@19.3.0: {resolution: {integrity: fixture}}\n  hono@4.0.0: {resolution: {integrity: hono}}",
          )
          .replace("  react@19.3.0: {}", "  react@19.3.0: {}\n  hono@4.0.0: {}")
  ).replace(
    "importers:\n  .:\n    dependencies:",
    "overrides: {typescript: 6.0.3}\nimporters:\n  .:\n    dependencies:",
  );
  const validSource = source.replace(
    "overrides: {typescript: 6.0.3}\noverrides: {typescript: 6.0.3}\n",
    "overrides: {typescript: 6.0.3}\n",
  );
  write(root, "templates/expo/pnpm-lock.yaml", validSource);
  write(root, "templates/nextjs/pnpm-lock.yaml", validSource);
  write(
    root,
    "templates/expo/pnpm-workspace.yaml",
    "packages: [contract/*]\nminimumReleaseAge: 1440\nallowBuilds: {lefthook: false}\noverrides: {typescript: 6.0.3}\n",
  );
  write(
    root,
    "templates/nextjs/pnpm-workspace.yaml",
    "packages: [contract/*]\nminimumReleaseAge: 1440\nallowBuilds: {lefthook: false}\noverrides: {typescript: 6.0.3}\n",
  );
  write(root, "templates/expo/app-identity.json", "{}\n");
  write(
    root,
    `templates/${backend}/.env.example`,
    "OAUTH_REDIRECT_URIS=http://localhost:3000/oauth/callback\n",
  );
  cpSync(join(root, "templates/nextjs"), join(root, "templates/nextjs-admin"), { recursive: true });
  for (const file of ["untracked.txt", "contract/untracked.txt"])
    rmSync(join(root, "templates/nextjs-admin", file), { force: true });
  git(root, "add", "templates");
  git(
    root,
    "reset",
    "--",
    "templates/nextjs/untracked.txt",
    "templates/nextjs/contract/untracked.txt",
  );
  git(root, "update-index", "--chmod=+x", "templates/expo/contract/mock/bin/start.sh");
  git(
    root,
    "update-index",
    "--chmod=+x",
    "templates/nextjs-admin/contract/mock/bin/start.sh",
    "templates/nextjs-admin/bin/start.sh",
  );
  git(root, "commit", "-m", "chore: mobile fixture");
  return root;
}
it.each(
  ["fastapi", "nestjs"].flatMap((backend) =>
    [["mobile"], ["web", "mobile"], ["admin", "mobile"], ["web", "admin", "mobile"]].map(
      (apps) => ({ backend, apps }),
    ),
  ),
)("keeps mobile's independent importer and root contract: $backend $apps", ({ backend, apps }) => {
  const root = repository(backend),
    target = join(temporaryFolder(), "Path With Spaces"),
    name = "class";
  const options = parseArguments(
    [target, "--api", backend, ...apps.map((app) => `--${app}`), "--name", name, "--no-git"],
    {},
  );
  if (options === "help") throw new Error("Expected options");
  const calls: { cwd: string; args: string[] }[] = [];
  createProject(options, root, {
    pnpm: (cwd, args) => {
      calls.push({ cwd, args });
    },
  });
  const mobile = join(target, "apps/mobile");
  const document = parseAllDocuments(readFileSync(join(mobile, "pnpm-lock.yaml"), "utf8")).at(-1);
  if (!document) throw new Error("Missing mobile lock");
  const lock = document.toJS() as { importers: Record<string, unknown> };
  expect(Object.keys(lock.importers)).toEqual(["."]);
  const workspace = parse(
    readFileSync(join(target, "pnpm-workspace.yaml"), "utf8"),
  ) as WorkspaceDocument;
  expect(workspace.packages).toContain("tools/mobile");
  expect(workspace.packages).not.toContain("apps/mobile");
  expect(readFileSync(join(mobile, "app-identity.json"), "utf8")).toContain(
    "com.example.app_class",
  );
  expect(
    (JSON.parse(readFileSync(join(mobile, "package.json"), "utf8")) as { name: string }).name,
  ).toBe("mobile");
  expect(
    (JSON.parse(readFileSync(join(mobile, "mobile-defaults.json"), "utf8")) as { mode: string })
      .mode,
  ).toBe("backend");
  expect(
    (JSON.parse(readFileSync(join(mobile, "gen.config.json"), "utf8")) as { contractRoot: string })
      .contractRoot,
  ).toBe("../../contract");
  expect(existsSync(join(mobile, "contract"))).toBe(false);
  expect(existsSync(join(mobile, "Dockerfile"))).toBe(false);
  expect(existsSync(join(target, "scripts/mobile-command.mjs"))).toBe(true);
  expect(
    calls.some(
      (call) =>
        (call.cwd.endsWith("apps\\mobile") &&
          call.args.join(" ") === "install --frozen-lockfile") ||
        (call.cwd.endsWith("apps/mobile") && call.args.join(" ") === "install --frozen-lockfile"),
    ),
  ).toBe(true);
  expect(calls.filter((call) => call.args.includes("gen")).map((call) => call.args)).toEqual(
    apps.map((app) => ["--filter", app, "run", "gen"]),
  );
  const ci = readFileSync(join(target, ".github/workflows/ci.yml"), "utf8");
  if (!apps.includes("web")) expect(ci).not.toContain("--filter web");
  expect(ci).not.toContain("apps/mobile/Dockerfile");
  expect(readFileSync(join(target, "README.md"), "utf8")).not.toContain(
    "-f apps/mobile/Dockerfile",
  );
});
it.each(["install --lockfile-only", "install --frozen-lockfile", "--filter mobile run gen"])(
  "cleans a failed creation at %s",
  (failure) => {
    const root = repository(),
      parent = temporaryFolder(),
      target = join(parent, "mobile-app");
    const options = parseArguments([target, "--api", "fastapi", "--mobile", "--no-git"], {});
    if (options === "help") throw new Error("Expected options");
    expect(() =>
      createProject(options, root, {
        pnpm: (_cwd, args) => {
          if (args.join(" ") === failure) throw new Error("Injected failure");
        },
      }),
    ).toThrow("Injected failure");
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(parent)).toEqual([]);
  },
);
