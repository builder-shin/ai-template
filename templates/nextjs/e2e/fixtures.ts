import { randomUUID } from "node:crypto";
import { appSessionCookieName } from "../src/lib/app-config.mjs";

import { test as base, expect, type Page } from "@playwright/test";
import { createTarget, targetName, type TargetAdapter } from "./targets";
import ko from "../messages/ko.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

export const sessionCookieName = appSessionCookieName("production");

export { expect };
export const test = base.extend<{ target: TargetAdapter }>({
  target: async ({ request }, provide) => {
    await provide(createTarget(targetName(), request));
  },
});

interface Account {
  name: string;
  email: string;
  password: string;
  locale: "ko" | "en";
}

const copy = (locale: Account["locale"]) => (locale === "ko" ? ko : en);
const prefix = (locale: Account["locale"]) => (locale === "ko" ? "" : "/en");

export function waitForServerAction(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
  );
}

export async function signupAndVerify(
  page: Page,
  target: TargetAdapter,
  locale: Account["locale"],
) {
  const account: Account = {
    name: `E2E ${randomUUID()}`,
    email: `e2e-${randomUUID()}@example.com`,
    password: randomUUID(),
    locale,
  };
  const t = copy(locale);
  await page.goto(`${prefix(locale)}/signup`);
  await page.getByRole("textbox", { name: t.auth.name, exact: true }).fill(account.name);
  await page.getByRole("textbox", { name: t.auth.email, exact: true }).fill(account.email);
  await page.getByLabel(t.auth.passwordLabel, { exact: true }).fill(account.password);
  await page.getByRole("button", { name: t.auth.signup, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(t.auth.verificationSent);
  const link = await target.mailLink(account.email, "verification");
  expect(new URL(link).pathname).toBe("/verify-email");
  await page.goto(link);
  await expect(page).toHaveURL(new RegExp(`${prefix(locale)}/verify-email\\?token=`));
  await page.getByRole("button", { name: t.auth.verifyEmail, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(t.auth.verificationComplete);
  return account;
}

export async function login(page: Page, account: Account, success = true, path?: string) {
  const t = copy(account.locale);
  await page.goto(path ?? `${prefix(account.locale)}/login`);
  await page.getByRole("textbox", { name: t.auth.email, exact: true }).fill(account.email);
  await page.getByLabel(t.auth.passwordLabel, { exact: true }).fill(account.password);
  await page.getByRole("button", { name: t.auth.login, exact: true }).click();
  if (success)
    await expect(
      page.getByRole("button", {
        name: t.layout.userMenu.replace("{name}", account.name),
        exact: true,
      }),
    ).toBeVisible();
}

export async function logout(page: Page, account: Account) {
  const t = copy(account.locale);
  await page
    .getByRole("button", { name: t.layout.userMenu.replace("{name}", account.name), exact: true })
    .click();
  await page.getByRole("menuitem", { name: t.layout.logout, exact: true }).click();
  await expect(page).toHaveURL(prefix(account.locale) || "/");
  await expect(
    page.getByRole("banner").getByRole("link", { name: t.layout.login, exact: true }),
  ).toBeVisible();
}
