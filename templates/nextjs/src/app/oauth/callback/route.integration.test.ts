import { sessionCookieName } from "../../../lib/session/cookie";
import { appSessionCookieName } from "../../../lib/app-config.mjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { EXAMPLE_SESSION_SECRET } from "../../../lib/env";
import { oauthCookie } from "../../../lib/session/oauth";
import { GET } from "./route";

const origin = "https://web.example";
const attempt = {
  provider: "google",
  verifier: "v".repeat(43),
  returnTo: "/me?tab=profile#avatar",
  locale: "en",
} as const;
const code = "test-oauth-code";
const tokens = {
  accessToken: "opaque-oauth-access",
  refreshToken: "opaque-oauth-refresh",
  accessTokenExpiresAt: "2030-01-01T00:15:00.000Z",
  refreshTokenExpiresAt: "2030-01-31T00:00:00.000Z",
};
const sessionDocument = {
  data: {
    type: "sessions",
    id: "00000000-0000-4000-8000-000000000001",
    attributes: {
      ...tokens,
      userAgent: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      lastUsedAt: "2026-10-01T00:00:00.000Z",
      current: true,
    },
    relationships: {
      user: { data: { type: "users", id: "00000000-0000-4000-8000-000000000002" } },
    },
  },
};

beforeEach(() => {
  vi.stubEnv("API_BASE_URL", "https://api.example/api/v1");
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "https://api.example");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each([
  ["/sessions", "not-json", "SyntaxError"],
  ["/sessions", "", "TypeError"],
  ["/sessions", "{}", "TypeError"],
  ["/sessions", '{"data":{"attributes":{}}}', "ZodError"],
  ["/me", "not-json", "SyntaxError"],
  ["/me", "", "TypeError"],
  ["/me", "{}", "TypeError"],
])("%s의 잘못된 200 응답(%s)은 쿠키를 정리하고 실패로 이동한다", async (path, body, name) => {
  const actual = globalThis.fetch;
  // 목이 만들 수 없는 응답만 HTTP 경계에서 주입하고 API 클라이언트는 그대로 쓴다.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (input instanceof Request) {
      const pathname = new URL(input.url).pathname;
      if (pathname === `/api/v1${path}`)
        return new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/vnd.api+json" },
        });
      if (input.method === "POST" && pathname === "/api/v1/sessions")
        return Response.json(sessionDocument);
    }
    return actual(input, init);
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const cookie = await oauthCookie(attempt, EXAMPLE_SESSION_SECRET, "development");
  const response = await GET(
    new NextRequest(`${origin}/oauth/callback?code=${code}`, {
      headers: { Cookie: `oauth=${cookie.value}`, "Sec-Fetch-Site": "cross-site" },
    }),
  );

  expect(response.status).toBe(303);
  const target = new URL(response.headers.get("location")!);
  expect(target.origin).toBe(origin);
  expect(target.pathname).toBe("/en/login");
  expect(target.searchParams.get("returnTo")).toBe(attempt.returnTo);
  expect(target.searchParams.get("notice")).toBe("auth.oauth_failed");
  expect(response.cookies.get("oauth")?.value).toBe("");
  expect(response.headers.getSetCookie().join(";")).toMatch(/oauth=;.*Max-Age=0/i);
  expect(response.cookies.get(appSessionCookieName("development"))).toBeUndefined();
  expect(response.cookies.get(sessionCookieName("production"))).toBeUndefined();
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(log).toHaveBeenCalledExactlyOnceWith(`OAuth 콜백 처리 실패: ${name}`);
  const line = log.mock.calls[0]![0] as string;
  for (const value of [code, attempt.verifier, cookie.value, ...Object.values(tokens)])
    expect(line).not.toContain(value);
});
