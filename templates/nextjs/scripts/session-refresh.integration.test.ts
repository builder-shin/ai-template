import "server-only";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { ApiError } from "../src/lib/api/errors";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { login, mockClient } from "./test/session";
import { refreshSession } from "../src/lib/session/refresh";

beforeEach(() => {
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("실제 목의 일회용 refresh 갱신 묶기", () => {
  it("동시 요청이 하나의 새 토큰 쌍을 받고 세션이 살아 있다", async () => {
    const old = await login();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => refreshSession(old.refreshToken, "ko")),
    );
    expect(new Set(results.map((value) => value.accessToken)).size).toBe(1);
    expect(new Set(results.map((value) => value.refreshToken)).size).toBe(1);
    expect(results[0]?.accessToken).not.toBe(old.accessToken);
    expect(results[0]?.refreshToken).not.toBe(old.refreshToken);
    expect((await mockClient(results[0]!.accessToken).GET("/me")).response.status).toBe(200);
  });

  it("완료 후 30초 미만의 옛 쿠키는 기억한 결과를 받으며 경계에서 만료된다", async () => {
    const old = await login();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const first = await refreshSession(old.refreshToken, "ko");
    clock.mockReturnValue(now + 29999);
    expect(await refreshSession(old.refreshToken, "en")).toEqual(first);
    expect((await mockClient(first.accessToken).GET("/me")).response.status).toBe(200);
    clock.mockReturnValue(now + 30000);
    await expect(refreshSession(old.refreshToken, "ko")).rejects.toMatchObject({
      status: 401,
      errors: [{ code: "auth.refresh_token_reused" }],
    });
    // 실제 목이 재사용을 감지해 세션을 폐기했으므로 다시 보낸 것이 증명된다.
    await expect(mockClient(first.accessToken).GET("/me")).rejects.toBeInstanceOf(ApiError);
  });
});
