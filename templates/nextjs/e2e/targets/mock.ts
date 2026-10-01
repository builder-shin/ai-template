import type { APIRequestContext } from "@playwright/test";
import type { TargetAdapter } from "./index";

export const mockRecentLoginSeconds = 10;

export function mockTarget(request: APIRequestContext, origin: string): TargetAdapter {
  return {
    async expireRecentLogin() {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, mockRecentLoginSeconds * 1000 + 100),
      );
    },
    async mailLink(email, purpose) {
      const path = purpose === "verification" ? "/verify-email" : "/reset-password";
      const response = await request.get(`${origin}/_test/mail`, { params: { to: email } });
      if (!response.ok()) throw new Error(`테스트 메일 조회 실패: ${response.status()}`);
      const mail = (await response.json()) as { messages: { to: string; text: string }[] };
      // 목의 outbox는 최신순이다. 인증·재설정 목적에 맞는 실제 링크를 고른다.
      for (const message of mail.messages) {
        if (message.to !== email) continue;
        const value = message.text.match(/https?:\/\/\S+/)?.[0];
        if (value && new URL(value).pathname === path) return value;
      }
      throw new Error("요청한 목적의 테스트 메일이 없다.");
    },
  };
}
