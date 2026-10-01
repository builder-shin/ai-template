import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { registerTestAccount } from "../../lib/testing/account";

/** 실제 목에서 파일을 소유하는 일반 계정을 준비한다. */
export async function fileOwnerFixture() {
  const { session, client } = await registerTestAccount({
    origin: inject("mockBaseUrl"),
    locale: "en",
    account: {
      name: "파일 소유자",
      email: `file-owner-${randomUUID()}@example.com`,
      password: "file-owner-test-password", // betterleaks:allow 사유: 테스트 비밀번호
    },
  });
  return {
    session,
    client,
    async stop() {
      await client.DELETE("/me");
    },
  };
}
