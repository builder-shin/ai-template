import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { createApiClient } from "../../lib/api/client";

/** 실제 목에서 파일을 소유하는 일반 계정을 준비한다. */
export async function fileOwnerFixture() {
  const baseUrl = `${inject("mockBaseUrl")}/api/v1`;
  const anonymous = createApiClient({ baseUrl, locale: "en", log: () => {} });
  const email = `file-owner-${randomUUID()}@example.com`;
  const password = "file-owner-test-password"; // betterleaks:allow 사유: 테스트 비밀번호
  await anonymous.POST("/registrations", {
    body: { data: { type: "registrations", attributes: { name: "파일 소유자", email, password } } },
  });
  const mail = await fetch(`${inject("mockBaseUrl")}/_test/mail?to=${email}`);
  const { messages } = (await mail.json()) as { messages: { text: string }[] };
  const token = new URL(messages[0]!.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  await anonymous.POST("/email-verifications", {
    body: { data: { type: "email-verifications", attributes: { token } } },
  });
  const { data } = await anonymous.POST("/sessions", {
    body: { data: { type: "sessions", attributes: { grantType: "password", email, password } } },
  });
  const session = data!.data.attributes;
  const client = createApiClient({
    baseUrl,
    locale: "en",
    accessToken: session.accessToken,
    log: () => {},
  });
  return {
    session,
    client,
    async stop() {
      await client.DELETE("/me");
    },
  };
}
