/**
 * 파일 등록부: 다른 모듈이 files에 거는 규칙(FastAPI의 files.service의 add_read_rule,
 * add_reference_check). files가 users·posts를 import하면 순환이 되므로, 파일을 가리키는 모듈이 앱을
 * 조립할 때(app.ts) 등록한다(FastAPI의 app/modules/registry.py).
 *
 * - 읽기 규칙: 소유자가 아닌 사람(비로그인이면 undefined)이 이 파일을 읽어도 되는가. 파일을 가리키는
 *   리소스를 그 사람이 볼 수 있으면 true다(예: 사용자의 아바타는 누구나, 볼 수 있는 글의 커버 이미지).
 * - 참조 확인: 주어진 파일 가운데 그 모듈의 리소스가 가리키는 것의 id. 관계에서 풀린 파일(release)과
 *   탈퇴한 사용자의 파일(removeUnreferenced)을 지울지 정한다.
 * - 삭제 처리: 파일을 지울 때 그 파일을 가리키는 관계를 null로 바꾼다. FastAPI는 외래 키(ON DELETE SET
 *   NULL)가 하는 일이라 등록이 없다. DB가 바꾸는 값이라 updatedAt과 실시간 이벤트는 그대로 둔다.
 * - FastAPI는 모듈 전역에 두지만 목은 상태(MockState.fileRegistry)마다 둔다. 테스트가 앱을 여럿
 *   만들어도 규칙이 섞이지 않는다. 같은 함수를 두 번 등록해도 한 번만 부른다.
 */

import type { Principal } from "../../core/access.ts";
import type { Store } from "../../store.ts";

export type ReadRule = (store: Store, fileId: string, viewer: Principal | undefined) => boolean;
export type ReferenceCheck = (store: Store, fileIds: readonly string[]) => ReadonlySet<string>;
export type DeleteHandler = (store: Store, fileIds: readonly string[]) => void;

export interface FileRegistry {
  readonly readRules: ReadRule[];
  readonly referenceChecks: ReferenceCheck[];
  readonly deleteHandlers: DeleteHandler[];
}

export function createFileRegistry(): FileRegistry {
  return { readRules: [], referenceChecks: [], deleteHandlers: [] };
}

function addOnce<T>(list: T[], item: T): void {
  if (!list.includes(item)) list.push(item);
}

/** 파일 읽기 규칙을 등록한다. */
export function addReadRule(registry: FileRegistry, rule: ReadRule): void {
  addOnce(registry.readRules, rule);
}

/** 파일 참조 확인을 등록한다. */
export function addReferenceCheck(registry: FileRegistry, check: ReferenceCheck): void {
  addOnce(registry.referenceChecks, check);
}

/** 파일을 지울 때(행을 지우기 전에) 부를 처리를 등록한다. */
export function onFilesDeleted(registry: FileRegistry, handler: DeleteHandler): void {
  addOnce(registry.deleteHandlers, handler);
}
