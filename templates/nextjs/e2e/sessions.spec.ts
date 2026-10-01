import { randomUUID } from "node:crypto";
import { test, expect, signupAndVerify, login, logout } from "./fixtures";
import { webOrigin } from "./targets";
import { observeRealtime } from "./realtime";
import en from "../messages/en.json" with { type: "json" };

test("세션 하나를 폐기하면 다른 컨텍스트는 자동 로그아웃하고 현재 세션은 유지된다", async ({
  page,
  target,
  browser,
  context,
}) => {
  const account = await signupAndVerify(page, target, "en");
  await login(page, account);
  const peer = await browser.newContext({ baseURL: webOrigin });
  try {
    const other = await peer.newPage();
    await login(other, account);
    const revokedConnection = observeRealtime(other);
    const currentConnection = observeRealtime(page);
    await other.goto("/en/me");
    await page.goto("/en/me/sessions");
    await expect.poll(() => revokedConnection.connected).toBe(true);
    await expect.poll(() => currentConnection.connected).toBe(true);
    const current = page.getByRole("listitem").filter({ hasText: en.sessions.current });
    await expect(current).toHaveCount(1);
    const revoked = page.getByRole("listitem").filter({ hasNotText: en.sessions.current });
    await expect(revoked).toHaveCount(1);
    await revoked.getByRole("button", { name: en.sessions.revoke, exact: true }).click();
    await expect(other).toHaveURL("/en/login?returnTo=%2Fen%2Fme");
    await expect.poll(() => revokedConnection.received.has("session.revoked")).toBe(true);
    await expect.poll(() => currentConnection.received.has("session.revoked")).toBe(true);
    await expect(
      other.getByRole("banner").getByRole("link", { name: en.layout.login, exact: true }),
    ).toBeVisible();
    expect((await peer.cookies()).some((cookie) => cookie.name === "__Host-session")).toBe(false);
    await expect(page).toHaveURL("/en/me/sessions");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    expect((await context.cookies()).some((cookie) => cookie.name === "__Host-session")).toBe(true);
    await page.reload();
    await expect(current).toHaveCount(1);
    await other.goto("/en/me");
    await expect(other).toHaveURL("/en/login?returnTo=%2Fen%2Fme");
  } finally {
    await peer.close();
  }
});

test("비밀번호 변경은 다른 컨텍스트를 로그아웃하고 새 비밀번호로만 로그인된다", async ({
  page,
  target,
  browser,
  context,
}) => {
  const account = await signupAndVerify(page, target, "en");
  await login(page, account);
  const peer = await browser.newContext({ baseURL: webOrigin });
  try {
    const other = await peer.newPage();
    await login(other, account);
    const revokedConnection = observeRealtime(other);
    const currentConnection = observeRealtime(page);
    await other.goto("/en/me");
    await page.goto("/en/me");
    await expect.poll(() => revokedConnection.connected).toBe(true);
    await expect.poll(() => currentConnection.connected).toBe(true);
    await page.getByLabel(en.me.currentPasswordLabel, { exact: true }).fill(account.password);
    const password = `changed-${randomUUID()}`;
    await page.getByLabel(en.me.newPasswordLabel, { exact: true }).fill(password);
    await page.getByRole("button", { name: en.me.passwordTitle, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(en.me.passwordChanged);
    await expect(other).toHaveURL("/en/login?returnTo=%2Fen%2Fme");
    await expect.poll(() => revokedConnection.received.has("session.revoked")).toBe(true);
    await expect.poll(() => currentConnection.received.has("session.revoked")).toBe(true);
    expect((await peer.cookies()).some((cookie) => cookie.name === "__Host-session")).toBe(false);
    expect((await context.cookies()).some((cookie) => cookie.name === "__Host-session")).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: en.me.title, exact: true })).toBeVisible();
    await logout(page, account);
    await login(page, account, false);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      en.errors.auth.invalid_credentials,
    );
    await login(page, { ...account, password });
    await expect(page).toHaveURL("/en");
  } finally {
    await peer.close();
  }
});
