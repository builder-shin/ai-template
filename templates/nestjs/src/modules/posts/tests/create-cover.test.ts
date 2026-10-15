import "reflect-metadata";
import { afterEach, expect, it } from "vitest";
import { errorDocument, mediaType, testApp } from "../../../core/http/tests/fixtures.js";
import { PRINCIPAL_RESOLVER } from "../../../core/security/principal.js";
import { PostsService } from "../index.js";
import { author, fileId, fixture } from "./fixtures.js";

const owned: ReturnType<typeof fixture>[] = [];
afterEach(() => {
  for (const f of owned.splice(0)) f.close();
});
function setup() {
  const f = fixture([]);
  owned.push(f);
  return f;
}
function document(cover: "생략" | "null" | "완료 파일" | "빈 ID") {
  return {
    data: {
      type: "posts" as const,
      attributes: { title: "새 글", body: "본문" },
      ...(cover === "생략"
        ? {}
        : {
            relationships: {
              coverImage: {
                data:
                  cover === "null"
                    ? null
                    : { type: "files" as const, id: cover === "빈 ID" ? "" : fileId },
              },
            },
          }),
    },
  };
}
async function httpFixture(f: ReturnType<typeof fixture>) {
  const { app, http } = await testApp([], {
    providers: [
      { provide: PRINCIPAL_RESOLVER, useValue: { resolve: () => Promise.resolve(author) } },
      { provide: PostsService, useValue: f.service },
    ],
  });
  app.get(PostsService).create = f.service.create.bind(f.service);
  return http;
}
function expectRejectedState(f: ReturnType<typeof fixture>) {
  expect(f.state.posts).toEqual([]);
  expect(f.state.files).toHaveLength(1);
  expect(f.state.files[0]?.detachedAt).toBeNull();
  expect(f.state.audits).toEqual([]);
  expect(f.events).toEqual([]);
  expect(f.redisValues.size).toBe(0);
  expect(f.removedObjects).toEqual([]);
  expect(f.trace).not.toContain("COMMIT");
  expect(f.trace).not.toContain("cache bump");
}
it("생성 서비스는 빈 표지 ID를 404로 거절하고 행과 커밋 후 효과를 남기지 않는다", async () => {
  const f = setup();
  await expect(f.service.create(author, document("빈 ID").data)).rejects.toMatchObject({
    init: {
      status: 404,
      code: "resource.not_found",
      source: { pointer: "/data/relationships/coverImage/data" },
    },
  });
  expectRejectedState(f);
});
it("생성 HTTP는 스키마를 통과한 빈 표지 ID에 404와 관계 포인터를 돌려준다", async () => {
  const f = setup();
  const http = await httpFixture(f);
  const response = await http
    .post("/api/v1/posts")
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send(document("빈 ID"));
  expect(response.status).toBe(404);
  expect(errorDocument(response.text).errors[0]).toMatchObject({
    status: "404",
    code: "resource.not_found",
    source: { pointer: "/data/relationships/coverImage/data" },
  });
  expectRejectedState(f);
});
it.each(["생략", "null", "완료 파일"] as const)(
  "생성 서비스는 표지 %s을 허용하고 커밋 뒤 알린다",
  async (cover) => {
    const f = setup();
    const result = await f.service.create(author, document(cover).data);
    expect(result.data.type).toBe("posts");
    expect(f.state.posts).toHaveLength(1);
    expect(f.state.posts[0]?.coverImageId).toBe(cover === "완료 파일" ? fileId : null);
    expect(f.state.files).toHaveLength(1);
    expect(f.events.map((event) => event.name)).toEqual(["post.created"]);
    expect(f.trace.indexOf("COMMIT")).toBeLessThan(f.trace.indexOf("cache bump"));
    expect(f.trace.indexOf("COMMIT")).toBeLessThan(f.trace.indexOf("post.created"));
  },
);
it.each(["생략", "null", "완료 파일"] as const)(
  "생성 HTTP는 표지 %s에 201을 돌려준다",
  async (cover) => {
    const f = setup();
    const http = await httpFixture(f);
    const response = await http
      .post("/api/v1/posts")
      .set("Authorization", "Bearer fixture")
      .set("Content-Type", mediaType)
      .send(document(cover));
    expect(response.status).toBe(201);
    expect(f.state.posts).toHaveLength(1);
    expect(f.state.posts[0]?.coverImageId).toBe(cover === "완료 파일" ? fileId : null);
    expect(f.events.map((event) => event.name)).toEqual(["post.created"]);
  },
);
