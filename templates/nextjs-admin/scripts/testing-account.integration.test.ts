import { randomUUID } from "node:crypto";
import { expect, inject, it } from "vitest";
import { registerTestAccount } from "../src/lib/testing/account";

function account(locale: "ko" | "en") {
  return {
    email: `account-test-${randomUUID()}@example.com`,
    name: "가입 테스트",
    locale,
    password: "account-test-password", // betterleaks:allow 사유: 실제 목 통합 테스트 계정
  };
}

async function mailLink(origin: string, email: string) {
  const response = await fetch(`${origin}/_test/mail?to=${encodeURIComponent(email)}`);
  expect(response.ok).toBe(true);
  const { messages } = (await response.json()) as { messages: { text: string }[] };
  return messages[0]!.text.match(/https?:\/\/\S+/)![0]!;
}

it("기본 메일 조회로 가입·인증·로그인하고 계정 언어를 유지한다", async () => {
  const input = account("en");
  const owner = await registerTestAccount({
    origin: inject("mockBaseUrl"),
    locale: "en",
    account: input,
  });
  const me = (await owner.client.GET("/me")).data!.data;
  expect(me.attributes).toMatchObject({ email: input.email, locale: "en" });
  expect(me.attributes.emailVerifiedAt).toBeTruthy();
  expect(owner.session.accessToken).toBeTruthy();
  expect((await owner.client.GET("/sessions")).data!.data).toEqual([
    expect.objectContaining({
      id: owner.id,
      attributes: expect.objectContaining({ current: true }),
    }),
  ]);
});

it.each(["ko", "en"] as const)(
  "메일 callback에 수신자·인증 목적을 전달하고 언어·User-Agent를 유지한다 (언어 %s)",
  async (locale) => {
    const origin = inject("mockBaseUrl");
    const input = account(locale);
    const calls: { email: string; purpose: "verification" }[] = [];
    const userAgent = `account-integration/${locale}`;
    const owner = await registerTestAccount({
      origin,
      locale,
      account: input,
      userAgent,
      async mailLink(email, purpose) {
        calls.push({ email, purpose });
        return mailLink(origin, email);
      },
    });
    expect(calls).toEqual([{ email: input.email, purpose: "verification" }]);
    const me = (await owner.client.GET("/me")).data!.data;
    expect(me.attributes).toMatchObject({ email: input.email, locale });
    expect(me.attributes.emailVerifiedAt).toBeTruthy();
    expect(owner.session.userAgent).toBe(userAgent);
    expect((await owner.client.GET("/sessions")).data!.data).toEqual([
      expect.objectContaining({
        id: owner.id,
        attributes: expect.objectContaining({ current: true, userAgent }),
      }),
    ]);
  },
);

it("callback 링크에 토큰이 없으면 기존 인증 오류를 그대로 전달한다", async () => {
  await expect(
    registerTestAccount({
      origin: inject("mockBaseUrl"),
      locale: "ko",
      account: account("ko"),
      mailLink: async () => "http://localhost/verify-email",
    }),
  ).rejects.toEqual(new Error("테스트 인증 메일에 토큰이 없다."));
});

it("메일 callback 실패는 목 조회로 대체하지 않고 그대로 전달한다", async () => {
  const failure = new Error("메일 callback 실패");
  const calls: string[] = [];
  const input = account("en");
  await expect(
    registerTestAccount({
      origin: inject("mockBaseUrl"),
      locale: "en",
      account: input,
      async mailLink(email) {
        calls.push(email);
        throw failure;
      },
    }),
  ).rejects.toBe(failure);
  expect(calls).toEqual([input.email]);
});
