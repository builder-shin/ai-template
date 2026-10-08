/**
 * 1회용 계정 토큰(이메일 인증 24시간, 비밀번호 재설정 1시간). 원문은 메일로만 보낸다(FastAPI의
 * auth/service/tokens.py).
 *
 * - 쓰면 그 토큰과 그 사용자의 같은 목적 토큰을 모두 지운다. 그래서 새로 받은 메일의 토큰으로 인증하면
 *   전에 받은 토큰도 더 쓰지 못한다.
 * - FastAPI는 토큰을 지운 뒤 다음 검사가 실패하면 롤백해 토큰이 남는다. 목은 검사를 모두 마친 뒤에
 *   지운다(findAccountToken으로 찾고, 검사하고, deleteAccountTokens로 지운다).
 */

import { HOUR, type Instant } from "../../core/clock.ts";
import { uuid7 } from "../../core/ids.ts";
import { digest, newToken } from "../../core/security.ts";
import { ApiError } from "../../jsonapi/errors.ts";
import type { Store } from "../../store.ts";
import type { AccountTokenRow, TokenPurpose } from "./model.ts";

export const ACCOUNT_TOKEN_TTL: Readonly<Record<TokenPurpose, number>> = {
  email_verification: 24 * HOUR,
  password_reset: HOUR,
};

/** 토큰을 만들어 저장하고 원문을 돌려준다. */
export function issueAccountToken(
  store: Store,
  userId: string,
  purpose: TokenPurpose,
  now: Instant,
): string {
  const token = newToken();
  const row: AccountTokenRow = {
    id: uuid7(),
    userId,
    purpose,
    tokenHash: digest(token),
    expiresAt: now + ACCOUNT_TOKEN_TTL[purpose],
    createdAt: now,
  };
  store.accountTokens.set(row.tokenHash, row);
  return token;
}

export function invalidToken(): ApiError {
  const detail = "The token is wrong or has expired.";
  const pointer = "/data/attributes/token";
  return new ApiError(422, "auth.verification_token_invalid", detail, { pointer });
}

/** 맞고 만료되지 않은 토큰. 틀렸거나 만료됐으면 422 auth.verification_token_invalid다. */
export function findAccountToken(
  store: Store,
  token: string,
  purpose: TokenPurpose,
  now: Instant,
): AccountTokenRow {
  const row = store.accountTokens.get(digest(token));
  if (row?.purpose !== purpose || row.expiresAt <= now) throw invalidToken();
  return row;
}

/** 사용자의 1회용 토큰을 지운다. purpose가 없으면 모든 목적의 토큰이다. */
export function deleteAccountTokens(store: Store, userId: string, purpose?: TokenPurpose): void {
  for (const [key, row] of store.accountTokens) {
    if (row.userId === userId && (purpose === undefined || row.purpose === purpose)) {
      store.accountTokens.delete(key);
    }
  }
}
