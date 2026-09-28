import { createHash, randomBytes } from "node:crypto";
import type {
  OAuthDriver,
  OAuthPerson,
  OAuthProvider,
  OAuthReturn,
  OAuthStart,
} from "../side-channels.ts";
import { ContractViolation, validateResponse } from "../validation.ts";

export interface MockOAuthDriverOptions {
  /** 대상 백엔드 주소. 예: http://localhost:8000 */
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
}

const AUTHORIZE = "/api/v1/oauth/{provider}/authorize";
const CALLBACK = "/api/v1/oauth/{provider}/callback";

/**
 * 모의 OAuth 서버(navikt/mock-oauth2-server)의 신원 응답. 제공자마다 프로필 응답의 모양을 흉내 낸다.
 * 모의 서버는 로그인 폼의 claims를 토큰과 userinfo에 그대로 담고, username을 sub로 쓴다.
 * 구글은 gmail.com 주소이거나 email_verified가 참이고 hd(Workspace)가 있어야 그 이메일의 주인을
 * 보증한다(providers/google.py와 같은 규칙). hd는 검증된 이메일이 gmail.com이 아닐 때만 붙인다.
 */
export function mockClaims(provider: OAuthProvider, person: OAuthPerson): Record<string, unknown> {
  const verified = person.emailVerified ?? false;
  switch (provider) {
    case "kakao":
      return {
        id: person.subject,
        kakao_account: {
          email: person.email,
          is_email_valid: verified,
          is_email_verified: verified,
          profile: { nickname: person.name },
        },
      };
    case "naver":
      return { response: { id: person.subject, email: person.email, name: person.name } };
    case "google": {
      const result: Record<string, unknown> = {
        email: person.email,
        email_verified: verified,
        name: person.name,
      };
      if (
        verified &&
        person.email !== undefined &&
        !person.email.toLowerCase().endsWith("@gmail.com")
      ) {
        result.hd = person.email.split("@").at(-1);
      }
      return result;
    }
  }
}

/** PKCE 쌍(verifier, S256 challenge). BFF가 만들어 authorize에 codeChallenge로 보내고, 코드 교환 때 codeVerifier로 증명한다. */
function pkcePair(): { readonly verifier: string; readonly challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * 브라우저 대신 소셜 로그인을 진행한다. 백엔드의 응답은 계약으로 검증한다(리다이렉트는 따라가지 않는다).
 * 제공자에서는 모의 서버의 로그인 폼에 신원을 보낸다. 거부(access_denied)는 모의 서버가 만들지 못하므로
 * callback으로 백엔드 콜백을 직접 부른다.
 */
export function createMockOAuthDriver(options: MockOAuthDriverOptions): OAuthDriver {
  const request = options.fetch ?? fetch;
  const root = options.baseUrl.replace(/\/+$/, "");

  async function backend(url: string, operation: string): Promise<Response> {
    const response = await request(url, { redirect: "manual" });
    const text = await response.text();
    const body: unknown = text === "" ? undefined : JSON.parse(text);
    const contentType = response.headers.get("content-type");
    const problems = validateResponse("GET", operation, response.status, contentType, body);
    if (problems.length > 0) throw new ContractViolation(problems);
    return response;
  }

  function redirected(response: Response, label: string): URL {
    const location = response.headers.get("location");
    if (response.status !== 302 || location === null) {
      throw new Error(`${label}가 302로 보내지 않았다(상태 ${String(response.status)}).`);
    }
    return new URL(location);
  }

  async function start(provider: OAuthProvider, redirectUri: string): Promise<OAuthStart> {
    const { verifier, challenge } = pkcePair();
    const query = new URLSearchParams({ redirectUri, codeChallenge: challenge });
    const response = await backend(
      `${root}/api/v1/oauth/${provider}/authorize?${query.toString()}`,
      AUTHORIZE,
    );
    const providerUrl = redirected(response, "authorize");
    const state = providerUrl.searchParams.get("state");
    if (state === null) throw new Error(`제공자 주소 ${providerUrl.href}에 state가 없다.`);
    return { providerUrl: providerUrl.href, state, codeVerifier: verifier };
  }

  async function callback(
    provider: OAuthProvider,
    params: Readonly<Record<string, string>>,
  ): Promise<URLSearchParams> {
    const query = new URLSearchParams(params);
    const response = await backend(
      `${root}/api/v1/oauth/${provider}/callback?${query.toString()}`,
      CALLBACK,
    );
    return redirected(response, "callback").searchParams;
  }

  async function signIn(
    provider: OAuthProvider,
    redirectUri: string,
    person: OAuthPerson,
  ): Promise<OAuthReturn> {
    const { providerUrl, codeVerifier } = await start(provider, redirectUri);
    const form = new URLSearchParams({
      username: person.subject,
      claims: JSON.stringify(mockClaims(provider, person)),
    });
    const login = await request(providerUrl, { method: "POST", body: form, redirect: "manual" });
    // 제공자는 백엔드의 콜백 주소(대상의 API_URL)로 보낸다. 같은 쿼리로 대상의 콜백을 부른다.
    const back = redirected(login, "모의 제공자");
    const query = await callback(provider, Object.fromEntries(back.searchParams));
    return { query, codeVerifier };
  }

  return { start, signIn, callback };
}
