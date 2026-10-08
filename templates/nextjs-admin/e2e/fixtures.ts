import { registerHooks } from "node:module";
import { test, expect, type Page } from "@playwright/test";
import { appSessionCookieName } from "../src/lib/app-config.mjs";
import { mockOrigin } from "./targets";
import { ko, en } from "../src/lib/i18n/catalogs";
import type { components } from "../src/lib/api/schema";

type PermissionCode = components["schemas"]["PermissionCode"];

export { test, expect, mockOrigin };
export const sessionCookieName = appSessionCookieName("production");

/** Node의 테스트 worker에서만 server-only 표식을 비운다. 앱 빌드는 경계를 유지한다. */
async function fixtures() {
  const hook = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "server-only")
        return {
          url: new URL("../scripts/test/server-only.ts", import.meta.url).href,
          shortCircuit: true,
        };
      if (specifier.endsWith(".json")) {
        const importAttributes = { type: "json" };
        return { ...next(specifier, { ...context, importAttributes }), importAttributes };
      }
      return next(specifier, context);
    },
  });
  try {
    return await import("../scripts/test/admin-fixture");
  } finally {
    hook.deregister();
  }
}

export async function member(locale: "ko" | "en" = "ko") {
  return (await fixtures()).memberFixture(mockOrigin, locale);
}
export async function admin(
  locale: "ko" | "en" = "ko",
  permissions: readonly PermissionCode[] = ["admin:access", "posts:manage", "users:read"],
) {
  return (await fixtures()).partialAdminFixture(mockOrigin, locale, permissions);
}
export async function login(
  page: Page,
  account: { email: string; password: string; locale: "ko" | "en" },
) {
  const t = (account.locale === "ko" ? ko : en).auth;
  await page.goto(account.locale === "ko" ? "/login" : "/en/login");
  await page.getByRole("textbox", { name: t.email, exact: true }).fill(account.email);
  await page.getByLabel(t.passwordLabel, { exact: true }).fill(account.password);
  await page.getByRole("button", { name: t.login, exact: true }).click();
}

export function realtime(page: Page) {
  let connected = false;
  const events = new Set<string>();
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname !== "/socket.io/") return;
    let active = false;
    socket.on("framesent", ({ payload }) => {
      // 티켓 본문은 저장하지 않고 인증 연결 여부만 확인한다.
      if (String(payload).startsWith("40") && String(payload).includes('"ticket"')) active = true;
    });
    socket.on("framereceived", ({ payload }) => {
      const frame = String(payload);
      if (active && frame.startsWith("40")) connected = true;
      const match = frame.match(/^42\d*(\[.*)$/);
      if (match) events.add((JSON.parse(match[1]!) as [string])[0]);
    });
  });
  return {
    get connected() {
      return connected;
    },
    received: (name: string) => events.has(name),
  };
}
