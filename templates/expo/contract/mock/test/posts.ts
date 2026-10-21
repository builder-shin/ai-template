/**
 * 글 도우미: 글을 API로 쓰거나 저장소에 바로 넣는다(FastAPI 테스트의 posts/tests의 create와 add_post).
 * 앱은 시드의 예제 글(관리자가 쓴 글 셋)을 가지고 시작하므로, 목록을 보는 테스트는 postsApp으로 그 글을
 * 뺀 앱을 쓴다.
 */

import type { Hono } from "hono";
import { expect } from "vitest";
import type { AppEnv } from "../src/context.ts";
import { uuid7 } from "../src/core/ids.ts";
import type { components } from "../src/generated/api.ts";
import type { PostResource } from "../src/modules/posts/documents.ts";
import type { PostRow, PostStatus } from "../src/modules/posts/model.ts";
import type { MockState } from "../src/state.ts";
import { type SignedIn, send } from "./accounts.ts";
import { testApp } from "./support.ts";

type App = Hono<AppEnv>;
type Schemas = components["schemas"];
export type PostCollection = Schemas["PostCollectionDocument"];
export type PostDocument = Schemas["PostDocument"];

export const POSTS = "/api/v1/posts";
export const COVER_POINTER = "/data/relationships/coverImage/data";

/** 시드의 예제 글을 뺀 앱과 그 상태. */
export function postsApp() {
  const setup = testApp();
  setup.state.store.posts.clear();
  return setup;
}

/** 커버 관계. fileId가 null이면 커버를 뺀다. */
export function coverRelationship(fileId: string | null) {
  return { coverImage: { data: fileId === null ? null : { type: "files", id: fileId } } };
}

/** 만들기 요청 문서. cover를 주면 커버 관계를 더한다. */
export function createDocument(attributes: Record<string, unknown> = {}, cover?: string | null) {
  return {
    data: {
      type: "posts",
      attributes: { title: "첫 글", body: "# 안녕", ...attributes },
      ...(cover === undefined ? {} : { relationships: coverRelationship(cover) }),
    },
  };
}

/** 고치기 요청 문서. data에 attributes나 relationships를 준다. */
export function updateDocument(postId: string, data: Record<string, unknown> = {}) {
  return { data: { type: "posts", id: postId, ...data } };
}

/** API로 글을 쓴다(201이어야 한다). */
export async function writePost(
  app: App,
  user: SignedIn,
  attributes: Record<string, unknown> = {},
  cover?: string | null,
): Promise<PostResource> {
  const document = createDocument(attributes, cover);
  const response = await send(app, "POST", POSTS, { document, token: user.accessToken });
  expect(response.status, await response.clone().text()).toBe(201);
  return ((await response.json()) as PostDocument).data;
}

/** API로 글을 고친다. */
export function patchPost(
  app: App,
  user: SignedIn,
  postId: string,
  data: Record<string, unknown>,
): Promise<Response> {
  const document = updateDocument(postId, data);
  return send(app, "PATCH", `${POSTS}/${postId}`, { document, token: user.accessToken });
}

export interface NewRow {
  readonly status?: PostStatus;
  readonly title?: string;
  readonly body?: string;
  readonly coverImageId?: string | null;
  /** 지금보다 이만큼(마이크로초) 전에 만든 것으로 둔다. 발행된 글은 그때 발행한 것이다. */
  readonly age?: number;
}

/** 글을 저장소에 바로 넣는다(FastAPI 테스트의 add_post). 기본은 발행된 글이다. */
export function addPost(state: MockState, authorId: string, row: NewRow = {}): PostRow {
  const createdAt = state.clock.now() - (row.age ?? 0);
  const status = row.status ?? "published";
  const post: PostRow = {
    id: uuid7(),
    authorId,
    title: row.title ?? "제목",
    body: row.body ?? "본문",
    status,
    publishedAt: status === "published" ? createdAt : null,
    coverImageId: row.coverImageId ?? null,
    createdAt,
    updatedAt: createdAt,
  };
  state.store.posts.set(post.id, post);
  return post;
}

/** 목록 응답의 제목들(200이어야 한다). */
export async function titles(response: Response): Promise<string[]> {
  expect(response.status, await response.clone().text()).toBe(200);
  const body = (await response.json()) as PostCollection;
  return body.data.map((post) => post.attributes.title);
}
