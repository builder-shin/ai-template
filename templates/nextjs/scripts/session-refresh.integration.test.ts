import { appOrigin } from "../src/lib/app-config.mjs";
import "server-only";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { ApiError } from "../src/lib/api/errors";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { login, mockClient } from "./test/session";
import { refreshSession } from "../src/lib/session/refresh";

beforeEach(() => {
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("APP_URL", appOrigin("dev"));
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("실제 목의 일회용 refresh 갱신 묶기", () => {
  it("실패한 Promise도 진행 중·완료 후에 같은 토큰의 요청에 재사용한다", async () => {
    const old = await login();
    await mockClient(old.accessToken).DELETE("/sessions/current");
    const first = refreshSession(old.refreshToken, "ko");
    expect(refreshSession(old.refreshToken, "en")).toBe(first);
    await expect(first).rejects.toMatchObject({ status: 401 });
    const late = refreshSession(old.refreshToken, "en");
    await expect(late).rejects.toMatchObject({ status: 401 });
    expect(late).toBe(first);
  });

  it("실패가 완료된 시각부터 30초를 기억하고 정확한 경계에서 다시 요청한다", async () => {
    const old = await login();
    await mockClient(old.accessToken).DELETE("/sessions/current");
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const first = refreshSession(old.refreshToken, "ko");
    // 요청이 진행 중인 동안 10초가 흘러도 기억 시간은 완료 뒤부터 센다.
    clock.mockReturnValue(now + 10000);
    await expect(first).rejects.toMatchObject({ status: 401 });
    clock.mockReturnValue(now + 39999);
    expect(refreshSession(old.refreshToken, "en")).toBe(first);
    clock.mockReturnValue(now + 40000);
    const next = refreshSession(old.refreshToken, "ko");
    expect(next).not.toBe(first);
    await expect(next).rejects.toMatchObject({ status: 401 });
  });

  it("옛 타이머는 새 항목을 지우지 않고 현재 타이머는 재요청 없이도 치운다", async () => {
    const old = await login();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    // 실제 HTTP와 Date는 유지하고 만료 콜백만 앞당겨 실행한다.
    const timers = vi.spyOn(globalThis, "setTimeout");
    await refreshSession(old.refreshToken, "ko");
    const staleTimer = timers.mock.calls.find(([, delay]) => delay === 30000)![0];
    timers.mockClear();
    clock.mockReturnValue(now + 30000);
    const newer = refreshSession(old.refreshToken, "ko");
    await expect(newer).rejects.toMatchObject({ status: 401 });
    const currentTimer = timers.mock.calls.find(([, delay]) => delay === 30000)![0];
    staleTimer();
    const afterStale = refreshSession(old.refreshToken, "en");
    await expect(afterStale).rejects.toMatchObject({ status: 401 });
    expect(afterStale).toBe(newer);
    currentTimer();
    const afterCleanup = refreshSession(old.refreshToken, "ko");
    expect(afterCleanup).not.toBe(newer);
    await expect(afterCleanup).rejects.toMatchObject({ status: 401 });
  });

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
