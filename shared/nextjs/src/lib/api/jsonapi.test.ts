import { describe, expect, expectTypeOf, it } from "vitest";
import {
  buildQuery,
  pageLinks,
  resolveIncluded,
  resolveRelationship,
  serializeQuery,
} from "./jsonapi";
import type { components } from "./schema";

const author: components["schemas"]["UserPublicResource"] = {
  type: "users",
  id: "same-id",
  attributes: { name: "Author" },
  relationships: { avatar: { data: null } },
};
const file: components["schemas"]["FileResource"] = {
  type: "files",
  id: "same-id",
  attributes: {
    filename: "cover.txt",
    contentType: "text/plain",
    size: 10,
    status: "ready",
    createdAt: "2026-01-01T00:00:00Z",
  },
  relationships: { owner: { data: { type: "users", id: "same-id" } } },
};
const document: components["schemas"]["PostDocument"] = {
  data: {
    type: "posts",
    id: "post-id",
    attributes: {
      title: "Title",
      body: "Body",
      status: "published",
      publishedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    relationships: {
      author: { data: { type: "users", id: "same-id" } },
      coverImage: { data: null },
    },
  },
  included: [file, author],
};

describe("계약 타입의 JSON:API 도우미", () => {
  it("type과 id가 모두 같은 included를 찾아 공개 사용자 타입을 유지한다", () => {
    const resolved = resolveIncluded(document, { type: "users", id: "same-id" });
    expect(resolved).toEqual(author);
    expectTypeOf(resolved).toEqualTypeOf<components["schemas"]["UserPublicResource"] | undefined>();
    expect(resolveIncluded(document, { type: "files", id: "same-id" })).toEqual(file);
    expect(resolveIncluded(document, { type: "users", id: "absent" })).toBeUndefined();
    expect(resolveIncluded(document, null)).toBeUndefined();
    expect(resolveIncluded({}, { type: "users", id: "same-id" })).toBeUndefined();
  });

  it("단수·복수 관계를 연결하고 누락된 대상과 null을 유지한다", () => {
    const linked = resolveRelationship(document, document.data.relationships.author.data);
    expect(linked).toEqual(author);
    expectTypeOf(linked).toEqualTypeOf<components["schemas"]["UserPublicResource"] | undefined>();
    expect(
      resolveRelationship(document, document.data.relationships.coverImage.data),
    ).toBeUndefined();
    expect(
      resolveRelationship(document, [
        { type: "users", id: "same-id" },
        { type: "users", id: "absent" },
      ]),
    ).toEqual([author, undefined]);
    expect(document.data.relationships.author.data).toEqual({ type: "users", id: "same-id" });
  });

  it("필터·정렬·페이지·include·fields를 계약 쿼리로 조립하고 한 번만 인코딩한다", () => {
    const query = buildQuery("/posts", {
      filter: { status: "published", q: "a&b 한글", author: "user-id" },
      sort: ["-createdAt", "title"],
      page: { number: 2, size: 10 },
      include: ["author", "coverImage"],
      fields: { posts: ["title", "author"], users: ["name"] },
    });
    expect(query).toEqual({
      "filter[status]": "published",
      "filter[q]": "a&b 한글",
      "filter[author]": "user-id",
      sort: "-createdAt,title",
      "page[number]": 2,
      "page[size]": 10,
      include: "author,coverImage",
      "fields[posts]": "title,author",
      "fields[users]": "name",
    });
    const serialized = serializeQuery(query);
    expect(serialized).toContain("filter%5Bq%5D=a%26b+%ED%95%9C%EA%B8%80");
    expect(Object.fromEntries(new URLSearchParams(serialized))).toEqual({
      "filter[status]": "published",
      "filter[q]": "a&b 한글",
      "filter[author]": "user-id",
      sort: "-createdAt,title",
      "page[number]": "2",
      "page[size]": "10",
      include: "author,coverImage",
      "fields[posts]": "title,author",
      "fields[users]": "name",
    });
    expect(buildQuery("/posts", {})).toEqual({});
    expect(serializeQuery({ "filter[q]": "", "page[number]": 0, omit: undefined })).toBe(
      "filter%5Bq%5D=&page%5Bnumber%5D=0",
    );
  });

  it("페이지 주소는 서버 링크에서 그대로 읽는다", () => {
    const links = {
      first: "/api/v1/posts?page%5Bnumber%5D=1",
      last: "/api/v1/posts?page%5Bnumber%5D=2",
      prev: null,
      next: "/api/v1/posts?page%5Bnumber%5D=2&include=author",
    };
    expect(pageLinks({ links })).toEqual({
      previous: null,
      next: "/api/v1/posts?page%5Bnumber%5D=2&include=author",
    });
    expect(pageLinks({ links: { ...links, prev: links.first, next: null } })).toEqual({
      previous: links.first,
      next: null,
    });
  });
});
