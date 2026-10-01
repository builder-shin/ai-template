import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import proxy, { config } from "../src/proxy";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { sealSession, unsealSession } from "../src/lib/session/cookie";
import { safeReturnTo } from "../src/lib/session/redirect";
import { login, mockClient } from "./test/session";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function request(path: string, cookie = "NEXT_LOCALE=ko", method = "GET") {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { Cookie: cookie, "Accept-Language": "ko", "Next-Action": "test-action" },
    method,
  });
}

describe("세션과 로케일 proxy 합성", () => {
  it.each(["/me", "/my-posts?page=2", "/en/me/security"])(
    "%s는 로그인과 안전한 returnTo로 보낸다",
    async (path) => {
      const result = await proxy(request(path));
      const location = new URL(result.headers.get("location")!);
      expect(result.status).toBe(303);
      expect(location.origin).toBe("http://localhost:3000");
      expect(location.pathname).toBe(path.startsWith("/en") ? "/en/login" : "/login");
      expect(location.searchParams.get("returnTo")).toBe(path);
    },
  );

  it.each(["GET", "POST"])("%s의 인코딩된 보호 경로도 로그인으로 보낸다", async (method) => {
    for (const [path, canonical] of [
      ["/%6d%65", "/me"],
      ["/my%2dposts?page=2", "/my-posts?page=2"],
      ["/en/%6d%65/security", "/en/me/security"],
      ["/en//%6d%65/security", "/"],
    ]) {
      const result = await proxy(request(path!, undefined, method));
      expect(result.status).toBe(303);
      const location = new URL(result.headers.get("location")!);
      expect(location.searchParams.get("returnTo")).toBe(canonical);
      expect(location.pathname).toBe(path!.startsWith("/en") ? "/en/login" : "/login");
    }
  });

  it.each(["/x/../en/me?tab=profile#details", "/%2e%2e/en/me?tab=profile#details"])(
    "점 구간 %s를 정규화하고 쿼리와 hash는 보존한다",
    (path) => expect(safeReturnTo(path)).toBe("/en/me?tab=profile#details"),
  );

  it.each([
    "https://evil.example/x",
    "//evil.example",
    "/\\evil.example",
    "/%2fevil.example",
    "/%5cevil.example",
    "/%252fevil.example",
    "/\n/evil.example",
  ])("외부 또는 모호한 returnTo %s를 기본 경로로 바꾼다", (path) => {
    expect(safeReturnTo(path)).toBe("/");
  });
  it("정상 쿼리와 로케일 상대 경로를 유지한다", () => {
    expect(safeReturnTo("/en/my-posts?page=2&filter=published")).toBe(
      "/en/my-posts?page=2&filter=published",
    );
    expect(safeReturnTo("/me?next=https%3A%2F%2Fevil.example")).toBe(
      "/me?next=https%3A%2F%2Fevil.example",
    );
  });

  it("60초 이상 남은 세션은 갱신하지 않고 보호 페이지를 통과한다", async () => {
    const session = await login();
    const value = await sealSession(session);
    const result = await proxy(request("/me", `session=${value}; NEXT_LOCALE=ko`));
    expect(result.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/ko/me");
    expect(result.cookies.get("session")).toBeUndefined();
    expect((await mockClient(session.accessToken).GET("/me")).response.status).toBe(200);
  });

  it("남은 시간이 정확히 60초인 세션은 갱신하지 않는다", async () => {
    const now = Date.now();
    const session = {
      ...(await login()),
      accessTokenExpiresAt: new Date(now + 60000).toISOString(),
    };
    vi.spyOn(Date, "now").mockReturnValue(now);
    const result = await proxy(request("/me", `session=${await sealSession(session)}`));
    expect(result.cookies.get("session")).toBeUndefined();
    expect((await mockClient(session.accessToken).GET("/me")).response.status).toBe(200);
  });

  it("POST 갱신이 응답·요청 쿠키와 next-intl 로케일을 함께 보존한다", async () => {
    const session = {
      ...(await login()),
      accessTokenExpiresAt: new Date(Date.now() + 59000).toISOString(),
    };
    const oldCookie = await sealSession(session);
    const result = await proxy(
      request("/en/me", `session=${oldCookie}; NEXT_LOCALE=ko; unrelated=kept`, "POST"),
    );
    const nextCookie = result.cookies.get("session")!.value;
    const renewed = await unsealSession(nextCookie);
    expect(renewed?.accessToken).not.toBe(session.accessToken);
    expect(renewed?.refreshToken).not.toBe(session.refreshToken);
    expect(result.headers.get("x-middleware-request-cookie")).toContain(`session=${nextCookie}`);
    expect(result.headers.get("x-middleware-request-cookie")).toContain("unrelated=kept");
    expect(result.headers.get("x-middleware-request-x-next-intl-locale")).toBe("en");
    expect(result.headers.get("x-middleware-override-headers")?.split(",")).toContain("cookie");
    expect(result.cookies.get("NEXT_LOCALE")?.value).toBe("en");
    expect((await mockClient(renewed!.accessToken).GET("/me")).response.status).toBe(200);
  });

  it("별도 proxy 호출과 늦은 옛 쿠키도 같은 갱신 결과를 받는다", async () => {
    const session = {
      ...(await login()),
      accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
    };
    const cookie = `session=${await sealSession(session)}; NEXT_LOCALE=ko`;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => proxy(request("/me", cookie))),
    );
    const late = await proxy(request("/me", cookie));
    const sessions = await Promise.all(
      [...results, late].map((response) => unsealSession(response.cookies.get("session")!.value)),
    );
    expect(new Set(sessions.map((value) => value?.accessToken)).size).toBe(1);
    expect((await mockClient(sessions[0]!.accessToken).GET("/me")).response.status).toBe(200);
  });

  it("갱신 실패는 쿠키를 지우고 POST를 GET 로그인으로 보낸다", async () => {
    const session = {
      ...(await login()),
      accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
    };
    await mockClient(session.accessToken).DELETE("/sessions/current");
    const result = await proxy(request("/en/me", `session=${await sealSession(session)}`, "POST"));
    expect(result.status).toBe(303);
    expect(new URL(result.headers.get("location")!).pathname).toBe("/en/login");
    expect(result.cookies.get("session")).toMatchObject({
      value: "",
      maxAge: 0,
      httpOnly: true,
      path: "/",
    });
  });

  it("/en으로 시작하는 한국어 경로는 영어 로케일로 오인하지 않는다", async () => {
    const session = {
      ...(await login()),
      accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
    };
    await mockClient(session.accessToken).DELETE("/sessions/current");
    const result = await proxy(request("/enough", `session=${await sealSession(session)}`));
    expect(new URL(result.headers.get("location")!).pathname).toBe("/login");
  });

  it("변조 쿠키는 보호 경로에서 지우고 공개 경로에서는 페이지를 유지한다", async () => {
    const protectedResponse = await proxy(request("/me", "session=broken"));
    expect(protectedResponse.status).toBe(303);
    expect(protectedResponse.cookies.get("session")?.maxAge).toBe(0);
    const publicResponse = await proxy(request("/", "session=broken"));
    expect(publicResponse.headers.get("location")).toBeNull();
    expect(publicResponse.cookies.get("session")?.maxAge).toBe(0);
  });

  it("matcher는 페이지 Server Action POST를 포함하고 쿠키 정리 route를 제외한다", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ["/me", "/en/me", "/my-posts", "/me/a.b", "/en/%6d%65/a.b"])
      expect(matcher.test(path)).toBe(true);
    expect(matcher.test("/session/clear")).toBe(false);
    expect(matcher.test("/icon.svg")).toBe(false);
  });
});
