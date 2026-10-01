/**
 * 소셜 로그인 도우미: 목의 가짜 OAuth 서버에서 로그인하고 콜백을 거친다(FastAPI 테스트의
 * app/tests/oauth.py와 auth/tests/test_oauth.py의 도우미). 브라우저 대신 리다이렉트를 따라간다:
 * authorize → 제공자 로그인 폼 → callback → 프론트 콜백의 code → POST /sessions(oauthCode).
 */

import { randomBytes } from "node:crypto";
import type { Hono } from "hono";
import { expect } from "vitest";
import type { AppEnv } from "../src/context.ts";
import { pkceChallenge } from "../src/core/security.ts";
import type { OAuthProvider } from "../src/modules/auth/model.ts";
import { send } from "./accounts.ts";

type App = Hono<AppEnv>;

/** 목의 기본 OAUTH_REDIRECT_URIS(FastAPI 템플릿 .env.example과 같다). */
export const FRONT = "http://localhost:3000/oauth/callback";

/** BFF가 만드는 PKCE 쌍(codeVerifier, codeChallenge). verifier를 주면 그 값으로 challenge를 만든다. */
export function pkce(verifier = randomBytes(32).toString("base64url")) {
  return { verifier, challenge: pkceChallenge(verifier) };
}

export interface ClaimsOptions {
  readonly email?: string | null;
  readonly verified?: boolean;
  readonly name?: string;
  /** 구글 Workspace 계정인가(hd). false면 확인된 gmail.com 밖 주소에도 hd를 붙이지 않는다. */
  readonly googleWorkspace?: boolean;
}

/**
 * provider의 프로필 응답 모양으로 만든 claims(FastAPI 테스트의 claims, 적합성 키트의 mockClaims).
 * 구글은 확인된 이메일이 gmail.com이 아니면 hd(Workspace)를 붙인다.
 */
export function claims(
  provider: OAuthProvider,
  subject: string,
  options: ClaimsOptions = {},
): Record<string, unknown> {
  const { email = null, verified = false, name = "Social User" } = options;
  switch (provider) {
    case "kakao": {
      const account = { email, is_email_valid: verified, is_email_verified: verified };
      return { id: subject, kakao_account: { ...account, profile: { nickname: name } } };
    }
    case "naver":
      return { response: { id: subject, email, name } };
    case "google": {
      const workspace =
        verified &&
        options.googleWorkspace !== false &&
        email !== null &&
        !email.toLowerCase().endsWith("@gmail.com");
      const hd = workspace ? { hd: email.slice(email.lastIndexOf("@") + 1) } : {};
      return { email, email_verified: verified, name, ...hd };
    }
  }
}

/** 주소의 쿼리(이름 → 값). */
export function queryOf(location: string | null): Record<string, string> {
  return Object.fromEntries(new URL(location ?? "").searchParams);
}

/** authorize를 불러 제공자 로그인 화면의 주소를 받는다. */
export async function start(
  app: App,
  provider: OAuthProvider,
  codeChallenge: string,
  redirectUri = FRONT,
): Promise<string> {
  const query = new URLSearchParams({ redirectUri, codeChallenge });
  const response = await app.request(`/api/v1/oauth/${provider}/authorize?${query.toString()}`);
  expect(response.status, await response.clone().text()).toBe(302);
  return response.headers.get("location") ?? "";
}

/** 제공자 로그인 화면에 폼을 보낸다(브라우저의 제출). */
export function submit(
  app: App,
  location: string,
  form: Readonly<Record<string, string>>,
): Promise<Response> {
  return Promise.resolve(
    app.request(location, { method: "POST", body: new URLSearchParams({ ...form }) }),
  );
}

/** 제공자에서 username과 claims로 로그인하고, 제공자가 돌려보낸 콜백 주소의 쿼리(code, state)를 준다. */
export async function signInAtProvider(
  app: App,
  location: string,
  username: string,
  found: Readonly<Record<string, unknown>>,
): Promise<Record<string, string>> {
  const response = await submit(app, location, { username, claims: JSON.stringify(found) });
  expect(response.status, await response.clone().text()).toBe(302);
  return queryOf(response.headers.get("location"));
}

/** 제공자가 돌려보낸 것처럼 콜백을 부른다. */
export function callback(
  app: App,
  provider: OAuthProvider,
  params: Readonly<Record<string, string>>,
  headers: Readonly<Record<string, string>> = {},
): Promise<Response> {
  const query = new URLSearchParams({ ...params }).toString();
  return Promise.resolve(app.request(`/api/v1/oauth/${provider}/callback?${query}`, { headers }));
}

/** 콜백을 부르고, 프론트 콜백으로 보낸 주소의 쿼리(code 또는 error)를 준다. */
export async function comeBack(
  app: App,
  provider: OAuthProvider,
  params: Readonly<Record<string, string>>,
  headers: Readonly<Record<string, string>> = {},
): Promise<Record<string, string>> {
  const response = await callback(app, provider, params, headers);
  expect(response.status, await response.clone().text()).toBe(302);
  const location = response.headers.get("location") ?? "";
  expect(location.startsWith(`${FRONT}?`), location).toBe(true);
  return queryOf(location);
}

export interface SocialOptions extends ClaimsOptions {
  /** 만든 값 대신 쓸 code verifier. */
  readonly verifier?: string;
  /** 콜백 요청의 헤더(예: Accept-Language). */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * 제공자에서 로그인하고 프론트 콜백의 쿼리(code 또는 error)를 준다. code가 있으면(성공) 그 code를 만든
 * codeVerifier도 verifier로 더해 준다(FastAPI 테스트의 _social).
 */
export async function social(
  app: App,
  provider: OAuthProvider,
  subject: string,
  options: SocialOptions = {},
): Promise<Record<string, string>> {
  const { verifier, challenge } = pkce(options.verifier);
  const location = await start(app, provider, challenge);
  const returned = await signInAtProvider(
    app,
    location,
    subject,
    claims(provider, subject, options),
  );
  const back = await comeBack(app, provider, returned, options.headers);
  return back.code === undefined ? back : { ...back, verifier };
}

export function oauthGrant(code: string, codeVerifier: string) {
  return { data: { type: "sessions", attributes: { grantType: "oauthCode", code, codeVerifier } } };
}

/** 1회용 코드를 세션으로 바꾼다(BFF의 POST /sessions). */
export function exchange(
  app: App,
  code: string | undefined,
  codeVerifier: string | undefined,
  headers: Readonly<Record<string, string>> = {},
): Promise<Response> {
  const document = oauthGrant(code ?? "", codeVerifier ?? "");
  return send(app, "POST", "/api/v1/sessions", { document, headers });
}

export interface SocialUser {
  readonly id: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly accessToken: string;
}

/** 소셜 로그인의 결과(social)로 세션을 열고 그 사용자(/me)를 준다. */
export async function me(app: App, back: Readonly<Record<string, string>>): Promise<SocialUser> {
  const created = await exchange(app, back.code, back.verifier);
  expect(created.status, await created.clone().text()).toBe(201);
  const session = (await created.json()) as { data: { attributes: { accessToken: string } } };
  const accessToken = session.data.attributes.accessToken;
  const response = await send(app, "GET", "/api/v1/me", { token: accessToken });
  const body = (await response.json()) as {
    data: { id: string; attributes: { email: string | null; name: string | null } };
  };
  const { email, name } = body.data.attributes;
  return { id: body.data.id, email, name, accessToken };
}
