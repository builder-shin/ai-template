import { constants } from "node:os";
import { parseArgs, usage } from "./args.ts";
import {
  isServing,
  runCommand,
  shellCommand,
  type StartedProcess,
  startProcess,
  stopProcess,
  waitForReady,
} from "./process.ts";
import {
  type ComposeTarget,
  composeArgs,
  flowTestCommand,
  type ProcessTarget,
  TARGETS,
  testEnv,
} from "./targets.ts";

/**
 * 사용법: pnpm conformance <대상> [--keep] [흐름 파일...]
 * 대상을 띄우고(실제 백엔드는 docker compose, 목은 로컬 프로세스) 적합성 흐름 테스트를 돌린 뒤 내린다.
 * --keep이면 대상을 둔다. 대상 뒤의 인자는 vitest에 넘긴다(예: test/flows/smoke.test.ts).
 */

/** 목 프로세스가 /health/ready에 응답하기를 기다리는 한도. */
const READY_TIMEOUT_MS = 30_000;

function runComposeTarget(target: ComposeTarget, keep: boolean, extra: readonly string[]): number {
  let status = runCommand(["docker", ...composeArgs(target, "up")]);
  if (status !== 0) {
    console.error(`${target.name} 스택을 띄우지 못했다. docker compose 출력을 확인한다.`);
  } else {
    status = runCommand(flowTestCommand(extra), testEnv(target));
  }
  if (!keep) runCommand(["docker", ...composeArgs(target, "down")]);
  return status;
}

/** Ctrl+C나 종료 신호를 받으면 대상 프로세스 트리를 끝내고 나간다. POSIX에서는 대상이 다른 프로세스 그룹이라 신호를 받지 못한다. */
function stopOnSignals(started: StartedProcess): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void stopProcess(started).finally(() => process.exit(128 + constants.signals[signal]));
    });
  }
}

async function runProcessTarget(
  target: ProcessTarget,
  keep: boolean,
  extra: readonly string[],
): Promise<number> {
  const readyUrl = `${target.baseUrl}/health/ready`;
  if (await isServing(readyUrl)) {
    console.error(
      `${target.baseUrl}에 이미 서버가 떠 있다. 그 서버를 끝내고 다시 돌린다(--keep으로 남긴 ${target.name}일 수 있다).`,
    );
    return 1;
  }
  const started = startProcess(target.command, target.processEnv);
  stopOnSignals(started);
  try {
    await waitForReady(readyUrl, { timeoutMs: READY_TIMEOUT_MS, exited: started.exited });
  } catch (error) {
    console.error(`${target.name}을 띄우지 못했다. ${error instanceof Error ? error.message : ""}`);
    await stopProcess(started);
    return 1;
  }
  const status = runCommand(flowTestCommand(extra), testEnv(target));
  if (keep) {
    console.log(`${target.name}을 남겨 둔다(${target.baseUrl}). 끝내려면 Ctrl+C를 누른다.`);
    await started.exited;
  } else {
    await stopProcess(started);
  }
  return status;
}

const { target: name, keep, extra } = parseArgs(process.argv.slice(2));
const target = TARGETS[name];
if (target === undefined) {
  console.error(usage(Object.keys(TARGETS)));
  process.exit(2);
}
try {
  // 대상을 띄우기 전에 vitest에 넘길 인자를 확인한다.
  shellCommand(extra);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
process.exitCode =
  target.kind === "compose"
    ? runComposeTarget(target, keep, extra)
    : await runProcessTarget(target, keep, extra);
