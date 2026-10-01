import { type Plan, projectName } from "./plan.ts";
import type { CommandOptions, CommandResult } from "./process.ts";

export interface Dependencies {
  validate: () => void;
  probe: () => Promise<void>;
  execute: (argv: readonly string[], options: CommandOptions) => Promise<CommandResult>;
  ready: (signal?: AbortSignal) => Promise<void>;
  command: (signal?: AbortSignal) => Promise<number>;
  log: (message: string) => void;
}
export async function runStack(
  plan: Plan,
  options: { keep?: boolean; signal?: AbortSignal },
  deps: Dependencies,
): Promise<{ code: number; cleanupCode: number }> {
  let code = 1;
  let cleanupCode = 0;
  let attempted = false;
  const commandOptions: CommandOptions = options.signal ? { signal: options.signal } : {};
  try {
    if (plan.project !== projectName(plan.runId)) throw new Error("전용 프로젝트 이름을 쓴다.");
    deps.validate();
    await deps.probe();
    options.signal?.throwIfAborted();
    code = (await deps.execute(plan.commands.config, commandOptions)).code;
    if (code === 0) {
      options.signal?.throwIfAborted();
      attempted = true;
      code = (await deps.execute(plan.commands.up, commandOptions)).code;
      if (code === 0) {
        await deps.ready(options.signal);
        const worker = await deps.execute(plan.commands.worker, {
          ...commandOptions,
          capture: true,
        });
        code = worker.code;
        if (code === 0 && !worker.stdout.split(/\r?\n/).includes("worker"))
          throw new Error("worker가 실행 중이어야 한다.");
        if (code === 0) code = await deps.command(options.signal);
      }
    }
  } catch (error) {
    code = 1;
    deps.log(error instanceof Error ? error.message : String(error));
  } finally {
    if (options.signal?.aborted === true) {
      const reason: unknown = options.signal.reason;
      code = typeof reason === "number" ? reason : 130;
    }
    if (attempted) {
      if (options.keep === true && code === 0) {
        deps.log(
          `스택 유지: ${plan.project}. 정리 인자: ${JSON.stringify(plan.commands.down)} (COMPOSE_DISABLE_ENV_FILE=1, WEB_E2E_RUN_ID=${plan.runId}).`,
        );
      } else {
        for (const argv of [plan.commands.ps, plan.commands.logs]) {
          try {
            await deps.execute(argv, { capture: false });
          } catch (error) {
            deps.log(`진단 실패: ${String(error)}`);
          }
        }
        try {
          cleanupCode = (await deps.execute(plan.commands.down, { capture: false })).code;
        } catch (error) {
          cleanupCode = 1;
          deps.log(String(error));
        }
        if (cleanupCode !== 0)
          deps.log(
            `정리 실패: ${plan.project}, 종료 코드 ${String(cleanupCode)}. 정리 인자: ${JSON.stringify(plan.commands.down)}`,
          );
      }
    }
  }
  return { code, cleanupCode };
}
