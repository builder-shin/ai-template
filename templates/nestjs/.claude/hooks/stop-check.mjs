import { failure, isMain, readInput, runLocal, writeOutput } from "./common.mjs";

export async function stopCheck(input, run = runLocal) {
  if (input.stop_hook_active) return {};
  try {
    const result = await run(input.cwd, ["check", "--fast"]);
    if (result.status === 0 && !result.error) return {};
    return { decision: "block", reason: `pnpm check --fast의 오류를 고친다:\n${failure(result)}` };
  } catch (error) {
    return { decision: "block", reason: `pnpm check --fast를 확인한다: ${error.message}` };
  }
}
if (isMain(import.meta.url)) writeOutput(await stopCheck(readInput()));
