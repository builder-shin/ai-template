import { appSessionCookieName } from "../../src/lib/app-config.mjs";
import { expect, inject, it } from "vitest";
import { JSDOM } from "jsdom";
import { deletionFixture } from "../../src/features/me/deletion-fixture";
import { sealSession } from "../../src/lib/session/cookie";
import { EXAMPLE_SESSION_SECRET } from "../../src/lib/env";
import { base } from "./helpers";

function document(html: string) {
  const dom = new JSDOM(html);
  const result = dom.window.document;
  dom.window.close();
  return result;
}
it.each(["ko", "en"] as const)(
  "%s 탈퇴는 JS 없는 확인 폼으로 계정을 지우고 홈으로 간다",
  async (locale) => {
    const owner = await deletionFixture(locale, inject("mockBaseUrl"));
    try {
      const prefix = locale === "ko" ? "" : "/en";
      const path = `${prefix}/me/delete`;
      const headers = {
        Cookie: `${appSessionCookieName("development")}=${await sealSession(owner.session, EXAMPLE_SESSION_SECRET)}; NEXT_LOCALE=${locale}`,
        "Accept-Language": locale,
        Origin: base,
      };
      const profile = document(await (await fetch(`${base}${prefix}/me`, { headers })).text());
      expect(profile.querySelector(`a[href="${path}"]`)).toBeTruthy();
      const page = document(await (await fetch(`${base}${path}`, { headers })).text());
      expect(page.querySelector("h1")?.textContent).toBe(
        locale === "ko" ? "회원 탈퇴" : "Delete account",
      );
      const form = page.getElementById("delete-account-form")! as HTMLFormElement;
      const body = new FormData();
      for (const input of form.querySelectorAll<HTMLInputElement>('input[type="hidden"]'))
        body.append(input.name, input.value);
      expect([...body.keys()].some((name) => name.startsWith("$ACTION_"))).toBe(true);
      expect((form.querySelector('input[name="confirm"]') as HTMLInputElement).required).toBe(true);
      const post = () =>
        fetch(new URL(form.getAttribute("action") || path, base), {
          method: "POST",
          headers,
          body,
          redirect: "manual",
        });
      const refused = await post();
      expect(refused.status).toBe(200);
      expect(document(await refused.text()).querySelector('[role="alert"]')?.textContent).toBe(
        locale === "ko" ? "탈퇴를 확인해 주세요." : "Confirm account deletion.",
      );
      expect((await owner.client.GET("/me")).response.status).toBe(200);
      body.set("confirm", "on");
      const success = await post();
      expect(success.status).toBe(303);
      expect(success.headers.get("location")).toBe(prefix || "/");
      owner.markDeleted();
      expect(
        success.headers
          .getSetCookie()
          .some(
            (cookie) =>
              cookie.startsWith(`${appSessionCookieName("development")}=;`) &&
              cookie.includes("Max-Age=0"),
          ),
      ).toBe(true);
      await expect(owner.client.GET("/me")).rejects.toMatchObject({ status: 401 });
    } finally {
      await owner.stop();
    }
  },
);
it.each(["ko", "en"] as const)(
  "%s 로그인에서 재인증 사유를 번역하고 폼 재제출 경로에도 보존한다",
  async (locale) => {
    const path = `${locale === "ko" ? "" : "/en"}/login?returnTo=${encodeURIComponent(`${locale === "ko" ? "" : "/en"}/me/delete`)}&notice=reauthentication`;
    const response = await fetch(`${base}${path}`, { headers: { "Accept-Language": locale } });
    const page = document(await response.text());
    expect(page.querySelector('[role="alert"]')?.textContent).toBe(
      locale === "ko" ? "다시 로그인하세요." : "Please sign in again.",
    );
    expect(
      page.querySelector('form input[type="email"]')?.closest("form")?.getAttribute("action"),
    ).toBe(path);
  },
);
it("익명 탈퇴 화면은 로그인과 복귀 경로로 보낸다", async () => {
  const response = await fetch(`${base}/me/delete`, {
    redirect: "manual",
    headers: { "Accept-Language": "ko" },
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/login?returnTo=%2Fme%2Fdelete");
});
