import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { startMock } from "./mock-server";
import { appConfig } from "../../src/lib/app-config.mjs";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture(source: string) {
  const directory = mkdtempSync(join(tmpdir(), "aitpl-mock-start-"));
  directories.push(directory);
  const entry = join(directory, "server.mjs");
  writeFileSync(entry, source);
  return { entry, directory };
}
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

it("조기 종료의 코드와 표준 출력·표준 오류를 보고한다", async () => {
  const { entry } = fixture(
    'console.log("starting"); console.error("broken configuration"); process.exit(23);',
  );
  const starting = startMock({ env: {}, entry });
  await expect(starting).rejects.toThrow("23");
  await expect(starting).rejects.toThrow("starting");
  await expect(starting).rejects.toThrow("broken configuration");
});

it("준비 시간 초과 뒤 시작한 부모와 자식을 모두 종료한다", async () => {
  const { entry, directory } = fixture(`
    import { createServer } from "node:http";
    import { spawn } from "node:child_process";
    import { writeFileSync } from "node:fs";
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
    createServer(() => {}).listen(Number(process.env.PORT), "127.0.0.1", () => {
      writeFileSync(process.env.PIDS, JSON.stringify([process.pid, child.pid]));
      console.error("never ready");
    });
  `);
  const pids = join(directory, "pids.json");
  const starting = startMock({ env: { PIDS: pids }, entry, timeoutMs: 3000 });
  const failure = expect(starting).rejects.toThrow(/시작 실패[\s\S]*never ready/);
  await expect.poll(() => existsSync(pids), { timeout: 2000 }).toBe(true);
  const owned = JSON.parse(readFileSync(pids, "utf8")) as number[];
  expect(owned.map(alive)).toEqual([true, true]);
  await failure;
  expect(owned.map(alive)).toEqual([false, false]);
});

it("실제 목을 빈 포트에 띄우고 종료 뒤 HTTP 연결을 남기지 않는다", async () => {
  const mock = await startMock({ env: {} });
  try {
    expect(Object.values(appConfig.ports)).not.toContain(Number(new URL(mock.base).port));
    expect((await fetch(`${mock.base}/health/ready`)).ok).toBe(true);
  } finally {
    await mock.stop();
  }
  await expect(fetch(`${mock.base}/health/ready`)).rejects.toThrow();
  await mock.stop();
});

it("앱 밖의 계약 목을 띄우고 정리한다", async () => {
  const { directory } = fixture("");
  const root = join(directory, "apps/web");
  mkdirSync(root, { recursive: true });
  mkdirSync(join(directory, "contract/mock/src"), { recursive: true });
  mkdirSync(join(directory, "contract/typespec"));
  writeFileSync(join(root, "gen.config.json"), JSON.stringify({ contract: "../../contract" }));
  writeFileSync(
    join(directory, "contract/mock/src/main.ts"),
    `
    import { createServer } from "node:http";
    createServer((_, response) => response.end("custom contract")).listen(Number(process.env.PORT), "127.0.0.1");
  `,
  );
  const mock = await startMock({ env: {}, root });
  try {
    expect(await (await fetch(`${mock.base}/health/ready`)).text()).toBe("custom contract");
  } finally {
    await mock.stop();
  }
  await expect(fetch(`${mock.base}/health/ready`)).rejects.toThrow();
});
