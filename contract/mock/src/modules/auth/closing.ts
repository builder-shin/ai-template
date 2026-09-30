/**
 * 계정 닫기(users의 closeAccount)에 auth가 등록하는 처리(FastAPI의 auth/service/credentials.py의
 * close_credentials). 등록은 modules/registry.ts가 한다.
 *
 * - 비활성화와 탈퇴 모두 폐기하지 않은 세션을 모두 폐기한다. 폐기한 세션이 있으면 session.revoked를
 *   보낸다(사유 account_deactivated, account_deleted).
 * - 탈퇴면 남은 1회용 토큰(이메일 인증, 비밀번호 재설정)과 소셜 로그인 연결도 지운다. 그래서 같은
 *   제공자의 같은 사람이 다시 로그인하면 새 계정이 된다. 비활성화는 토큰과 연결을 남긴다(다시 활성화하면
 *   그대로 쓴다).
 */

import type { MockState } from "../../state.ts";
import type { Closure } from "../users/accounts.ts";
import { sessionRevoked } from "./events.ts";
import { deleteSocialAccounts } from "./oauth.ts";
import { revokeUserSessions } from "./sessions.ts";
import { deleteAccountTokens } from "./tokens.ts";

export function closeCredentials(state: MockState, userId: string, closure: Closure): void {
  const deleted = closure === "deleted";
  if (revokeUserSessions(state.store, userId, state.clock.now()) > 0) {
    sessionRevoked(state.realtime, userId, deleted ? "account_deleted" : "account_deactivated");
  }
  if (deleted) {
    deleteAccountTokens(state.store, userId);
    deleteSocialAccounts(state.store, userId);
  }
}
