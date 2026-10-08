/**
 * 글의 유스케이스(FastAPI의 posts/service.py와 repository.py).
 *
 * - 목록: 초안을 볼 수 없는 쿼리는 발행된 글만 돌려주고, filter[status]=draft면 빈 목록이다. 초안을 볼
 *   수 있는 쿼리(posts:manage, 또는 filter[author]=내 id)는 상태 필터가 없으면 모든 상태다. filter[q]는
 *   제목과 본문의 부분 일치(대소문자를 가리지 않는다)이고, 빈 값이면 거르지 않는다. 기본 정렬은 최근에
 *   만든 순서다.
 * - 조회: 볼 수 없는 글(남의 초안)은 있는지도 알리지 않고 404다.
 * - 쓰기: posts:create가 있으면 만든다(작성자는 나, 상태를 생략하면 draft). 고치기와 지우기는 작성자와
 *   posts:manage만 하고, 볼 수 있지만 고칠 수 없으면 403이다. 상태는 전이 표대로만 바꾼다(422
 *   post.invalid_transition). 발행하면 publishedAt을 채우고, 발행을 취소하면 null로 되돌린다.
 * - 커버 이미지는 요청한 사람이 올린 ready 이미지여야 한다(files의 attachableFile). 바꾸거나 뺀 커버와
 *   지운 글의 커버는 다른 리소스가 가리키지 않으면 지운다(files의 release).
 * - 값이 바뀐 것이 있을 때만 updatedAt을 바꾼다(FastAPI의 onupdate도 값이 바뀐 열이 있을 때만 돈다).
 *   바뀐 것이 없는 PATCH도 post.updated는 보낸다(FastAPI와 같다).
 * - 관리자(작성자가 아닌 posts:manage)가 글을 지우면 감사 로그 post.deleted_by_admin을 남긴다.
 * - 실시간 이벤트(events.ts)는 모두 바꾼 뒤에 보낸다(FastAPI는 commit한 뒤에 보낸다). 목은 검사를 모두
 *   마친 뒤에 바꾼다. FastAPI에서 검사가 실패하면 롤백되는 것과 같은 결과다.
 * - FastAPI는 공개 목록의 첫 페이지를 60초 캐시하고 글을 쓰면 지운다. 목은 캐시하지 않는다. 글을 쓰면
 *   첫 페이지에 바로 드러나는 것은 같다. 다른 모듈의 변경(작성자 이름, 커버 파일 삭제)은 FastAPI에서는
 *   캐시가 끝나야 첫 페이지에 드러나고, 목에서는 바로 드러난다.
 */

import type { Principal } from "../../core/access.ts";
import { type AuditRecord, recordAudit } from "../../core/audit.ts";
import type { Client } from "../../core/client.ts";
import { uuid7 } from "../../core/ids.ts";
import { containsText, ordered, pageOf, type SortColumns } from "../../core/listing.ts";
import { ApiError } from "../../jsonapi/errors.ts";
import type { Page, SortField } from "../../jsonapi/query.ts";
import type { MockState } from "../../state.ts";
import type { Store } from "../../store.ts";
import { attachableFile, release } from "../files/service.ts";
import { postCreated, postDeleted, postUpdated } from "./events.ts";
import type { PostRow, PostStatus } from "./model.ts";
import {
  canEdit,
  canTransition,
  canView,
  seesDrafts,
  TRANSITIONS,
  type Transition,
} from "./policies.ts";

const COVER_POINTER = "/data/relationships/coverImage/data";
const STATUS_POINTER = "/data/attributes/status";

const SORT_COLUMNS: SortColumns<PostRow> = {
  createdAt: (post) => post.createdAt,
  publishedAt: (post) => post.publishedAt,
  title: (post) => post.title,
};
const DEFAULT_SORT: readonly SortField[] = [{ name: "createdAt", descending: true }];

export interface PostFilter {
  readonly status?: PostStatus;
  /** 작성자(사용자) id. */
  readonly author?: string;
  /** 제목과 본문의 부분 일치. 비었으면 거르지 않는다. */
  readonly q?: string;
}

function matches(post: PostRow, filter: PostFilter, drafts: boolean): boolean {
  const { status, author, q } = filter;
  if (!drafts && post.status !== "published") return false;
  if (status !== undefined && post.status !== status) return false;
  if (author !== undefined && post.authorId !== author) return false;
  return !q || containsText(post.title, q) || containsText(post.body, q);
}

/** 보는 사람에게 보이는 글 한 페이지와 전체 개수. */
export function listPosts(
  store: Store,
  viewer: Principal | undefined,
  filter: PostFilter,
  sort: readonly SortField[],
  page: Page,
): { rows: PostRow[]; total: number } {
  const drafts = seesDrafts(viewer, filter.author);
  const found = [...store.posts.values()].filter((post) => matches(post, filter, drafts));
  return pageOf(ordered(found, sort, SORT_COLUMNS, DEFAULT_SORT), page);
}

/** 볼 수 있는 글. 없거나 볼 수 없으면 404다. */
export function visiblePost(store: Store, postId: string, viewer: Principal | undefined): PostRow {
  const post = store.posts.get(postId);
  if (post === undefined || !canView(post, viewer)) {
    throw new ApiError(404, "resource.not_found", `Post ${postId} does not exist.`);
  }
  return post;
}

/** 고칠 수 있는 글: 볼 수 없으면 404, 볼 수 있지만 고칠 수 없으면 403이다. */
function editablePost(store: Store, postId: string, actor: Principal): PostRow {
  const post = visiblePost(store, postId, actor);
  if (!canEdit(post, actor)) {
    const detail = "Only the author or someone with posts:manage can change it.";
    throw new ApiError(403, "permission.denied", detail);
  }
  return post;
}

/** 전이 표에 없는 전이면 422 post.invalid_transition(/data/attributes/status)이다. */
export function requireTransition(
  current: PostStatus,
  wanted: PostStatus,
  transitions: readonly Transition[] = TRANSITIONS,
): void {
  if (canTransition(current, wanted, transitions)) return;
  const detail = `A post cannot go from ${current} to ${wanted}.`;
  throw new ApiError(422, "post.invalid_transition", detail, { pointer: STATUS_POINTER });
}

/** 커버로 걸 파일의 id. cover가 null이면 커버가 없다. */
function coverId(state: MockState, actor: Principal, cover: string | null): string | null {
  return cover === null ? null : attachableFile(state, actor, cover, COVER_POINTER).id;
}

export interface NewPost {
  readonly title: string;
  readonly body: string;
  readonly status: PostStatus;
  /** 커버 이미지로 걸 파일 id(요청 그대로). null이면 커버가 없다. */
  readonly cover: string | null;
}

/** 글을 만든다. 작성자는 나다. */
export function createPost(state: MockState, actor: Principal, input: NewPost): PostRow {
  const coverImageId = coverId(state, actor, input.cover);
  const now = state.clock.now();
  const post: PostRow = {
    id: uuid7(),
    authorId: actor.userId,
    title: input.title,
    body: input.body,
    status: input.status,
    publishedAt: input.status === "published" ? now : null,
    coverImageId,
    createdAt: now,
    updatedAt: now,
  };
  state.store.posts.set(post.id, post);
  postCreated(state.realtime, post);
  return post;
}

/** PATCH /posts/{id}로 바꿀 값. 없는 값은 그대로 둔다. */
export interface PostChanges {
  readonly title?: string;
  readonly body?: string;
  readonly status?: PostStatus;
  /** 커버로 걸 파일 id(요청 그대로). null이면 커버를 뺀다. */
  readonly cover?: string | null;
}

/** 글을 고친다. 바꾸거나 뺀 커버는 다른 리소스가 가리키지 않으면 지운다. */
export function updatePost(
  state: MockState,
  actor: Principal,
  postId: string,
  changes: PostChanges,
): PostRow {
  const post = editablePost(state.store, postId, actor);
  const was = post.status;
  const { title = post.title, body = post.body, status = was, cover: wanted } = changes;
  requireTransition(was, status);
  const cover = wanted === undefined ? post.coverImageId : coverId(state, actor, wanted);
  const released = cover === post.coverImageId ? null : post.coverImageId;
  if (title !== post.title || body !== post.body || status !== was || cover !== post.coverImageId) {
    const now = state.clock.now();
    if (status !== was) post.publishedAt = status === "published" ? now : null;
    post.title = title;
    post.body = body;
    post.status = status;
    post.coverImageId = cover;
    post.updatedAt = now;
  }
  release(state, [released]);
  postUpdated(state.realtime, post, was);
  return post;
}

/** 글을 지운다. 관리자가 남의 글을 지우면 감사 로그를 남긴다. 커버는 가리키는 것이 없으면 지운다. */
export function deletePost(
  state: MockState,
  actor: Principal,
  client: Client,
  postId: string,
): void {
  const post = editablePost(state.store, postId, actor);
  state.store.posts.delete(post.id);
  if (post.authorId !== actor.userId) {
    const record: AuditRecord = {
      action: "post.deleted_by_admin",
      actorId: actor.userId,
      ipAddress: client.ip,
      target: { type: "posts", id: post.id },
      metadata: { author: post.authorId },
    };
    recordAudit(state.store, record, state.clock.now());
  }
  release(state, [post.coverImageId]);
  postDeleted(state.realtime, post);
}
