/**
 * 소셜 로그인(FastAPI의 auth/service/oauth.py): authorize, callback, 1회용 코드.
 *
 * - authorize: redirectUri가 설정의 허용 목록(OAUTH_REDIRECT_URIS)에 없으면 400 jsonapi.invalid_query
 *   (redirectUri)다. codeChallenge의 형식은 라우터가 계약의 pattern으로 먼저 본다. state, 백엔드의
 *   PKCE verifier, redirectUri, codeChallenge, 제공자를 10분 두고 제공자 로그인 화면 주소를 돌려준다.
 * - callback: state를 꺼내면서 지운다. 없거나 만료됐거나 다른 제공자의 것이면 돌려보낼 곳을 모르므로
 *   400 jsonapi.invalid_query(state)다. 그 밖의 실패는 redirectUri에 error를 붙여 보낸다.
 *   - 제공자가 error=access_denied로 돌아왔다(사용자가 거부): auth.oauth_denied
 *   - 제공자의 다른 error, code가 없음, 코드 교환이나 신원 조회 실패: auth.oauth_failed
 *   - 연결된 계정이 활성이 아니다: auth.account_deactivated
 * - 계정 연결(link):
 *   1. (제공자, 사용자 id)로 연결된 계정이 있으면 그 계정이다.
 *   2. 제공자가 이메일을 보증하면 같은 이메일의 계정에 연결하고, 없으면 이메일 인증을 마친 새 계정을
 *      만든다. 같은 이메일의 계정이 인증 전이면(선점 가입) 그 비밀번호를 지우고 인증을 마친 것으로
 *      둔다. 같은 이메일의 계정이 활성이 아니면 연결하지 않고 그 계정을 돌려준다.
 *   3. 보증하지 않았거나 이메일이 없으면 이메일 없는 새 계정을 만든다(미검증 이메일은 저장하지 않는다).
 *   새 계정의 이름은 제공자가 준 이름, 로케일은 콜백 요청의 Accept-Language, 역할은 member다.
 * - 성공하면 1회용 코드(60초)에 codeChallenge를 실어 redirectUri?code=로 보낸다. POST /sessions의
 *   oauthCode grant가 코드를 꺼내면서 지우고(consumeCode) codeVerifier를 확인한다(verifies). 공격자가 자기
 *   계정으로 받은 코드를 피해자에게 보내도 피해자의 BFF가 가진 verifier로는 풀리지 않는다(로그인 CSRF).
 * - FastAPI는 같은 사람이 동시에 돌아와 유일 제약에 걸리면 한 번 더 찾는다. 목은 요청이 끼어들지 않는다.
 */

import { timingSafeEqual } from "node:crypto";
import type { MockConfig } from "../../config.ts";
import { MINUTE, SECOND } from "../../core/clock.ts";
import { uuid7 } from "../../core/ids.ts";
import { digest, newToken, pkceChallenge } from "../../core/security.ts";
import { withQuery } from "../../core/urls.ts";
import { ApiError, type ErrorCode } from "../../jsonapi/errors.ts";
import type { MockState } from "../../state.ts";
import type { Store } from "../../store.ts";
import { createAccount, findAccount, markEmailVerified } from "../users/accounts.ts";
import type { Locale, UserRow } from "../users/model.ts";
import type { OAuthProvider, SignInCode, SocialAccountRow } from "./model.ts";
import { authorizationUrl, type Identity, identity } from "./providers.ts";

/** authorize에서 callback까지 기다리는 시간. */
export const STATE_TTL = 10 * MINUTE;
/** 1회용 코드의 수명. */
export const CODE_TTL = 60 * SECOND;
/** PKCE code verifier(RFC 7636 §4.1): unreserved 글자 43~128자. */
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

/** 제공자가 콜백에 붙여 돌려보낸 값. */
export interface ProviderReturn {
  readonly state: string;
  readonly code?: string;
  readonly error?: string;
}

/** 로그인을 시작한다. 브라우저를 보낼 제공자 로그인 화면의 주소를 돌려준다. */
export function authorize(
  state: MockState,
  config: MockConfig,
  provider: OAuthProvider,
  redirectUri: string,
  codeChallenge: string,
): string {
  if (!config.oauthRedirectUris.includes(redirectUri)) {
    const detail = "redirectUri is not one of the allowed front-end callbacks.";
    throw new ApiError(400, "jsonapi.invalid_query", detail, { parameter: "redirectUri" });
  }
  const key = newToken();
  const verifier = newToken();
  state.oauth.states.set(key, { provider, redirectUri, verifier, codeChallenge }, STATE_TTL);
  return authorizationUrl(config, provider, key, verifier);
}

export function findSocialAccount(
  store: Store,
  provider: OAuthProvider,
  subject: string,
): SocialAccountRow | undefined {
  return [...store.socialAccounts.values()].find(
    (row) => row.provider === provider && row.subject === subject,
  );
}

/** 사용자의 소셜 로그인 연결을 모두 지운다(탈퇴). */
export function deleteSocialAccounts(store: Store, userId: string): void {
  for (const [id, row] of store.socialAccounts) {
    if (row.userId === userId) store.socialAccounts.delete(id);
  }
}

/** 신원에 연결된 계정. 없으면 규칙대로 찾거나 만들어 연결한다. */
function link(
  state: MockState,
  provider: OAuthProvider,
  person: Identity,
  locale: Locale,
): UserRow {
  const { store } = state;
  const now = state.clock.now();
  const linked = findSocialAccount(store, provider, person.subject);
  const linkedUser = linked === undefined ? undefined : store.users.get(linked.userId);
  if (linkedUser !== undefined) return linkedUser;
  let user: UserRow | undefined;
  if (person.emailVerified && person.email !== null) {
    user = findAccount(store, person.email);
    if (user !== undefined && user.status !== "active") return user;
    // 인증 전 가입의 비밀번호는 이메일의 주인이 정한 것인지 알 수 없다(선점 가입).
    if (user !== undefined && markEmailVerified(user, now)) user.passwordHash = null;
  }
  if (user === undefined) {
    const email = person.emailVerified ? person.email : null;
    const account = { email, password: null, name: person.name, locale, verified: email !== null };
    user = createAccount(store, account, now);
  }
  const row: SocialAccountRow = {
    id: uuid7(),
    userId: user.id,
    provider,
    subject: person.subject,
    createdAt: now,
  };
  store.socialAccounts.set(row.id, row);
  return user;
}

/** 제공자가 돌아온 뒤 브라우저를 보낼 프론트 콜백 주소(code 또는 error가 붙는다). */
export function callback(
  state: MockState,
  config: MockConfig,
  provider: OAuthProvider,
  returned: ProviderReturn,
  locale: Locale,
): string {
  const pending = state.oauth.states.take(returned.state);
  if (pending?.provider !== provider) {
    const detail = "The state is unknown or has expired.";
    throw new ApiError(400, "jsonapi.invalid_query", detail, { parameter: "state" });
  }
  const failed = (error: ErrorCode) => withQuery(pending.redirectUri, [["error", error]]);
  if (returned.error === "access_denied") return failed("auth.oauth_denied");
  if (returned.error !== undefined || returned.code === undefined) {
    return failed("auth.oauth_failed");
  }
  const person = identity(state, config, provider, returned.code, pending.verifier);
  if (person === undefined) return failed("auth.oauth_failed");
  const user = link(state, provider, person, locale);
  if (user.status !== "active") return failed("auth.account_deactivated");
  const code = newToken();
  const signIn: SignInCode = { userId: user.id, provider, codeChallenge: pending.codeChallenge };
  state.oauth.codes.set(digest(code), signIn, CODE_TTL);
  return withQuery(pending.redirectUri, [["code", code]]);
}

/** 1회용 코드를 꺼내면서 지운다. 없거나 만료됐으면 undefined다. */
export function consumeCode(state: MockState, code: string): SignInCode | undefined {
  return state.oauth.codes.take(digest(code));
}

/**
 * codeVerifier가 authorize에서 받은 codeChallenge(PKCE S256)를 만드는가. RFC 7636의 모양이 아니면 바로
 * false다: 빈 verifier의 challenge도 43자라 authorize의 형식 검사를 지나므로, verifier가 없는 BFF가
 * ""를 보내면 공격자의 코드가 풀린다. 비교는 시간이 일정하다.
 */
export function verifies(codeChallenge: string, codeVerifier: string): boolean {
  if (!CODE_VERIFIER.test(codeVerifier)) return false;
  const actual = Buffer.from(pkceChallenge(codeVerifier));
  const expected = Buffer.from(codeChallenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
