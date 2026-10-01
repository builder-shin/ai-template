import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { TargetAdapter, SocialProvider } from "./index";

export const mockRecentLoginSeconds = 10;

export function mockTarget(request: APIRequestContext, origin: string): TargetAdapter {
  const providerPage = async (page: Page, provider: SocialProvider) => {
    await expect(page).toHaveURL(
      (url) => url.origin === origin && url.pathname === `/_mock/oauth/${provider}/authorize`,
    );
  };
  return {
    async completeSocialLogin(page, provider, { username, name }) {
      await providerPage(page, provider);
      // 제공자별 프로필은 테스트 어댑터에만 둔다. 토큰과 콜백은 실제 브라우저 흐름을 따른다.
      const claims = {
        google: { sub: username, name },
        kakao: { id: username, kakao_account: { profile: { nickname: name } } },
        naver: { response: { id: username, name } },
      }[provider];
      await page.locator('input[name="username"]').fill(username);
      await page.locator("details > summary").click();
      await page.locator('textarea[name="claims"]').fill(JSON.stringify(claims));
      await page.getByRole("button", { name: "로그인", exact: true }).click();
    },
    async denySocialLogin(page, provider) {
      await providerPage(page, provider);
      await page.getByRole("button", { name: "거부", exact: true }).click();
    },
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
