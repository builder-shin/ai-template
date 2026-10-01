import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { loginAction, logoutAction, resendVerificationAction } from "../src/features/auth/actions";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { unsealSession, sealSession } from "../src/lib/session/cookie";
import { login, mockClient } from "./test/session";

const context = vi.hoisted(() => ({
  locale: "ko",
  jar: new Map<string, { value: string; maxAge?: number }>(),
}));
// Next 요청 저장소만 대체한다. 인증·검증·메일·폐기는 실제 목이다.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => context.jar.get(name),
    set: (cookie: { name: string; value: string; maxAge?: number }) =>
      context.jar.set(cookie.name, cookie),
  }),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => context.locale }));
beforeEach(() => {
  context.jar.clear();
  context.locale = "ko";
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
});
afterEach(() => vi.unstubAllEnvs());

const adminPassword = "admin-password"; // betterleaks:allow 테스트 시드
function form(email = "admin@example.com", password = adminPassword) {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  return data;
}

async function register(locale: "ko" | "en", verified = true) {
  const email = `action-${randomUUID()}@example.com`;
  const client = mockClient();
  await client.POST("/registrations", {
    body: {
      data: {
        type: "registrations",
        attributes: {
          email,
          name: "Action user",
          locale,
          password: "action-test-password", // betterleaks:allow 테스트 비밀번호
        },
      },
    },
  });
  if (verified) {
    const response = await fetch(
      `${inject("mockBaseUrl")}/_test/mail?to=${encodeURIComponent(email)}`,
    );
    const mail = (await response.json()) as { messages: { text: string }[] };
    const token = new URL(mail.messages[0]!.text.match(/https?:\/\/\S+/)![0]).searchParams.get(
      "token",
    )!;
    await client.POST("/email-verifications", {
      body: { data: { type: "email-verifications", attributes: { token } } },
    });
  }
  return email;
}

describe("로그인 Action과 실제 목", () => {
  it.each([
    ["en", "/my-posts?tag=a&tag=b", "/en/my-posts?tag=a&tag=b"],
    ["ko", "/en/me?tab=profile", "/me?tab=profile"],
    ["ko", "/x/../en/me?tab=profile#details", "/me?tab=profile#details"],
    ["ko", "/%2e%2e/en/me?tab=profile#details", "/me?tab=profile#details"],
    ["en", "https://evil.example", "/en"],
    ["ko", "//evil.example", "/"],
    ["ko", "/en//evil.example", "/"],
    ["ko", "/en/%2F%2Fevil.example", "/"],
    ["en", "/ko?tab=profile#details", "/en?tab=profile#details"],
  ] as const)("계정 %s 로케일과 안전한 %s 경로로 이동한다", async (locale, returnTo, target) => {
    context.locale = locale === "ko" ? "en" : "ko";
    const email = await register(locale);
    await expect(
      loginAction(returnTo, { ok: true }, form(email, "action-test-password")),
    ).rejects.toMatchObject({ digest: `NEXT_REDIRECT;replace;${target};307;` });
    const session = await unsealSession(context.jar.get("session")?.value);
    expect(session).not.toBeNull();
    const { data } = await mockClient(session!.accessToken).GET("/me");
    expect(data!.data.attributes.email).toBe(email);
    expect(context.jar.get("NEXT_LOCALE")?.value).toBe(locale);
  });

  it("검증 오류 pointer만 입력칸에 매핑한다", async () => {
    const result = await loginAction("/", { ok: true }, form("bad-email", ""));
    expect(result).toMatchObject({
      ok: false,
      formError: null,
      fieldErrors: {
        email: [expect.any(String)],
      },
    });
    expect(context.jar.has("session")).toBe(false);
  });
  it("틀린 자격증명의 401은 폼 오류이며 로그인으로 재귀 이동하지 않는다", async () => {
    const result = await loginAction("/", { ok: true }, form("missing@example.com"));
    expect(result).toMatchObject({ ok: false, fieldErrors: {}, formError: expect.any(String) });
    expect(context.jar.has("session")).toBe(false);
  });
  it("미인증 계정에는 재발송용 이메일을 돌려준다", async () => {
    const email = await register("ko", false);
    const result = await loginAction("/", { ok: true }, form(email, "action-test-password"));
    expect(result).toMatchObject({
      ok: false,
      verificationEmail: email,
      formError: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain("action-test-password");
    expect(context.jar.has("session")).toBe(false);
  });
  it("예상 밖 API 오류는 trace와 함께 오류 경계로 넘긴다", async () => {
    vi.stubEnv("API_BASE_URL", "http://127.0.0.1:1/api/v1");
    await expect(loginAction("/", { ok: true }, form())).rejects.toMatchObject({
      status: 0,
      code: "service.unavailable",
      digest: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    expect(context.jar.has("session")).toBe(false);
  });
});

describe("인증 메일 재발송 Action", () => {
  it("실제 인증 메일을 한 번 더 보내고 429의 Retry-After를 보존한다", async () => {
    const email = await register("ko", false);
    const data = new FormData();
    data.set("email", email);
    expect(await resendVerificationAction({ ok: true }, data)).toMatchObject({
      ok: true,
      verificationEmail: email,
    });
    const mail = (await (
      await fetch(`${inject("mockBaseUrl")}/_test/mail?to=${encodeURIComponent(email)}`)
    ).json()) as { messages: unknown[] };
    expect(mail.messages).toHaveLength(2);
    await resendVerificationAction({ ok: true }, data);
    await resendVerificationAction({ ok: true }, data);
    const limited = await resendVerificationAction({ ok: true }, data);
    expect(limited).toMatchObject({ ok: false, retryAfter: expect.any(Number) });
  });
  it("재발송 이메일의 pointer 오류도 매핑한다", async () => {
    const data = new FormData();
    data.set("email", "invalid");
    expect(await resendVerificationAction({ ok: true }, data)).toMatchObject({
      ok: false,
      fieldErrors: { email: [expect.any(String)] },
    });
  });
});

describe("로그아웃 Action", () => {
  it("현재 세션을 실제로 폐기하고 쿠키를 지운 뒤 로케일 홈으로 이동한다", async () => {
    context.locale = "en";
    const session = await login();
    context.jar.set("session", { value: await sealSession(session) });
    await expect(logoutAction()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/en;307;",
    });
    expect(context.jar.get("session")).toMatchObject({ value: "", maxAge: 0 });
    await expect(mockClient(session.accessToken).GET("/me")).rejects.toMatchObject({ status: 401 });
  });
  it.each(["revoked", "offline", "anonymous"])(
    "%s여도 쿠키를 지우고 홈으로 이동한다",
    async (mode) => {
      if (mode !== "anonymous") {
        const session = await login();
        context.jar.set("session", { value: await sealSession(session) });
        if (mode === "revoked") await mockClient(session.accessToken).DELETE("/sessions/current");
        else vi.stubEnv("API_BASE_URL", "http://127.0.0.1:1/api/v1");
      }
      await expect(logoutAction()).rejects.toMatchObject({
        digest: "NEXT_REDIRECT;replace;/;307;",
      });
      expect(context.jar.get("session")).toMatchObject({ value: "", maxAge: 0 });
    },
  );
});
