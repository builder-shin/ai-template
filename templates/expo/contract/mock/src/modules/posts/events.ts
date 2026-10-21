/**
 * posts의 실시간 이벤트(계약의 x-realtime-events). FastAPI의 posts/events.py와 같다.
 *
 * - 채널 posts(PUBLIC_CHANNEL)는 발행된 글의 이벤트다. 익명 연결도 구독한다.
 * - 채널 posts:all(ALL_CHANNEL)은 모든 글의 이벤트다. 구독하려면 posts:manage가 있어야 한다.
 * - 작성자의 user:{id} 룸에도 보낸다. 룸 이름은 채널 이름이다.
 * - 서비스가 글을 바꾼 뒤에 부른다(FastAPI는 commit한 뒤에 보낸다). 페이로드는 그때의 글이다.
 *   - 만들면 post.created(posts:all, 작성자)다. 발행 상태로 만들면 post.published(posts, posts:all,
 *     작성자)도 보낸다.
 *   - 발행하면(draft → published) post.published만 보낸다.
 *   - 발행을 취소하면(published → draft) posts:all과 작성자에게 post.updated를, posts에
 *     post.unpublished를 보낸다. post.unpublished의 페이로드는 식별자뿐이다(초안의 내용이 공개 채널로
 *     나가지 않는다).
 *   - 그 밖의 고치기는 post.updated다. 바뀐 것이 없는 PATCH도 보낸다. 발행된 글이면 posts에도 보낸다.
 *   - 지우면 post.deleted(식별자뿐)다. 발행된 글이었으면 posts에도 보낸다.
 * - 글 문서의 페이로드(data: 글 리소스)에는 포함 리소스가 없다.
 */

import { type RealtimeHub, userRoom } from "../../core/realtime.ts";
import type { components } from "../../generated/api.ts";
import { postResource } from "./documents.ts";
import type { PostRow, PostStatus } from "./model.ts";

type Schemas = components["schemas"];
type PostIdentifier = Schemas["PostDeletedEventDocument"]["data"];

/** 발행된 글의 채널. */
export const PUBLIC_CHANNEL = "posts";
/** 모든 글의 채널(posts:manage). */
export const ALL_CHANNEL = "posts:all";

export const POST_CREATED = "post.created";
export const POST_UPDATED = "post.updated";
export const POST_PUBLISHED = "post.published";
export const POST_UNPUBLISHED = "post.unpublished";
export const POST_DELETED = "post.deleted";

/** 모든 글 채널과 작성자의 룸. 발행된 글이면 앞에 공개 채널을 더한다. */
function roomsOf(post: PostRow, published: boolean): string[] {
  const rooms = [ALL_CHANNEL, userRoom(post.authorId)];
  return published ? [PUBLIC_CHANNEL, ...rooms] : rooms;
}

function identifierOf(post: PostRow): PostIdentifier {
  return { type: "posts", id: post.id };
}

function published(realtime: RealtimeHub, post: PostRow): void {
  const payload: Schemas["PostPublishedEventDocument"] = { data: postResource(post) };
  realtime.publish({ name: POST_PUBLISHED, rooms: roomsOf(post, true), payload });
}

/** 만든 글을 알린다. */
export function postCreated(realtime: RealtimeHub, post: PostRow): void {
  const payload: Schemas["PostCreatedEventDocument"] = { data: postResource(post) };
  realtime.publish({ name: POST_CREATED, rooms: roomsOf(post, false), payload });
  if (post.status === "published") published(realtime, post);
}

/** 고친 글을 알린다. was는 고치기 전의 상태다. */
export function postUpdated(realtime: RealtimeHub, post: PostRow, was: PostStatus): void {
  const isPublished = post.status === "published";
  if (isPublished && was !== "published") {
    published(realtime, post);
    return;
  }
  const payload: Schemas["PostUpdatedEventDocument"] = { data: postResource(post) };
  realtime.publish({ name: POST_UPDATED, rooms: roomsOf(post, isPublished), payload });
  if (was === "published" && !isPublished) {
    const withdrawn: Schemas["PostUnpublishedEventDocument"] = { data: identifierOf(post) };
    realtime.publish({ name: POST_UNPUBLISHED, rooms: [PUBLIC_CHANNEL], payload: withdrawn });
  }
}

/** 지운 글을 알린다. post는 지우기 전의 글이다. */
export function postDeleted(realtime: RealtimeHub, post: PostRow): void {
  const payload: Schemas["PostDeletedEventDocument"] = { data: identifierOf(post) };
  const rooms = roomsOf(post, post.status === "published");
  realtime.publish({ name: POST_DELETED, rooms, payload });
}
