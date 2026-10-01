import { describe, expect, it } from "vitest";
import { EXAMPLE_SESSION_SECRET } from "../../src/lib/env";
import { sealSession } from "../../src/lib/session/cookie";
import {
  base,
  login,
  mockClient,
  postForm,
  responseSession,
  serverForm,
  sessionHeaders,
} from "./helpers";

describe("§13 #3/#4/#5 실제 페이지·헤더·로그아웃 Action", () => {
  it.each(["/", "/en"])(
    "%s의 같은 렌더링은 거절된 옛 토큰 대신 갱신 토큰으로 헤더를 읽는다",
    async (path) => {
      const old = {
        ...(await login()),
        accessToken: "rejected-old-access",
        accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
      };
      const response = await fetch(`${base}${path}`, {
        headers: sessionHeaders(await sealSession(old, EXAMPLE_SESSION_SECRET)),
        redirect: "manual",
      });
      expect(response.status).toBe(200);
      const session = await responseSession(response);
      const html = await response.text();
      expect(html).toContain(path === "/en" ? "User menu: Admin" : "사용자 메뉴: Admin");
      expect(html).toContain(path === "/en" ? '<html lang="en">' : '<html lang="ko">');
      expect(html).not.toContain(session.accessToken);
      expect(html).not.toContain(session.refreshToken);
      expect(session.accessToken).not.toBe(old.accessToken);
      if (path === "/en")
        expect(
          response.headers.getSetCookie().some((value) => value.startsWith("NEXT_LOCALE=en;")),
        ).toBe(true);
      expect((await mockClient(session.accessToken).GET("/me")).response.status).toBe(200);
    },
  );

  it("별도 HTTP proxy 호출과 늦은 옛 쿠키가 같은 갱신 결과를 공유한다", async () => {
    const old = {
      ...(await login()),
      accessToken: "rejected-old-access",
      accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
    };
    const headers = sessionHeaders(await sealSession(old, EXAMPLE_SESSION_SECRET));
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => fetch(`${base}/en`, { headers, redirect: "manual" })),
    );
    responses.push(await fetch(`${base}/en`, { headers, redirect: "manual" }));
    const sessions = [];
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("User menu: Admin");
      sessions.push(await responseSession(response));
    }
    expect(new Set(sessions.map((session) => session.accessToken)).size).toBe(1);
    expect(new Set(sessions.map((session) => session.refreshToken)).size).toBe(1);
    expect((await mockClient(sessions[0]!.accessToken).GET("/me")).response.status).toBe(200);
  });

  it("JS 없는 로그아웃 POST는 proxy에서 갱신한 토큰으로 실제 세션을 폐기한다", async () => {
    const tokens = await login();
    const page = await fetch(`${base}/en`, {
      headers: sessionHeaders(await sealSession(tokens, EXAMPLE_SESSION_SECRET)),
    });
    expect(page.status).toBe(200);
    const form = serverForm(await page.text(), "logout");
    const old = {
      ...tokens,
      accessToken: "rejected-old-access",
      accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
    };
    const response = await postForm("/en", form, await sealSession(old, EXAMPLE_SESSION_SECRET));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!, base).pathname).toBe("/en");
    expect(response.headers.get("set-cookie")).toContain("session=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    // 옛 토큰으로 DELETE했다면 세션이 살아 있어 이 조회가 성공한다.
    await expect(mockClient(tokens.accessToken).GET("/me")).rejects.toMatchObject({ status: 401 });
  });

  it("실패한 refresh는 HTTP 응답에서 쿠키를 지우고 영어 로그인으로 보낸다", async () => {
    const old = {
      ...(await login()),
      accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
    };
    await mockClient(old.accessToken).DELETE("/sessions/current");
    const response = await fetch(`${base}/en`, {
      headers: sessionHeaders(await sealSession(old, EXAMPLE_SESSION_SECRET)),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!, base).pathname).toBe("/en/login");
    expect(response.headers.get("set-cookie")).toContain("session=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("헤더 렌더링의 실제 401은 정리 route에서 쿠키를 지우고 로그인으로 이어진다", async () => {
    const tokens = await login();
    const cookie = await sealSession(tokens, EXAMPLE_SESSION_SECRET);
    await mockClient(tokens.accessToken).DELETE("/sessions/current");
    const response = await fetch(`${base}/en`, {
      headers: sessionHeaders(cookie),
      redirect: "manual",
    });
    expect(response.status).toBe(307);
    const clearUrl = new URL(response.headers.get("location")!, base);
    expect(clearUrl.pathname).toBe("/session/clear");
    // 브라우저의 같은 origin 이동에는 Origin이 없어도 Fetch Metadata가 있다.
    const cleared = await fetch(clearUrl, {
      headers: { ...sessionHeaders(cookie), "Sec-Fetch-Site": "same-origin" },
      redirect: "manual",
    });
    expect(cleared.status).toBe(303);
    expect(cleared.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(new URL(cleared.headers.get("location")!, base).pathname).toBe("/en/login");
  });

  it("cross-site 쿠키 정리 요청은 실제 HTTP에서도 Set-Cookie를 보내지 않는다", async () => {
    const cookie = await sealSession(await login(), EXAMPLE_SESSION_SECRET);
    const response = await fetch(`${base}/session/clear?returnTo=%2Fen`, {
      headers: {
        ...sessionHeaders(cookie),
        "Sec-Fetch-Site": "cross-site",
        Origin: "https://evil.example",
      },
      redirect: "manual",
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
