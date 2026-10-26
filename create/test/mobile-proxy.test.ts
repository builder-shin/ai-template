import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { selectFrontendSteps } from "../src/frontend-config.ts";
import { temporaryFolder, write } from "./helpers.ts";
interface Result {
  status: number | null;
  signal?: string;
  error?: Error;
}
type Execute = (
  command: string,
  args: string[],
  options: { cwd: string; stdio: string; env: NodeJS.ProcessEnv },
) => Result;
async function proxy() {
  const root = temporaryFolder();
  for (const file of ["mobile-command.mjs", "mobile-e2e.mjs", "process.mjs"])
    write(
      root,
      `scripts/${file}`,
      readFileSync(
        resolve(
          import.meta.dirname,
          "../assets/combo",
          file === "process.mjs" ? `scripts/${file}` : `mobile-only/scripts/${file}`,
        ),
        "utf8",
      ),
    );
  return {
    root,
    module: (await import(pathToFileURL(join(root, "scripts/mobile-command.mjs")).href)) as {
      mobileCommand(root: string, args: string[], execute: Execute): number;
    },
  };
}
it("forwards task arguments literally and blocks dependency operations", async () => {
  const { root, module } = await proxy(),
    calls: unknown[] = [];
  const args = ["build", "--platform", "android", "--device", "space name;$()"];
  expect(
    module.mobileCommand(root, args, (command, argv, options) => {
      calls.push({ command, argv, options });
      return { status: 7 };
    }),
  ).toBe(7);
  expect(calls).toEqual([
    {
      command: "pnpm",
      argv: ["--dir", "apps/mobile", "run", ...args],
      options: { cwd: root, stdio: "inherit", env: { ...process.env, EXPO_NO_DOTENV: "1" } },
    },
  ]);
  for (const name of ["add", "remove", "exec"])
    expect(() =>
      module.mobileCommand(root, [name], () => {
        throw new Error("Must not execute");
      }),
    ).toThrow("Unknown mobile task");
});
it("preserves termination and command failures", async () => {
  const { root, module } = await proxy();
  expect(module.mobileCommand(root, ["dev"], () => ({ status: null, signal: "SIGINT" }))).toBe(130);
  expect(module.mobileCommand(root, ["dev"], () => ({ status: null, signal: "SIGTERM" }))).toBe(
    143,
  );
  expect(() =>
    module.mobileCommand(root, ["check"], () => ({
      status: null,
      error: new Error("missing executable"),
    })),
  ).toThrow("missing executable");
});
it("prunes space/equals/multiline mobile CI references together with absent apps", () => {
  const steps = [
    { name: "mobile", run: "pnpm --filter mobile run check" },
    { name: "equals", run: "pnpm --filter=mobile run check" },
    { name: "mixed", run: "pnpm --filter=mobile run test\npnpm --filter web run test" },
    { name: "api", run: "pnpm --filter api run check" },
  ];
  const names = (apps: string[]) => {
    const workflow = parse(
      selectFrontendSteps(JSON.stringify({ jobs: { check: { steps } } }), apps),
    ) as { jobs: { check: { steps: { name: string }[] } } };
    return workflow.jobs.check.steps.map((item) => item.name);
  };
  expect(names(["mobile"])).toEqual(["mobile", "equals", "api"]);
  expect(names(["web"])).toEqual(["api"]);
  expect(names(["web", "mobile"])).toEqual(["mobile", "equals", "mixed", "api"]);
});
