/**
 * 로그인 세션, 토큰, 1회용 계정 토큰, 소셜 로그인 연결(FastAPI의 sessions, refresh_tokens,
 * account_tokens, social_accounts 테이블)과 소셜 로그인의 짧게 사는 값(FastAPI가 Valkey에 두는 값).
 *
 * - 토큰은 원문 대신 SHA-256(security.digest)을 키로 저장한다.
 * - 세션 하나에 refresh token이 회전하며 쌓인다. 쓴 토큰은 usedAt을 남겨 재사용을 알아챈다.
 * - 세션의 expiresAt은 가장 최근 refresh token의 만료와 같다. 회전할 때 늘어난다.
 * - 폐기한 세션은 revokedAt이 있다. 인증기는 요청마다 이 값을 보므로, 폐기한 세션의 access token은
 *   만료 전이라도 바로 막힌다.
 * - access token은 FastAPI에서는 서명한 JWT라 저장하지 않는다. 목은 불투명한 무작위 문자열을 쓰므로
 *   발급한 토큰을 저장해 두고 요청마다 찾는다(AccessTokenRow).
 */

import type { Instant } from "../../core/clock.ts";
import type { ExpiringMap } from "../../core/expiring.ts";
import type { components } from "../../generated/api.ts";

export type TokenPurpose = "email_verification" | "password_reset";
export type OAuthProvider = components["schemas"]["OAuthProvider"];

/** 로그인 세션(계약의 sessions). */
export interface LoginSessionRow {
  readonly id: string;
  readonly userId: string;
  readonly userAgent: string | null;
  readonly createdAt: Instant;
  lastUsedAt: Instant;
  expiresAt: Instant;
  revokedAt: Instant | null;
}

export interface RefreshTokenRow {
  readonly id: string;
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly expiresAt: Instant;
  usedAt: Instant | null;
  readonly createdAt: Instant;
}

/** 발급한 access token. FastAPI의 JWT가 담는 클레임(sub, sid, exp)과 같은 것을 둔다. */
export interface AccessTokenRow {
  readonly tokenHash: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly expiresAt: Instant;
}

/** 1회용 토큰(이메일 인증, 비밀번호 재설정). 쓰면 지운다. */
export interface AccountTokenRow {
  readonly id: string;
  readonly userId: string;
  readonly purpose: TokenPurpose;
  readonly tokenHash: string;
  readonly expiresAt: Instant;
  readonly createdAt: Instant;
}

/** 소셜 로그인 연결. (제공자, 제공자의 사용자 id)가 계정 하나를 가리킨다. 탈퇴하면 지운다. */
export interface SocialAccountRow {
  readonly id: string;
  readonly userId: string;
  readonly provider: OAuthProvider;
  readonly subject: string;
  readonly createdAt: Instant;
}

/** authorize가 state로 기억해 두는 로그인 시작(FastAPI의 Valkey 키 oauth-state:<state>). */
export interface PendingSignIn {
  readonly provider: OAuthProvider;
  /** 끝나고 돌아갈 프론트 콜백(허용 목록에 있는 redirectUri). */
  readonly redirectUri: string;
  /** 백엔드가 제공자와 쓰는 PKCE code verifier. */
  readonly verifier: string;
  /** BFF가 보낸 codeChallenge. 1회용 코드에 싣는다. */
  readonly codeChallenge: string;
}

/** 1회용 코드가 가리키는 로그인(FastAPI의 SignInCode, Valkey 키 oauth-code:<코드의 digest>). */
export interface SignInCode {
  readonly userId: string;
  readonly provider: OAuthProvider;
  readonly codeChallenge: string;
}

/** 소셜 로그인의 짧게 사는 값. states의 키는 state, codes의 키는 1회용 코드의 digest다. */
export interface OAuthStore {
  readonly states: ExpiringMap<PendingSignIn>;
  readonly codes: ExpiringMap<SignInCode>;
}
