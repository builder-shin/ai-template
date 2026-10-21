import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { check, resolveConfig } from "prettier";
import { expect, it } from "vitest";
import { parse, parseAllDocuments } from "yaml";
import type { WorkspaceDocument } from "../src/workspace.ts";
import type { LockDocument } from "../src/lock-graph.ts";
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
    "OAUTH_REDIRECT_URIS=http://localhost:3000/oauth/callback\nREALTIME_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001\n",
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
  expect(readFileSync(join(target, "apps/api/.env.example"), "utf8")).toContain(
    "REALTIME_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://10.0.2.2:8000,http://localhost:8000\n",
  );
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
  const workflow = parse(readFileSync(join(target, ".github/workflows/ci.yml"), "utf8")) as {
    jobs: Record<
      string,
      { env?: Record<string, string>; steps: { run?: string; with?: Record<string, unknown> }[] }
    >;
  };
  expect(workflow.jobs.check?.env?.E2E_SKIP_MOBILE).toBe("1");
  expect(Object.keys(workflow.jobs)).toEqual([
    "check",
    "mobile-check",
    "mobile-android",
    "mobile-ios",
  ]);
  expect(JSON.stringify(workflow.jobs["mobile-android"])).toContain(
    "apps/mobile install --frozen-lockfile",
  );
  expect(JSON.stringify(workflow.jobs["mobile-ios"])).toContain("apps/mobile");
  expect(existsSync(join(target, "native-ci.json"))).toBe(false);
  expect(readFileSync(join(target, "scripts/test-e2e.mjs"), "utf8")).toContain("E2E_SKIP_MOBILE");
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
it.each([
  { backend: "fastapi", apps: ["mobile"] },
  { backend: "nestjs", apps: ["web", "admin", "mobile"] },
])(
  "formats every adapted mobile runner with the actual pinned formatter: $backend",
  async ({ backend, apps }) => {
    const source = repository(backend),
      target = join(temporaryFolder(), "Formatted Mobile"),
      options = parseArguments(
        [
          target,
          "--api",
          backend,
          ...apps.map((app) => `--${app}`),
          "--name",
          "formatted-mobile",
          "--no-git",
        ],
        {},
      );
    if (options === "help") throw new Error("Expected generation options");
    const formatter = createRequire(import.meta.url).resolve("prettier/bin/prettier.cjs");
    createProject(options, source, {
      pnpm: (cwd, args) => {
        if (args[0] === "exec" && args[1] === "prettier")
          execFileSync(process.execPath, [formatter, ...args.slice(2)], { cwd, stdio: "pipe" });
      },
    });
    for (const name of ["apps.mjs", "frontend-e2e.mjs", "test-e2e.mjs"]) {
      const file = join(target, "scripts", name);
      expect(
        await check(readFileSync(file, "utf8"), {
          ...((await resolveConfig(file)) ?? {}),
          filepath: file,
        }),
        name,
      ).toBe(true);
    }
  },
);
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
it("retains each installation boundary's optional peer context when only the root owns contract tools", () => {
  const root = repository();
  for (const [template, color] of [
    ["nextjs", "7.2.0"],
    ["expo", "10.2.2"],
  ] as const) {
    const file = `templates/${template}/pnpm-lock.yaml`,
      source = readFileSync(join(root, file), "utf8");
    const docs = parseAllDocuments(source),
      doc = docs.at(-1);
    if (!doc) throw new Error("Missing fixture lock");
    const data = doc.toJS() as LockDocument;
    const importer = data.importers["contract/mock"];
    if (!importer) throw new Error("Missing fixture importer");
    importer.dependencies = {
      ...(importer.dependencies as Record<string, unknown>),
      "socket.io": { specifier: "4.8.4", version: `4.8.4(supports-color@${color})` },
    };
    data.packages["socket.io@4.8.4"] = { resolution: { integrity: "socket-fixture" } };
    data.packages[`supports-color@${color}`] = { resolution: { integrity: `color-${color}` } };
    data.snapshots[`supports-color@${color}`] = {};
    data.snapshots[`socket.io@4.8.4(supports-color@${color})`] = {
      optionalDependencies: { "supports-color": color },
    };
    if (template === "expo") {
      const app = data.importers["."];
      if (!app) throw new Error("Missing app importer");
      app.dependencies = {
        ...(app.dependencies as Record<string, unknown>),
        "socket.io": { specifier: "4.8.4", version: `4.8.4(supports-color@${color})` },
      };
    }
    for (const section of ["importers", "packages", "snapshots"]) doc.set(section, data[section]);
    write(root, file, source.slice(0, doc.range[0]) + doc.toString({ lineWidth: 0 }));
  }
  git(root, "add", "templates/nextjs/pnpm-lock.yaml", "templates/expo/pnpm-lock.yaml");
  git(root, "commit", "-m", "chore: distinct native optional peers");
  const target = join(temporaryFolder(), "native-peers");
  createProject(
    { target, name: "native-peers", template: "combo", frontends: ["web", "mobile"], git: false },
    root,
    { pnpm: () => undefined },
  );
  const rootDoc = parseAllDocuments(readFileSync(join(target, "pnpm-lock.yaml"), "utf8")).at(-1);
  const mobileDoc = parseAllDocuments(
    readFileSync(join(target, "apps/mobile/pnpm-lock.yaml"), "utf8"),
  ).at(-1);
  if (!rootDoc || !mobileDoc) throw new Error("Missing generated lock");
  const outer = rootDoc.toJS() as LockDocument,
    inner = mobileDoc.toJS() as LockDocument;
  expect(outer.importers["contract/mock"]?.dependencies).toMatchObject({
    "socket.io": { version: "4.8.4(supports-color@7.2.0)" },
  });
  expect(inner.importers["."]?.dependencies).toMatchObject({
    "socket.io": { version: "4.8.4(supports-color@10.2.2)" },
  });
  expect(inner.snapshots["socket.io@4.8.4(supports-color@10.2.2)"]).toEqual({
    optionalDependencies: { "supports-color": "10.2.2" },
  });
});
