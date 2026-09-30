/**
 * 모듈 사이의 등록(FastAPI의 app/modules/registry.py). 앱을 조립할 때(app.ts) 상태마다 한 번 건다.
 *
 * 모듈이 서로를 import하면 순환이 되는 곳은 부르는 쪽이 등록 지점을 두고, 여기서 처리를 건다.
 * - users가 계정을 닫을 때(비활성화, 탈퇴) auth가 세션을 폐기하고 토큰과 소셜 로그인 연결을 지운다.
 * - 역할의 권한이 바뀌거나 역할이 지워지면 users가 그 역할을 가진 사용자에게 me.updated를 보낸다.
 * - 소유자가 아닌 사람도 읽는 파일: 사용자의 아바타(공개 표현에 들어간다)와 볼 수 있는 글의 커버 이미지.
 * - 탈퇴한 사용자의 파일과 관계에서 풀린 파일 가운데 남기는 것: 사용자의 아바타나 글의 커버 이미지인 파일.
 * - 파일을 지우면 그 파일을 가리키던 아바타와 커버 이미지 관계를 null로 바꾼다(FastAPI의 외래 키 ON
 *   DELETE SET NULL).
 * 모듈을 더하면 그 모듈의 처리를 여기에 더한다.
 */

import type { MockState } from "../state.ts";
import { closeCredentials } from "./auth/closing.ts";
import { addReadRule, addReferenceCheck, onFilesDeleted } from "./files/registry.ts";
import { clearDeletedCovers, coverReadable, coverReferences } from "./posts/covers.ts";
import { onMembersChanged } from "./roles/management.ts";
import { onAccountClosed } from "./users/accounts.ts";
import { rolesChanged } from "./users/events.ts";
import { avatarReadable, avatarReferences, clearDeletedAvatars } from "./users/public.ts";

export function connectModules(state: MockState): void {
  onAccountClosed(state.accountClosers, closeCredentials);
  onMembersChanged(state.membersChanged, rolesChanged);
  addReadRule(state.fileRegistry, avatarReadable);
  addReadRule(state.fileRegistry, coverReadable);
  addReferenceCheck(state.fileRegistry, avatarReferences);
  addReferenceCheck(state.fileRegistry, coverReferences);
  onFilesDeleted(state.fileRegistry, clearDeletedAvatars);
  onFilesDeleted(state.fileRegistry, clearDeletedCovers);
}
