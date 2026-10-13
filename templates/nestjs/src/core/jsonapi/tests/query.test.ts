import { expect, it } from "vitest";
import { z } from "zod";
import { parseQuery, type QuerySpec } from "../query.js";
import { toThrowApiError } from "./helpers.js";
const spec: QuerySpec = {
  filters: { q: z.string(), status: z.enum(["draft", "published"]) },
  sort: ["createdAt", "title"],
  defaultSort: "-createdAt",
  include: ["author", "author.avatar"],
  fields: { posts: ["title", "body", "author"] },
  page: { defaultSize: 20, maxSize: 100 },
};
it("선언한 쿼리를 타입이 있는 값으로 파싱한다", () => {
  expect(
    parseQuery(
      "?filter[q]=hello+world&filter[status]=draft&sort=-createdAt,title&include=author.avatar,author&fields[posts]=title,author&page[number]=2&page[size]=10",
      spec,
    ),
  ).toEqual({
    filter: { q: "hello world", status: "draft" },
    sort: [
      { field: "createdAt", descending: true },
      { field: "title", descending: false },
    ],
    include: ["author.avatar", "author"],
    fields: { posts: ["title", "author"] },
    page: { number: 2, size: 10 },
  });
});
it("비어 있는 쿼리는 기본 정렬과 페이지를 쓴다", () => {
  expect(parseQuery("", spec)).toEqual({
    filter: {},
    sort: [{ field: "createdAt", descending: true }],
    include: [],
    fields: {},
    page: { number: 1, size: 20 },
  });
});
it.each([
  "page[size]=1&page%5Bsize%5D=2",
  "filter[q]=a&filter[q]=b",
  "include=author&include=author.avatar",
])("같은 파라미터가 두 번 오면 400이다: %s", (search) => {
  toThrowApiError(() => parseQuery(search, spec), 400, "jsonapi.invalid_query", {
    parameter: new URLSearchParams(search).keys().next().value,
  });
});
it.each([
  "unknown=1",
  "filter[secret]=1",
  "filter[q=1",
  "filter[created_from]=1",
  "fields[secret]=title",
  "fields[posts]=secret",
  "filter[status]=secret",
])("모르는 파라미터와 필드·필터는 거절한다: %s", (search) => {
  toThrowApiError(() => parseQuery(search, spec), 400, "jsonapi.invalid_query");
});
it.each(["0", "-1", "1.5", "1e2", "NaN", "", "9007199254740993"])(
  "페이지 번호는 양의 십진 안전 정수다: %s",
  (number) => {
    toThrowApiError(
      () => parseQuery(`page[number]=${number}`, spec),
      400,
      "jsonapi.invalid_query",
      { parameter: "page[number]" },
    );
  },
);
it("최대 크기를 넘는 페이지는 거절한다", () => {
  toThrowApiError(() => parseQuery("page[size]=101", spec), 400, "jsonapi.invalid_query", {
    parameter: "page[size]",
  });
});
it("허용하지 않은 include와 sort는 각자의 코드다", () => {
  toThrowApiError(() => parseQuery("include=secret", spec), 400, "jsonapi.unsupported_include");
  toThrowApiError(() => parseQuery("sort=-secret", spec), 400, "jsonapi.unsupported_sort");
});
it("동일 include와 sparse field는 한 번만 남긴다", () => {
  expect(parseQuery("include=author,author&fields[posts]=title,title", spec)).toMatchObject({
    include: ["author"],
    fields: { posts: ["title"] },
  });
});
it("선언하지 않은 쿼리 기능을 받지 않는다", () => {
  for (const query of ["page[size]=10", "fields[posts]=title", "filter[q]=a"])
    toThrowApiError(() => parseQuery(query, {}), 400, "jsonapi.invalid_query");
});
