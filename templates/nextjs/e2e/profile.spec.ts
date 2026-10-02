import { randomUUID } from "node:crypto";
import { test, expect, signupAndVerify, login, logout } from "./fixtures";
import { webOrigin } from "./targets";
import ko from "../messages/ko.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

for (const locale of ["ko", "en"] as const) {
  const t = locale === "ko" ? ko : en;
  const prefix = locale === "ko" ? "" : "/en";
  test(`${locale} 이름과 아바타를 저장하면 헤더와 다시 연 프로필에 반영된다`, async ({
    page,
    target,
  }) => {
    const account = await signupAndVerify(page, target, locale);
    await login(page, account);
    await page.goto(`${prefix}/me`);
    const name = `Profile ${randomUUID()}`;
    await page.getByLabel(t.me.nameLabel, { exact: true }).fill(name);
    // PNG는 실행 때 만든다. 저장소에는 텍스트만 둔다.
    await page.getByLabel(t.me.avatarLabel, { exact: true }).setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(page.locator('input[name="avatar"]')).not.toHaveValue("");
    await page.getByRole("button", { name: t.me.save, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(t.me.saved);
    await expect(
      page.getByRole("button", { name: t.layout.userMenu.replace("{name}", name), exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(t.me.nameLabel, { exact: true })).toHaveValue(name);
    await expect
      .poll(() =>
        page
          .getByRole("img", { name: t.me.avatarLabel, exact: true })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(1);
  });
}

test("프로필 언어를 바꾸면 URL·쿠키·다음 로그인 언어가 함께 바뀐다", async ({
  page,
  target,
  context,
}) => {
  const account = await signupAndVerify(page, target, "ko");
  await login(page, account);
  await page.goto("/me");
  await page.getByLabel(ko.me.localeLabel, { exact: true }).selectOption("en");
  await page.getByRole("button", { name: ko.me.save, exact: true }).click();
  await expect(page).toHaveURL("/en/me");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByLabel(en.me.localeLabel, { exact: true })).toHaveValue("en");
  expect((await context.cookies()).find((cookie) => cookie.name === "NEXT_LOCALE")?.value).toBe(
    "en",
  );
  await logout(page, { ...account, locale: "en" });
  // 한국어 로그인으로 들어가도 저장한 계정 언어가 우선한다.
  await context.addCookies([{ name: "NEXT_LOCALE", value: "ko", url: webOrigin }]);
  await login(page, account, false);
  await expect(page).toHaveURL("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/en/me");
  await expect(page.getByLabel(en.me.localeLabel, { exact: true })).toHaveValue("en");
});

test("헤더 언어 전환은 공개 목록의 검색 조건과 선택 쿠키를 보존한다", async ({ page, context }) => {
  await page.goto("/posts?q=locale-e2e&sort=title");
  await page
    .getByRole("navigation", { name: ko.locale.switcher })
    .getByRole("link", { name: "English", exact: true })
    .click();
  await expect(page).toHaveURL("/en/posts?q=locale-e2e&sort=title");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByLabel(en.posts.search, { exact: true })).toHaveValue("locale-e2e");
  expect((await context.cookies()).find((cookie) => cookie.name === "NEXT_LOCALE")?.value).toBe(
    "en",
  );
  await page
    .getByRole("navigation", { name: en.locale.switcher })
    .getByRole("link", { name: "한국어", exact: true })
    .click();
  await expect(page).toHaveURL("/posts?q=locale-e2e&sort=title");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.getByLabel(ko.posts.search, { exact: true })).toHaveValue("locale-e2e");
  expect((await context.cookies()).find((cookie) => cookie.name === "NEXT_LOCALE")?.value).toBe(
    "ko",
  );
});
