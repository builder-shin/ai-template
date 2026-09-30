/**
 * 인증기와 세션 발급(FastAPI의 auth/service/credentials.py).
 *
 * - access token(15분)은 불투명한 무작위 문자열이다. 발급할 때 사용자, 세션, 만료 시각을 저장해 두고
 *   요청마다 찾는다. FastAPI의 JWT와 같게 만료는 초 단위로 버리고 30초를 봐준다. 모르는 토큰은
 *   auth.token_invalid, 만료된 토큰은 auth.token_expired(세션이 살아 있는지와 관계없다)다.
 * - 인증기는 요청마다 세션이 폐기되지 않았는지, 사용자가 활성인지 본다. 그래서 로그아웃과 폐기는 access
 *   token의 만료를 기다리지 않고 바로 효과를 낸다(401 auth.token_invalid "The session has ended.").
 *   같은 요청에서 역할로 실제 권한도 계산한다.
 * - refresh token은 32바이트 불투명 토큰(30일)이고 digest만 저장한다.
 */

import type { Authenticator, Principal } from "../../core/access.ts";
import { DAY, type Instant, MINUTE, SECOND } from "../../core/clock.ts";
import { uuid7 } from "../../core/ids.ts";
import { digest, newToken } from "../../core/security.ts";
import { ApiError, type ErrorCode } from "../../jsonapi/errors.ts";
import type { MockState } from "../../state.ts";
import type { Store } from "../../store.ts";
import { effectivePermissions } from "../roles/service.ts";
import type { AccessTokenRow, LoginSessionRow, RefreshTokenRow } from "./model.ts";

export const ACCESS_TOKEN_TTL = 15 * MINUTE;
/** 만료를 검사할 때 봐주는 시간. FastAPI는 api 인스턴스끼리 시계가 조금 어긋나도 되게 둔다. */
export const ACCESS_TOKEN_LEEWAY = 30 * SECOND;
export const REFRESH_TOKEN_TTL = 30 * DAY;

/** POST /sessions의 201 응답에만 담기는 토큰. */
export interface IssuedTokens {
  readonly session: LoginSessionRow;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: Instant;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: Instant;
}

export function unauthorized(code: ErrorCode, detail: string): ApiError {
  return new ApiError(401, code, detail);
}

/** 폐기되지 않았고 사용자가 활성인 세션. 인증기가 요청마다 부른다. */
export function activeSession(
  store: Store,
  sessionId: string,
  userId: string,
): LoginSessionRow | undefined {
  const login = store.sessions.get(sessionId);
  const active = store.users.get(userId)?.status === "active";
  return login?.userId === userId && login.revokedAt === null && active ? login : undefined;
}

/**
 * 살아 있는 세션의 Principal(실제 권한 포함). 세션이 끝났거나 사용자가 활성이 아니면 undefined다.
 * 인증기와 실시간 연결(티켓)이 같은 규칙으로 본다.
 */
export function sessionPrincipal(
  store: Store,
  userId: string,
  sessionId: string,
): Principal | undefined {
  const login = activeSession(store, sessionId, userId);
  if (login === undefined) return undefined;
  return {
    userId,
    sessionId,
    permissions: effectivePermissions(store, userId),
    loggedInAt: login.createdAt,
  };
}

/** JWT의 exp처럼 만료 시각을 초 단위로 버리고, 봐주는 시간까지 지났으면 만료다. */
function expired(row: AccessTokenRow, now: Instant): boolean {
  const exp = Math.floor(row.expiresAt / SECOND) * SECOND;
  return exp <= now - ACCESS_TOKEN_LEEWAY;
}

/** Bearer 토큰 → Principal. 앱을 조립할 때 JSON:API 라우터에 건다. */
export function createAuthenticator(state: MockState): Authenticator {
  return (token) => {
    const row = state.store.accessTokens.get(digest(token));
    if (row === undefined) throw unauthorized("auth.token_invalid", "The access token is invalid.");
    if (expired(row, state.clock.now())) {
      throw unauthorized("auth.token_expired", "The access token has expired.");
    }
    const principal = sessionPrincipal(state.store, row.userId, row.sessionId);
    if (principal === undefined) throw unauthorized("auth.token_invalid", "The session has ended.");
    return principal;
  };
}

/** 세션의 새 refresh token(원문, 행). 세션의 만료를 새 토큰의 만료로 늘린다. */
export function refreshTokenRow(login: LoginSessionRow, now: Instant): [string, RefreshTokenRow] {
  const token = newToken();
  const expiresAt = now + REFRESH_TOKEN_TTL;
  login.expiresAt = expiresAt;
  const row: RefreshTokenRow = {
    id: uuid7(),
    sessionId: login.id,
    tokenHash: digest(token),
    expiresAt,
    usedAt: null,
    createdAt: now,
  };
  return [token, row];
}

/** 세션의 access token을 발급하고 refresh token과 함께 돌려준다. */
export function issue(
  store: Store,
  login: LoginSessionRow,
  refreshToken: string,
  now: Instant,
): IssuedTokens {
  const accessToken = newToken();
  const row: AccessTokenRow = {
    tokenHash: digest(accessToken),
    userId: login.userId,
    sessionId: login.id,
    expiresAt: now + ACCESS_TOKEN_TTL,
  };
  store.accessTokens.set(row.tokenHash, row);
  return {
    session: login,
    accessToken,
    accessTokenExpiresAt: row.expiresAt,
    refreshToken,
    refreshTokenExpiresAt: login.expiresAt,
  };
}

/** 로그인 세션을 열고 토큰을 발급한다. */
export function openSession(
  store: Store,
  userId: string,
  userAgent: string | null,
  now: Instant,
): IssuedTokens {
  const login: LoginSessionRow = {
    id: uuid7(),
    userId,
    userAgent,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: now + REFRESH_TOKEN_TTL,
    revokedAt: null,
  };
  const [token, row] = refreshTokenRow(login, now);
  store.sessions.set(login.id, login);
  store.refreshTokens.set(row.tokenHash, row);
  return issue(store, login, token, now);
}
