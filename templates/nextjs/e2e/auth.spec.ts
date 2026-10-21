import { randomUUID } from "node:crypto";
import { test, expect, sessionCookieName, signupAndVerify, login, logout } from "./fixtures";

test("한국어 가입과 실제 메일 링크 인증", async ({ page, target }) => {
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (/Base UI:|not configured to support act/.test(message.text()))
      diagnostics.push(message.text());
  });
  await page.goto("/signup");
  for (let attempt = 1; attempt <= 2; attempt++) {
    const name = `Retry ${attempt}`;
    const email = `signup-retry-${randomUUID()}@example.com`;
    await page.getByLabel("이름", { exact: true }).fill(name);
    await page.getByLabel("이메일", { exact: true }).fill(email);
    await page.getByLabel("비밀번호", { exact: true }).fill("short"); // betterleaks:allow 사유: 검증 실패용 비밀번호
    await page.getByRole("button", { name: "가입", exact: true }).click();
    await expect(page.getByLabel("비밀번호", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByLabel("이름", { exact: true })).toHaveValue(name);
    await expect(page.getByLabel("이메일", { exact: true })).toHaveValue(email);
    await expect(page.getByLabel("비밀번호", { exact: true })).toHaveValue("");
  }
  expect(diagnostics).toEqual([]);
  await signupAndVerify(page, target, "ko");
  await expect(page.getByRole("status")).toHaveText(
    "이메일 인증을 마쳤습니다. 이제 로그인할 수 있습니다.",
  );
  await expect(
    page.getByRole("banner").getByRole("link", { name: "로그인", exact: true }),
  ).toBeVisible();
});

test("/en 로그인과 사용자 메뉴 로그아웃", async ({ page, target, context }) => {
  const account = await signupAndVerify(page, target, "en");
  await login(page, account);
  await expect(page).toHaveURL("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const cookie = (await context.cookies()).find((value) => value.name === sessionCookieName);
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
  await logout(page, account);
  expect((await context.cookies()).some((value) => value.name === sessionCookieName)).toBe(false);
  await page.reload();
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Log in", exact: true }),
  ).toBeVisible();
});

test("/en 재설정 메일과 새 비밀번호 로그인", async ({ page, target, context }) => {
  const account = await signupAndVerify(page, target, "en");
  await login(page, account);
  await page.goto("/en/forgot-password");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(account.email);
  await page.getByRole("button", { name: "Send reset email", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "If an account exists for that email, we sent a password reset link. Check your inbox.",
  );
  const link = await target.mailLink(account.email, "reset");
  expect(new URL(link).pathname).toBe("/reset-password");
  await page.goto(link);
  await expect(page).toHaveURL(/\/en\/reset-password\?token=/);
  const nextPassword = `reset-${randomUUID()}`;
  await page.getByLabel("New password", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Your password has been reset. Log in with your new password.",
  );
  expect((await context.cookies()).some((value) => value.name === sessionCookieName)).toBe(false);
  await login(page, account, false);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Check your email or password.",
  );
  await login(page, { ...account, password: nextPassword });
  await expect(page).toHaveURL("/en");
  await logout(page, account);
});

test("로그인 필수 경로는 returnTo를 보존하고 로그인 뒤 돌아간다", async ({ page, target }) => {
  const account = await signupAndVerify(page, target, "ko");
  const destination = "/me?from=e2e";
  await page.goto(destination);
  const redirected = new URL(page.url());
  expect(redirected.pathname).toBe("/login");
  expect(redirected.searchParams.get("returnTo")).toBe(destination);
  await login(page, account, true, `${redirected.pathname}${redirected.search}`);
  await expect(page).toHaveURL(destination);
  await expect(
    page.getByRole("button", { name: `사용자 메뉴: ${account.name}`, exact: true }),
  ).toBeVisible();
  await logout(page, account);
});
