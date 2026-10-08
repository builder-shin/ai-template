import { appOrigin } from "../src/lib/app-config.mjs";
import { appSessionCookieName } from "../src/lib/app-config.mjs";
import "server-only";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { ApiError } from "../src/lib/api/errors";
import { createSessionApiClient } from "../src/lib/api/session-client";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { login, mockClient } from "./test/session";
import { GET } from "../src/app/session/clear/route";
import { sealSession, sessionCookieName } from "../src/lib/session/cookie";
import {
  readSession,
  writeSession,
  clearSessionAndRedirect,
  redirectOnUnauthorized,
} from "../src/lib/session/request";

// Next 요청 문맥은 Node 테스트 밖에 있으므로 쿠키 저장소 경계만 대체한다.
const { jar } = vi.hoisted(() => ({ jar: new Map<string, { value: string; maxAge?: number }>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => jar.get(name),
    set: (cookie: { name: string; value: string; maxAge?: number }) => jar.set(cookie.name, cookie),
  }),
}));

beforeEach(() => {
  jar.clear();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("APP_URL", appOrigin("dev"));
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("렌더링과 Action의 세션 읽기 및 401 처리", () => {
  it("로그인 쿠키 쓰기가 계약 만료 시각과 두 토큰을 함께 보관한다", async () => {
    const tokens = await login();
    await writeSession(tokens);
    expect(await readSession()).toEqual({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    });
  });
  it("저장한 access 만료가 가까워도 읽기와 API 호출은 갱신하지 않는다", async () => {
    const session = {
      ...(await login()),
      accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    jar.set(appSessionCookieName("development"), { value: await sealSession(session) });
    expect(await readSession()).toEqual({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    });
    const client = await createSessionApiClient({ locale: "ko", log: () => {} });
    expect((await client.GET("/me")).response.status).toBe(200);
    expect(jar.get(appSessionCookieName("development"))?.maxAge).toBeUndefined();
    // 원래 refresh가 여전히 유효해야 읽기·클라이언트가 갱신하지 않은 것이다.
    expect(
      (
        await mockClient().POST("/sessions", {
          body: {
            data: {
              type: "sessions",
              attributes: { grantType: "refreshToken", refreshToken: session.refreshToken },
            },
          },
        })
      ).response.status,
    ).toBe(201);
  });

  it("익명 API는 인증이 필요한 호출에서 실제 401을 받는다", async () => {
    const client = await createSessionApiClient({ locale: "en", log: () => {} });
    await expect(client.GET("/me")).rejects.toMatchObject({ status: 401 });
  });

  it("Server Action의 직접 정리는 쿠키 삭제 뒤 GET 로그인으로 리다이렉트한다", async () => {
    jar.set(appSessionCookieName("development"), { value: "old" });
    await expect(clearSessionAndRedirect("/en/me")).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/en/login?returnTo=%2Fen%2Fme;307;",
    });
    expect(jar.get(appSessionCookieName("development"))).toMatchObject({ value: "", maxAge: 0 });
  });

  it("공통 401 helper는 렌더링에서 쿠키를 수정하지 않고 정리 route로 보낸다", () => {
    const error = new ApiError({ status: 401, traceId: "a".repeat(32), errors: [] });
    expect(() => redirectOnUnauthorized(error, "/en/me?tab=sessions")).toThrow();
    try {
      redirectOnUnauthorized(error, "/en/me?tab=sessions");
    } catch (redirect) {
      expect(redirect).toMatchObject({
        digest: "NEXT_REDIRECT;replace;/session/clear?returnTo=%2Fen%2Fme%3Ftab%3Dsessions;307;",
      });
    }
    expect(jar.size).toBe(0);
    expect(
      redirectOnUnauthorized(new ApiError({ status: 403, traceId: "a".repeat(32), errors: [] })),
    ).toBeUndefined();
    expect(redirectOnUnauthorized(new Error("other"))).toBeUndefined();
  });

  it.each(["development", "production"] as const)(
    "정리 route는 %s 쿠키를 지우고 안전한 로그인 주소만 사용한다",
    (mode) => {
      vi.stubEnv("NODE_ENV", mode);
      vi.stubEnv("SESSION_SECRET", "test-only-cleanup-secret-32-chars"); // betterleaks:allow 사유: 쿠키 삭제 route 테스트 키
      const result = GET(
        new NextRequest(`${appOrigin("dev")}/session/clear?returnTo=https%3A%2F%2Fevil.example`, {
          headers: { "Sec-Fetch-Site": "same-origin" },
        }),
      );
      expect(result.status).toBe(303);
      expect(result.headers.get("location")).toBe(`${appOrigin("dev")}/login?returnTo=%2F`);
      expect(result.cookies.get(sessionCookieName(mode))).toMatchObject({
        value: "",
        maxAge: 0,
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: mode === "production",
      });
    },
  );

  it.each([
    { Origin: "https://evil.example" },
    { "Sec-Fetch-Site": "cross-site" },
    { Origin: appOrigin("dev"), "Sec-Fetch-Site": "cross-site" },
    { "Sec-Fetch-Site": "same-site" },
    {},
  ])("같은 origin을 확인할 수 없는 정리 요청은 쿠키를 바꾸지 않는다 %j", (headers) => {
    const result = GET(new NextRequest(`${appOrigin("dev")}/session/clear`, { headers }));
    expect(result.status).toBe(403);
    expect(result.headers.get("set-cookie")).toBeNull();
  });

  it("같은 Origin의 요청은 쿠키를 정리한다", () => {
    const result = GET(
      new NextRequest(`${appOrigin("dev")}/session/clear`, {
        headers: { Origin: appOrigin("dev") },
      }),
    );
    expect(result.status).toBe(303);
    expect(result.cookies.get(appSessionCookieName("development"))?.maxAge).toBe(0);
  });
});
