import { createMobilePlan, type MobilePlan } from "./plan.ts";
import type { CommandOptions, CommandResult } from "../web-e2e/process.ts";
interface Dependencies {
  execute(argv: readonly string[], options?: CommandOptions): Promise<CommandResult>;
  log(message: string): void;
  onCleanupFailure?(): void;
}
function interrupted(code: number, signal?: AbortSignal) {
  return signal?.aborted ? (typeof signal.reason === "number" ? signal.reason : 130) : code;
}
export async function checkMobileInventory(
  plan: MobilePlan,
  deps: Pick<Dependencies, "execute">,
  signal?: AbortSignal,
): Promise<number> {
  for (const argv of [plan.commands.containers, plan.commands.volumes, plan.commands.image]) {
    const result = await deps.execute(argv, { ...(signal ? { signal } : {}), capture: true });
    if (result.code !== 0) return result.code;
    if (result.stdout.trim())
      throw new Error("An existing native resource is not owned by this run.");
  }
  return 0;
}
export async function downMobileStack(plan: MobilePlan, deps: Dependencies): Promise<number> {
  if (plan.project !== createMobilePlan(plan.backend, plan.runId).project)
    throw new Error("Dedicated mobile project required.");
  try {
    let code = (await deps.execute(plan.commands.down)).code;
    if (code === 0) {
      const image = await deps.execute(plan.commands.image, { capture: true });
      code = image.code;
      if (code === 0 && image.stdout.trim())
        code = (await deps.execute(plan.commands.removeImage)).code;
    }
    if (code !== 0)
      deps.log(
        `Native stack cleanup failed: ${plan.project}. Retry mobile-e2e ${plan.backend} --run-id ${plan.runId} --down.`,
      );
    return code;
  } catch {
    deps.log(`Native stack cleanup failed: ${plan.project}.`);
    return 1;
  }
}
export async function runMobileStack(
  plan: MobilePlan,
  options: { keep?: boolean; signal?: AbortSignal },
  deps: Dependencies & {
    probe(): Promise<void>;
    ready(signal?: AbortSignal): Promise<void>;
    command(signal?: AbortSignal): Promise<number>;
  },
): Promise<number> {
  let attempted = false,
    code = 1,
    cleanupCode = 0;
  const commandOptions = options.signal ? { signal: options.signal } : {};
  try {
    if (plan.project !== createMobilePlan(plan.backend, plan.runId).project)
      throw new Error("Dedicated mobile project required.");
    await deps.probe();
    options.signal?.throwIfAborted();
    code = (await deps.execute(plan.commands.config, commandOptions)).code;
    if (code === 0) code = await checkMobileInventory(plan, deps, options.signal);
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
          throw new Error("Native stack worker is not running.");
        if (code === 0) code = await deps.command(options.signal);
      }
    }
  } catch (error) {
    deps.log(error instanceof Error ? error.message : String(error));
    code = 1;
  } finally {
    code = interrupted(code, options.signal);
    if (attempted) {
      if (options.keep && code === 0)
        deps.log(
          `Native stack kept: ${plan.project}. COMPOSE_DISABLE_ENV_FILE=1 MOBILE_E2E_RUN_ID=${plan.runId}; pnpm mobile-e2e ${plan.backend} --run-id ${plan.runId} --down`,
        );
      else {
        if (code !== 0)
          for (const argv of [plan.commands.ps, plan.commands.logs])
            try {
              await deps.execute(argv);
            } catch {
              deps.log("Native stack diagnostics unavailable.");
            }
        cleanupCode = await downMobileStack(plan, deps);
        if (cleanupCode !== 0) deps.onCleanupFailure?.();
      }
    }
  }
  return interrupted(code === 0 && cleanupCode !== 0 ? 1 : code, options.signal);
}
