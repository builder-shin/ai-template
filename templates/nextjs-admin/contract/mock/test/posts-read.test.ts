/**
 * 글 읽기: 목록의 가시성(발행, 내 초안, posts:manage), 필터, 검색, 정렬, 포함 리소스와 sparse fieldset,
 * 페이지, 단건 조회, 커버의 읽기 규칙, 시드의 예제 글. FastAPI 템플릿의 posts/tests/test_read.py와 같은
 * 경우를 본다.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MINUTE } from "../src/core/clock.ts";
import { newUser, send, type SignedIn, signIn, userWith } from "./accounts.ts";
import {
  addPost,
  POSTS,
  type PostCollection,
  type PostDocument,
  postsApp,
  titles,
} from "./posts.ts";
import { errorsOf, testApp } from "./support.ts";
import { FILES, uploadFile } from "./uploads.ts";

type App = ReturnType<typeof testApp>["app"];

/** 목록의 제목들. user가 있으면 그 사람으로 본다. */
async function listed(app: App, query: string, user?: SignedIn): Promise<string[]> {
  const options = user === undefined ? {} : { token: user.accessToken };
  return titles(await send(app, "GET", `${POSTS}${query}`, options));
}

function filter(name: string, value: string): string {
  return `filter%5B${name}%5D=${encodeURIComponent(value)}`;
}

describe("목록의 가시성", () => {
  it("기본 목록은 발행된 글만 보이고, filter[status]=draft면 비어 있다", async () => {
    const { app, state } = postsApp();
    const author = await newUser(app, state);
    addPost(state, author.userId, { title: "발행" });
    addPost(state, author.userId, { status: "draft", title: "초안" });
    expect(await listed(app, "")).toEqual(["발행"]);
    expect(await listed(app, `?${filter("status", "draft")}`)).toEqual([]);
    expect(await listed(app, "", author)).toEqual(["발행"]);
  });

  it("작성자 필터가 나면 내 초안도 보인다", async () => {
    const { app, state } = postsApp();
    const author = await newUser(app, state);
    const other = await newUser(app, state);
    addPost(state, author.userId, { title: "발행", age: MINUTE });
    addPost(state, author.userId, { status: "draft", title: "초안" });
    const mine = `?${filter("author", author.userId)}`;
    expect(await listed(app, mine, author)).toEqual(["초안", "발행"]);
    expect(await listed(app, `${mine}&${filter("status", "draft")}`, author)).toEqual(["초안"]);
    expect(await listed(app, mine, other)).toEqual(["발행"]);
    expect(await listed(app, mine)).toEqual(["발행"]);
    // 작성자 id는 Pydantic의 UUID처럼 대문자와 중괄호 표기도 받는다.
    const braced = `?${filter("author", `{${author.userId.toUpperCase()}}`)}`;
    expect(await listed(app, braced, author)).toEqual(["초안", "발행"]);
  });

  it("posts:manage는 모든 초안을 본다", async () => {
    const { app, state } = postsApp();
    const author = await newUser(app, state);
    const manager = await userWith(app, state, ["posts:manage"]);
    addPost(state, author.userId, { title: "발행", age: MINUTE });
    addPost(state, author.userId, { status: "draft", title: "초안" });
    expect(await listed(app, "", manager)).toEqual(["초안", "발행"]);
    expect(await listed(app, `?${filter("status", "draft")}`, manager)).toEqual(["초안"]);
  });

  it("시드의 예제 글은 발행된 둘이 누구에게나 보이고, 관리자는 초안까지 최근 순서로 본다", async () => {
    const { app, config } = testApp();
    const admin = await signIn(app, config.seedAdmin.email, config.seedAdmin.password);
    expect(await listed(app, "")).toEqual(["마크다운으로 쓰기", "환영합니다"]);
    expect(await listed(app, "", admin)).toEqual(["초안", "마크다운으로 쓰기", "환영합니다"]);
  });
});

describe("검색과 정렬", () => {
  it("제목과 본문의 부분 일치로 찾는다(대소문자를 가리지 않고, %와 _는 글자 그대로다)", async () => {
    const { app, state } = postsApp();
    const author = await newUser(app, state);
    addPost(state, author.userId, { title: "사과", body: "빨간 과일" });
    addPost(state, author.userId, { title: "바나나", body: "노란 과일 100%" });
    addPost(state, author.userId, { title: "체리", body: "작은 과일 Cherry_Red" });
    const search = (q: string) => listed(app, `?${filter("q", q)}&sort=title`);
    expect(await search("바나")).toEqual(["바나나"]);
    expect(await search("100%")).toEqual(["바나나"]);
    expect(await search("cherry_red")).toEqual(["체리"]);
    expect(await search("_")).toEqual(["체리"]);
    expect(await search("과일")).toEqual(["바나나", "사과", "체리"]);
    expect(await search("")).toEqual(["바나나", "사과", "체리"]);
  });

  it("제목으로 정렬하고, -를 붙이면 내림차순이다", async () => {
    const { app, state } = postsApp();
    const author = await newUser(app, state);
    for (const title of ["사과", "바나나", "체리"]) addPost(state, author.userId, { title });
    expect(await listed(app, "?sort=title")).toEqual(["바나나", "사과", "체리"]);
    expect(await listed(app, "?sort=-title")).toEqual(["체리", "사과", "바나나"]);
  });

  it("제목은 FastAPI의 DB처럼 코드 포인트 순서로 늘어선다(이모지는 전각 문자 뒤다)", async () => {
    const { app, state } = postsApp();
    const author = await newUser(app, state);
    for (const title of ["🎉 출시", "（공지）", "Zebra", "apple"]) {
      addPost(state, author.userId, { title });
    }
    expect(await listed(app, "?sort=title")).toEqual(["Zebra", "apple", "（공지）", "🎉 출시"]);
  });

  it("publishedAt 정렬에서 초안(null)은 오름차순이면 맨 뒤, 내림차순이면 맨 앞이다", async () => {
    const { app, state } = postsApp();
    const manager = await userWith(app, state, ["posts:manage"]);
    addPost(state, manager.userId, { title: "옛 글", age: 2 * MINUTE });
    addPost(state, manager.userId, { status: "draft", title: "초안", age: 3 * MINUTE });
    addPost(state, manager.userId, { title: "새 글", age: MINUTE });
    expect(await listed(app, "?sort=publishedAt", manager)).toEqual(["옛 글", "새 글", "초안"]);
    expect(await listed(app, "?sort=-publishedAt", manager)).toEqual(["초안", "새 글", "옛 글"]);
    expect(await listed(app, "?sort=createdAt", manager)).toEqual(["초안", "옛 글", "새 글"]);
    expect(await listed(app, "", manager)).toEqual(["새 글", "옛 글", "초안"]);
  });

  it("같은 값이면 만든 순서(id)로 가른다", async () => {
    const { app, state } = postsApp();
    const author = await newUser(app, state);
    for (const body of ["첫째", "둘째", "셋째"]) addPost(state, author.userId, { body });
    const response = await send(app, "GET", `${POSTS}?sort=title`);
    const body = (await response.json()) as PostCollection;
    expect(body.data.map((post) => post.attributes.body)).toEqual(["첫째", "둘째", "셋째"]);
  });
});

describe("포함 리소스와 페이지", () => {
  it("작성자와 커버를 포함하고, sparse fieldset은 타입마다 적용한다", async () => {
    const { app, state } = postsApp();
    const author = await newUser(app, state);
    const cover = await uploadFile(app, author);
    const post = addPost(state, author.userId, { coverImageId: cover.id });
    const query = "?include=author,coverImage&fields%5Bposts%5D=title,author";
    const response = await send(app, "GET", `${POSTS}/${post.id}${query}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as PostDocument;
    expect(body.data.attributes).toEqual({ title: "제목" });
    expect(body.data.relationships).toEqual({
      author: { data: { type: "users", id: author.userId } },
    });
    const user = body.included?.find((item) => item.type === "users");
    expect(user).toEqual({
      type: "users",
      id: author.userId,
      attributes: { name: "가입자" },
      relationships: { avatar: { data: null } },
    });
    const file = body.included?.find((item) => item.type === "files");
    expect(file?.type === "files" ? Object.keys(file.meta ?? {}) : []).toEqual([
      "downloadUrl",
      "downloadUrlExpiresAt",
    ]);
    const users = await send(app, "GET", `${POSTS}/${post.id}?include=author&fields%5Busers%5D=`);
    const bare = (await users.json()) as PostDocument;
    expect(bare.included).toEqual([
      { type: "users", id: author.userId, attributes: {}, relationships: {} },
    ]);
  });

  it("목록의 포함 리소스는 include 순서대로, 경로마다 id 순이고 겹치지 않는다", async () => {
    const { app, state } = postsApp();
    const first = await newUser(app, state);
    const second = await newUser(app, state);
    const cover = await uploadFile(app, first);
    addPost(state, second.userId, { age: MINUTE });
    addPost(state, first.userId, { coverImageId: cover.id });
    addPost(state, first.userId);
    const response = await send(app, "GET", `${POSTS}?include=coverImage,author,coverImage`);
    const body = (await response.json()) as PostCollection;
    expect(body.included?.map((item) => [item.type, item.id])).toEqual([
      ["files", cover.id],
      ["users", first.userId],
      ["users", second.userId],
    ]);
    const plain = (await (await send(app, "GET", POSTS)).json()) as PostCollection;
    expect(Object.keys(plain)).toEqual(["data", "links", "meta"]);
  });

  it("페이지로 나누고 페이지 메타와 요청 경로 기준의 상대 링크를 준다", async () => {
    const { app, state } = postsApp();
    const author = await newUser(app, state);
    for (const index of [0, 1, 2]) {
      addPost(state, author.userId, { title: `글 ${String(index)}`, age: index * MINUTE });
    }
    const query = `?page%5Bsize%5D=2&${filter("q", "글")}`;
    const response = await send(app, "GET", `${POSTS}${query}`);
    const body = (await response.json()) as PostCollection;
    expect(body.data.map((post) => post.attributes.title)).toEqual(["글 0", "글 1"]);
    expect(body.meta.page).toEqual({ number: 1, size: 2, total: 3, totalPages: 2 });
    const page = (number: number) =>
      `/api/v1/posts?page%5Bsize%5D=2&filter%5Bq%5D=%EA%B8%80&page%5Bnumber%5D=${String(number)}`;
    expect(body.links).toEqual({ first: page(1), last: page(2), prev: null, next: page(2) });
  });
});

describe("단건 조회와 커버", () => {
  it("볼 수 없는 글(남의 초안)은 있는지도 알리지 않고 404다", async () => {
    const { app, state } = postsApp();
    const author = await newUser(app, state);
    const member = await newUser(app, state);
    const manager = await userWith(app, state, ["posts:manage"]);
    const published = addPost(state, author.userId);
    const draft = addPost(state, author.userId, { status: "draft" });
    expect((await send(app, "GET", `${POSTS}/${published.id}`)).status).toBe(200);
    const statuses: number[] = [];
    for (const viewer of [undefined, member, author, manager]) {
      const options = viewer === undefined ? {} : { token: viewer.accessToken };
      statuses.push((await send(app, "GET", `${POSTS}/${draft.id}`, options)).status);
    }
    expect(statuses).toEqual([404, 404, 200, 200]);
    for (const id of [draft.id, randomUUID()]) {
      const errors = await errorsOf(await send(app, "GET", `${POSTS}/${id}`), 404);
      expect(errors).toEqual([
        {
          status: "404",
          code: "resource.not_found",
          title: "Not Found",
          detail: `Post ${id} does not exist.`,
        },
      ]);
    }
  });

  it("볼 수 있는 글의 커버는 누구나 읽고, 초안의 커버는 볼 수 있는 사람만 읽는다", async () => {
    const { app, state } = postsApp();
    const author = await newUser(app, state);
    const member = await newUser(app, state);
    const manager = await userWith(app, state, ["posts:manage"]);
    const publicCover = await uploadFile(app, author);
    const draftCover = await uploadFile(app, author);
    addPost(state, author.userId, { coverImageId: publicCover.id });
    addPost(state, author.userId, { status: "draft", coverImageId: draftCover.id });
    expect((await send(app, "GET", `${FILES}/${publicCover.id}`)).status).toBe(200);
    const statuses: number[] = [];
    for (const viewer of [undefined, member, manager]) {
      const options = viewer === undefined ? {} : { token: viewer.accessToken };
      statuses.push((await send(app, "GET", `${FILES}/${draftCover.id}`, options)).status);
    }
    expect(statuses).toEqual([404, 404, 200]);
  });
});

describe("틀린 쿼리", () => {
  it.each([
    [filter("status", "archived"), "filter[status]", "Input should be 'draft' or 'published'"],
    [
      `${filter("author", "alice")}&${filter("status", "archived")}`,
      "filter[status]",
      "Input should be 'draft' or 'published'",
    ],
    [
      filter("author", "alice"),
      "filter[author]",
      "Input should be a valid UUID, invalid character: found `l` at 2",
    ],
    [filter("mine", "1"), "filter[mine]", "Extra inputs are not permitted"],
    ["fields%5Broles%5D=name", "fields[roles]", "Unknown query parameter fields[roles]."],
  ])("%s는 400 jsonapi.invalid_query다", async (query, parameter, detail) => {
    const { app } = testApp();
    const errors = await errorsOf(await send(app, "GET", `${POSTS}?${query}`), 400);
    expect(errors.map((error) => [error.code, error.source, error.detail])).toEqual([
      ["jsonapi.invalid_query", { parameter }, detail],
    ]);
  });

  it.each([
    [`${POSTS}?sort=body`, "jsonapi.unsupported_sort", "sort", "Cannot sort by body."],
    [`${POSTS}?include=roles`, "jsonapi.unsupported_include", "include", "Cannot include roles."],
    [
      `${POSTS}/${randomUUID()}?sort=title`,
      "jsonapi.invalid_query",
      "sort",
      "Unknown query parameter sort.",
    ],
  ])("%s는 400 %s다", async (path, code, parameter, detail) => {
    const { app } = testApp();
    const errors = await errorsOf(await send(app, "GET", path), 400);
    expect(errors.map((error) => [error.code, error.source, error.detail])).toEqual([
      [code, { parameter }, detail],
    ]);
  });
});
