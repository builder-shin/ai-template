import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { registerTestAccount, loginTestAccount } from "../../lib/testing/account";

/** 짧은 재인증 창의 별도 목을 쓴다. HTTP 화면 검사는 기본 목을 지정한다. */
export async function deletionFixture(
  locale: "ko" | "en" = "ko",
  origin = inject("deletionMockBaseUrl"),
) {
  const email = `deletion-${randomUUID()}@example.com`;
  const password = "deletion-test-password"; // betterleaks:allow 사유: 테스트 비밀번호
  const account = { name: "탈퇴 사용자", email, password };
  const owner = await registerTestAccount({ origin, locale, account });
  const login = () => loginTestAccount({ origin, locale, account });
  let deleted = false;
  return {
    ...owner,
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
