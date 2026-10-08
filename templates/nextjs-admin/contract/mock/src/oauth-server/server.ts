/**
 * 가짜 OAuth 서버: 목 안의 소셜 로그인 제공자(google, kakao, naver). FastAPI 템플릿이 개발과 테스트에
 * 쓰는 모의 OAuth 서버(navikt/mock-oauth2-server 6.0.3)의 인가 코드 흐름을 흉내 낸다.
 *
 * - 인가 화면은 <API_URL>/_mock/oauth/<제공자>/authorize다(routes.ts). 백엔드의 authorize가 브라우저를
 *   response_type=code, client_id, redirect_uri, state, scope, code_challenge(S256)와 함께 보낸다.
 *   로그인하면 인가 코드를 만들어 redirect_uri?code=&state=로 돌려보내고(grant), 거부하면
 *   error=access_denied를 붙여 돌려보낸다(denial).
 * - 백엔드(auth의 providers.ts)는 같은 프로세스에서 코드를 프로필로 바꾼다(redeem). 제공자의 토큰
 *   엔드포인트와 userinfo를 한 번에 하는 셈이다. 코드는 한 번만 쓰고(교환에 실패해도 사라진다) 10분 뒤
 *   만료된다. 같은 제공자, 인가 요청과 같은 redirect_uri, challenge를 만든 code verifier여야 한다.
 * - 프로필은 모의 OAuth 서버의 userinfo처럼 username이 sub이고 claims가 그 위에 얹힌다(claims의 sub가
 *   이긴다). 값이 null인 클레임은 없는 것으로 본다. 모의 OAuth 서버와 달리 비ASCII 값도 그대로 둔다.
 * - claims 없이 사람이 고른 신원(이름, 이메일, 확인 여부)으로 로그인하면 제공자의 프로필 모양으로
 *   claims를 만든다(personClaims). 적합성 키트의 mockClaims, FastAPI 테스트의 claims와 같은 모양이다.
 */

import { type Clock, MINUTE } from "../core/clock.ts";
import { createExpiringMap } from "../core/expiring.ts";
import { newToken, pkceChallenge } from "../core/security.ts";
import { isHttpUrl, withQuery } from "../core/urls.ts";
import type { components } from "../generated/api.ts";

export type OAuthProvider = components["schemas"]["OAuthProvider"];
/** 제공자가 알려 주는 사람(userinfo의 JSON 객체). */
export type Profile = Readonly<Record<string, unknown>>;

/** 가짜 OAuth 서버가 뜨는 경로. 테스트 통로라 MOCK_TEST_ENDPOINTS가 켜져 있을 때만 붙는다. */
export const OAUTH_SERVER_PATH = "/_mock/oauth";
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ["google", "kakao", "naver"];
/** 인가 코드의 수명. */
export const AUTHORIZATION_CODE_TTL = 10 * MINUTE;

/** 인가 요청(인가 화면 주소의 쿼리). */
export interface AuthorizationRequest {
  readonly redirectUri: string;
  readonly state: string | undefined;
  /** PKCE S256 challenge. 없으면 코드 교환 때 verifier를 보지 않는다. */
  readonly codeChallenge: string | undefined;
}

/** 코드 교환 요청. redirectUri와 codeVerifier는 인가 요청과 맞아야 한다. */
export interface Redemption {
  readonly provider: OAuthProvider;
  readonly code: string;
  readonly redirectUri: string;
  readonly codeVerifier: string;
}

/** 사람이 인가 화면에서 고른 신원. */
export interface Person {
  /** 제공자 안의 사용자 id. */
  readonly subject: string;
  readonly email: string | undefined;
  /** 제공자가 이메일의 주인을 확인했는가. */
  readonly emailVerified: boolean;
  readonly name: string | undefined;
}

export interface OAuthServer {
  /** 로그인한 사람의 프로필로 인가 코드를 만들고, 브라우저를 돌려보낼 주소를 준다. */
  grant(provider: OAuthProvider, request: AuthorizationRequest, profile: Profile): string;
  /** 인가 코드를 프로필로 바꾼다. 없거나 만료됐거나 요청과 맞지 않으면 undefined다. */
  redeem(redemption: Redemption): Profile | undefined;
}

interface Grant {
  readonly provider: OAuthProvider;
  readonly redirectUri: string;
  readonly codeChallenge: string | undefined;
  readonly profile: Profile;
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/** 제공자의 인가 화면 주소. API_URL(브라우저가 보는 목의 주소) 아래다. */
export function authorizeEndpoint(apiUrl: string, provider: OAuthProvider): string {
  return `${apiUrl.replace(/\/+$/, "")}${OAUTH_SERVER_PATH}/${provider}/authorize`;
}

/** 인가 화면 주소의 쿼리를 읽는다. 틀리면 무엇이 틀렸는지(한국어)를 준다. */
export function authorizationRequest(
  query: Readonly<Record<string, string>>,
): { readonly request: AuthorizationRequest } | { readonly problem: string } {
  const redirectUri = query.redirect_uri ?? "";
  const codeChallenge = query.code_challenge;
  if (query.response_type !== "code") return { problem: "response_type이 code가 아니다." };
  if (!query.client_id) return { problem: "client_id가 없다." };
  if (!isHttpUrl(redirectUri)) return { problem: "redirect_uri가 http(s) 절대 주소가 아니다." };
  if (codeChallenge !== undefined && query.code_challenge_method !== "S256") {
    return { problem: "code_challenge_method가 S256이 아니다." };
  }
  return { request: { redirectUri, state: query.state, codeChallenge } };
}

function stateOf(request: AuthorizationRequest): [string, string][] {
  return request.state === undefined ? [] : [["state", request.state]];
}

/** 거부(RFC 6749의 에러 응답)로 돌려보낼 주소: redirect_uri에 error와 state를 붙인다. */
export function denial(request: AuthorizationRequest, error: string): string {
  return withQuery(request.redirectUri, [["error", error], ...stateOf(request)]);
}

/** 제공자의 프로필 모양으로 만든 claims. 이메일과 이름이 없으면 그 클레임은 undefined(없는 값)다. */
export function personClaims(provider: OAuthProvider, person: Person): Profile {
  const { subject, email, emailVerified, name } = person;
  switch (provider) {
    case "kakao": {
      const account = { email, is_email_valid: emailVerified, is_email_verified: emailVerified };
      return { id: subject, kakao_account: { ...account, profile: { nickname: name } } };
    }
    case "naver":
      return { response: { id: subject, email, name } };
    case "google": {
      // 구글은 확인된 gmail.com 밖 주소를 Workspace(hd)가 있을 때만 보증한다. 여기서는 Workspace로 본다.
      const workspace =
        emailVerified && email !== undefined && !email.toLowerCase().endsWith("@gmail.com");
      const hd = workspace ? { hd: email.slice(email.lastIndexOf("@") + 1) } : {};
      return { email, email_verified: emailVerified, name, ...hd };
    }
  }
}

/** 프로필: username이 sub이고 claims가 그 위에 얹힌다(claims의 sub가 이긴다). null인 클레임은 뺀다. */
export function profileOf(username: string, claims: Profile): Profile {
  const present = Object.entries(claims).filter(
    ([, value]) => value !== null && value !== undefined,
  );
  return Object.fromEntries([["sub", username], ...present]);
}

export function createOAuthServer(clock: Clock): OAuthServer {
  const grants = createExpiringMap<Grant>(clock);
  return {
    grant(provider, request, profile) {
      const code = newToken();
      const { redirectUri, codeChallenge } = request;
      grants.set(code, { provider, redirectUri, codeChallenge, profile }, AUTHORIZATION_CODE_TTL);
      return withQuery(redirectUri, [["code", code], ...stateOf(request)]);
    },
    redeem({ provider, code, redirectUri, codeVerifier }) {
      const found = grants.take(code);
      if (found?.provider !== provider || found.redirectUri !== redirectUri) return undefined;
      const challenge = found.codeChallenge;
      if (challenge !== undefined && pkceChallenge(codeVerifier) !== challenge) return undefined;
      return found.profile;
    },
  };
}
