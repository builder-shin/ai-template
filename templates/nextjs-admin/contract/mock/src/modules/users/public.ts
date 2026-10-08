/**
 * 사용자의 공개 표현과 아바타 규칙(FastAPI의 users/service/accounts.py의 avatar_of,
 * public_user_resource, public_users, avatar_readable, avatar_references).
 *
 * - 다른 사람과 비로그인 사용자에게는 이름과 아바타만 보인다(UserPublicResource). 다른 모듈이 포함
 *   리소스(감사 로그의 행위자, 글의 작성자)에 늘 이 모양으로 넣는다. 이메일을 절대 담지 않는다.
 * - 아바타 파일은 공개 표현에 들어가므로 누구나 읽는다(파일 읽기 규칙). 사용자의 아바타인 파일은
 *   관계에서 풀린 파일이나 탈퇴한 사용자의 파일을 지울 때 남긴다(파일 참조 확인). 아바타 파일을 지우면
 *   관계를 null로 바꾼다(FastAPI의 외래 키 ON DELETE SET NULL). 세 규칙은 modules/registry.ts가 건다.
 */

import { compareText } from "../../core/permissions.ts";
import type { components } from "../../generated/api.ts";
import type { Store } from "../../store.ts";
import type { DeleteHandler, ReadRule, ReferenceCheck } from "../files/registry.ts";
import type { UserRow } from "./model.ts";

type Schemas = components["schemas"];
/** 다른 사람에게 보이는 사용자 리소스(이름과 아바타). */
export type UserPublicResource = Schemas["UserPublicResource"];
/** 사용자의 아바타 관계. 없으면 data가 null이다. */
export type AvatarRelationship = Schemas["UserRelationships"]["avatar"];

export function avatarOf(user: UserRow): AvatarRelationship {
  return { data: user.avatarId === null ? null : { type: "files", id: user.avatarId } };
}

export function publicUserResource(user: UserRow): UserPublicResource {
  return {
    type: "users",
    id: user.id,
    attributes: { name: user.name },
    relationships: { avatar: avatarOf(user) },
  };
}

/** 사용자들의 공개 표현(id 순). 겹치는 id는 한 번, 없는 id는 건너뛴다. */
export function publicUsers(store: Store, userIds: Iterable<string>): UserPublicResource[] {
  return [...new Set(userIds)].sort(compareText).flatMap((id) => {
    const user = store.users.get(id);
    return user === undefined ? [] : [publicUserResource(user)];
  });
}

/** 파일 읽기 규칙: 어떤 사용자의 아바타면 누구나(비로그인도) 읽는다. */
export const avatarReadable: ReadRule = (store, fileId) =>
  [...store.users.values()].some((user) => user.avatarId === fileId);

/** 파일 참조 확인: 주어진 파일 가운데 사용자의 아바타인 것. */
export const avatarReferences: ReferenceCheck = (store, fileIds) => {
  const candidates = new Set(fileIds);
  const found = new Set<string>();
  for (const user of store.users.values()) {
    if (user.avatarId !== null && candidates.has(user.avatarId)) found.add(user.avatarId);
  }
  return found;
};

/** 파일 삭제 처리: 지운 파일을 가리키던 아바타 관계를 null로 바꾼다. updatedAt과 이벤트는 그대로다. */
export const clearDeletedAvatars: DeleteHandler = (store, fileIds) => {
  const deleted = new Set(fileIds);
  for (const user of store.users.values()) {
    if (user.avatarId !== null && deleted.has(user.avatarId)) user.avatarId = null;
  }
};
