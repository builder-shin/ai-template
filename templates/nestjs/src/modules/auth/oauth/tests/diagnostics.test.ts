import { Logger } from "@nestjs/common";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { OAuthClient, OAuthService } from "../../index.js";
import { JsonLogger } from "../../../../core/logging/json-logger.js";
import { requestContext } from "../../../../core/logging/context.js";
import { settings } from "../../../../core/http/tests/fixtures.js";
import { oauthFixture, start } from "./fixtures.js";
const TRACE = "00112233445566778899aabbccddeeff";
const PRIVATE = "민감-시험-표식";
let lines: string[];
beforeEach(() => {
  lines = [];
  Logger.overrideLogger(new JsonLogger(["warn"]));
  for (const stream of [process.stdout, process.stderr])
    vi.spyOn(stream, "write").mockImplementation((chunk: string | Uint8Array) => {
      lines.push(chunk.toString());
      return true;
    });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Logger.overrideLogger(new JsonLogger(["error"]));
});
function diagnostic() {
  const rows = lines
    .join("")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(rows).toHaveLength(1);
  return rows[0];
}
function poisonedError() {
  const error = Object.assign(new Error(PRIVATE), {
    name: PRIVATE,
    code: PRIVATE,
    stack: PRIVATE,
    cause: { email: PRIVATE },
    token: PRIVATE,
    state: PRIVATE,
    codeVerifier: PRIVATE,
    clientSecret: PRIVATE,
  });
  return error;
}
it.each([
  [new DOMException(PRIVATE, "TimeoutError"), "TimeoutError", undefined],
  [new DOMException(PRIVATE, "AbortError"), "AbortError", undefined],
  [new TypeError(PRIVATE), "TypeError", undefined],
  [new SyntaxError(PRIVATE), "SyntaxError", undefined],
  [new RangeError(PRIVATE), "RangeError", undefined],
  [new z.ZodError([]), "ZodError", undefined],
  [new Error(PRIVATE), "Error", undefined],
  [PRIVATE, "unknown", undefined],
  [Object.assign(new Error(PRIVATE), { code: "P2024" }), "Error", "P2024"],
] as const)(
  "콜백 오류 분류 [%#]에서 허용된 유형과 코드만 기록한다",
  async (error, errorType, errorCode) => {
    const f = oauthFixture();
    const state = await start(f);
    vi.spyOn(f.client, "exchange").mockRejectedValue(error);
    const url = new URL(await f.service.callback("google", { state, code: PRIVATE }));
    expect(url.searchParams.get("error")).toBe("auth.oauth_failed");
    const row = diagnostic();
    expect(row?.message).toEqual({
      message: "소셜 로그인 콜백이 실패했다",
      provider: "google",
      phase: "exchange",
      errorType,
      ...(errorCode ? { errorCode } : {}),
    });
    expect(lines.join("")).not.toContain(PRIVATE);
  },
);
it("fetch 실패 원인의 허용된 연결 코드를 안전하게 기록한다", async () => {
  const f = oauthFixture();
  const state = await start(f);
  vi.spyOn(f.client, "exchange").mockRejectedValue(
    new TypeError("fetch failed", { cause: { code: "ECONNREFUSED", message: PRIVATE } }),
  );
  await f.service.callback("google", { state, code: PRIVATE });
  expect(diagnostic()).toMatchObject({
    message: { errorType: "TypeError", errorCode: "ECONNREFUSED" },
  });
  expect(lines.join("")).not.toContain(PRIVATE);
});
it.each(["원인 접근자", "코드 접근자", "상속 코드"])(
  "진단 조건 %s에서 getter와 상속 속성을 읽지 않는다",
  async (kind) => {
    const f = oauthFixture();
    const state = await start(f);
    const getter = vi.fn(() => {
      throw new Error(PRIVATE);
    });
    const error = new TypeError(PRIVATE);
    if (kind === "원인 접근자") Object.defineProperty(error, "cause", { get: getter });
    else {
      const cause =
        kind === "상속 코드"
          ? (Object.create({ code: "ECONNREFUSED" }) as object)
          : Object.defineProperty({}, "code", { get: getter });
      Object.defineProperty(error, "cause", { value: cause });
    }
    vi.spyOn(f.client, "exchange").mockRejectedValue(error);
    await f.service.callback("google", { state, code: PRIVATE });
    expect(diagnostic()?.message).toEqual({
      message: "소셜 로그인 콜백이 실패했다",
      provider: "google",
      phase: "exchange",
      errorType: "TypeError",
    });
    expect(getter).not.toHaveBeenCalled();
    expect(lines.join("")).not.toContain(PRIVATE);
  },
);
it.each(["exchange", "profile", "identity", "link", "issue_code"] as const)(
  "콜백 %s 실패는 안전한 JSON 진단과 trace를 남기고 oauth_failed를 유지한다",
  async (phase) => {
    const f = oauthFixture();
    const state = await start(f);
    const stored = JSON.parse([...f.memory.values.values()][0]?.value ?? "{}") as {
      verifier: string;
    };
    const error = poisonedError();
    if (phase === "exchange") vi.spyOn(f.client, "exchange").mockRejectedValue(error);
    if (phase === "profile") vi.spyOn(f.client, "profile").mockRejectedValue(error);
    if (phase === "identity") f.profile = { sub: null, email: PRIVATE, name: PRIVATE };
    if (phase === "link") f.uniqueFailures = 2;
    if (phase === "issue_code") vi.spyOn(f.store, "issueCode").mockRejectedValue(error);
    const url = new URL(
      await requestContext.run({ traceId: TRACE }, () =>
        f.service.callback("google", { state, code: PRIVATE }),
      ),
    );
    expect(url.searchParams.get("error")).toBe("auth.oauth_failed");
    expect(url.searchParams.has("code")).toBe(false);
    const row = diagnostic();
    expect(row).toMatchObject({
      level: "warn",
      context: "OAuthService",
      traceId: TRACE,
      message: { provider: "google", phase },
    });
    if (phase === "link") expect(row?.message).toMatchObject({ errorCode: "P2002" });
    expect(lines.join("")).not.toContain(PRIVATE);
    expect(lines.join("")).not.toContain(state);
    expect(lines.join("")).not.toContain(stored.verifier);
    expect(lines.join("")).not.toContain("ada@example.com");
    expect(lines.join("")).not.toContain("http://");
    expect(lines.join("")).not.toContain("https://");
    expect(lines.join("")).not.toMatch(
      /codeVerifier|clientSecret|passwordHash|access_token|stack|cause/,
    );
  },
);
it.each([
  ["exchange", 502],
  ["profile", 429],
] as const)(
  "제공자 %s HTTP 실패는 상태 %i를 진단하되 응답 본문을 남기지 않는다",
  async (phase, status) => {
    const f = oauthFixture();
    const state = await start(f);
    let calls = 0;
    vi.stubGlobal("fetch", () => {
      calls++;
      return Promise.resolve(
        phase === "profile" && calls === 1
          ? new Response(JSON.stringify({ access_token: PRIVATE }))
          : new Response(PRIVATE, { status }),
      );
    });
    const service = new OAuthService(f.unit, f.store, new OAuthClient(settings), settings);
    const url = new URL(
      await requestContext.run({ traceId: TRACE }, () =>
        service.callback("google", { state, code: PRIVATE }),
      ),
    );
    expect(url.searchParams.get("error")).toBe("auth.oauth_failed");
    expect(diagnostic()).toMatchObject({
      message: { provider: "google", phase, httpStatus: status, errorType: "OAuthHttpError" },
      traceId: TRACE,
    });
    expect(lines.join("")).not.toContain(PRIVATE);
    expect(lines.join("")).not.toContain(state);
    expect(lines.join("")).not.toContain("http://");
  },
);
it.each([
  [null],
  [{ name: PRIVATE, code: PRIVATE, message: PRIVATE, stack: PRIVATE, profile: { email: PRIVATE } }],
])("임의 throw 값 %j 처리 시 페이로드 없이 실패 단계만 진단한다", async (error: unknown) => {
  const f = oauthFixture();
  const state = await start(f);
  vi.spyOn(f.client, "exchange").mockRejectedValue(error);
  expect(
    new URL(await f.service.callback("google", { state, code: PRIVATE })).searchParams.get("error"),
  ).toBe("auth.oauth_failed");
  expect(diagnostic()).toMatchObject({
    message: { provider: "google", phase: "exchange", errorType: "unknown" },
  });
  expect(lines.join("")).not.toContain(PRIVATE);
});
it.each(["exchange", "profile"] as const)(
  "OAuthClient %s HTTP 오류는 진단 가능한 상태를 가진다",
  async (method) => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(PRIVATE, { status: 503 })));
    const client = new OAuthClient(settings);
    const result =
      method === "exchange"
        ? client.exchange("google", PRIVATE, PRIVATE)
        : client.profile("google", PRIVATE);
    await expect(result).rejects.toMatchObject({ status: 503 });
  },
);
