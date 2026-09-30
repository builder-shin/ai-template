/**
 * 로그인 세션, 토큰, 1회용 계정 토큰(FastAPI의 sessions, refresh_tokens, account_tokens 테이블).
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

export type TokenPurpose = "email_verification" | "password_reset";

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
