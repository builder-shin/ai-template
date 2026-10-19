import { setTimeout } from "node:timers/promises";
import { Controller, Get, Inject, Module } from "@nestjs/common";
import { afterEach, expect, it, vi } from "vitest";
import { requestContext, currentTraceId } from "../context.js";
import { JsonLogger } from "../json-logger.js";
import { settings, testApp, publicFixtureOperation } from "../../http/tests/fixtures.js";

afterEach(() => {
  vi.restoreAllMocks();
});
interface LogLine {
  level: string;
  traceId?: string;
  message: unknown;
  stack?: string;
  path?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  error?: { stack: string };
}
function capture(stream: NodeJS.WriteStream) {
  const lines: LogLine[] = [];
  vi.spyOn(stream, "write").mockImplementation((chunk: string | Uint8Array) => {
    for (const line of chunk.toString().trim().split("\n")) lines.push(JSON.parse(line) as LogLine);
    return true;
  });
  return lines;
}
it("요청 문맥의 모든 레벨 로그에 traceId를 넣는다", () => {
  const stdout = capture(process.stdout);
  const stderr = capture(process.stderr);
  const logger = new JsonLogger();
  requestContext.run({ traceId: "0123456789abcdef0123456789abcdef" }, () => {
    logger.log("요청 처리");
    logger.warn("주의");
    logger.debug("진단");
    logger.verbose("세부");
    logger.error(new Error("예외"));
    logger.fatal("치명 오류");
  });
  expect([...stdout, ...stderr]).toHaveLength(6);
  expect(stdout[0]).toMatchObject({
    level: "log",
    message: "요청 처리",
    traceId: "0123456789abcdef0123456789abcdef",
  });
  for (const line of [...stdout, ...stderr])
    expect(line.traceId).toBe("0123456789abcdef0123456789abcdef");
  expect(stderr.find((line) => line.level === "error")?.error?.stack).toContain("Error: 예외");
});
@Controller()
class LogController {
  constructor(@Inject(JsonLogger) private readonly logger: JsonLogger) {}
  @Get("/api/v1/log") @publicFixtureOperation() async log() {
    const before = currentTraceId();
    await setTimeout(5);
    this.logger.log("요청 처리");
    return { meta: { before, after: currentTraceId() }, data: null };
  }
  @Get("/api/v1/failure") @publicFixtureOperation() failure() {
    throw new Error("로그에만 남는 예외");
  }
}
@Module({ controllers: [LogController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class LogTestModule {}
it("접근 로그는 쿼리를 빼고 상태와 지연을 한 줄에 남기며 헬스체크는 제외한다", async () => {
  const lines = capture(process.stdout);
  const { http } = await testApp([LogTestModule], { settings: { ...settings, LOG_LEVEL: "info" } });
  expect(lines.some((line) => line.message === "Starting Nest application...")).toBe(true);
  expect(lines.some((line) => line.message === "Nest application successfully started")).toBe(true);
  const res = await http.get("/api/v1/log?token=private-query");
  await http.get("/health/live?probe=1");
  const access = lines.filter((line) => line.path !== undefined);
  expect(access).toHaveLength(1);
  expect(access[0]).toMatchObject({ method: "GET", path: "/api/v1/log", status: 200 });
  expect(access[0]).not.toHaveProperty("aborted");
  expect(access[0]?.durationMs).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(lines)).not.toContain("private-query");
  expect(lines.find((line) => line.message === "요청 처리")?.traceId).toBe(access[0]?.traceId);
  expect(JSON.parse(res.text) as unknown).toMatchObject({
    meta: { before: access[0]?.traceId, after: access[0]?.traceId },
  });
});
it("동시에 처리한 요청은 서로 다른 문맥을 유지한다", async () => {
  const { http } = await testApp([LogTestModule]);
  const results = await Promise.all([http.get("/api/v1/log"), http.get("/api/v1/log")]);
  const traces = results.map(
    (res) => (JSON.parse(res.text) as { meta: { before: string; after: string } }).meta,
  );
  expect(traces[0]?.before).toMatch(/^[a-f0-9]{32}$/);
  expect(traces[0]?.before).not.toBe(traces[1]?.before);
  for (const trace of traces) expect(trace.before).toBe(trace.after);
  expect(currentTraceId()).toBeUndefined();
});
it("예외는 같은 traceId와 스택을 한 줄 JSON 로그에만 남긴다", async () => {
  const { http } = await testApp([LogTestModule]);
  const lines = capture(process.stderr);
  const res = await http.get("/api/v1/failure");
  expect(res.status).toBe(500);
  expect(res.text).not.toContain("로그에만");
  expect(lines).toHaveLength(1);
  expect(lines[0]?.level).toBe("error");
  expect(lines[0]?.error?.stack ?? lines[0]?.stack).toContain("로그에만 남는 예외");
  expect(JSON.parse(res.text) as unknown).toMatchObject({ meta: { traceId: lines[0]?.traceId } });
});
