import { afterEach, expect, it, vi } from "vitest";
import * as probe from "../../otel-probe.js";
import { assessTelemetry } from "../assess.js";

const previousExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = previousExitCode;
  vi.restoreAllMocks();
});
function streams() {
  return {
    stdout: vi.spyOn(process.stdout, "write").mockImplementation(() => true),
    stderr: vi.spyOn(process.stderr, "write").mockImplementation(() => true),
  };
}
it("프로브 실패는 원인 이름과 실패 JSON만 내고 종료 코드 1을 남긴다", async () => {
  const { stdout, stderr } = streams();
  const main = Reflect.get(probe, "probeMain") as (run: typeof probe.runProbe) => Promise<void>;
  await main(() => Promise.reject(new TypeError("private-host private-token")));
  expect(stderr).toHaveBeenCalledExactlyOnceWith("OTEL 확인 실패: probe TypeError\n");
  expect(stdout).toHaveBeenCalledExactlyOnceWith('{"complete":false,"error":"TypeError"}\n');
  const output: unknown = JSON.parse(String(stdout.mock.calls[0]?.[0]));
  expect(output).not.toHaveProperty("healthSpans");
  expect(process.exitCode).toBe(1);
});
it("프로브 성공은 기존 계층별 개수와 성공 JSON을 보존한다", async () => {
  const { stdout, stderr } = streams();
  const result = {
    ...assessTelemetry([], "", 0, true),
    http: 1,
    handler: 1,
    pg: 1,
    redis: 1,
    sameTrace: true,
    complete: true,
  };
  const main = Reflect.get(probe, "probeMain") as (run: typeof probe.runProbe) => Promise<void>;
  await main(() => Promise.resolve(result));
  expect(stdout).toHaveBeenCalledExactlyOnceWith(JSON.stringify(result) + "\n");
  expect(stderr).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(previousExitCode);
});
