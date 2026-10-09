import { type Plan, projectName } from "./plan.ts";
import type { CommandOptions, CommandResult } from "./process.ts";

function signalExitCode(code: number, signal?: AbortSignal): number {
  if (signal?.aborted !== true) return code;
  const reason: unknown = signal.reason;
  return typeof reason === "number" ? reason : 130;
}

export interface Dependencies {
  validate: () => void;
  probe: () => Promise<void>;
  execute: (argv: readonly string[], options: CommandOptions) => Promise<CommandResult>;
  ready: (signal?: AbortSignal) => Promise<void>;
  command: (signal?: AbortSignal) => Promise<number>;
  log: (message: string) => void;
}

/** 명시한 프로젝트를 내린 뒤 해당 실행의 이미지 태그만 정리한다. */
export async function downStack(
  plan: Plan,
  deps: Pick<Dependencies, "execute" | "log">,
): Promise<number> {
  let argv = plan.commands.down;
  try {
    let code = (await deps.execute(argv, { capture: false })).code;
    if (code === 0) {
      argv = plan.commands.image;
      const image = await deps.execute(argv, { capture: true });
      code = image.code;
      if (code === 0 && image.stdout.trim()) {
        argv = plan.commands.removeImage;
        code = (await deps.execute(argv, { capture: false })).code;
      }
    }
    if (code !== 0)
      deps.log(
        `정리 실패: ${plan.project}, 종료 코드 ${String(code)}. 정리 인자: ${JSON.stringify(argv)}`,
      );
    return code;
  } catch (error) {
    deps.log(`정리 실패: ${plan.project}, ${String(error)}. 정리 인자: ${JSON.stringify(argv)}`);
    return 1;
  }
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
    if (plan.project !== projectName(plan.runId, plan.app))
      throw new Error("전용 프로젝트 이름을 쓴다.");
    deps.validate();
    await deps.probe();
    options.signal?.throwIfAborted();
    code = (await deps.execute(plan.commands.config, commandOptions)).code;
    if (code === 0) {
      for (const argv of [plan.commands.containers, plan.commands.volumes]) {
        const existing = await deps.execute(argv, { ...commandOptions, capture: true });
        code = existing.code;
        if (code !== 0) break;
        if (existing.stdout.trim()) {
          throw new Error(
            `프로젝트 ${plan.project}가 이미 존재한다. 다른 --run-id를 쓰거나 --down으로 정리한다.`,
          );
        }
      }
    }
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
    code = signalExitCode(code, options.signal);
    if (attempted) {
      if (options.keep === true && code === 0) {
        deps.log(
          `스택 유지: ${plan.project}. 정리 인자: ${JSON.stringify(plan.commands.down)} (COMPOSE_DISABLE_ENV_FILE=1, ${plan.runIdVariable}=${plan.runId}).`,
        );
      } else {
        if (code !== 0) {
          for (const argv of [plan.commands.ps, plan.commands.logs]) {
            try {
              await deps.execute(argv, { capture: false });
            } catch (error) {
              deps.log(`진단 실패: ${String(error)}`);
            }
          }
        }
        cleanupCode = await downStack(plan, deps);
      }
    }
  }
  return { code: signalExitCode(code, options.signal), cleanupCode };
}
