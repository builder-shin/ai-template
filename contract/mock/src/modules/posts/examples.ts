/**
 * 시드의 예제 글(FastAPI의 posts/service.py의 EXAMPLE_POSTS와 ensure_example_posts). 시드(seed.ts)가
 * 관리자에게 글이 하나도 없을 때만 만든다: 발행 둘, 초안 하나. 실시간 이벤트는 보내지 않는다.
 *
 * - 두 발행 글의 publishedAt은 같은 시각이고, createdAt은 만든 차례대로 늘어난다(FastAPI는 flush할 때
 *   행마다 createdAt을 채운다). 그래서 기본 정렬(최근에 만든 순서)에서 초안, 마크다운으로 쓰기,
 *   환영합니다 순서다.
 */

import { uuid7 } from "../../core/ids.ts";
import type { MockState } from "../../state.ts";
import type { PostRow, PostStatus } from "./model.ts";

interface ExamplePost {
  readonly title: string;
  readonly body: string;
  readonly status: PostStatus;
}

const EXAMPLE_POSTS: readonly ExamplePost[] = [
  {
    title: "환영합니다",
    body: "# 환영합니다\n\nAI 템플릿의 예제 글이다. 발행된 글은 누구나 본다.",
    status: "published",
  },
  {
    title: "마크다운으로 쓰기",
    body: "본문은 **마크다운**이다.\n\n- 목록\n- 링크: [JSON:API](https://jsonapi.org)",
    status: "published",
  },
  { title: "초안", body: "초안은 작성자와 posts:manage만 본다.", status: "draft" },
];

/** 작성자에게 글이 하나도 없으면 예제 글을 만들고 그 제목을 돌려준다. */
export function ensureExamplePosts(state: MockState, authorId: string): string[] {
  const { posts } = state.store;
  if ([...posts.values()].some((post) => post.authorId === authorId)) return [];
  const publishedAt = state.clock.now();
  for (const { title, body, status } of EXAMPLE_POSTS) {
    const createdAt = state.clock.now();
    const post: PostRow = {
      id: uuid7(),
      authorId,
      title,
      body,
      status,
      publishedAt: status === "published" ? publishedAt : null,
      coverImageId: null,
      createdAt,
      updatedAt: createdAt,
    };
    posts.set(post.id, post);
  }
  return EXAMPLE_POSTS.map((post) => post.title);
}
