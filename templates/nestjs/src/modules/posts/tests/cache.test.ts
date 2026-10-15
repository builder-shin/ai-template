import { expect, it } from "vitest";
import type { ParsedQuery } from "../../../core/jsonapi/query.js";
import { cacheKey } from "../index.js";
const query = (): ParsedQuery => ({
  filter: {},
  fields: {},
  include: [],
  sort: [{ field: "createdAt", descending: true }],
  page: { number: 1, size: 20 },
});
it("첫 페이지와 정렬한 include를 캐시 키로 쓴다", () => {
  const q = query();
  expect(cacheKey(q, undefined)).toBe("");
  q.include = ["coverImage", "author"];
  expect(cacheKey(q, undefined)).toBe("author,coverImage");
});
it("회원의 필터 없는 목록은 공개 캐시를 쓴다", () => {
  expect(
    cacheKey(query(), { userId: "a", sessionId: "s", permissions: new Set(["posts:create"]) }),
  ).toBe("");
});
it("관리자의 목록은 캐시하지 않는다", () => {
  expect(
    cacheKey(query(), { userId: "a", sessionId: "s", permissions: new Set(["posts:manage"]) }),
  ).toBeUndefined();
});
it.each([
  { label: "다음 페이지", change: { page: { number: 2, size: 20 } } },
  { label: "다른 크기", change: { page: { number: 1, size: 10 } } },
  { label: "초안 필터", change: { filter: { status: "draft" } } },
  { label: "빈 검색 필터", change: { filter: { q: "" } } },
  { label: "희소 필드", change: { fields: { posts: [] } } },
  { label: "다른 정렬", change: { sort: [{ field: "title", descending: false }] } },
  { label: "빈 정렬", change: { sort: [] } },
])("$label 요청은 캐시하지 않는다", ({ change }) => {
  expect(cacheKey({ ...query(), ...change }, undefined)).toBeUndefined();
});
