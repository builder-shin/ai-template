/**
 * 내 정보(/me)의 유스케이스: 이름·로케일·아바타 바꾸기와 탈퇴(FastAPI의 users/service/profile.py).
 *
 * - 아바타는 내가 올린 ready 이미지 파일이어야 한다(files의 attachableFile). null이면 아바타를 뺀다.
 *   바꾸거나 뺀 아바타는 다른 리소스가 가리키지 않으면 지운다(files의 release).
 * - 이름, 로케일, 아바타 가운데 하나라도 바뀌면 updatedAt을 바꾸고 me.updated(profile)를 보낸다. 같은
 *   값이면 아무것도 바꾸지 않는다(FastAPI의 onupdate도 값이 바뀐 열이 있을 때만 updated_at을 바꾼다).
 * - 탈퇴는 개인정보(이메일, 이름, 비밀번호, 아바타)를 지우고 상태를 deleted로 바꾼다. 글처럼 남이 보는
 *   콘텐츠는 남는다. 역할을 빼고, 다른 리소스가 가리키지 않는 내 파일을 지우고, 계정 닫기 처리(세션
 *   폐기, 남은 토큰 삭제)를 부르고, 감사 로그 user.deleted를 남긴다. 로그인한 지 10분 안의 세션만
 *   탈퇴할 수 있고(requireRecentLogin), 마지막 활성 admin은 탈퇴할 수 없다.
 * - 목은 검사를 모두 마친 뒤에 바꾼다. FastAPI에서 검사가 실패하면 롤백되는 것과 같은 결과다.
 */

import { type Principal, requireRecentLogin } from "../../core/access.ts";
import { type AuditRecord, recordAudit } from "../../core/audit.ts";
import type { Client } from "../../core/client.ts";
import type { MockState } from "../../state.ts";
import { attachableFile, release, removeUnreferenced } from "../files/service.ts";
import { clearRoles } from "../roles/service.ts";
import { closeAccount, protectLastAdmin } from "./accounts.ts";
import { requireUser } from "./documents.ts";
import { meUpdated } from "./events.ts";
import type { Locale, UserRow } from "./model.ts";

export const AVATAR_POINTER = "/data/relationships/avatar/data";

/** PATCH /me로 바꿀 값. 없는 값은 그대로 둔다. */
export interface ProfileChanges {
  readonly name?: string;
  readonly locale?: Locale;
  /** 아바타로 걸 파일 id(요청 그대로). null이면 아바타를 뺀다. */
  readonly avatar?: string | null;
}

/** 내 이름, 로케일, 아바타를 바꾼다. */
export function updateMe(state: MockState, actor: Principal, changes: ProfileChanges): UserRow {
  const user = requireUser(state.store, actor.userId);
  let avatarId = user.avatarId;
  if (changes.avatar !== undefined) {
    const fileId = changes.avatar;
    avatarId = fileId === null ? null : attachableFile(state, actor, fileId, AVATAR_POINTER).id;
  }
  const name = changes.name ?? user.name;
  const locale = changes.locale ?? user.locale;
  if (name === user.name && locale === user.locale && avatarId === user.avatarId) return user;
  const released = avatarId === user.avatarId ? null : user.avatarId;
  user.name = name;
  user.locale = locale;
  user.avatarId = avatarId;
  user.updatedAt = state.clock.now();
  meUpdated(state.realtime, [user.id], ["profile"]);
  release(state, [released]);
  return user;
}

/** 탈퇴: 개인정보를 지우고 계정을 닫는다. */
export function deleteMe(state: MockState, actor: Principal, client: Client): void {
  const { store } = state;
  requireRecentLogin(actor, state.clock.now());
  const user = requireUser(store, actor.userId);
  protectLastAdmin(store, user);
  user.email = null;
  user.name = null;
  user.passwordHash = null;
  user.avatarId = null;
  user.status = "deleted";
  user.updatedAt = state.clock.now();
  clearRoles(store, user.id);
  removeUnreferenced(state, user.id);
  closeAccount(state, user.id, "deleted");
  const record: AuditRecord = {
    action: "user.deleted",
    actorId: user.id,
    ipAddress: client.ip,
    target: { type: "users", id: user.id },
  };
  recordAudit(store, record, state.clock.now());
}
