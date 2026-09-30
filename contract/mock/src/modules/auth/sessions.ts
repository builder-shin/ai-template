/**
 * 로그인(POST /sessions), 세션 목록, 로그아웃, 다른 기기·전체 로그아웃(FastAPI의
 * auth/service/sessions.py).
 *
 * - password grant: IP별과 이메일(해시)별 분당 한도를 넘으면 429다. 틀린 비밀번호와 없는 계정은 같은
 *   401 auth.invalid_credentials이고, 비밀번호가 맞아도 비활성 계정은 403 auth.account_deactivated,
 *   인증 전 계정은 403 auth.email_not_verified다. 실패는 감사 로그(session.login_failed, 입력한 이메일의
 *   해시만)를 남긴다.
 * - refreshToken grant: refresh token을 회전한다. 이미 쓴 토큰이 다시 오면 그 세션을 폐기하고 401
 *   auth.refresh_token_reused다.
 * - oauthCode grant: 소셜 로그인 콜백이 프론트로 넘긴 1회용 코드다. 코드를 만드는 소셜 로그인 흐름이
 *   아직 없어, FastAPI가 모르는 코드에 답하는 것처럼 모든 코드가 401 auth.oauth_code_invalid다.
 */

import type { MockConfig } from "../../config.ts";
import type { Principal } from "../../core/access.ts";
import { type AuditRecord, recordAudit } from "../../core/audit.ts";
import type { Client } from "../../core/client.ts";
import type { Instant } from "../../core/clock.ts";
import { ordered, pageOf } from "../../core/listing.ts";
import { enforce } from "../../core/rate-limit.ts";
import { checkPassword, digest } from "../../core/security.ts";
import type { components } from "../../generated/api.ts";
import { ApiError } from "../../jsonapi/errors.ts";
import type { Page, SortField } from "../../jsonapi/query.ts";
import type { MockState } from "../../state.ts";
import type { Store } from "../../store.ts";
import { findAccount } from "../users/accounts.ts";
import type { UserRow } from "../users/model.ts";
import {
  activeSession,
  type IssuedTokens,
  issue,
  openSession,
  refreshTokenRow,
  unauthorized,
} from "./credentials.ts";
import { sessionRevoked } from "./events.ts";
import { authLimits, emailSubject, ipSubject } from "./limits.ts";
import type { LoginSessionRow } from "./model.ts";

type SessionGrant = components["schemas"]["SessionGrant"];
type SessionPasswordGrant = components["schemas"]["SessionPasswordGrant"];
export type SessionRevocationScope = components["schemas"]["SessionRevocationScope"];

const SESSION_DEFAULT_SORT: readonly SortField[] = [{ name: "lastUsedAt", descending: true }];

function userTarget(userId: string): AuditRecord["target"] {
  return { type: "users", id: userId };
}

function loginFailed(
  state: MockState,
  client: Client,
  user: UserRow | undefined,
  identifier: string,
  reason: string,
): void {
  const record: AuditRecord = {
    action: "session.login_failed",
    actorId: null,
    ipAddress: client.ip,
    target: user === undefined ? undefined : userTarget(user.id),
    metadata: { identifierHash: identifier, reason },
  };
  recordAudit(state.store, record, state.clock.now());
}

function password(
  state: MockState,
  config: MockConfig,
  client: Client,
  grant: SessionPasswordGrant,
): IssuedTokens {
  const identifier = emailSubject(config, grant.email);
  const limits = authLimits(config);
  enforce(state.limiter, limits.loginIp, ipSubject(client));
  enforce(state.limiter, limits.loginIdentifier, identifier);
  const user = findAccount(state.store, grant.email);
  if (!checkPassword(grant.password, user?.passwordHash ?? null) || user === undefined) {
    loginFailed(state, client, user, identifier, "invalid_credentials");
    throw unauthorized("auth.invalid_credentials", "The email or password is wrong.");
  }
  if (user.status !== "active") {
    loginFailed(state, client, user, identifier, "account_deactivated");
    throw new ApiError(403, "auth.account_deactivated", "The account is deactivated.");
  }
  if (user.emailVerifiedAt === null) {
    loginFailed(state, client, user, identifier, "email_not_verified");
    throw new ApiError(403, "auth.email_not_verified", "The email is not verified yet.");
  }
  const issued = openSession(state.store, user.id, client.userAgent, state.clock.now());
  const record: AuditRecord = {
    action: "session.login_succeeded",
    actorId: user.id,
    ipAddress: client.ip,
    target: userTarget(user.id),
    metadata: { method: "password" },
  };
  recordAudit(state.store, record, state.clock.now());
  return issued;
}

function refresh(state: MockState, refreshToken: string): IssuedTokens {
  const { store } = state;
  const now = state.clock.now();
  const invalid = () => unauthorized("auth.token_invalid", "The refresh token is invalid.");
  const row = store.refreshTokens.get(digest(refreshToken));
  if (row === undefined || row.expiresAt <= now) throw invalid();
  const login = store.sessions.get(row.sessionId);
  if (login?.revokedAt !== null) throw invalid();
  if (row.usedAt !== null) {
    login.revokedAt = now;
    sessionRevoked(state.realtime, login.userId, "refresh_token_reused");
    const detail = "The refresh token was already used. The session is revoked.";
    throw unauthorized("auth.refresh_token_reused", detail);
  }
  if (activeSession(store, login.id, login.userId) === undefined) throw invalid();
  row.usedAt = now;
  login.lastUsedAt = now;
  const [token, fresh] = refreshTokenRow(login, now);
  store.refreshTokens.set(fresh.tokenHash, fresh);
  return issue(store, login, token, now);
}

/**
 * oauthCode grant. 소셜 로그인 흐름(authorize → 제공자 → callback)이 1회용 코드를 만들면 여기서 코드와
 * code verifier를 확인하고 세션을 연다. 그 흐름을 더하기 전에는 받을 수 있는 코드가 없다.
 */
function oauthCode(): never {
  throw unauthorized("auth.oauth_code_invalid", "The sign-in code is wrong or has expired.");
}

export function signIn(
  state: MockState,
  config: MockConfig,
  client: Client,
  grant: SessionGrant,
): IssuedTokens {
  switch (grant.grantType) {
    case "password":
      return password(state, config, client, grant);
    case "refreshToken":
      return refresh(state, grant.refreshToken);
    case "oauthCode":
      return oauthCode();
  }
}

/** 사용자의 폐기되지 않고 만료되지 않은 세션인가. */
function live(login: LoginSessionRow, userId: string, now: Instant): boolean {
  return login.userId === userId && login.revokedAt === null && login.expiresAt > now;
}

/** 내 살아 있는 세션 한 페이지와 전체 개수. 기본 정렬은 최근에 쓴 순서다. */
export function listSessions(
  state: MockState,
  actor: Principal,
  sort: readonly SortField[],
  page: Page,
): { rows: LoginSessionRow[]; total: number } {
  const now = state.clock.now();
  const mine = [...state.store.sessions.values()].filter((login) => live(login, actor.userId, now));
  const columns = {
    createdAt: (login: LoginSessionRow) => login.createdAt,
    lastUsedAt: (login: LoginSessionRow) => login.lastUsedAt,
  };
  return pageOf(ordered(mine, sort, columns, SESSION_DEFAULT_SORT), page);
}

/**
 * 내 세션 하나를 폐기한다. 없거나, 남의 세션이거나, 이미 끝난 세션이면 404다. 현재 세션이면 사유가
 * logout, 다른 세션이면 revoked다.
 */
export function revokeSession(state: MockState, actor: Principal, sessionId: string): void {
  const now = state.clock.now();
  const login = state.store.sessions.get(sessionId);
  if (login === undefined || !live(login, actor.userId, now)) {
    throw new ApiError(404, "resource.not_found", `Session ${sessionId} does not exist.`);
  }
  login.revokedAt = now;
  const reason = sessionId === actor.sessionId ? "logout" : "revoked";
  sessionRevoked(state.realtime, actor.userId, reason);
}

/**
 * 사용자의 폐기하지 않은 세션을 모두 폐기하고 그 개수를 돌려준다(FastAPI의 revoke_sessions). keep은
 * 남길 세션이다. 폐기하지 않은 세션이면 만료됐어도 센다(FastAPI는 정리 잡이 지우기 전까지 남아 있는
 * 세션을 센다). 이벤트는 부른 쪽이 사유를 정해 보낸다.
 */
export function revokeUserSessions(
  store: Store,
  userId: string,
  now: Instant,
  keep?: string,
): number {
  let revoked = 0;
  for (const login of store.sessions.values()) {
    if (login.userId !== userId || login.revokedAt !== null || login.id === keep) continue;
    login.revokedAt = now;
    revoked += 1;
  }
  return revoked;
}

/**
 * others는 현재 세션을 뺀 나머지를, all은 전부 폐기한다. 폐기한 개수를 돌려준다. all은 폐기한
 * 세션이 없어도 감사 로그를 남긴다.
 */
export function revokeSessions(
  state: MockState,
  actor: Principal,
  client: Client,
  scope: SessionRevocationScope,
): number {
  const keep = scope === "others" ? actor.sessionId : undefined;
  const revoked = revokeUserSessions(state.store, actor.userId, state.clock.now(), keep);
  if (revoked > 0) sessionRevoked(state.realtime, actor.userId, "revoked");
  if (scope === "all") {
    const record: AuditRecord = {
      action: "session.all_revoked",
      actorId: actor.userId,
      ipAddress: client.ip,
      target: userTarget(actor.userId),
      metadata: { revokedCount: revoked },
    };
    recordAudit(state.store, record, state.clock.now());
  }
  return revoked;
}
