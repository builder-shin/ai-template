import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMap, isSeq, parseDocument } from "yaml";

export function selectFrontendSteps(source: string, frontends: readonly string[]): string {
  const workflow = parseDocument(source);
  const steps = workflow.getIn(["jobs", "check", "steps"], true);
  if (isSeq(steps)) {
    steps.items = steps.items.filter((step) => {
      const run = isMap(step) ? step.get("run") : undefined;
      const app =
        typeof run === "string" ? /--filter (\w+)|-f apps\/(\w+)\/Dockerfile/.exec(run) : undefined;
      return !app || frontends.includes(app[1] ?? app[2] ?? "");
    });
  }
  return workflow.toString({ lineWidth: 0 });
}

export function writeFrontendConfiguration(root: string, frontends: readonly string[]): void {
  const json = (file: string, value: unknown) => {
    writeFileSync(join(root, file), JSON.stringify(value, null, 2) + "\n");
  };
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  for (const command of ["dev", "fix", "test", "gen"]) {
    pkg.scripts[command] = (pkg.scripts[command] ?? "").replace(
      "--filter=web",
      frontends.map((app) => `--filter=${app}`).join(" "),
    );
  }
  json("package.json", pkg);
  const turbo = JSON.parse(readFileSync(join(root, "turbo.json"), "utf8")) as {
    tasks: Record<string, unknown>;
  };
  for (const command of ["check", "test", "gen"]) {
    const task = turbo.tasks[`web#${command}`];
    Reflect.deleteProperty(turbo.tasks, `web#${command}`);
    for (const app of frontends) turbo.tasks[`${app}#${command}`] = task;
  }
  json("turbo.json", turbo);
  const workflow = join(root, ".github/workflows/ci.yml");
  writeFileSync(workflow, selectFrontendSteps(readFileSync(workflow, "utf8"), frontends));
}
