import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, inject, it, vi } from "vitest";
import proxy, { config } from "../src/proxy";
import { appOrigin, appSessionCookieName } from "../src/lib/app-config.mjs";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { sealSession, unsealSession } from "../src/lib/session/cookie";
import { login, mockClient } from "./test/session";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("APP_URL", appOrigin("dev"));
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const cookieName = appSessionCookieName("development");
function request(path: string, cookie = "NEXT_LOCALE=ko", method = "GET") {
  return new NextRequest(`${appOrigin("dev")}${path}`, {
    headers: { Cookie: cookie, "Accept-Language": "ko", "Next-Action": "test-action" },
    method,
  });
}

it.each(["GET", "POST"])("%s: login 외의 경로를 로케일과 복귀 쿼리로 보호한다", async (method) => {
  for (const [path, target] of [
    ["/", "/login"],
    ["/posts?filter%5Bq%5D=hello", "/login"],
    ["/forbidden", "/login"],
    ["/unknown", "/login"],
    ["/posts/a.b/edit", "/login"],
    ["/en/posts?page=2", "/en/login"],
    ["/EN/posts", "/en/login"],
    ["/ko/forbidden", "/login"],
    ["/login/extra", "/login"],
  ]) {
    const response = await proxy(request(path!, undefined, method));
    const targetUrl = new URL(response.headers.get("location")!);
    expect(response.status).toBe(303);
    expect(targetUrl.origin).toBe(appOrigin("dev"));
    expect(targetUrl.pathname).toBe(target);
    expect(targetUrl.searchParams.get("returnTo")).toBe(path);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  }
});

it.each(["/login", "/en/login"])("%s: 인증 없이 next-intl의 언어 헤더를 유지한다", async (path) => {
  const response = await proxy(request(path));
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("x-middleware-request-x-next-intl-locale")).toBe(
    path.startsWith("/en") ? "en" : "ko",
  );
});

it("첫 방문의 영어 헤더·쿠키가 보호 경로의 영어 로그인 목적지를 정한다", async () => {
  for (const headers of [{ "Accept-Language": "en-US,en;q=0.9" }, { Cookie: "NEXT_LOCALE=en" }]) {
    const response = await proxy(
      new NextRequest(`${appOrigin("dev")}/posts?sort=title`, { headers }),
    );
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/en/login");
    expect(target.searchParams.get("returnTo")).toBe("/posts?sort=title");
  }
});

it.each(["/posts", "/login"])("%s: 변조 쿠키를 지운다", async (path) => {
  const response = await proxy(request(path, `${cookieName}=broken`));
  expect(response.cookies.get(cookieName)).toMatchObject({
    value: "",
    maxAge: 0,
    httpOnly: true,
    path: "/",
  });
  expect(response.status).toBe(path === "/login" ? 200 : 303);
});

it.each([60000, 120000])(
  "%i ms 남은 세션은 갱신 없이 로케일 rewrite를 유지한다",
  async (remaining) => {
    const now = Date.now();
    const session = {
      ...(await login()),
      accessTokenExpiresAt: new Date(now + remaining).toISOString(),
    };
    vi.spyOn(Date, "now").mockReturnValue(now);
    const response = await proxy(request("/posts", `${cookieName}=${await sealSession(session)}`));
    expect(response.headers.get("x-middleware-rewrite")).toBe(`${appOrigin("dev")}/ko/posts`);
    expect(response.cookies.get(cookieName)).toBeUndefined();
    expect((await mockClient(session.accessToken).GET("/me")).response.status).toBe(200);
  },
);

it.each(["/posts", "/en/posts"])(
  "%s: POST 갱신은 요청·응답 쿠키와 intl 헤더를 유지한다",
  async (path) => {
    const session = {
      ...(await login()),
      accessTokenExpiresAt: new Date(Date.now() + 59000).toISOString(),
    };
    const response = await proxy(
      request(
        path,
        `${cookieName}=${await sealSession(session)}; NEXT_LOCALE=ko; unrelated=kept`,
        "POST",
      ),
    );
    const refreshed = response.cookies.get(cookieName)!;
    const renewed = await unsealSession(refreshed.value);
    expect(renewed?.accessToken).not.toBe(session.accessToken);
    expect(renewed?.refreshToken).not.toBe(session.refreshToken);
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      `${cookieName}=${refreshed.value}`,
    );
    expect(response.headers.get("x-middleware-request-cookie")).toContain("unrelated=kept");
    expect(response.headers.get("x-middleware-request-x-next-intl-locale")).toBe(
      path.startsWith("/en") ? "en" : "ko",
    );
    expect(response.headers.get("x-middleware-override-headers")?.split(",")).toContain("cookie");
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      path === "/posts" ? `${appOrigin("dev")}/ko/posts` : null,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await mockClient(renewed!.accessToken).GET("/me")).response.status).toBe(200);
  },
);

it("갱신 실패는 쿠키를 지우고 POST를 복귀 쿼리가 있는 영어 로그인 GET으로 보낸다", async () => {
  const session = {
    ...(await login()),
    accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
  };
  await mockClient(session.accessToken).DELETE("/sessions/current");
  const response = await proxy(
    request("/en/posts?sort=title", `${cookieName}=${await sealSession(session)}`, "POST"),
  );
  const target = new URL(response.headers.get("location")!);
  expect(response.status).toBe(303);
  expect(target.pathname).toBe("/en/login");
  expect(target.searchParams.get("returnTo")).toBe("/en/posts?sort=title");
  expect(response.cookies.get(cookieName)).toMatchObject({ value: "", maxAge: 0 });
});

it("matcher는 점이 있는 화면과 Action을 포함하고 정적 자원·쿠키 정리는 제외한다", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);
  for (const path of ["/", "/login", "/en/forbidden", "/posts/a.b/edit", "/unknown"])
    expect(matcher.test(path)).toBe(true);
  for (const path of [
    "/_next/static/app.js",
    "/_vercel/x",
    "/session/clear",
    "/icon.svg",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
  ])
    expect(matcher.test(path)).toBe(false);
});
