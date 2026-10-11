import { registerHooks } from "node:module";
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { appSessionCookieName } from "../src/lib/app-config.mjs";
import { createTarget, targetName, targetEnvironment } from "./targets";
import { ko, en } from "../src/lib/i18n/catalogs";
import type { components } from "../src/lib/api/schema";

type PermissionCode = components["schemas"]["PermissionCode"];

export { test, expect };
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

function accountOptions(request: APIRequestContext) {
  const name = targetName();
  const env = targetEnvironment(name);
  const target = createTarget(name, request);
  return {
    origin: new URL(env.API_BASE_URL!).origin,
    options: {
      mailLink: target.mailLink,
      ...(name === "fastapi"
        ? {
            seedAccount: {
              email: env.E2E_SEED_ADMIN_EMAIL!,
              password: env.E2E_SEED_ADMIN_PASSWORD!,
            },
          }
        : {}),
    },
  };
}

export async function member(request: APIRequestContext, locale: "ko" | "en" = "ko") {
  const { origin, options } = accountOptions(request);
  return (await fixtures()).memberFixture(origin, locale, options);
}
export async function admin(
  request: APIRequestContext,
  locale: "ko" | "en" = "ko",
  permissions: readonly PermissionCode[] = ["admin:access", "posts:manage", "users:read"],
) {
  const { origin, options } = accountOptions(request);
  return (await fixtures()).partialAdminFixture(origin, locale, permissions, options);
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
  const subscriptions = new Map<string, string>();
  const subscribed = new Set<string>();
  const subscriptionCounts = new Map<string, number>();
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname !== "/socket.io/") return;
    let active = false;
    socket.on("framesent", ({ payload }) => {
      // 티켓 본문은 저장하지 않고 인증 연결 여부만 확인한다.
      if (String(payload).startsWith("40") && String(payload).includes('"ticket"')) active = true;
      const match = String(payload).match(/^42(\d+)(\[.*)$/);
      if (match) {
        const [name, body] = JSON.parse(match[2]!) as [string, { channel?: string }];
        if (name === "subscribe" && body.channel) subscriptions.set(match[1]!, body.channel);
      }
    });
    socket.on("framereceived", ({ payload }) => {
      const frame = String(payload);
      if (active && frame.startsWith("40")) connected = true;
      const match = frame.match(/^42\d*(\[.*)$/);
      if (match) events.add((JSON.parse(match[1]!) as [string])[0]);
      const ack = frame.match(/^43(\d+)(\[.*)$/);
      if (ack && (JSON.parse(ack[2]!) as [{ ok: boolean }])[0].ok) {
        const channel = subscriptions.get(ack[1]!);
        if (channel) {
          subscribed.add(channel);
          subscriptionCounts.set(channel, (subscriptionCounts.get(channel) ?? 0) + 1);
        }
      }
    });
  });
  return {
    get connected() {
      return connected;
    },
    received: (name: string) => events.has(name),
    subscribed: (channel: string) => subscribed.has(channel),
    subscriptionCount: (channel: string) => subscriptionCounts.get(channel) ?? 0,
  };
}
