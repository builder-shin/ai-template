import { afterEach, expect, it } from "vitest";
import {
  fixture,
  post,
  query,
  author,
  member,
  manager,
  authorId,
  postId,
  fileId,
} from "./fixtures.js";
import { required } from "./fixtures.js";
const owned: ReturnType<typeof fixture>[] = [];
afterEach(() => {
  for (const f of owned.splice(0)) f.close();
});
const setup = (initial = [post()]) => {
  const f = fixture(initial);
  owned.push(f);
  return f;
};
it.each([
  { who: "익명", viewer: undefined, filter: {}, ids: ["public"] },
  { who: "저자 기본", viewer: author, filter: {}, ids: ["public"] },
  { who: "저자 필터", viewer: author, filter: { author: authorId }, ids: [postId, "public"] },
  { who: "남의 필터", viewer: member, filter: { author: authorId }, ids: ["public"] },
  { who: "관리자", viewer: manager, filter: {}, ids: [postId, "public"] },
  { who: "익명 초안 필터", viewer: undefined, filter: { status: "draft" }, ids: [] },
])("$who 목록은 볼 수 있는 글만 돌려준다", async ({ viewer, filter, ids }) => {
  const f = setup([post(), post("published", { id: "public" })]);
  const doc = await f.service.list(viewer, query({ filter }));
  expect(doc.data.map((p) => p.id).sort()).toEqual([...ids].sort());
  expect(doc.meta.page.total).toBe(ids.length);
});
it("목록의 검색·정렬·페이지·희소 필드와 include를 함께 적용한다", async () => {
  const f = setup([
    post("published", { id: "a", title: "Whale", coverImageId: fileId }),
    post("published", { id: "b", title: "WHALE two", coverImageId: fileId }),
    post("published", { id: "c", title: "다른 글" }),
  ]);
  const doc = await f.service.list(
    undefined,
    query({
      filter: { q: "whale" },
      sort: [{ field: "title", descending: false }],
      page: { number: 2, size: 1 },
      include: ["author", "coverImage"],
      fields: { posts: ["title"], users: ["name"], files: ["filename"] },
    }),
    "filter[q]=whale&page[size]=1&page[number]=2",
  );
  expect(doc.data).toMatchObject([{ id: "b", attributes: { title: "WHALE two" } }]);
  expect(Object.keys(doc.data[0]?.attributes ?? {})).toEqual(["title"]);
  expect(doc.included).toHaveLength(2);
  expect(doc.included?.find((r) => r.type === "users")?.attributes).toEqual({ name: "공개 저자" });
  expect(doc.included?.find((r) => r.type === "files")?.attributes).toEqual({
    filename: "표지.png",
  });
  expect(doc.meta.page).toEqual({ number: 2, size: 1, total: 2, totalPages: 2 });
  expect(f.options[0]).toEqual({ isolationLevel: "RepeatableRead" });
});
it("중복 저자·표지 include는 SELECT 네 번으로 묶는다", async () => {
  const f = setup([
    post("published", { coverImageId: fileId }),
    post("published", { id: "b", coverImageId: fileId }),
  ]);
  const doc = await f.service.list(undefined, query({ include: ["author", "coverImage"] }));
  expect(doc.included).toHaveLength(2);
  expect(f.trace.filter((s) => s.startsWith("SELECT"))).toEqual([
    "SELECT count",
    "SELECT posts",
    "SELECT users",
    "SELECT files",
  ]);
});
it("보이지 않는 글은 404이고 읽을 수 있는 남의 글 수정은 403이다", async () => {
  const f = setup();
  await expect(f.service.get(member, postId, query())).rejects.toMatchObject({
    init: { status: 404, code: "resource.not_found" },
  });
  f.state.posts[0] = post("published");
  await expect(
    f.service.update(member, postId, { attributes: { title: "탈취" } }),
  ).rejects.toMatchObject({ init: { status: 403, code: "permission.denied" } });
});
it("생성은 저자를 본인으로 정하고 commit 뒤 무효화와 생성 이벤트를 보낸다", async () => {
  const f = setup([]);
  const doc = await f.service.create(author, { attributes: { title: "새 글", body: "본문" } });
  expect(f.state.posts[0]).toMatchObject({
    authorId,
    status: "draft",
    publishedAt: null,
    title: "새 글",
  });
  expect(f.events).toMatchObject([
    {
      name: "post.created",
      rooms: ["posts:all", "user:" + authorId],
      payload: { data: { id: doc.data.id, attributes: { body: "본문" } } },
    },
  ]);
  expect(f.trace.indexOf("COMMIT")).toBeLessThan(f.trace.indexOf("cache bump"));
});
it("발행·취소는 시각을 바꾸고 공개 채널에 초안 본문을 보내지 않는다", async () => {
  const f = setup();
  await f.service.update(author, postId, { attributes: { status: "published" } });
  expect(f.state.posts[0]?.publishedAt).toBeInstanceOf(Date);
  expect(f.events.map((e) => e.name)).toEqual(["post.published"]);
  await f.service.update(author, postId, { attributes: { status: "draft", body: "비공개" } });
  expect(f.state.posts[0]?.publishedAt).toBeNull();
  expect(f.events.slice(1)).toMatchObject([
    {
      name: "post.unpublished",
      rooms: ["posts"],
      payload: { data: { type: "posts", id: postId } },
    },
    { name: "post.updated", rooms: ["posts:all", "user:" + authorId] },
  ]);
  expect(f.events[1]?.payload).toEqual({ data: { type: "posts", id: postId } });
});
it("commit 실패는 저장·이벤트·캐시 세대를 모두 되돌린다", async () => {
  const f = setup();
  f.failCommit = true;
  await expect(f.service.update(author, postId, { attributes: { title: "실패" } })).rejects.toThrow(
    "commit 실패",
  );
  expect(f.state.posts[0]?.title).toBe("고래");
  expect(f.events).toEqual([]);
  expect(f.redisValues.size).toBe(0);
});
it("남의 글을 지운 관리자는 감사와 식별자 이벤트를 남긴다", async () => {
  const f = setup();
  await f.service.delete(manager, postId);
  expect(f.state.posts).toEqual([]);
  expect(f.state.audits).toMatchObject([
    {
      action: "post.deleted_by_admin",
      actorUserId: manager.userId,
      targetType: "posts",
      targetId: postId,
    },
  ]);
  expect(f.events[0]?.payload).toEqual({ data: { type: "posts", id: postId } });
});
it("저자의 삭제는 관리자 감사 행위를 만들지 않는다", async () => {
  const f = setup();
  await f.service.delete(author, postId);
  expect(f.state.audits).toEqual([]);
});
it("공개 캐시는 반복 조회를 줄이고 발행·취소·삭제 직후 바뀐다", async () => {
  const f = setup();
  expect((await f.service.list(undefined, query())).data).toEqual([]);
  await f.service.list(undefined, query());
  expect(f.options).toHaveLength(1);
  await f.service.update(author, postId, { attributes: { status: "published" } });
  expect((await f.service.list(undefined, query())).data.map((p) => p.id)).toEqual([postId]);
  await f.service.update(author, postId, { attributes: { status: "draft" } });
  expect((await f.service.list(undefined, query())).data).toEqual([]);
  await f.service.update(author, postId, { attributes: { status: "published" } });
  expect((await f.service.list(undefined, query())).data.map((p) => p.id)).toEqual([postId]);
  await f.service.delete(author, postId);
  expect((await f.service.list(undefined, query())).data).toEqual([]);
  f.failRedis = true;
  expect((await f.service.list(manager, query())).data).toHaveLength(0);
  expect((await f.service.list(undefined, query())).data).toEqual([]);
});
it("발행된 글 생성은 생성 룸과 공개 발행 룸에 따로 알린다", async () => {
  const f = setup([]);
  await f.service.create(author, {
    attributes: { title: "즉시 발행", body: "본문", status: "published" },
  });
  expect(f.events.map((e) => ({ name: e.name, rooms: e.rooms }))).toEqual([
    { name: "post.created", rooms: ["posts:all", "user:" + authorId] },
    { name: "post.published", rooms: ["posts", "posts:all", "user:" + authorId] },
  ]);
});
it("같은 상태와 같은 내용 수정은 시각과 알림과 세대를 바꾸지 않는다", async () => {
  const f = setup([post("published")]),
    before = f.state.posts[0]?.publishedAt;
  await f.service.update(author, postId, { attributes: { status: "published" } });
  expect(f.state.posts[0]?.publishedAt).toEqual(before);
  expect(f.events).toEqual([]);
  expect(f.redisValues.size).toBe(0);
});
it("캐시의 include 순서는 정규화하지만 페이지 링크는 현재 쿼리를 따른다", async () => {
  const f = setup([post("published", { coverImageId: fileId })]);
  await f.service.list(
    undefined,
    query({ include: ["coverImage", "author"] }),
    "include=coverImage,author",
  );
  const doc = await f.service.list(
    undefined,
    query({ include: ["author", "coverImage"] }),
    "include=author,coverImage&page[number]=1",
  );
  expect(f.options).toHaveLength(1);
  expect(new URL(doc.links.first, "https://example.test").searchParams.get("include")).toBe(
    "author,coverImage",
  );
});
it("신뢰된 표지 로더는 중첩된 다른 파일 참조까지 읽지 않는다", async () => {
  const f = setup([post("published", { coverImageId: fileId })]);
  const unrelated = "01900000-0000-7000-8000-000000000088";
  f.state.files.push({ ...required(f.state.files[0]), id: unrelated, key: "다른 파일" });
  f.state.avatarIds.push(unrelated);
  const doc = await f.service.list(undefined, query({ include: ["author.avatar", "coverImage"] }));
  expect(
    doc.included?.filter((resource) => resource.type === "files").map((resource) => resource.id),
  ).toEqual([fileId]);
});
