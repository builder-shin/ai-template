import { appOrigin } from "../src/lib/app-config.mjs";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, inject, it, vi } from "vitest";
import {
  signupAction,
  verifyEmailAction,
  resendVerificationAction,
} from "../src/features/auth/actions";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { mockClient } from "./test/session";

const context = vi.hoisted(() => ({ locale: "ko" }));
// 로케일 요청 경계만 대체한다. 가입·메일·토큰·검증은 실제 목이다.
vi.mock("next-intl/server", () => ({ getLocale: async () => context.locale }));
beforeEach(() => {
  context.locale = "ko";
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("APP_URL", appOrigin("dev"));
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
});
afterEach(() => vi.unstubAllEnvs());

const password = "signup-test-password"; // betterleaks:allow 테스트 비밀번호
function registration(email = `signup-${randomUUID()}@example.com`) {
  const data = new FormData();
  data.set("name", "Signup user");
  data.set("email", email);
  data.set("password", password);
  return data;
}
function verification(token: string) {
  const data = new FormData();
  data.set("token", token);
  return data;
}
async function mails(email: string) {
  const response = await fetch(
    `${inject("mockBaseUrl")}/_test/mail?to=${encodeURIComponent(email)}`,
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { messages: { text: string; subject: string }[] }).messages;
}

it.each(["ko", "en"])(
  "%s 가입은 해당 언어의 메일을 보내고 토큰 인증 뒤 로그인할 수 있다",
  async (locale) => {
    context.locale = locale;
    const data = registration();
    const email = String(data.get("email"));
    const result = await signupAction({ ok: true }, data);
    expect(result).toEqual({ ok: true, verificationEmail: email });
    expect(JSON.stringify(result)).not.toContain(password);
    const mail = await mails(email);
    expect(mail).toHaveLength(1);
    expect(mail[0]!.subject).toBe(
      locale === "ko" ? "이메일 주소를 확인해 주세요" : "Confirm your email address",
    );
    const link = new URL(mail[0]!.text.match(/https?:\/\/\S+/)![0]);
    expect(link.origin).toBe(inject("mockBaseUrl"));
    expect(link.pathname).toBe("/verify-email");
    const token = link.searchParams.get("token")!;
    expect(await verifyEmailAction({ ok: true }, verification(token))).toEqual({ ok: true });
    expect(await mails(email)).toHaveLength(2);
    const { data: session } = await mockClient().POST("/sessions", {
      body: { data: { type: "sessions", attributes: { grantType: "password", email, password } } },
    });
    const { data: me } = await mockClient(session!.data.attributes.accessToken).GET("/me");
    expect(me!.data.attributes.locale).toBe(locale);
    expect(me!.data.attributes.name).toBe("Signup user");
    expect(await verifyEmailAction({ ok: true }, verification(token))).toMatchObject({
      ok: false,
      fieldErrors: {},
      formError: expect.any(String),
    });
  },
);

it("가입의 name·email·password pointer를 각각 연결하고 비밀번호를 돌려주지 않는다", async () => {
  const data = registration("invalid");
  data.set("name", "");
  data.set("password", "x"); // betterleaks:allow 검증 실패용 비밀번호
  const result = await signupAction({ ok: true }, data);
  expect(result).toMatchObject({
    ok: false,
    name: "",
    email: "invalid",
    formError: null,
    fieldErrors: {
      name: [expect.any(String)],
      email: [expect.any(String)],
      password: [expect.any(String)],
    },
  });
  expect(result).not.toHaveProperty("password");
  expect(await mails("invalid")).toHaveLength(0);
});

it("중복 이메일 가입은 이메일 오류로 남는다", async () => {
  const data = registration();
  await signupAction({ ok: true }, data);
  expect(await signupAction({ ok: true }, data)).toMatchObject({
    ok: false,
    fieldErrors: { email: [expect.any(String)] },
    formError: null,
  });
});

it.each(["", "invalid", "a".repeat(43)])(
  "잘못된 인증 토큰 %s는 번역된 실패 안내로 바뀐다",
  async (token) => {
    context.locale = "en";
    const result = await verifyEmailAction({ ok: true }, verification(token));
    expect(result).toMatchObject({ ok: false, fieldErrors: {}, formError: expect.any(String) });
    expect(result).not.toHaveProperty("token");
  },
);

it("가입 뒤 재발송은 실제 메일을 추가하고 한도 초과는 Retry-After를 보존한다", async () => {
  const data = registration();
  await signupAction({ ok: true }, data);
  expect(await resendVerificationAction({ ok: true }, data)).toMatchObject({ ok: true });
  expect(await mails(String(data.get("email")))).toHaveLength(2);
  await resendVerificationAction({ ok: true }, data);
  await resendVerificationAction({ ok: true }, data);
  const limited = await resendVerificationAction({ ok: true }, data);
  expect(limited).toMatchObject({
    ok: false,
    retryAfter: expect.any(Number),
    formError: expect.any(String),
  });
  expect(limited.retryAfter).toBeGreaterThan(0);
  expect(await mails(String(data.get("email")))).toHaveLength(4);
});

it("예상 밖 연결 오류는 trace를 가진 경계로 넘긴다", async () => {
  vi.stubEnv("API_BASE_URL", "http://127.0.0.1:1/api/v1");
  await expect(signupAction({ ok: true }, registration())).rejects.toMatchObject({
    status: 0,
    digest: expect.stringMatching(/^[0-9a-f]{32}$/),
  });
  await expect(verifyEmailAction({ ok: true }, verification("a".repeat(43)))).rejects.toMatchObject(
    {
      status: 0,
      digest: expect.stringMatching(/^[0-9a-f]{32}$/),
    },
  );
});
