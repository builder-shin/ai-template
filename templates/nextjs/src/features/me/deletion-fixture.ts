import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { createApiClient } from "../../lib/api/client";

/** 짧은 재인증 창의 별도 목을 쓴다. HTTP 화면 검사는 기본 목을 지정한다. */
export async function deletionFixture(
  locale: "ko" | "en" = "ko",
  origin = inject("deletionMockBaseUrl"),
) {
  const baseUrl = `${origin}/api/v1`;
  const anonymous = createApiClient({ baseUrl, locale, log: () => {} });
  const email = `deletion-${randomUUID()}@example.com`;
  const password = "deletion-test-password"; // betterleaks:allow 사유: 테스트 비밀번호
  await anonymous.POST("/registrations", {
    body: { data: { type: "registrations", attributes: { name: "탈퇴 사용자", email, password } } },
  });
  const { messages } = (await (await fetch(`${origin}/_test/mail?to=${email}`)).json()) as {
    messages: { text: string }[];
  };
  const token = new URL(messages[0]!.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  await anonymous.POST("/email-verifications", {
    body: { data: { type: "email-verifications", attributes: { token } } },
  });
  async function login() {
    const { data } = await anonymous.POST("/sessions", {
      body: { data: { type: "sessions", attributes: { grantType: "password", email, password } } },
    });
    const session = data!.data.attributes;
    return {
      session,
      client: createApiClient({ baseUrl, locale, accessToken: session.accessToken, log: () => {} }),
    };
  }
  let deleted = false;
  return {
    ...(await login()),
    email,
    password,
    login,
    markDeleted() {
      deleted = true;
    },
    async stop() {
      if (!deleted) await (await login()).client.DELETE("/me");
    },
  };
}
