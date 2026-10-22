/**
 * 글 문서의 조립: 리소스와 포함 리소스(FastAPI의 posts/schemas.py의 post_resource와 router.py의
 * included_for). 응답(routes.ts)과 실시간 이벤트(events.ts)가 같은 리소스를 쓴다.
 */

import type { MockConfig } from "../../config.ts";
import { formatInstant } from "../../core/clock.ts";
import type { components } from "../../generated/api.ts";
import { loadIncluded } from "../../jsonapi/rendering.ts";
import type { MockState } from "../../state.ts";
import { type FileResource, fileResources } from "../files/documents.ts";
import { publicUsers, type UserPublicResource } from "../users/public.ts";
import type { PostRow } from "./model.ts";

export type PostResource = components["schemas"]["PostResource"];
/** 글 문서의 포함 리소스: 작성자(공개 표현)와 커버 이미지(파일). */
export type PostIncluded = UserPublicResource | FileResource;

export function postResource(post: PostRow): PostResource {
  const cover = post.coverImageId;
  return {
    type: "posts",
    id: post.id,
    attributes: {
      title: post.title,
      body: post.body,
      status: post.status,
      publishedAt: post.publishedAt === null ? null : formatInstant(post.publishedAt),
      createdAt: formatInstant(post.createdAt),
      updatedAt: formatInstant(post.updatedAt),
    },
    relationships: {
      author: { data: { type: "users", id: post.authorId } },
      coverImage: { data: cover === null ? null : { type: "files", id: cover } },
    },
  };
}

/**
 * include 경로마다 포함 리소스. 작성자는 공개 표현(이름과 아바타, 이메일 없음)이고 커버는 파일
 * 리소스다(ready면 downloadUrl이 있다). 경로마다 id 순이다.
 */
export function includedFor(
  state: MockState,
  config: MockConfig,
  include: readonly string[],
  found: readonly PostRow[],
): PostIncluded[] {
  const authorIds = found.map((post) => post.authorId);
  const coverIds = found.flatMap((post) => post.coverImageId ?? []);
  return loadIncluded<PostIncluded>(include, {
    author: () => publicUsers(state.store, authorIds),
    coverImage: () => fileResources(state, config, coverIds),
  });
}
