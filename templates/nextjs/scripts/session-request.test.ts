import { appOrigin } from "../src/lib/app-config.mjs";
import { appSessionCookieName } from "../src/lib/app-config.mjs";
import "server-only";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { GET } from "../src/app/session/clear/route";
import { sessionCookieName } from "../src/lib/session/cookie";

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

describe("세션 정리 route", () => {
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
