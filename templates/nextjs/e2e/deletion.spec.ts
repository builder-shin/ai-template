import { ko, en } from "../src/lib/i18n/catalogs";
import { test, expect, sessionCookieName, signupAndVerify, login } from "./fixtures";

for (const locale of ["ko", "en"] as const) {
  test(`${locale} 탈퇴 재인증 후 확인 화면으로 돌아와 계정을 지운다`, async ({
    page,
    target,
    context,
  }) => {
    const account = await signupAndVerify(page, target, locale);
    await login(page, account);
    const prefix = locale === "ko" ? "" : "/en";
    const t = locale === "ko" ? ko : en;
    await page.goto(`${prefix}/me`);
    await page
      .getByRole("link", { name: locale === "ko" ? "회원 탈퇴" : "Delete account", exact: true })
      .click();
    await expect(page).toHaveURL(`${prefix}/me/delete`);
    // 목의 짧은 창을 기다린다. W4는 FastAPI에서 같은 재인증 조건을 준비한다.
    await target.expireRecentLogin();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: locale === "ko" ? "탈퇴하기" : "Delete account", exact: true })
      .click();
    await expect(page).toHaveURL(
      `${prefix}/login?returnTo=${encodeURIComponent(`${prefix}/me/delete`)}&notice=reauthentication`,
    );
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      t.errors.auth.reauthentication_required,
    );
    expect((await context.cookies()).some((cookie) => cookie.name === sessionCookieName)).toBe(
      false,
    );
    await page.getByRole("textbox", { name: t.auth.email, exact: true }).fill(account.email);
    await page.getByLabel(t.auth.passwordLabel, { exact: true }).fill(account.password);
    await page.getByRole("button", { name: t.auth.login, exact: true }).click();
    await expect(page).toHaveURL(`${prefix}/me/delete`);
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: locale === "ko" ? "탈퇴하기" : "Delete account", exact: true })
      .click();
    await expect(page).toHaveURL(prefix || "/");
    expect((await context.cookies()).some((cookie) => cookie.name === sessionCookieName)).toBe(
      false,
    );
    await expect(
      page.getByRole("banner").getByRole("link", { name: t.layout.login, exact: true }),
    ).toBeVisible();
    await login(page, account, false);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      t.errors.auth.invalid_credentials,
    );
  });
}
