/**
 * 적합성 실행기가 띄우는 프로세스: 한 번 돌리고 끝나는 명령(docker, 흐름 테스트)과, 흐름 테스트가
 * 도는 동안 떠 있는 대상 프로세스(목 서버).
 *
 * 명령은 쉘로 실행한다. Windows에서 pnpm은 .cmd라 쉘을 거쳐야 한다. 인자 배열을 shell: true와 함께
 * 넘기면 Node가 경고(DEP0190)하므로 한 줄로 이어 붙인다.
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

/** 그대로 넘겨도 되는 인자. 그 밖은 큰따옴표로 감싼다(공백, 괄호, 한글 등). */
const PLAIN_ARG = /^[\w@+=:,./\\-]+$/;
/** 큰따옴표 안에서도 cmd나 sh가 해석하는 문자. 이런 인자는 받지 않는다. */
const UNQUOTABLE = /["$`%]/;

/** 인자를 cmd와 sh가 똑같이 읽는 명령 한 줄로 잇는다. */
export function shellCommand(argv: readonly string[]): string {
  return argv
    .map((arg) => {
      if (UNQUOTABLE.test(arg)) {
        throw new Error(`쉘이 해석하는 문자(" $ \` %)가 든 인자는 넘기지 못한다: ${arg}`);
      }
      return PLAIN_ARG.test(arg) ? arg : `"${arg}"`;
    })
    .join(" ");
}

/** 명령을 실행하고 끝날 때까지 기다린다. 출력은 그대로 보여 주고 종료 코드를 돌려준다. */
export function runCommand(argv: readonly string[], env: Record<string, string> = {}): number {
  const result = spawnSync(shellCommand(argv), {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  return result.status ?? 1;
}

export interface StartedProcess {
  readonly child: ChildProcess;
  /** 직접 띄운 프로세스가 끝나면 종료 코드로 풀린다(신호로 끝났거나 띄우지 못했으면 null). */
  readonly exited: Promise<number | null>;
}

/**
 * 명령을 띄워 둔다. 출력은 그대로 보여 준다. POSIX에서는 새 프로세스 그룹으로 띄워 나중에 그룹째
 * 끝낸다. Windows에서 detached는 새 콘솔 창을 띄우므로 쓰지 않고, 트리는 taskkill /T로 끝낸다.
 */
export function startProcess(
  argv: readonly string[],
  env: Readonly<Record<string, string>> = {},
): StartedProcess {
  const child = spawn(shellCommand(argv), {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
    detached: process.platform !== "win32",
  });
  const exited = new Promise<number | null>((resolve) => {
    child.once("exit", (code) => {
      resolve(code);
    });
    child.once("error", () => {
      resolve(null);
    });
  });
  return { child, exited };
}

/** 프로세스 트리에 신호를 보낸다. Windows는 taskkill /T /F로 자식까지, POSIX는 프로세스 그룹(-pid)에 보낸다. */
export function killTree(pid: number, signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    // 그룹에 남은 프로세스가 없다.
  }
}

/**
 * 띄워 둔 프로세스를 자식까지 모두 끝내고, 직접 띄운 프로세스가 끝날 때까지 기다린다.
 * graceMs 안에 끝나지 않으면 SIGKILL을 보낸다(Windows는 처음부터 강제로 끝낸다).
 */
export async function stopProcess(started: StartedProcess, graceMs = 5_000): Promise<void> {
  const { pid } = started.child;
  if (pid === undefined) return;
  killTree(pid);
  const stopped = await Promise.race([
    started.exited.then(() => true),
    sleep(graceMs).then(() => false),
  ]);
  if (stopped) return;
  killTree(pid, "SIGKILL");
  await started.exited;
}

/** url이 200으로 응답하는가. 연결되지 않거나 2초 안에 답하지 않으면 false다. */
export async function isServing(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    await response.arrayBuffer();
    return response.ok;
  } catch {
    return false;
  }
}

export interface ReadyOptions {
  /** 기다리는 한도(밀리초). */
  readonly timeoutMs: number;
  /** 확인 간격(밀리초). 기본 200. */
  readonly intervalMs?: number;
  /** 대상 프로세스의 exited. 준비되기 전에 끝나면 더 기다리지 않고 던진다. */
  readonly exited?: Promise<number | null>;
}

/** url이 200으로 응답할 때까지 기다린다. 한도를 넘기거나 대상 프로세스가 먼저 끝나면 던진다. */
export async function waitForReady(url: string, options: ReadyOptions): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  const target: { exitCode?: number | null } = {};
  void options.exited?.then((code) => {
    target.exitCode = code;
  });
  for (;;) {
    if (await isServing(url)) return;
    if ("exitCode" in target) {
      const code = target.exitCode === null ? "없음" : String(target.exitCode);
      throw new Error(`대상 프로세스가 ${url}에 응답하기 전에 끝났다(종료 코드 ${code}).`);
    }
    if (Date.now() >= deadline) {
      const seconds = String(options.timeoutMs / 1000);
      throw new Error(`${url}이 ${seconds}초 안에 200으로 응답하지 않았다.`);
    }
    await sleep(options.intervalMs ?? 200);
  }
}
