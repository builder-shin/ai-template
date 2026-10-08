import { ko, en } from "../src/lib/i18n/catalogs";
import { randomUUID } from "node:crypto";
import { test, expect, sessionCookieName, logout } from "./fixtures";

for (const provider of ["google", "kakao", "naver"] as const) {
  test(`${provider} 소셜 로그인은 PKCE 콜백 뒤 returnTo로 돌아오고 로그아웃된다`, async ({
    page,
    target,
    context,
  }) => {
    const username = `social-${randomUUID()}`;
    const name = `Social ${randomUUID()}`;
    const destination = "/me?from=social-e2e";
    await page.goto(`/login?returnTo=${encodeURIComponent(destination)}`);
    await page.getByRole("link", { name: ko.auth.social[provider], exact: true }).click();
    // 가짜 제공자의 UI·claims는 어댑터만 안다. W4는 모의 OAuth 서버로 교체한다.
    await target.completeSocialLogin(page, provider, { username, name });
    await expect(page).toHaveURL(destination);
    await expect(
      page.getByRole("button", { name: ko.layout.userMenu.replace("{name}", name), exact: true }),
    ).toBeVisible();
    expect((await context.cookies()).some((cookie) => cookie.name === sessionCookieName)).toBe(
      true,
    );
    expect((await context.cookies()).some((cookie) => cookie.name === "__Host-oauth")).toBe(false);
    await expect(page.getByLabel(ko.me.nameLabel, { exact: true })).toHaveValue(name);
    await logout(page, { name, email: "", password: "", locale: "ko" });
  });
}

test("소셜 로그인 거부는 현재 언어의 안내를 보여 주고 시도 쿠키를 지운다", async ({
  page,
  target,
  context,
}) => {
  await page.goto("/en/login?returnTo=%2Fen%2Fme");
  await page.getByRole("link", { name: en.auth.social.google, exact: true }).click();
  await target.denySocialLogin(page, "google");
  await expect(page).toHaveURL("/en/login?returnTo=%2Fen%2Fme&notice=auth.oauth_denied");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(en.errors.auth.oauth_denied);
  expect((await context.cookies()).some((cookie) => cookie.name === sessionCookieName)).toBe(false);
  expect((await context.cookies()).some((cookie) => cookie.name === "__Host-oauth")).toBe(false);
});
