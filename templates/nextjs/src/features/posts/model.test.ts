import { expect, it } from "vitest";
import { parsePostSearch, postPageHref } from "./model";

it("중복 쿼리의 첫 값을 쓰고 잘못된 정렬·페이지는 기본값으로 돌린다", () => {
  expect(
    parsePostSearch({ q: ["  검색  ", "다른 값"], sort: "unknown", page: "-1", size: "101" }),
  ).toEqual({ q: "검색", sort: "latest", page: 1, size: 10 });
  expect(parsePostSearch({ sort: "published", page: "2", size: "1" })).toEqual({
    q: "",
    sort: "published",
    page: 2,
    size: 1,
  });
  expect(parsePostSearch({ page: "1.5", size: "NaN" })).toEqual({
    q: "",
    sort: "latest",
    page: 1,
    size: 10,
  });
});

it.each([
  ["-createdAt", "latest"],
  ["-publishedAt", "published"],
  ["title", "title"],
])("페이지 이동에서도 API 정렬 %s를 web 선택 %s로 유지한다", (apiSort, webSort) => {
  expect(postPageHref(`/api/v1/posts?sort=${apiSort}&page%5Bnumber%5D=3&page%5Bsize%5D=10`)).toBe(
    `/posts?sort=${webSort}&page=3&size=10`,
  );
});
