import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { createApiClient } from "../../lib/api/client";

/** 실제 계정과 세션을 만들고 마지막 세션 폐기 뒤에도 다시 로그인해 정리한다. */
export async function sessionsFixture(locale: "ko" | "en" = "ko") {
  const baseUrl = `${inject("mockBaseUrl")}/api/v1`;
  const anonymous = createApiClient({ baseUrl, locale, log: () => {} });
  const email = `sessions-${randomUUID()}@example.com`;
  const password = "sessions-test-password"; // betterleaks:allow 사유: 테스트 비밀번호
  await anonymous.POST("/registrations", {
    body: { data: { type: "registrations", attributes: { name: "세션 사용자", email, password } } },
  });
  const mail = await fetch(`${inject("mockBaseUrl")}/_test/mail?to=${email}`);
  const { messages } = (await mail.json()) as { messages: { text: string }[] };
  const token = new URL(messages[0]!.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  await anonymous.POST("/email-verifications", {
    body: { data: { type: "email-verifications", attributes: { token } } },
  });
  async function login(userAgent = "Test device") {
    const { data } = await anonymous.POST("/sessions", {
      headers: { "User-Agent": userAgent },
      body: { data: { type: "sessions", attributes: { grantType: "password", email, password } } },
    });
    return {
      id: data!.data.id,
      session: data!.data.attributes,
      client: createApiClient({
        baseUrl,
        locale,
        accessToken: data!.data.attributes.accessToken,
        log: () => {},
      }),
    };
  }
  return {
    ...(await login("Current device")),
    login,
    async stop() {
      const fresh = await login();
      await fresh.client.DELETE("/me");
    },
  };
}
