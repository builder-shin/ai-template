import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { components } from "../../src/generated/api.ts";
import {
  api,
  codes,
  newUser,
  problems,
  type Session,
  signInAdmin,
  target,
  uniqueName,
  uploadFile,
} from "./support.ts";

type Post = components["schemas"]["PostResource"];
type PostStatus = components["schemas"]["PostStatus"];

interface Draft {
  readonly title: string;
  readonly body?: string;
  readonly status?: PostStatus;
  readonly coverImage?: string;
}

/** 글을 쓴다. 흐름은 병렬로 돌고 목록을 공유하므로, 목록은 작성자 필터로 좁혀 본다. */
async function write(author: Session, draft: Draft): Promise<Post> {
  const { coverImage, ...rest } = draft;
  const relationships =
    coverImage === undefined
      ? {}
      : { coverImage: { data: { type: "files" as const, id: coverImage } } };
  const { data, response } = await author.api.POST("/api/v1/posts", {
    body: {
      data: { type: "posts", attributes: { body: "본문", ...rest }, relationships },
    },
  });
  if (data === undefined) throw new Error(`글을 쓰지 못했다: ${String(response.status)}`);
  return data.data;
}

function change(session: Session, id: string, attributes: { title?: string; status?: PostStatus }) {
  return session.api.PATCH("/api/v1/posts/{id}", {
    params: { path: { id } },
    body: { data: { type: "posts", id, attributes } },
  });
}

function titles(posts: readonly Post[] | undefined): string[] {
  return (posts ?? []).map((post) => post.attributes.title);
}

describe(`글 (${target.name})`, () => {
  it("새 글은 작성자만 보는 초안이고, 발행하면 누구나 보며, 발행을 취소하면 다시 숨는다", async () => {
    const [author, reader] = await Promise.all([newUser(), newUser()]);
    const post = await write(author, { title: "초안" });
    expect(post.attributes).toMatchObject({ status: "draft", publishedAt: null });
    expect(post.relationships.author.data).toEqual({ type: "users", id: author.userId });
    const path = { params: { path: { id: post.id } } };
    expect((await api().GET("/api/v1/posts/{id}", path)).response.status).toBe(404);
    expect((await reader.api.GET("/api/v1/posts/{id}", path)).response.status).toBe(404);
    expect((await author.api.GET("/api/v1/posts/{id}", path)).response.status).toBe(200);

    const published = await change(author, post.id, { status: "published" });
    expect(published.data?.data.attributes.publishedAt).not.toBeNull();
    expect((await api().GET("/api/v1/posts/{id}", path)).response.status).toBe(200);

    const unpublished = await change(author, post.id, { status: "draft" });
    expect(unpublished.data?.data.attributes.publishedAt).toBeNull();
    expect((await reader.api.GET("/api/v1/posts/{id}", path)).response.status).toBe(404);
  });

  it("목록은 발행된 글만 보이고, 작성자 필터가 나면 내 초안도 보인다", async () => {
    const [author, reader] = await Promise.all([newUser(), newUser()]);
    await write(author, { title: "발행", status: "published" });
    await write(author, { title: "초안" });
    const query = { "filter[author]": author.userId, sort: "title" };
    const mine = await author.api.GET("/api/v1/posts", { params: { query } });
    expect(titles(mine.data?.data)).toEqual(["발행", "초안"]);
    const theirs = await reader.api.GET("/api/v1/posts", { params: { query } });
    expect(titles(theirs.data?.data)).toEqual(["발행"]);
    const anonymous = await api().GET("/api/v1/posts", { params: { query } });
    expect(titles(anonymous.data?.data)).toEqual(["발행"]);
    const drafts = await reader.api.GET("/api/v1/posts", {
      params: { query: { ...query, "filter[status]": "draft" } },
    });
    expect(drafts.data?.data).toEqual([]);
  });

  it("제목과 본문으로 찾고, 제목으로 정렬하고, 페이지로 나눈다", async () => {
    const author = await newUser();
    for (const title of ["체리", "사과", "바나나"]) {
      await write(author, { title, body: `${title}는 과일이다`, status: "published" });
    }
    await write(author, { title: "당근", body: "채소", status: "published" });
    const { data } = await api().GET("/api/v1/posts", {
      params: {
        query: {
          "filter[author]": author.userId,
          "filter[q]": "과일",
          sort: "title",
          "page[size]": 2,
        },
      },
    });
    expect(titles(data?.data)).toEqual(["바나나", "사과"]);
    expect(data?.meta.page).toEqual({ number: 1, size: 2, total: 3, totalPages: 2 });
    expect(data?.links.next).not.toBeNull();
  });

  it("작성자와 커버 이미지를 포함하고, 볼 수 있는 글의 커버는 누구나 읽는다", async () => {
    const [author, other] = await Promise.all([newUser(), newUser()]);
    const cover = await uploadFile(author);
    const post = await write(author, { title: "커버", status: "published", coverImage: cover.id });
    expect(post.relationships.coverImage.data).toEqual({ type: "files", id: cover.id });
    const { data } = await api().GET("/api/v1/posts/{id}", {
      params: { path: { id: post.id }, query: { include: "author,coverImage" } },
    });
    const included = data?.included ?? [];
    const user = included.find((resource) => resource.type === "users");
    expect(user?.id).toBe(author.userId);
    expect(user?.attributes).toEqual({ name: "적합성" });
    const file = included.find((resource) => resource.type === "files");
    expect(file?.id).toBe(cover.id);
    expect(file?.type === "files" ? file.meta?.downloadUrl : undefined).toBeDefined();
    const coverPath = { params: { path: { id: cover.id } } };
    expect((await api().GET("/api/v1/files/{id}", coverPath)).response.status).toBe(200);

    const theirs = await uploadFile(other);
    const foreign = await author.api.PATCH("/api/v1/posts/{id}", {
      params: { path: { id: post.id } },
      body: {
        data: {
          type: "posts",
          id: post.id,
          relationships: { coverImage: { data: { type: "files", id: theirs.id } } },
        },
      },
    });
    expect(foreign.response.status).toBe(404);
    expect(problems(foreign.error)).toEqual([
      ["resource.not_found", "/data/relationships/coverImage/data"],
    ]);
  });

  it("남의 글은 고치지 못하고, posts:manage는 남의 초안을 보고 고치며 지우면 감사 로그에 남는다", async () => {
    const [author, other, manager] = await Promise.all([newUser(), newUser(), signInAdmin()]);
    const post = await write(author, { title: "남의 글", status: "published" });
    const blocked = await change(other, post.id, { title: "바꿈" });
    expect(blocked.response.status).toBe(403);
    expect(codes(blocked.error)).toEqual(["permission.denied"]);
    const draft = await write(author, { title: "남의 초안" });
    expect((await change(other, draft.id, { title: "바꿈" })).response.status).toBe(404);
    const draftPath = { params: { path: { id: draft.id } } };
    expect((await manager.api.GET("/api/v1/posts/{id}", draftPath)).response.status).toBe(200);
    expect((await change(manager, draft.id, { title: "관리자가 고침" })).response.status).toBe(200);

    const path = { params: { path: { id: post.id } } };
    expect((await manager.api.DELETE("/api/v1/posts/{id}", path)).response.status).toBe(204);
    expect((await api().GET("/api/v1/posts/{id}", path)).response.status).toBe(404);
    const logs = await manager.api.GET("/api/v1/audit-logs", {
      params: {
        query: {
          "filter[actor]": manager.userId,
          "filter[action]": "post.deleted_by_admin",
          "page[size]": 100,
        },
      },
    });
    const log = logs.data?.data.find((entry) => entry.attributes.targetId === post.id);
    expect(log?.attributes.targetType).toBe("posts");
  });

  it("로그인하지 않으면 401, posts:create가 없으면 403이다", async () => {
    const document = {
      data: { type: "posts" as const, attributes: { title: "글", body: "본문" } },
    };
    const anonymous = await api().POST("/api/v1/posts", { body: document });
    expect(anonymous.response.status).toBe(401);
    const [manager, user] = await Promise.all([signInAdmin(), newUser()]);
    const stripped = await manager.api.PATCH("/api/v1/users/{id}", {
      params: { path: { id: user.userId } },
      body: { data: { type: "users", id: user.userId, relationships: { roles: { data: [] } } } },
    });
    expect(stripped.response.status).toBe(200);
    const denied = await user.api.POST("/api/v1/posts", { body: document });
    expect(denied.response.status).toBe(403);
    expect(codes(denied.error)).toEqual(["permission.denied"]);
  });

  it("발행하거나 발행을 취소하면 공개 목록의 첫 페이지에 바로 드러난다", async () => {
    const author = await newUser();
    await api().GET("/api/v1/posts");
    const post = await write(author, { title: uniqueName("새 글"), status: "published" });
    const ids = async () =>
      ((await api().GET("/api/v1/posts")).data?.data ?? []).map((item) => item.id);
    expect(await ids()).toContain(post.id);
    await change(author, post.id, { status: "draft" });
    expect(await ids()).not.toContain(post.id);
    const missing = await api().GET("/api/v1/posts/{id}", {
      params: { path: { id: randomUUID() } },
    });
    expect(codes(missing.error)).toEqual(["resource.not_found"]);
  });
});
