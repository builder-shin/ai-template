/**
 * 비밀번호 재설정 요청, 재설정, 변경(FastAPI의 auth/service/passwords.py).
 *
 * - 재설정 요청은 계정이 있는지 드러내지 않도록 늘 202다. 이메일이 있는 활성 계정에만 메일을
 *   보낸다(인증 전 계정과 소셜 전용 계정도 이메일이 있으면 비밀번호를 정할 수 있다). 인증 메일
 *   재발송과 같은 한도(mail-ip, mail-email)를 나눠 쓴다.
 * - 재설정: 1회용 토큰(1시간)으로 비밀번호를 바꾸고 모든 세션을 폐기한다(session.revoked, 사유
 *   password_reset). 재설정 메일을 받았으니 이메일도 확인된 것으로 본다. 토큰이 틀렸거나 만료됐거나
 *   계정이 활성이 아니면 422 auth.verification_token_invalid다.
 * - 변경: 현재 세션을 뺀 나머지를 폐기하고(사유 password_changed), 남은 재설정 토큰을 지운다(바꾸기
 *   전에 요청해 둔 재설정 메일로 다시 바꾸지 못하게). 현재 비밀번호가 틀리거나 비밀번호가 없는
 *   계정은 401 auth.invalid_credentials(source.pointer는 currentPassword)다. 사용자별 엄격한 레이트
 *   리밋(password-change-user)을 먼저 센다.
 * - 둘 다 감사 로그(user.password_reset, user.password_changed)를 남긴다. 폐기한 세션이 없으면
 *   session.revoked를 보내지 않는다.
 */

import type { MockConfig } from "../../config.ts";
import type { Principal } from "../../core/access.ts";
import { type AuditRecord, recordAudit } from "../../core/audit.ts";
import type { Client } from "../../core/client.ts";
import type { Instant } from "../../core/clock.ts";
import { enforce } from "../../core/rate-limit.ts";
import { checkPassword } from "../../core/security.ts";
import type { components } from "../../generated/api.ts";
import { ApiError } from "../../jsonapi/errors.ts";
import type { MockState } from "../../state.ts";
import { findAccount, markEmailVerified, setPassword } from "../users/accounts.ts";
import { sessionRevoked } from "./events.ts";
import { authLimits, mailRequestLimits } from "./limits.ts";
import { sendPasswordReset } from "./mails.ts";
import { revokeUserSessions } from "./sessions.ts";
import { deleteAccountTokens, findAccountToken, invalidToken } from "./tokens.ts";

type PasswordResetCreateAttributes = components["schemas"]["PasswordResetCreateAttributes"];
type PasswordChangeCreateAttributes = components["schemas"]["PasswordChangeCreateAttributes"];

export interface PasswordReset {
  /** 재설정 리소스의 id(쓴 토큰의 id). */
  readonly id: string;
  readonly createdAt: Instant;
}

/** 비밀번호를 바꾼 기록. 행위자와 대상이 그 사용자다. */
function audit(
  state: MockState,
  action: "user.password_reset" | "user.password_changed",
  userId: string,
  client: Client,
  now: Instant,
): void {
  const record: AuditRecord = {
    action,
    actorId: userId,
    ipAddress: client.ip,
    target: { type: "users", id: userId },
  };
  recordAudit(state.store, record, now);
}

/** 이메일이 있는 활성 계정에만 재설정 메일을 보낸다. 부른 쪽은 늘 202로 답한다. */
export function requestReset(
  state: MockState,
  config: MockConfig,
  client: Client,
  email: string,
): void {
  mailRequestLimits(state, config, client, email);
  const user = findAccount(state.store, email);
  if (user?.status !== "active") return;
  sendPasswordReset(state, config, user.id);
}

/** 토큰으로 비밀번호를 바꾸고 모든 세션을 폐기한다. */
export function resetPassword(
  state: MockState,
  client: Client,
  attributes: PasswordResetCreateAttributes,
): PasswordReset {
  const now = state.clock.now();
  const row = findAccountToken(state.store, attributes.token, "password_reset", now);
  const user = state.store.users.get(row.userId);
  if (user?.status !== "active") throw invalidToken();
  deleteAccountTokens(state.store, user.id, "password_reset");
  setPassword(user, attributes.password, now);
  markEmailVerified(user, now);
  const revoked = revokeUserSessions(state.store, user.id, now);
  sessionRevoked(state.realtime, user.id, "password_reset", revoked);
  audit(state, "user.password_reset", user.id, client, now);
  return { id: row.id, createdAt: now };
}

/** 현재 비밀번호를 확인하고 바꾼다. 바꾼 시각을 돌려준다. */
export function changePassword(
  state: MockState,
  config: MockConfig,
  actor: Principal,
  client: Client,
  attributes: PasswordChangeCreateAttributes,
): Instant {
  enforce(state.limiter, authLimits(config).passwordChangeUser, actor.userId);
  const user = state.store.users.get(actor.userId);
  const hashed = user?.passwordHash ?? null;
  if (!checkPassword(attributes.currentPassword, hashed) || user === undefined) {
    const pointer = "/data/attributes/currentPassword";
    const detail = "The current password is wrong.";
    throw new ApiError(401, "auth.invalid_credentials", detail, { pointer });
  }
  const now = state.clock.now();
  setPassword(user, attributes.newPassword, now);
  deleteAccountTokens(state.store, user.id, "password_reset");
  const revoked = revokeUserSessions(state.store, user.id, now, actor.sessionId);
  sessionRevoked(state.realtime, user.id, "password_changed", revoked);
  audit(state, "user.password_changed", user.id, client, now);
  return now;
}
