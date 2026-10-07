import { appSessionCookieName } from "../../src/lib/app-config.mjs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { profileFixture } from "../../src/features/me/test-fixture";
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
const fixtures: Awaited<ReturnType<typeof profileFixture>>[] = [];
beforeAll(async () => {
  for (const locale of ["ko", "en"] as const) fixtures.push(await profileFixture(locale));
});
afterAll(async () => {
  for (const fixture of fixtures) await fixture.stop();
});
it.each(["ko", "en"] as const)(
  "%s 내 정보와 비밀번호 폼은 JS 없이 제출하고 로케일·헤더를 갱신한다",
  async (locale) => {
    const fixture = fixtures[locale === "ko" ? 0 : 1]!;
    const path = locale === "ko" ? "/me" : "/en/me";
    const headers = {
      Cookie: `${appSessionCookieName("development")}=${await sealSession(fixture.session, EXAMPLE_SESSION_SECRET)}; NEXT_LOCALE=${locale}`,
      "Accept-Language": locale,
      Origin: base,
    };
    const get = async (url = path) => (await fetch(`${base}${url}`, { headers })).text();
    const post = (input: ReturnType<typeof form>) =>
      fetch(new URL(input.action || path, base), {
        method: "POST",
        body: input.body,
        headers,
        redirect: "manual",
      });
    const html = await get();
    expect(document(html).querySelector("h1")?.textContent).toBe(
      locale === "ko" ? "내 정보" : "My profile",
    );
    const invalid = form(html, "profile-form");
    invalid.body.set("name", "");
    invalid.body.set("locale", locale);
    const failed = await post(invalid);
    expect(failed.status).toBe(200);
    const failedHtml = await failed.text();
    expect(document(failedHtml).querySelector('[name="name"]')?.getAttribute("aria-invalid")).toBe(
      "true",
    );
    const save = form(failedHtml, "profile-form");
    save.body.set("name", "HTTP 새 이름");
    save.body.set("locale", locale);
    const saved = await post(save);
    expect(saved.status).toBe(200);
    expect(document(await saved.text()).querySelector("header button")?.textContent).toContain(
      "HTTP 새 이름",
    );
    const second = await fixture.login();
    const password = form(await get(), "password-change-form");
    password.body.set("currentPassword", "wrong-password");
    password.body.set("newPassword", "http-new-password");
    const wrong = await post(password);
    expect(wrong.status).toBe(200);
    const wrongHtml = await wrong.text();
    expect(
      document(wrongHtml).querySelector('[name="currentPassword"]')?.getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      document(wrongHtml).querySelector('[name="currentPassword"]')?.getAttribute("value"),
    ).not.toBe("wrong-password");
    const change = form(wrongHtml, "password-change-form");
    change.body.set("currentPassword", fixture.password);
    change.body.set("newPassword", "http-new-password");
    const changed = await post(change);
    expect(changed.status).toBe(200);
    expect(document(await changed.text()).body.textContent).toContain(
      locale === "ko" ? "다른 기기에서 로그아웃되었습니다." : "Other devices have been signed out.",
    );
    await expect(second.client.GET("/me")).rejects.toMatchObject({ status: 401 });
    const switchLocale = form(await get(), "profile-form");
    const nextLocale = locale === "ko" ? "en" : "ko";
    switchLocale.body.set("name", "HTTP 새 이름");
    switchLocale.body.set("locale", nextLocale);
    const switched = await post(switchLocale);
    expect(switched.status).toBe(303);
    expect(switched.headers.get("location")).toBe(nextLocale === "ko" ? "/me" : "/en/me");
    expect(
      switched.headers
        .getSetCookie()
        .some((cookie) => cookie.startsWith(`NEXT_LOCALE=${nextLocale};`)),
    ).toBe(true);
    headers.Cookie = headers.Cookie.replace(`NEXT_LOCALE=${locale}`, `NEXT_LOCALE=${nextLocale}`);
    expect(
      document(await get(nextLocale === "ko" ? "/me" : "/en/me")).querySelector("html")?.lang,
    ).toBe(nextLocale);
  },
  30000,
);
it("비로그인한 내 정보 요청은 로그인으로 이동한다", async () => {
  const response = await fetch(`${base}/me`, {
    redirect: "manual",
    headers: { "Accept-Language": "ko" },
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toContain("/login?returnTo=");
});
