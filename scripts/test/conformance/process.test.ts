/**
 * 적합성 실행기의 프로세스 관리. 실제 프로세스와 HTTP 서버로 확인한다: 쉘 명령 조립, 종료 코드,
 * 준비 대기, 프로세스 트리 끝내기(Windows는 taskkill /T /F, POSIX는 프로세스 그룹).
 */

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  isServing,
  runCommand,
  shellCommand,
  startProcess,
  stopProcess,
  waitForReady,
} from "../../src/conformance/process.ts";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
        }),
    ),
  );
});

/** 처음 failures번은 503, 그 뒤로는 200을 주는 서버의 주소. */
async function serverReadyAfter(failures: number): Promise<string> {
  let seen = 0;
  const server = createServer((_request, response) => {
    seen += 1;
    response.writeHead(seen > failures ? 200 : 503).end();
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/health/ready`;
}

/** 아무도 듣지 않는 주소. 잠깐 열었다 닫은 포트다. */
async function closedUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return `http://127.0.0.1:${String(port)}/health/ready`;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("shellCommand", () => {
  it("평범한 인자는 그대로, 공백이나 괄호가 든 인자는 큰따옴표로 감싼다", () => {
    expect(shellCommand(["pnpm", "--filter", "@ai-template/mock", "run", "start"])).toBe(
      "pnpm --filter @ai-template/mock run start",
    );
    expect(shellCommand(["vitest", "-t", "스모크 (mock)", "C:\\a b\\x.ts", ""])).toBe(
      'vitest -t "스모크 (mock)" "C:\\a b\\x.ts" ""',
    );
  });

  it("큰따옴표 안에서도 쉘이 해석하는 문자가 든 인자는 받지 않는다", () => {
    for (const arg of ['a"b', "$HOME", "`id`", "%PATH%"]) {
      expect(() => shellCommand(["echo", arg])).toThrow("넘기지 못한다");
    }
  });
});

describe("runCommand", () => {
  it("명령의 종료 코드를 돌려준다", () => {
    expect(runCommand(["node", "-e", "process.exit(3)"])).toBe(3);
    expect(
      runCommand(["node", "-e", "process.exit(process.env.EXPECTED === 'yes' ? 0 : 1)"], {
        EXPECTED: "yes",
      }),
    ).toBe(0);
  });
});

describe("waitForReady", () => {
  it("200을 줄 때까지 기다린다", async () => {
    const url = await serverReadyAfter(2);
    await expect(waitForReady(url, { timeoutMs: 5_000, intervalMs: 10 })).resolves.toBeUndefined();
  });

  it("한도 안에 200이 오지 않으면 던진다", async () => {
    const url = await serverReadyAfter(Number.POSITIVE_INFINITY);
    await expect(waitForReady(url, { timeoutMs: 100, intervalMs: 10 })).rejects.toThrow(
      "0.1초 안에 200으로 응답하지 않았다",
    );
  });

  it("대상 프로세스가 먼저 끝나면 기다리지 않고 종료 코드와 함께 던진다", async () => {
    const url = await closedUrl();
    const exited = Promise.resolve(3);
    await expect(waitForReady(url, { timeoutMs: 10_000, intervalMs: 10, exited })).rejects.toThrow(
      "응답하기 전에 끝났다(종료 코드 3)",
    );
  });

  it("isServing은 연결이 안 되면 false다", async () => {
    expect(await isServing(await closedUrl())).toBe(false);
    expect(await isServing(await serverReadyAfter(0))).toBe(true);
  });
});

describe("startProcess와 stopProcess", () => {
  it("띄운 프로세스의 자식까지 모두 끝낸다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "conformance-tree-"));
    const script = join(dir, "tree.mjs");
    const pids = join(dir, "pids.json");
    // 손자 프로세스를 띄우고 두 pid를 적은 뒤 끝나지 않고 기다린다(목 서버의 pnpm → tsx → node와 같은 모양).
    writeFileSync(
      script,
      [
        'import { spawn } from "node:child_process";',
        'import { writeFileSync } from "node:fs";',
        'const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
        "writeFileSync(process.argv[2], JSON.stringify([process.pid, grandchild.pid]));",
        "setInterval(() => {}, 1000);",
      ].join("\n"),
    );
    const started = startProcess(["node", script, pids]);
    for (let waited = 0; !existsSync(pids) && waited < 10_000; waited += 50) await sleep(50);
    const [child, grandchild] = JSON.parse(readFileSync(pids, "utf8")) as [number, number];
    expect(isAlive(child) && isAlive(grandchild)).toBe(true);

    await stopProcess(started);

    for (let waited = 0; (isAlive(child) || isAlive(grandchild)) && waited < 5_000; waited += 50) {
      await sleep(50);
    }
    expect([isAlive(child), isAlive(grandchild)]).toEqual([false, false]);
  }, 20_000);

  it("이미 끝난 프로세스를 끝내도 바로 돌아온다", async () => {
    const started = startProcess(["node", "-e", "process.exit(0)"]);
    expect(await started.exited).toBe(0);
    await expect(stopProcess(started)).resolves.toBeUndefined();
  });
});
