/**
 * 커버 이미지의 파일 규칙(FastAPI의 posts/service.py의 cover_image_readable, cover_image_references와
 * posts.cover_image_id 외래 키의 ON DELETE SET NULL). modules/registry.ts가 files에 건다.
 *
 * - 읽기 규칙: 볼 수 있는 글의 커버 이미지는 읽는다. 발행된 글의 커버는 비로그인도 읽고, 초안의 커버는
 *   작성자와 posts:manage가 읽는다.
 * - 참조 확인: 글의 커버 이미지인 파일은 관계에서 풀린 파일과 탈퇴한 사용자의 파일을 지울 때 남긴다.
 * - 삭제 처리: 커버 파일을 지우면 그 파일을 가리키던 글의 커버를 null로 바꾼다. DB가 바꾸는 값이라
 *   updatedAt과 실시간 이벤트는 그대로 둔다.
 */

import type { DeleteHandler, ReadRule, ReferenceCheck } from "../files/registry.ts";
import { canView } from "./policies.ts";

export const coverReadable: ReadRule = (store, fileId, viewer) =>
  [...store.posts.values()].some((post) => post.coverImageId === fileId && canView(post, viewer));

export const coverReferences: ReferenceCheck = (store, fileIds) => {
  const candidates = new Set(fileIds);
  const found = new Set<string>();
  for (const post of store.posts.values()) {
    if (post.coverImageId !== null && candidates.has(post.coverImageId)) {
      found.add(post.coverImageId);
    }
  }
  return found;
};

export const clearDeletedCovers: DeleteHandler = (store, fileIds) => {
  const deleted = new Set(fileIds);
  for (const post of store.posts.values()) {
    if (post.coverImageId !== null && deleted.has(post.coverImageId)) post.coverImageId = null;
  }
};
