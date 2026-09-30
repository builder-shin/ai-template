/**
 * 소셜 로그인 제공자(FastAPI의 auth/providers/*.py): 인가 주소, 코드 교환, 제공자마다 다른 프로필의 해석.
 *
 * - 목의 제공자는 가짜 OAuth 서버(oauth-server/)다. 인가 주소는 <API_URL>/_mock/oauth/<제공자>/authorize
 *   이고, 코드 교환과 프로필 조회는 같은 프로세스에서 한다(redeem). 클라이언트 id는 FastAPI 템플릿
 *   .env.example의 개발용 값이다.
 * - 인가 주소의 쿼리는 FastAPI(httpx-oauth)와 같은 순서와 인코딩이다: response_type, client_id,
 *   redirect_uri, state, scope, code_challenge, code_challenge_method=S256.
 * - 프로필 해석(parseProfile):
 *   - google: OIDC userinfo(sub, email, email_verified, hd, name). email_verified가 참이어도 gmail.com
 *     주소이거나 hd(Workspace)가 있어야 구글이 그 이메일의 주인을 보증한다.
 *   - kakao: /v2/user/me의 id와 kakao_account. is_email_valid와 is_email_verified가 모두 참이어야
 *     보증한다. 이름은 profile.nickname, 없으면 kakao_account.name이다.
 *   - naver: /v1/nid/me의 response. 이메일 검증 플래그가 없어 늘 보증하지 않는다. 이름은 name, 없으면
 *     nickname이다.
 * - 문자열이 아니거나 공백뿐인 값은 없는 값이다. 이름은 앞뒤 공백을 지우고 100자(코드 포인트)로
 *   자른다. 공백은 Python의 str.strip()과 같게 본다.
 * - 사용자 id(sub, id)가 없으면 교환에 실패한 것이다. 문자열이 아니면 Python의 str()처럼 글자로
 *   바꾼다(123 → "123", true → "True"). 정수가 아닌 수와 객체·배열은 표기가 Python과 다를 수 있다.
 */

import type { MockConfig } from "../../config.ts";
import { pkceChallenge } from "../../core/security.ts";
import { urlencode } from "../../core/urls.ts";
import { isRecord } from "../../json.ts";
import { authorizeEndpoint, type Profile } from "../../oauth-server/server.ts";
import type { MockState } from "../../state.ts";
import type { OAuthProvider } from "./model.ts";

/** 제공자가 알려 준 사람. emailVerified는 제공자가 그 이메일의 주인임을 보증하는가다. */
export interface Identity {
  readonly subject: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly name: string | null;
}

interface Provider {
  readonly clientId: string;
  readonly scopes: readonly string[];
  /** 프로필 → 신원. 사용자 id가 없으면 undefined다. */
  readonly parse: (profile: Profile) => Identity | undefined;
}

/** 사용자 이름(users.name)의 최대 길이. */
const NAME_MAX = 100;
/** Python의 str.strip()이 지우는 공백(str.isspace). */
const SPACE =
  "[\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
const EDGE_SPACE = new RegExp(`^${SPACE}+|${SPACE}+$`, "g");

function strip(value: string): string {
  return value.replace(EDGE_SPACE, "");
}

function valueOf(object: Profile, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

/** 비어 있지 않은 문자열이면 그대로(앞뒤 공백도 둔다), 아니면 null. */
function text(value: unknown): string | null {
  return typeof value === "string" && strip(value) !== "" ? value : null;
}

/** 사용자 이름으로 쓸 값. 앞뒤 공백을 지우고 길면 자른다. */
function shortName(value: unknown): string | null {
  const name = text(value);
  return name === null ? null : Array.from(strip(name)).slice(0, NAME_MAX).join("");
}

/** 중첩된 객체. 없거나 객체가 아니면 빈 객체. */
function child(object: Profile, key: string): Profile {
  const found = valueOf(object, key);
  return isRecord(found) ? found : {};
}

/** 사용자 id(Python의 str(object[key])). 키가 없으면 undefined다. */
function subjectOf(object: Profile, key: string): string | undefined {
  if (!Object.hasOwn(object, key)) return undefined;
  const value = object[key];
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value === null) return "None";
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

function google(profile: Profile): Identity | undefined {
  const email = text(valueOf(profile, "email"));
  // 구글은 gmail.com 주소이거나 hd(Workspace)가 있을 때만 이메일의 주인을 보증한다. 예전에 확인한 다른
  // 도메인 주소는 주인이 바뀌었을 수 있다.
  const vouched =
    email !== null &&
    (email.toLowerCase().endsWith("@gmail.com") || text(valueOf(profile, "hd")) !== null);
  const subject = subjectOf(profile, "sub");
  if (subject === undefined) return undefined;
  return {
    subject,
    email,
    emailVerified: valueOf(profile, "email_verified") === true && vouched,
    name: shortName(valueOf(profile, "name")),
  };
}

function kakao(profile: Profile): Identity | undefined {
  const account = child(profile, "kakao_account");
  const email = text(valueOf(account, "email"));
  const verified =
    valueOf(account, "is_email_valid") === true && valueOf(account, "is_email_verified") === true;
  const nickname = shortName(valueOf(child(account, "profile"), "nickname"));
  const subject = subjectOf(profile, "id");
  if (subject === undefined) return undefined;
  return {
    subject,
    email,
    emailVerified: email !== null && verified,
    name: nickname ?? shortName(valueOf(account, "name")),
  };
}

function naver(profile: Profile): Identity | undefined {
  const response = child(profile, "response");
  const subject = subjectOf(response, "id");
  if (subject === undefined) return undefined;
  return {
    subject,
    email: text(valueOf(response, "email")),
    emailVerified: false,
    name: shortName(valueOf(response, "name")) ?? shortName(valueOf(response, "nickname")),
  };
}

const PROVIDERS: Readonly<Record<OAuthProvider, Provider>> = {
  google: {
    clientId: "local-google-client",
    scopes: ["openid", "email", "profile"],
    parse: google,
  },
  kakao: {
    clientId: "local-kakao-client",
    scopes: ["openid", "profile_nickname", "account_email"],
    parse: kakao,
  },
  naver: { clientId: "local-naver-client", scopes: ["openid"], parse: naver },
};

/** 프로필을 신원으로 읽는다. 사용자 id가 없으면 undefined다. */
export function parseProfile(provider: OAuthProvider, profile: Profile): Identity | undefined {
  return PROVIDERS[provider].parse(profile);
}

/** 제공자가 돌아올 이 API의 주소(FastAPI의 callback_url). 실제 제공자라면 콘솔에 등록하는 값이다. */
export function callbackUrl(config: MockConfig, provider: OAuthProvider): string {
  return `${config.apiUrl.replace(/\/+$/, "")}/api/v1/oauth/${provider}/callback`;
}

/** 제공자 로그인 화면의 주소. state와 백엔드의 PKCE(S256)를 붙인다. */
export function authorizationUrl(
  config: MockConfig,
  provider: OAuthProvider,
  state: string,
  verifier: string,
): string {
  const { clientId, scopes } = PROVIDERS[provider];
  const query = urlencode([
    ["response_type", "code"],
    ["client_id", clientId],
    ["redirect_uri", callbackUrl(config, provider)],
    ["state", state],
    ["scope", scopes.join(" ")],
    ["code_challenge", pkceChallenge(verifier)],
    ["code_challenge_method", "S256"],
  ]);
  return `${authorizeEndpoint(config.apiUrl, provider)}?${query}`;
}

/**
 * 코드를 프로필로 바꾸고 신원을 읽는다(FastAPI의 identity). 교환에 실패했거나 사용자 id가 없으면
 * undefined다(FastAPI의 ProviderError).
 */
export function identity(
  state: MockState,
  config: MockConfig,
  provider: OAuthProvider,
  code: string,
  verifier: string,
): Identity | undefined {
  const redirectUri = callbackUrl(config, provider);
  const profile = state.oauthServer.redeem({ provider, code, redirectUri, codeVerifier: verifier });
  return profile === undefined ? undefined : parseProfile(provider, profile);
}
