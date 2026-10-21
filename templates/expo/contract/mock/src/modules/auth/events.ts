/**
 * auth의 실시간 이벤트(계약의 x-realtime-events). FastAPI의 auth/events.py와 같다.
 *
 * 세션을 폐기하면 그 사용자의 user:{id} 룸에 session.revoked를 보낸다. meta.reason이 사유다.
 * - logout: 본인이 로그아웃했다(자기 세션을 지운 경우도)
 * - revoked: 다른 기기에서 이 세션을 지웠거나, 다른 기기·전체 로그아웃
 * - refresh_token_reused: refresh token 재사용이 감지됐다
 * - password_reset, password_changed, account_deactivated, account_deleted: 비밀번호와 계정 흐름이 보낸다
 * 폐기한 세션이 없으면 보내지 않는다. 그 사용자의 연결은 폐기한 세션 수와 관계없이 다시 검사해
 * 끝난(폐기했거나 만료된) 세션의 연결을 끊는다.
 */

import { type RealtimeHub, userRoom } from "../../core/realtime.ts";
import type { components } from "../../generated/api.ts";

export type SessionRevokedReason = components["schemas"]["SessionRevokedReason"];
type SessionRevokedEventDocument = components["schemas"]["SessionRevokedEventDocument"];

export const SESSION_REVOKED = "session.revoked";

/**
 * 세션을 폐기한 뒤 부른다. revoked는 폐기한 세션 수다(하나를 폐기하는 경로는 1). session.revoked는 폐기한
 * 세션이 있을 때만 보낸다. 재검사는 수와 관계없이 한다. 폐기할 살아 있는 세션이 없어도 만료되기 전에 붙은
 * 연결이 남아 있을 수 있기 때문이다.
 */
export function sessionRevoked(
  realtime: RealtimeHub,
  userId: string,
  reason: SessionRevokedReason,
  revoked = 1,
): void {
  if (revoked > 0) {
    const payload: SessionRevokedEventDocument = { meta: { reason } };
    realtime.publish({ name: SESSION_REVOKED, rooms: [userRoom(userId)], payload });
  }
  realtime.recheck([userId]);
}
