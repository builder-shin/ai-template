import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";
import { diagnosticPlan } from "./nestjs-probe-lock-capture.ts";
import { temporaryFolder, write } from "./helpers.ts";

it("runs the actual lock diagnostic launcher with pnpm lifecycle version probing", () => {
  // Reverting the launcher to pnpm exec loses npm_execpath and fails the real version probe.
  const repository = resolve(import.meta.dirname, "../..");
  const fixture = temporaryFolder();
  const scriptKey = "probe:nestjs:lock-capture";
  const scriptValue = "tsx create/test/nestjs-probe-lock-capture.ts";
  const rootPackage = JSON.parse(readFileSync(join(repository, "package.json"), "utf8")) as {
    scripts: Record<string, string | undefined>;
  };
  const plan = diagnosticPlan(fixture, "web", "ci-lifecycle", join(fixture, "evidence"), ["web"]);
  // The literal lets the original exec launcher reach runPnpm before the new root key exists.
  write(
    fixture,
    "package.json",
    JSON.stringify({
      name: "aitpl-lock-lifecycle",
      private: true,
      type: "module",
      scripts: { [scriptKey]: rootPackage.scripts[scriptKey] ?? scriptValue },
    }),
  );
  // Resolve tsx from already installed repository tools through an owned link; never install.
  symlinkSync(
    join(repository, "node_modules"),
    join(fixture, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  write(
    fixture,
    "create/test/nestjs-probe-lock-capture.ts",
    `import { runPnpm } from ${JSON.stringify(pathToFileURL(join(repository, "create/src/pnpm.ts")).href)};
console.log("probe-entered:" + JSON.stringify({ pid: process.pid, hasEntry: Boolean(process.env.npm_execpath) }));
runPnpm(process.cwd(), ["--version"]);
console.log("probe-completed:" + JSON.stringify({ args: process.argv.slice(2), versionProbeCompleted: true }));
`,
  );
  const env = gitEnvironment();
  delete env.npm_execpath;
  delete env.npm_lifecycle_event;
  delete env.npm_lifecycle_script;
  const utcStart = new Date().toISOString();
  const start = performance.now();
  // Match the direct Node CI caller: pnpm from the installed PATH, with no lifecycle entry.
  const child = spawnSync("pnpm", plan.args, {
    cwd: fixture,
    env,
    encoding: "utf8",
    windowsHide: true,
    shell: process.platform === "win32",
    timeout: 20_000,
  });
  const utcEnd = new Date().toISOString();
  const wallSeconds = (performance.now() - start) / 1000;
  try {
    expect(child.error).toBeUndefined();
    expect(child.signal).toBeNull();
    expect(child.status, child.stdout + child.stderr).toBe(0);
    expect(child.stdout).toMatch(/probe-entered:.*"hasEntry":true/);
    const completed = child.stdout.split("\n").find((line) => line.startsWith("probe-completed:"));
    if (!completed) throw Error("Version probe completion was not emitted");
    expect(JSON.parse(completed.slice("probe-completed:".length)) as unknown).toEqual({
      args: [
        "--evidence-dir",
        join(fixture, "evidence", "lock-resolution"),
        "--binding-path",
        plan.bindingPath,
        "--",
        plan.target,
        "--api",
        "nestjs",
        "--web",
        "--name",
        "ci-lifecycle-lockdiag",
      ],
      versionProbeCompleted: true,
    });
    expect(rootPackage.scripts[scriptKey]).toBe(scriptValue);
    expect(existsSync(plan.target)).toBe(false);
    expect(existsSync(join(fixture, "evidence"))).toBe(false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
    const observation = {
      fixture,
      fixtureAbsent: !existsSync(fixture),
      command: "pnpm",
      args: plan.args,
      parentHasEntry: Boolean(env.npm_execpath),
      utcStart,
      utcEnd,
      wallSeconds,
      pid: child.pid,
      nativeExit: child.status,
      signal: child.signal,
      error: child.error?.message ?? null,
      stdout: child.stdout,
      stderr: child.stderr,
      innerRunPnpm: { pid: null, nativeExit: null, wallSeconds: null },
    };
    const evidence = process.env.AITPL_LOCK_LIFECYCLE_EVIDENCE;
    if (evidence) {
      const output = join(evidence, basename(fixture) + ".json");
      writeFileSync(output, JSON.stringify(observation, null, 2) + "\n", { flag: "wx" });
      chmodSync(output, 0o444);
    }
    console.log(JSON.stringify(observation));
    expect(observation.fixtureAbsent).toBe(true);
  }
});
