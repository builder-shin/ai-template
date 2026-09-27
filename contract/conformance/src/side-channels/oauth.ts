import type { OAuthDriver, OAuthProvider } from "../side-channels.ts";

export interface RedirectOAuthDriverOptions {
  /** 대상 백엔드 주소. 예: http://localhost:8000 */
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  readonly maxRedirects?: number;
}

/**
 * 백엔드의 authorize부터 리다이렉트를 직접 따라간다. 모의 OAuth 서버는 로그인 화면 없이 바로 코드를 준다.
 * 프론트 콜백 주소(redirectUri)에 닿으면 멈추고 code를 꺼낸다. error가 붙어 오면 그 코드로 던진다.
 */
export function createRedirectOAuthDriver(options: RedirectOAuthDriverOptions): OAuthDriver {
  const get = options.fetch ?? fetch;
  const maxRedirects = options.maxRedirects ?? 10;
  const root = options.baseUrl.replace(/\/+$/, "");

  return {
    async authorize(provider: OAuthProvider, redirectUri: string) {
      let url = `${root}/api/v1/oauth/${provider}/authorize?redirectUri=${encodeURIComponent(redirectUri)}`;
      for (let hop = 0; hop < maxRedirects; hop += 1) {
        const response = await get(url, { redirect: "manual" });
        const location = response.headers.get("location");
        if (location === null) {
          throw new Error(`${url}가 리다이렉트하지 않았다(상태 ${String(response.status)}).`);
        }
        const next = new URL(location, url);
        if (next.href.startsWith(redirectUri)) {
          const error = next.searchParams.get("error");
          if (error !== null) throw new Error(`소셜 로그인이 ${error}로 끝났다.`);
          const code = next.searchParams.get("code");
          if (code === null) throw new Error(`프론트 콜백 ${next.href}에 code가 없다.`);
          return { code };
        }
        url = next.href;
      }
      throw new Error(`리다이렉트가 ${String(maxRedirects)}번을 넘었다.`);
    },
  };
}
