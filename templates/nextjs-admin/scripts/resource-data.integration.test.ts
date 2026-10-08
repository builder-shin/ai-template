import { randomUUID } from "node:crypto";
import { beforeAll, expect, inject, it } from "vitest";
import { resolveIncluded } from "../src/lib/api/jsonapi";
import { ApiError, toFormResult } from "../src/lib/api/errors";
import { createResourceData } from "../src/lib/resources/data";
import { buildResourceDocument } from "../src/lib/resources/document";
import { memberFixture, seedFixture } from "./test/admin-fixture";
import { postsFixture } from "./test/resource-fixture";
import { defineResource } from "../src/lib/resources/definition";

let seed: Awaited<ReturnType<typeof seedFixture>>;
let member: Awaited<ReturnType<typeof memberFixture>>;
let data: ReturnType<typeof createResourceData>;
const prefix = randomUUID();
const ids: string[] = [];

beforeAll(async () => {
  seed = await seedFixture(inject("mockBaseUrl"));
  member = await memberFixture(inject("mockBaseUrl"));
  data = createResourceData(seed.client);
  for (let i = 0; i < 22; i++) {
    const post = await createResourceData(member.owner.client).create(postsFixture, {
      title: `${prefix} ${String(i).padStart(2, "0")}`,
      body: "본문",
      status: i === 21 ? "draft" : "published",
    });
    ids.push(post.data.id);
  }
});

it("실제 목에 검색·상태·작성자·정렬·include를 전달한다", async () => {
  const document = await data.list(postsFixture, {
    "filter[q]": prefix,
    "filter[status]": "published",
    "filter[author]": member.userId,
    sort: "title",
  });
  expect(document.data.map((post) => post.id)).toEqual(ids.slice(0, 20));
  expect(
    resolveIncluded(document, document.data[0]!.relationships.author.data)?.attributes.name,
  ).toBe("관리 테스트");
  expect(document.meta.page).toMatchObject({ number: 1, size: 20, total: 21, totalPages: 2 });
  const next = new URL(document.links.next!, inject("mockBaseUrl"));
  expect(next.searchParams.get("filter[q]")).toBe(prefix);
  expect(next.searchParams.get("include")).toBe("author");
});

it("URL의 두 번째 페이지를 읽고 외부 page[size]를 무시한다", async () => {
  const document = await data.list(postsFixture, {
    "filter[q]": prefix,
    "filter[status]": "published",
    sort: "title",
    "page[number]": "2",
    "page[size]": "1",
  });
  expect(document.data.map((post) => post.id)).toEqual([ids[20]]);
  expect(document.meta.page).toMatchObject({ number: 2, size: 20 });
});

it("초안 필터와 내림차순 정렬을 읽는다", async () => {
  expect(
    (
      await data.list(postsFixture, {
        "filter[q]": prefix,
        "filter[status]": "draft",
        sort: "-title",
      })
    ).data.map((post) => post.id),
  ).toEqual([ids[21]]);
  expect(
    (
      await data.list(postsFixture, {
        "filter[q]": prefix,
        "filter[status]": "published",
        sort: "-title",
      })
    ).data[0]?.id,
  ).toBe(ids[20]);
});

it("상세에도 작성자를 포함하고 선언한 속성만 수정한다", async () => {
  const updated = await data.update(postsFixture, ids[0]!, {
    title: `${prefix} edited`,
    status: "draft",
  });
  expect(updated.data).toMatchObject({
    id: ids[0],
    attributes: { title: `${prefix} edited`, status: "draft", body: "본문" },
  });
  const document = await data.detail(postsFixture, ids[0]!);
  expect(resolveIncluded(document, document.data.relationships.author.data)?.attributes.name).toBe(
    "관리 테스트",
  );
});

it("삭제한 글은 실제 상세 조회에서 404다", async () => {
  await data.delete(postsFixture, ids[1]!);
  await expect(data.detail(postsFixture, ids[1]!)).rejects.toMatchObject({ status: 404 });
});

it("422 source.pointer를 실제 입력 필드의 오류로 바꾼다", async () => {
  let error: unknown;
  try {
    await data.update(postsFixture, ids[2]!, { title: "" });
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(ApiError);
  const apiError = error as ApiError;
  expect(apiError).toMatchObject({ status: 422, pointer: "/data/attributes/title" });
  expect(toFormResult(apiError, "ko", Object.keys(postsFixture.edit!.fields))).toMatchObject({
    ok: false,
    formError: null,
    fieldErrors: { title: [expect.any(String)] },
  });
});

it("JSON:API 문서는 선언한 필드만 담고 속성과 관계를 나눈다", () => {
  const values = {
    title: "수정",
    coverImage: null,
    body: "보내지 않음",
    author: { type: "users", id: "other" },
  };
  expect(buildResourceDocument(postsFixture, "edit", values, "post-id")).toEqual({
    data: {
      type: "posts",
      id: "post-id",
      attributes: { title: "수정" },
      relationships: { coverImage: { data: null } },
    },
  });
});

it("다중 관계는 실제 사용자 수정 계약의 문서로 만든다", async () => {
  const users = defineResource({
    type: "users",
    permission: "users:read",
    list: { columns: ["email", "roles"] },
    edit: { permission: "users:manage", fields: { roles: "relation-many" } },
  });
  const document = await data.update(users, member.userId, { roles: [] });
  expect(document.data.relationships.roles.data).toEqual([]);
});

it("쓰기 화면이 없는 선언으로 생성·수정·삭제하지 못한다", async () => {
  const readOnly = defineResource({
    type: "posts",
    permission: "posts:manage",
    list: { columns: ["title"] },
  });
  expect(() => data.create(readOnly, { title: "새 글", body: "본문" })).toThrow(
    "쓰기 화면 선언 없음",
  );
  expect(() => data.update(readOnly, ids[3]!, { title: "변경" })).toThrow("쓰기 화면 선언 없음");
  await expect(data.delete(readOnly, ids[3]!)).rejects.toThrow("삭제 선언 없음");
  expect((await data.detail(postsFixture, ids[3]!)).data.attributes.title).toBe(`${prefix} 03`);
});
