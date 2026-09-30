/**
 * 글의 도메인 규칙. 저장소를 모르는 순수 함수이고 서비스가 쓴다(FastAPI의 posts/policies.py).
 *
 * - 상태 전이: 전이 표(TRANSITIONS)에 있는 것만 할 수 있다. 같은 상태로 바꾸는 것은 전이가 아니다. 표에
 *   없는 전이는 서비스가 422 post.invalid_transition으로 거부한다.
 * - 보기: 발행된 글은 누구나 본다. 초안은 작성자와 posts:manage만 본다.
 * - 고치기와 지우기: 작성자와 posts:manage만 한다.
 * - 목록에서 초안이 보이는 경우: posts:manage이거나, 작성자 필터가 보는 사람 자신일 때다.
 */

import type { Principal } from "../../core/access.ts";
import type { PostRow, PostStatus } from "./model.ts";

export type Transition = readonly [from: PostStatus, to: PostStatus];

/** (지금 상태, 바꿀 상태). 상태를 더하면 여기에 전이를 적는다. */
export const TRANSITIONS: readonly Transition[] = [
  ["draft", "published"],
  ["published", "draft"],
];

export function canTransition(
  current: PostStatus,
  wanted: PostStatus,
  transitions: readonly Transition[] = TRANSITIONS,
): boolean {
  return current === wanted || transitions.some(([from, to]) => from === current && to === wanted);
}

/** posts:manage가 있는가. */
export function manages(viewer: Principal | undefined): boolean {
  return viewer?.permissions.has("posts:manage") ?? false;
}

export function canEdit(post: PostRow, viewer: Principal | undefined): boolean {
  return manages(viewer) || viewer?.userId === post.authorId;
}

export function canView(post: PostRow, viewer: Principal | undefined): boolean {
  return post.status === "published" || canEdit(post, viewer);
}

/** 목록에 초안이 들어가는가: posts:manage이거나, 자기 글만 거를 때(filter[author]=내 id)다. */
export function seesDrafts(viewer: Principal | undefined, author: string | undefined): boolean {
  return manages(viewer) || (viewer !== undefined && author === viewer.userId);
}
