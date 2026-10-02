import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { validateCompose } from "./config.ts";
import { createPlan, webCommand } from "./plan.ts";
import { execute, probePorts } from "./process.ts";
import { runStack } from "./run.ts";
import { smoke, waitForServices } from "./smoke.ts";

/** 루트에서만 스택을 소유한다. web 템플릿은 주소와 설정만 받는다. */
async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      keep: { type: "boolean" },
      smoke: { type: "boolean" },
      print: { type: "boolean" },
      down: { type: "boolean" },
      "run-id": { type: "string" },
    },
  });
  if (
    positionals.length !== 1 ||
    positionals[0] !== "fastapi" ||
    (values.down === true && !values["run-id"])
  ) {
    throw new Error(
      "사용법: pnpm web-e2e fastapi [--smoke] [--keep] [--run-id <ID>] [--print|--down]",
    );
  }
  const runId = values["run-id"] ?? `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const plan = createPlan(runId);
  const validate = () => {
    validateCompose(readFileSync(resolve(plan.root, plan.composeFile), "utf8"), plan);
  };
  validate();
  console.log(`프로젝트: ${plan.project}`);
  console.log(`compose 환경: ${JSON.stringify(plan.env)}`);
  for (const [name, argv] of Object.entries(plan.commands))
    console.log(`${name}: ${JSON.stringify(argv)}`);
  if (values.smoke !== true) console.log(`web: ${JSON.stringify(webCommand(plan))}`);
  console.log(`정리: pnpm web-e2e fastapi --run-id ${runId} --down`);
  if (values.print === true) return 0;
  if (values.down === true) return (await execute(plan.commands.down, plan.env)).code;
  const controller = new AbortController();
  const interrupt = () => {
    controller.abort(130);
  };
  const terminate = () => {
    controller.abort(143);
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    const result = await runStack(
      plan,
      { keep: values.keep === true, signal: controller.signal },
      {
        validate,
        probe: () => probePorts(plan.ports),
        execute: (argv, options) => execute(argv, plan.env, options),
        ready: waitForServices,
        command: async (signal) =>
          values.smoke === true
            ? smoke(plan, signal)
            : (
                await execute(webCommand(plan), plan.webEnv, {
                  ...(signal ? { signal } : {}),
                  tree: true,
                })
              ).code,
        log: console.error,
      },
    );
    console.log(
      `실행 종료 코드: ${String(result.code)}, 정리 종료 코드: ${String(result.cleanupCode)}`,
    );
    return result.code === 0 && result.cleanupCode !== 0 ? 1 : result.code;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
