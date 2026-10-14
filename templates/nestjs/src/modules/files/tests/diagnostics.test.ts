import { Logger } from "@nestjs/common";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { JsonLogger } from "../../../core/logging/json-logger.js";
import { requestContext } from "../../../core/logging/context.js";
import { fixture, file, principal } from "./fixtures.js";
const TRACE = "00112233445566778899aabbccddeeff";
let lines: string[];
const fixtures: ReturnType<typeof fixture>[] = [];
beforeEach(() => {
  lines = [];
  Logger.overrideLogger(new JsonLogger(["error", "warn"]));
  for (const stream of [process.stdout, process.stderr])
    vi.spyOn(stream, "write").mockImplementation((chunk: string | Uint8Array) => {
      lines.push(chunk.toString());
      return true;
    });
});
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
  vi.restoreAllMocks();
  Logger.overrideLogger(new JsonLogger(["error"]));
});
function make(error?: unknown) {
  const f = fixture();
  fixtures.push(f);
  f.add();
  if (error !== undefined) f.headFailure = error;
  return f;
}
function diagnostic() {
  const rows = lines.join("").trim().split("\n").filter(Boolean);
  expect(rows).toHaveLength(1);
  return z
    .object({
      level: z.string(),
      context: z.string(),
      traceId: z.string().nullable(),
      message: z.object({
        phase: z.string(),
        category: z.string(),
        httpStatus: z.number().optional(),
      }),
    })
    .parse(JSON.parse(rows[0] ?? "{}") as unknown);
}
it.each([
  { name: "AccessDenied", status: 403, category: "access_denied" },
  { name: "SignatureDoesNotMatch", status: 403, category: "signature" },
  { name: "SlowDown", status: 503, category: "throttled" },
])(
  "HEAD $name 실패는 안전한 경고와 요청 trace와 같은 503을 남긴다",
  async ({ name, status, category }) => {
    const f = make(
      Object.assign(new Error("시험-민감-표식"), {
        name,
        $metadata: { httpStatusCode: status },
        stack: "시험-민감-표식",
        url: "https://private.example.test/?signature=시험-민감-표식",
        credentials: { secret: "시험-민감-표식" },
        payload: "시험-민감-표식",
      }),
    );
    await expect(
      requestContext.run({ traceId: TRACE }, () => f.service.complete(principal, "f1")),
    ).rejects.toMatchObject({ init: { status: 503, code: "service.unavailable" } });
    expect(diagnostic()).toMatchObject({
      level: "warn",
      context: "FilesService",
      traceId: TRACE,
      message: { phase: "complete_head", category, httpStatus: status },
    });
    expect(lines.join("")).not.toContain("시험-민감-표식");
    expect(lines.join("")).not.toContain("https://");
    expect(f.files[0]?.status).toBe("pending");
  },
);
it("연결 timeout은 원본 코드와 메시지 없이 고정 원인으로 기록한다", async () => {
  const f = make(Object.assign(new Error("시험-민감-표식"), { code: "ETIMEDOUT" }));
  await expect(f.service.complete(principal, "f1")).rejects.toMatchObject({
    init: { status: 503 },
  });
  expect(diagnostic().message).toEqual({ phase: "complete_head", category: "timeout" });
  expect(lines.join("")).not.toContain("시험-민감-표식");
});
it("임의 오류 이름과 코드와 불가능한 HTTP 상태는 로그에 보내지 않는다", async () => {
  const f = make({
    name: "시험-민감-표식",
    code: "시험-민감-표식",
    message: "시험-민감-표식",
    $metadata: { httpStatusCode: 999 },
    response: "시험-민감-표식",
  });
  await expect(f.service.complete(principal, "f1")).rejects.toMatchObject({
    init: { status: 503 },
  });
  expect(diagnostic().message.category).toBe("unknown");
  expect(diagnostic().message.httpStatus).toBeUndefined();
  expect(lines.join("")).not.toContain("시험-민감-표식");
});
it("오류 getter를 실행하지 않고 503과 unknown 진단을 유지한다", async () => {
  let reads = 0;
  const error = {};
  for (const key of ["name", "code", "$metadata"])
    Object.defineProperty(error, key, {
      get() {
        reads++;
        throw new Error("시험-민감-표식");
      },
    });
  const f = make(error);
  await expect(f.service.complete(principal, "f1")).rejects.toMatchObject({
    init: { status: 503 },
  });
  expect(reads).toBe(0);
  expect(diagnostic().message.category).toBe("unknown");
});
it("기대한 객체 없음은 경고 없이 upload_incomplete를 유지한다", async () => {
  const f = make();
  await expect(f.service.complete(principal, "f1")).rejects.toMatchObject({
    init: { status: 422, code: "file.upload_incomplete" },
  });
  expect(lines).toEqual([]);
});
it("HEAD 크기 불일치와 빈 수정은 실패 진단을 만들지 않는다", async () => {
  const f = make();
  f.objects.set(file.key, { ContentLength: 24, ContentType: "image/png" });
  await expect(f.service.complete(principal, "f1")).rejects.toMatchObject({
    init: { status: 422 },
  });
  await f.service.complete(principal, "f1", false);
  expect(lines).toEqual([]);
});
