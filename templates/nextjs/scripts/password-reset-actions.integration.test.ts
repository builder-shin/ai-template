import { appOrigin } from "../src/lib/app-config.mjs";
import { appSessionCookieName } from "../src/lib/app-config.mjs";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, inject, it, vi } from "vitest";
import { requestPasswordResetAction, resetPasswordAction } from "../src/features/auth/actions";
import { createApiClient } from "../src/lib/api/client";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { mockClient } from "./test/session";

const context = vi.hoisted(() => ({ locale: "ko", set: vi.fn() }));
// Next 요청 경계만 대체한다. 재설정·메일·로그인은 실제 복사 목이다.
vi.mock("next-intl/server", () => ({ getLocale: async () => context.locale }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: context.set }) }));
beforeEach(() => {
  context.locale = "ko";
  context.set.mockClear();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("APP_URL", appOrigin("dev"));
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
});
afterEach(() => vi.unstubAllEnvs());

const oldPassword = "reset-old-password"; // betterleaks:allow 테스트 비밀번호
const newPassword = "reset-new-password"; // betterleaks:allow 테스트 비밀번호
function fields(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}
async function mails(email: string) {
  const response = await fetch(
    `${inject("mockBaseUrl")}/_test/mail?to=${encodeURIComponent(email)}`,
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { messages: { text: string; subject: string }[] }).messages;
}
async function register(locale: "ko" | "en" = "ko") {
  const email = `reset-${randomUUID()}@example.com`;
  await createApiClient({ baseUrl: `${inject("mockBaseUrl")}/api/v1`, locale, log: () => {} }).POST(
    "/registrations",
    {
      body: {
        data: {
          type: "registrations",
          attributes: { name: "Reset user", email, password: oldPassword },
        },
      },
    },
  );
  return email;
}
async function resetLink(email: string) {
  const mail = (await mails(email)).find((message) =>
    message.text.includes("/reset-password?token="),
  );
  expect(mail).toBeDefined();
  const link = new URL(mail!.text.match(/https?:\/\/\S+/)![0]);
  expect(link.origin).toBe(inject("mockBaseUrl"));
  expect(link.pathname).toBe("/reset-password");
  return { link, mail: mail! };
}

it.each(["ko", "en"] as const)(
  "%s 요청·실제 메일·재설정 뒤 새 비밀번호로 로그인한다",
  async (locale) => {
    context.locale = locale;
    const email = await register(locale);
    const existing = await requestPasswordResetAction({ ok: true }, fields({ email }));
    const missingEmail = `missing-${randomUUID()}@example.com`;
    const missing = await requestPasswordResetAction({ ok: true }, fields({ email: missingEmail }));
    expect(existing).toEqual({ ok: true });
    expect(missing).toEqual(existing);
    expect(await mails(missingEmail)).toHaveLength(0);
    const { link, mail } = await resetLink(email);
    expect(mail.subject).toBe(locale === "ko" ? "비밀번호 재설정 안내" : "Reset your password");
    const token = link.searchParams.get("token")!;
    const result = await resetPasswordAction(
      { ok: true },
      fields({ token, password: newPassword }),
    );
    expect(result).toEqual({ ok: true });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain(newPassword);
    const { data: session } = await mockClient().POST("/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: { grantType: "password", email, password: newPassword },
        },
      },
    });
    const { data: me } = await mockClient(session!.data.attributes.accessToken).GET("/me");
    expect(me!.data.attributes.email).toBe(email);
    expect(me!.data.attributes.locale).toBe(locale);
    await expect(
      mockClient().POST("/sessions", {
        body: {
          data: {
            type: "sessions",
            attributes: { grantType: "password", email, password: oldPassword },
          },
        },
      }),
    ).rejects.toMatchObject({ code: "auth.invalid_credentials" });
    expect(
      await resetPasswordAction({ ok: true }, fields({ token, password: newPassword })),
    ).toMatchObject({
      ok: false,
      fieldErrors: {},
      formError:
        locale === "ko"
          ? "인증 링크가 올바르지 않거나 만료되었습니다."
          : "The verification link is invalid or expired.",
    });
  },
);

it("재설정은 기존 실제 세션을 폐기하고 브라우저 쿠키도 지운다", async () => {
  const email = await register();
  const verification = new URL((await mails(email))[0]!.text.match(/https?:\/\/\S+/)![0]);
  await mockClient().POST("/email-verifications", {
    body: {
      data: {
        type: "email-verifications",
        attributes: { token: verification.searchParams.get("token")! },
      },
    },
  });
  const { data: session } = await mockClient().POST("/sessions", {
    body: {
      data: {
        type: "sessions",
        attributes: { grantType: "password", email, password: oldPassword },
      },
    },
  });
  await requestPasswordResetAction({ ok: true }, fields({ email }));
  const { link } = await resetLink(email);
  expect(
    await resetPasswordAction(
      { ok: true },
      fields({ token: link.searchParams.get("token")!, password: newPassword }),
    ),
  ).toEqual({ ok: true });
  await expect(mockClient(session!.data.attributes.accessToken).GET("/me")).rejects.toMatchObject({
    status: 401,
  });
  expect(context.set).toHaveBeenCalledWith(
    expect.objectContaining({ name: appSessionCookieName("development"), value: "", maxAge: 0 }),
  );
});

it("메일·비밀번호 길이는 입력 오류로, 토큰은 폼 오류로 번역한다", async () => {
  context.locale = "en";
  expect(
    await requestPasswordResetAction({ ok: true }, fields({ email: "invalid" })),
  ).toMatchObject({
    ok: false,
    email: "invalid",
    formError: null,
    fieldErrors: { email: ["Enter a value in the correct format."] },
  });
  const email = await register();
  await requestPasswordResetAction({ ok: true }, fields({ email }));
  const token = (await resetLink(email)).link.searchParams.get("token")!;
  const invalidPassword = "x"; // betterleaks:allow 검증 실패용 비밀번호
  const result = await resetPasswordAction(
    { ok: true },
    fields({ token, password: invalidPassword }),
  );
  expect(result).toMatchObject({
    ok: false,
    formError: null,
    fieldErrors: { password: ["Enter at least 8 characters."] },
  });
  expect(result).not.toHaveProperty("password");
  expect(result).not.toHaveProperty("token");
  expect(await resetPasswordAction({ ok: true }, fields({ token, password: newPassword }))).toEqual(
    { ok: true },
  );
  expect(
    await resetPasswordAction({ ok: true }, fields({ token: "invalid", password: newPassword })),
  ).toMatchObject({
    ok: false,
    fieldErrors: {},
    formError: "The verification link is invalid or expired.",
  });
});

it.each([true, false])(
  "계정 존재 %s와 관계없이 메일 한도·Retry-After를 같은 방식으로 안내한다",
  async (exists) => {
    const email = exists ? await register() : `missing-limit-${randomUUID()}@example.com`;
    context.locale = "en";
    for (let attempt = 0; attempt < 3; attempt++)
      expect(await requestPasswordResetAction({ ok: true }, fields({ email }))).toEqual({
        ok: true,
      });
    const limited = await requestPasswordResetAction({ ok: true }, fields({ email }));
    expect(limited).toMatchObject({
      ok: false,
      email,
      fieldErrors: {},
      formError: "Too many requests. Try again later.",
      retryAfter: expect.any(Number),
    });
    expect(limited.retryAfter).toBeGreaterThan(0);
    expect(await mails(email)).toHaveLength(exists ? 4 : 0);
  },
);

it("연결 실패는 trace 오류 경계로 넘기며 실패한 재설정은 쿠키를 지우지 않는다", async () => {
  vi.stubEnv("API_BASE_URL", "http://127.0.0.1:1/api/v1");
  await expect(
    requestPasswordResetAction({ ok: true }, fields({ email: "user@example.com" })),
  ).rejects.toMatchObject({ status: 0, digest: expect.stringMatching(/^[0-9a-f]{32}$/) });
  await expect(
    resetPasswordAction({ ok: true }, fields({ token: "invalid", password: newPassword })),
  ).rejects.toMatchObject({ status: 0, digest: expect.stringMatching(/^[0-9a-f]{32}$/) });
  expect(context.set).not.toHaveBeenCalled();
});
