import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { EXAMPLE_SESSION_SECRET } from "../../lib/env";
import { postFixture } from "./test-fixture";
import { getPost, getPosts } from "./queries";

describe("공개 글 조회와 실제 목", () => {
  let fixture: Awaited<ReturnType<typeof postFixture>>;
  beforeAll(async () => {
    vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
    vi.stubEnv("APP_URL", inject("httpBaseUrl"));
    vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
    fixture = await postFixture();
  });
  afterAll(async () => {
    await fixture?.stop();
    vi.unstubAllEnvs();
  });
  it("검색한 발행 글만 가져오며 작성자와 커버를 포함한다", async () => {
    const list = await getPosts("ko", fixture.prefix);
    expect(list.posts.map((post) => post.id)).toEqual([fixture.m.id, fixture.a.id, fixture.z.id]);
    expect(list.posts[2]).toMatchObject({
      authorName: "Admin",
      coverUrl: expect.stringContaining("/_storage/"),
    });
    expect(list.posts[0]?.coverUrl).toBeNull();
    expect((await getPosts("en", `${fixture.prefix} Z`)).posts.map((post) => post.id)).toEqual([
      fixture.z.id,
    ]);
    expect((await getPosts("ko", randomUUID())).posts).toEqual([]);
  });
  it("발행일과 제목으로 정렬하며 API 페이지 링크를 보존한다", async () => {
    expect(
      (await getPosts("ko", fixture.prefix, "published")).posts.map((post) => post.id),
    ).toEqual([fixture.z.id, fixture.m.id, fixture.a.id]);
    const list = await getPosts("en", fixture.prefix, "title", 2, 1);
    expect(list.posts.map((post) => post.id)).toEqual([fixture.m.id]);
    expect(list.page).toMatchObject({ number: 2, size: 1, total: 3, totalPages: 3 });
    const next = new URL(list.links.next!, inject("mockBaseUrl"));
    expect(next.searchParams.get("page[number]")).toBe("3");
    expect(next.searchParams.get("filter[q]")).toBe(fixture.prefix);
    expect(next.searchParams.get("include")).toBe("author,coverImage");
  });
  it("상세에도 포함 관계가 있고 없는 글과 초안은 공개하지 않는다", async () => {
    expect(await getPost("en", fixture.z.id)).toMatchObject({
      id: fixture.z.id,
      authorName: "Admin",
      coverUrl: expect.stringContaining("/_storage/"),
      body: expect.stringContaining("**굵게**"),
    });
    expect(await getPost("ko", fixture.draft.id)).toBeNull();
    expect(await getPost("ko", randomUUID())).toBeNull();
    expect(await getPost("ko", "missing")).toBeNull();
  });
});
