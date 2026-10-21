import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
interface Step {
  run?: string;
  with?: Record<string, unknown>;
  "working-directory"?: string;
  [key: string]: unknown;
}
interface Job {
  steps: Step[];
  env?: Record<string, string>;
  [key: string]: unknown;
}
export function configureMobileCi(root: string): void {
  const path = join(root, ".github/workflows/ci.yml");
  const workflow = parse(readFileSync(path, "utf8")) as { jobs: Record<string, Job> };
  const check = workflow.jobs.check;
  if (!check) throw new Error("Mobile composition requires the root check CI job.");
  check.env = { ...check.env, E2E_SKIP_MOBILE: "1" };
  const asset = join(root, "native-ci.json"),
    native = JSON.parse(readFileSync(asset, "utf8")) as Record<string, Job>;
  for (const platform of ["android", "ios"]) {
    const job = native[platform];
    if (!job) throw new Error("Mobile composition requires both native CI jobs.");
    job.steps = job.steps.flatMap((step) => {
      if (step.run === "pnpm install --frozen-lockfile")
        return [step, { run: "pnpm --dir apps/mobile install --frozen-lockfile" }];
      if (step.run) step.run = step.run.replaceAll("pnpm ", "pnpm --dir apps/mobile ");
      if (typeof step.with?.script === "string")
        step.with.script = step.with.script.replaceAll("pnpm ", "pnpm --dir apps/mobile ");
      if (step.with?.["cache-dependency-path"])
        step.with["cache-dependency-path"] = "pnpm-lock.yaml\napps/mobile/pnpm-lock.yaml";
      if (step.run?.includes("scripts/native/ci-ios.mjs"))
        step["working-directory"] = "apps/mobile";
      return [step];
    });
    workflow.jobs[`mobile-${platform}`] = job;
  }
  writeFileSync(path, stringify(workflow, { lineWidth: 0 }));
  rmSync(asset);
  const runner = join(root, "scripts/test-e2e.mjs");
  writeFileSync(
    runner,
    readFileSync(runner, "utf8").replace(
      "...frontendNames(root).map((app) => [",
      '...frontendNames(root).filter((app) => app !== "mobile" || process.env.E2E_SKIP_MOBILE !== "1").map((app) => [',
    ),
  );
}
