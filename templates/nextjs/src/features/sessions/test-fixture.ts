import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { registerTestAccount, loginTestAccount } from "../../lib/testing/account";

/** 실제 계정과 세션을 만들고 마지막 세션 폐기 뒤에도 다시 로그인해 정리한다. */
export async function sessionsFixture(locale: "ko" | "en" = "ko") {
  const origin = inject("mockBaseUrl");
  const account = {
    name: "세션 사용자",
    email: `sessions-${randomUUID()}@example.com`,
    password: "sessions-test-password", // betterleaks:allow 사유: 테스트 비밀번호
  };
  const owner = await registerTestAccount({ origin, locale, account, userAgent: "Current device" });
  const login = (userAgent = "Test device") =>
    loginTestAccount({ origin, locale, account, userAgent });
  return {
    ...owner,
    login,
    async stop() {
      const fresh = await login();
      await fresh.client.DELETE("/me");
    },
  };
}
