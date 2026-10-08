import { expect, type Page } from "@playwright/test";
import { parseFastapiTargetEnv } from "./fastapi";
import { appEnvironment } from "./app";

export type SocialProvider = "google" | "kakao" | "naver";
export interface SocialIdentity {
  username: string;
  name: string;
}
export interface SocialAdapter {
  completeSocialLogin(
    page: Page,
    provider: SocialProvider,
    identity: SocialIdentity,
  ): Promise<void>;
  denySocialLogin(page: Page, provider: SocialProvider): Promise<void>;
}

export function mockSocial(origin: string): SocialAdapter {
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
  };
}

export function fastapiSocial(
  input: Record<string, string | undefined> = process.env,
): SocialAdapter {
  const config = {
    ...parseFastapiTargetEnv(input),
    oauthOrigin: appEnvironment("fastapi", input).E2E_OAUTH_URL!,
  };
  async function providerPage(page: Page, provider: SocialProvider) {
    await page.waitForURL(
      (url) => url.origin === config.oauthOrigin && url.pathname === `/${provider}/authorize`,
    );
    const current = new URL(page.url());
    const states = current.searchParams.getAll("state");
    const redirects = current.searchParams.getAll("redirect_uri");
    const callback = `${config.apiBaseUrl}/oauth/${provider}/callback`;
    if (states.length !== 1 || !states[0] || redirects.length !== 1 || redirects[0] !== callback) {
      throw new Error("제공자 페이지의 state·redirect_uri가 현재 FastAPI 시도와 맞지 않는다.");
    }
    return { state: states[0], callback: new URL(redirects[0]) };
  }

  return {
    async completeSocialLogin(page, provider, { username, name }) {
      await providerPage(page, provider);
      const claims = {
        google: { sub: username, name },
        kakao: { id: username, kakao_account: { profile: { nickname: name } } },
        naver: { response: { id: username, name } },
      }[provider];
      const form = page.locator("form").filter({ has: page.locator('input[name="username"]') });
      await form.locator('input[name="username"]').fill(username);
      const claimsField = form.locator('textarea[name="claims"]');
      if (!(await claimsField.isVisible())) await form.locator("details > summary").click();
      await claimsField.fill(JSON.stringify(claims));
      // 폼 제출·제공자→FastAPI→web 리다이렉트를 따른다. BFF의 PKCE 쿠키는 그대로 둔다.
      await form.locator('input[type="submit"]').click();
      await page.waitForURL((url) => url.origin === config.webOrigin);
    },
    async denySocialLogin(page, provider) {
      const { state, callback } = await providerPage(page, provider);
      // navikt에는 거부 버튼이 없다. 현재 시도만 FastAPI 콜백에 돌려준다.
      callback.searchParams.set("state", state);
      callback.searchParams.set("error", "access_denied");
      await page.goto(callback.href);
      await page.waitForURL((url) => url.origin === config.webOrigin);
    },
  };
}
