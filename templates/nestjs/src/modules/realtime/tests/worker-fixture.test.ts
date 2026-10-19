import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { fork } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { spawnWorker } from "../../../../tests/integration/realtime-fixture.js";

vi.mock("node:child_process", () => ({ fork: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
function worker() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null as string | null,
    send: vi.fn<(input: object, callback: (error: Error | null) => void) => void>(),
    kill: vi.fn(),
  });
  vi.mocked(fork).mockReturnValue(child as unknown as ReturnType<typeof fork>);
  return { child, process: spawnWorker() };
}
it("정상 종료는 표준 출력에 수집 영수증을 쓰지 않는다", async () => {
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const f = worker();
  f.child.exitCode = 0;
  f.child.emit("exit", 0, null);
  await f.process.close();
  expect(stdout).not.toHaveBeenCalled();
});
it("예상 밖 종료는 대기 요청에 종료 정보와 출력 바이트 수만 전달한다", async () => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const f = worker();
  const pending = f.process.call({ kind: "wait" });
  f.child.stdout.write("private-out");
  f.child.stderr.write("private-err");
  f.child.exitCode = 2;
  f.child.emit("exit", 2, null);
  await expect(pending).rejects.toThrow("code=2 signal=null stdoutBytes=11 stderrBytes=11");
  await expect(pending).rejects.not.toThrow("private-");
});
