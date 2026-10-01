import { chromium } from "@playwright/test";
import { expect, it } from "vitest";
import { EXAMPLE_SESSION_SECRET } from "../../src/lib/env";
import { sealSession } from "../../src/lib/session/cookie";
import { failureAccess, failureTrace } from "../test/header-failure-backend";
import { base, login } from "./helpers";

it.each([
  ["/", "오류가 발생했습니다", "다시 시도"],
  ["/en", "Something went wrong", "Try again"],
])("%s 헤더의 실제 /me 500도 번역한 복구 화면과 trace를 보여 준다", async (path, title, retry) => {
  const cookie = await sealSession(
    { ...(await login()), accessToken: failureAccess },
    EXAMPLE_SESSION_SECRET,
  );
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.addCookies([{ name: "session", value: cookie, url: base }]);
    const page = await context.newPage();
    await page.goto(`${base}${path}`);
    const body = await page.locator("body").innerText();
    expect(body).toContain(title);
    expect(body).toContain(failureTrace);
    expect(await page.locator("html").getAttribute("lang")).toBe(path === "/en" ? "en" : "ko");
    expect(await page.getByRole("button", { name: retry }).count()).toBe(1);
  } finally {
    await browser.close();
  }
});
