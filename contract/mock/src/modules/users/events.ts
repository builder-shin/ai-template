/**
 * users의 실시간 이벤트(계약의 x-realtime-events). FastAPI의 users/events.py와 같다.
 *
 * 내 정보가 바뀌면 그 사용자의 user:{id} 룸에 me.updated를 보낸다. meta.changed가 바뀐 항목이다.
 * - roles: 역할을 받거나 잃었다. 가진 역할의 권한이 바뀌었거나 역할이 지워졌다(roles가 알린다)
 * - status: 관리자가 상태를 바꿨다
 * - profile: 이름, 로케일, 아바타를 바꿨다(PATCH /me)
 * 바뀐 것이 없거나 받을 사용자가 없으면 보내지 않는다. 클라이언트는 GET /me를 다시 부른다. roles나
 * status가 바뀌면 그 사용자들의 연결을 다시 검사해 구독한 채널의 권한을 잃은 연결을 끊는다.
 */

import { type RealtimeHub, userRoom } from "../../core/realtime.ts";
import type { components } from "../../generated/api.ts";

type UserMeUpdatedEventDocument = components["schemas"]["UserMeUpdatedEventDocument"];
/** me.updated의 meta.changed 항목. */
export type MeChange = UserMeUpdatedEventDocument["meta"]["changed"][number];

export const ME_UPDATED = "me.updated";

export function meUpdated(
  realtime: RealtimeHub,
  userIds: readonly string[],
  changed: readonly MeChange[],
): void {
  if (userIds.length === 0 || changed.length === 0) return;
  const payload: UserMeUpdatedEventDocument = { meta: { changed: [...changed] } };
  realtime.publish({ name: ME_UPDATED, rooms: userIds.map(userRoom), payload });
  if (changed.includes("roles") || changed.includes("status")) realtime.recheck(userIds);
}
