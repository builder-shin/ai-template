import { appSessionCookieName } from "../../src/lib/app-config.mjs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { sessionsFixture } from "../../src/features/sessions/test-fixture";
import { sealSession } from "../../src/lib/session/cookie";
import { EXAMPLE_SESSION_SECRET } from "../../src/lib/env";
import { base } from "./helpers";

function document(html: string) {
  const dom = new JSDOM(html);
  const result = dom.window.document;
  dom.window.close();
  return result;
}
function form(html: string, id: string) {
  const element = document(html).getElementById(id)! as HTMLFormElement;
  expect(element).toBeTruthy();
  const body = new FormData();
  for (const input of element.querySelectorAll<HTMLInputElement>('input[type="hidden"]'))
    body.append(input.name, input.value);
  expect([...body.keys()].some((name) => name.startsWith("$ACTION_"))).toBe(true);
  return { body, action: element.getAttribute("action")! };
}
const fixtures: Awaited<ReturnType<typeof sessionsFixture>>[] = [];
beforeAll(async () => {
  for (const locale of ["ko", "en"] as const) fixtures.push(await sessionsFixture(locale));
});
afterAll(async () => {
  for (const fixture of fixtures) await fixture.stop();
});
it.each(["ko", "en"] as const)(
  "%s JS 없는 폐기 폼으로 다른 세션을 끝내고 폐기된 쿠키를 로그인으로 보낸다",
  async (locale) => {
    const owner = fixtures[locale === "ko" ? 0 : 1]!;
    const second = await owner.login("Second browser");
    const path = locale === "ko" ? "/me/sessions" : "/en/me/sessions";
    const headers = {
      Cookie: `${appSessionCookieName("development")}=${await sealSession(owner.session, EXAMPLE_SESSION_SECRET)}; NEXT_LOCALE=${locale}`,
      "Accept-Language": locale,
      Origin: base,
    };
    const get = async () => (await fetch(`${base}${path}`, { headers })).text();
    const post = (input: ReturnType<typeof form>) =>
      fetch(new URL(input.action || path, base), {
        method: "POST",
        body: input.body,
        headers,
        redirect: "manual",
      });
    const html = await get();
    expect(document(html).querySelector("h1")?.textContent).toBe(
      locale === "ko" ? "세션 관리" : "Sessions",
    );
    const profile = await fetch(`${base}${locale === "ko" ? "/me" : "/en/me"}`, { headers });
    expect(document(await profile.text()).querySelector(`a[href="${path}"]`)).toBeTruthy();
    expect(html).not.toContain(owner.session.accessToken);
    const revoke = await post(form(html, `revoke-session-${second.id}`));
    expect(revoke.status).toBe(200);
    const updated = document(await revoke.text());
    expect(updated.getElementById(`revoke-session-${second.id}`)).toBeNull();
    expect(updated.getElementById(`revoke-session-${owner.id}`)).toBeTruthy();
    const message = locale === "ko" ? "세션 1개를 폐기했습니다." : "Revoked 1 session(s).";
    expect(
      [...updated.querySelectorAll('[role="status"]')].map((node) => node.textContent),
    ).toContain(message);
    await expect(second.client.GET("/me")).rejects.toMatchObject({ status: 401 });
    const revokedHeaders = {
      ...headers,
      Cookie: `${appSessionCookieName("development")}=${await sealSession(second.session, EXAMPLE_SESSION_SECRET)}; NEXT_LOCALE=${locale}`,
    };
    const revoked = await fetch(`${base}${path}`, { headers: revokedHeaders, redirect: "manual" });
    // 스트리밍된 layout 401은 HTTP Location 대신 NEXT_REDIRECT를 HTML에 담을 수도 있다.
    const revokedHtml = await revoked.text();
    const clearPath =
      revoked.headers.get("location") ??
      document(revokedHtml)
        .querySelector('meta[http-equiv="refresh"]')
        ?.getAttribute("content")
        ?.replace(/^\d+;url=/, "");
    expect(clearPath).toContain("/session/clear?returnTo=");
    const cleared = await fetch(new URL(clearPath!, base), {
      headers: revokedHeaders,
      redirect: "manual",
    });
    expect(cleared.status).toBe(303);
    const loginUrl = new URL(cleared.headers.get("location")!);
    expect(loginUrl.origin).toBe(base);
    expect(loginUrl.pathname).toBe(locale === "ko" ? "/login" : "/en/login");
    expect(loginUrl.searchParams.get("returnTo")).toMatch(/^\/(?:en(?:\/|$))?/);
    expect(
      cleared.headers
        .getSetCookie()
        .some(
          (cookie) =>
            cookie.startsWith(`${appSessionCookieName("development")}=;`) &&
            cookie.includes("Max-Age=0"),
        ),
    ).toBe(true);
    const login = await fetch(cleared.headers.get("location")!, {
      headers: { "Accept-Language": locale, Cookie: `NEXT_LOCALE=${locale}` },
    });
    expect(document(await login.text()).querySelector('input[name="email"]')).toBeTruthy();
    const third = await owner.login();
    const others = await post(form(await get(), "revoke-others-form"));
    expect(others.status).toBe(200);
    await expect(third.client.GET("/me")).rejects.toMatchObject({ status: 401 });
    const fourth = await owner.login();
    const all = form(await get(), "revoke-all-form");
    // 서버에서도 확인을 강제한다. 조작한 폼은 세션을 끝내지 않는다.
    expect((await post(all)).status).toBe(200);
    expect((await owner.client.GET("/me")).response.status).toBe(200);
    all.body.set("confirm", "on");
    const ended = await post(all);
    expect(ended.status).toBe(303);
    expect(ended.headers.get("location")).toBe(
      `${locale === "ko" ? "/login" : "/en/login"}?returnTo=${encodeURIComponent(path)}`,
    );
    expect(
      ended.headers
        .getSetCookie()
        .some(
          (cookie) =>
            cookie.startsWith(`${appSessionCookieName("development")}=;`) &&
            cookie.includes("Max-Age=0"),
        ),
    ).toBe(true);
    for (const session of [owner, fourth])
      await expect(session.client.GET("/me")).rejects.toMatchObject({ status: 401 });
  },
  30000,
);
it.each(["ko", "en"] as const)(
  "%s 현재 세션의 JS 없는 개별 폐기는 쿠키 삭제와 로그인 이동으로 끝난다",
  async (locale) => {
    const owner = await sessionsFixture(locale);
    try {
      const second = await owner.login();
      const path = locale === "ko" ? "/me/sessions" : "/en/me/sessions";
      const headers = {
        Cookie: `${appSessionCookieName("development")}=${await sealSession(owner.session, EXAMPLE_SESSION_SECRET)}; NEXT_LOCALE=${locale}`,
        "Accept-Language": locale,
        Origin: base,
      };
      const html = await (await fetch(`${base}${path}`, { headers })).text();
      const revoke = form(html, `revoke-session-${owner.id}`);
      const ended = await fetch(new URL(revoke.action || path, base), {
        method: "POST",
        body: revoke.body,
        headers,
        redirect: "manual",
      });
      expect(ended.status).toBe(303);
      expect(ended.headers.get("location")).toBe(
        `${locale === "ko" ? "/login" : "/en/login"}?returnTo=${encodeURIComponent(path)}`,
      );
      expect(
        ended.headers
          .getSetCookie()
          .some(
            (cookie) =>
              cookie.startsWith(`${appSessionCookieName("development")}=;`) &&
              cookie.includes("Max-Age=0"),
          ),
      ).toBe(true);
      await expect(owner.client.GET("/me")).rejects.toMatchObject({ status: 401 });
      expect((await second.client.GET("/me")).response.status).toBe(200);
    } finally {
      await owner.stop();
    }
  },
);
it.each(["ko", "en"] as const)(
  "%s 마지막 페이지의 유일한 행을 폐기한 JS 없는 응답에도 성공 안내를 유지한다",
  async (locale) => {
    const owner = await sessionsFixture(locale);
    try {
      for (let index = 0; index < 9; index++) await owner.login();
      const current = await owner.login("Current browser");
      const path = `${locale === "ko" ? "/me/sessions" : "/en/me/sessions"}?page=2`;
      const headers = {
        Cookie: `${appSessionCookieName("development")}=${await sealSession(current.session, EXAMPLE_SESSION_SECRET)}; NEXT_LOCALE=${locale}`,
        "Accept-Language": locale,
        Origin: base,
      };
      const html = await (await fetch(`${base}${path}`, { headers })).text();
      const rows = document(html).querySelectorAll('form[id^="revoke-session-"]');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).not.toBe(`revoke-session-${current.id}`);
      const input = form(html, rows[0]!.id);
      const response = await fetch(new URL(input.action || path, base), {
        method: "POST",
        body: input.body,
        headers,
        redirect: "manual",
      });
      expect(response.status).toBe(200);
      const updated = document(await response.text());
      expect(updated.querySelectorAll('form[id^="revoke-session-"]')).toHaveLength(0);
      const message = locale === "ko" ? "세션 1개를 폐기했습니다." : "Revoked 1 session(s).";
      expect(
        [...updated.querySelectorAll('[role="status"]')].map((node) => node.textContent),
      ).toContain(message);
    } finally {
      await owner.stop();
    }
  },
);
it("익명 세션 화면은 로그인으로 이동한다", async () => {
  const response = await fetch(`${base}/me/sessions`, {
    redirect: "manual",
    headers: { "Accept-Language": "ko" },
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/login?returnTo=%2Fme%2Fsessions");
});
