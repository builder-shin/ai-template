/**
 * 쿼리 파서와 페이지 링크. FastAPI 템플릿의 core/jsonapi/tests/test_query.py와 test_rendering.py와
 * 같은 경우를 본다. 선언은 계약의 컬렉션 operation(Users_list: include, fields, sort, filter)이다.
 */

import { type Context, Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../src/context.ts";
import { ApiError } from "../src/jsonapi/errors.ts";
import { operationSpec } from "../src/jsonapi/operations.ts";
import {
  type FilterParsers,
  parseCollectionQuery,
  parseResourceQuery,
  queryParams,
} from "../src/jsonapi/query.ts";
import { pagination } from "../src/jsonapi/rendering.ts";

const USERS = operationSpec("Users_list").query;
const FILTERS: FilterParsers = {
  q: (raw) => ({ value: raw }),
  status: (raw) =>
    ["active", "deactivated", "deleted"].includes(raw)
      ? { value: raw }
      : { problem: "Input should be 'active', 'deactivated' or 'deleted'" },
  role: (raw) => ({ value: raw }),
};

/** 요청 URL에서 쿼리를 읽는다. 파서는 Hono 문맥의 URL만 본다. 파서가 던진 에러는 그대로 던진다. */
async function withQuery<T>(query: string, read: (c: Context<AppEnv>) => T): Promise<T> {
  const app = new Hono<AppEnv>();
  let outcome: { readonly value: T } | { readonly error: unknown } | undefined;
  app.get("/api/v1/users", (c) => {
    try {
      outcome = { value: read(c) };
    } catch (error) {
      outcome = { error };
    }
    return c.body(null, 204);
  });
  await app.request(`/api/v1/users${query}`);
  if (outcome === undefined) throw new Error("핸들러가 불리지 않았다.");
  if ("error" in outcome) throw outcome.error;
  return outcome.value;
}

function parse(query: string) {
  return withQuery(query, (c) => parseCollectionQuery(queryParams(c), USERS, FILTERS));
}

async function problemOf(query: string): Promise<[string, string | undefined]> {
  try {
    await parse(query);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return [error.code, error.options.parameter];
  }
  throw new Error(`${query}가 거절되지 않았다.`);
}

describe("컬렉션 쿼리", () => {
  it("값이 없으면 기본값이다", async () => {
    expect(await parse("")).toEqual({
      include: [],
      fields: new Map(),
      page: { number: 1, size: 20 },
      sort: [],
      filter: {},
    });
  });

  it("include, fields, page, sort, filter를 읽는다", async () => {
    const query =
      "?include=roles,avatar,roles&fields%5Busers%5D=name,%20email&fields%5Broles%5D=" +
      "&page%5Bnumber%5D=3&page%5Bsize%5D=100&sort=-name,createdAt,name&filter%5Bq%5D=a+b";
    expect(await parse(query)).toEqual({
      include: ["roles", "avatar"],
      fields: new Map([
        ["users", new Set(["name", "email"])],
        ["roles", new Set()],
      ]),
      page: { number: 3, size: 100 },
      sort: [
        { name: "name", descending: true },
        { name: "createdAt", descending: false },
      ],
      filter: { q: "a b" },
    });
  });

  it.each([
    ["?sort=-bogus", "jsonapi.unsupported_sort", "sort"],
    ["?sort=--name", "jsonapi.unsupported_sort", "sort"],
    ["?include=roles,bogus", "jsonapi.unsupported_include", "include"],
    ["?include=roles,,roles", "jsonapi.invalid_query", "include"],
    ["?page%5Bsize%5D=101", "jsonapi.invalid_query", "page[size]"],
    ["?page%5Bsize%5D=0", "jsonapi.invalid_query", "page[size]"],
    ["?page%5Bnumber%5D=abc", "jsonapi.invalid_query", "page[number]"],
    ["?page%5Bnumber%5D=2147483648", "jsonapi.invalid_query", "page[number]"],
    ["?page%5Bnumber%5D=%EF%BC%93", "jsonapi.invalid_query", "page[number]"],
    ["?foo=1", "jsonapi.invalid_query", "foo"],
    ["?fields%5Bnope%5D=name", "jsonapi.invalid_query", "fields[nope]"],
    ["?filter%5Bnope%5D=x", "jsonapi.invalid_query", "filter[nope]"],
    ["?filter%5Bcreated_from%5D=x", "jsonapi.invalid_query", "filter[created_from]"],
    ["?filter%5Bstatus=x", "jsonapi.invalid_query", "filter[status"],
    ["?filter%5Bstatus%5D=gone", "jsonapi.invalid_query", "filter[status]"],
    ["?filter%5Bnope%5D=x&filter%5Bstatus%5D=gone", "jsonapi.invalid_query", "filter[status]"],
    ["?sort=name&sort=email", "jsonapi.invalid_query", "sort"],
  ])("%s는 400 %s(parameter %s)다", async (query, code, parameter) => {
    expect(await problemOf(query)).toEqual([code, parameter]);
  });

  it("자릿수가 아주 많은 페이지 번호도 400이다", async () => {
    const digits = "1".repeat(4301);
    expect(await problemOf(`?page%5Bnumber%5D=${digits}`)).toEqual([
      "jsonapi.invalid_query",
      "page[number]",
    ]);
  });

  it("오류 문구는 FastAPI와 같다", async () => {
    const messages = async (query: string) => {
      try {
        await parse(query);
      } catch (error) {
        if (error instanceof ApiError) return error.detail;
      }
      return undefined;
    };
    expect(await messages("?foo=1")).toBe("Unknown query parameter foo.");
    expect(await messages("?sort=x")).toBe("Cannot sort by x.");
    expect(await messages("?include=x")).toBe("Cannot include x.");
    expect(await messages("?sort=a,,b")).toBe("sort has an empty item.");
    expect(await messages("?sort=a&sort=b")).toBe("Query parameter sort must appear once.");
    expect(await messages("?page%5Bsize%5D=0")).toBe("page[size] must be between 1 and 100.");
    expect(await messages("?filter%5Bx%5D=1")).toBe("Extra inputs are not permitted");
  });
});

describe("단건 쿼리", () => {
  it("선언하지 않은 파라미터는 filter도 400이다", async () => {
    const me = operationSpec("Me_get").query;
    const read = (query: string) =>
      withQuery(query, (c) => {
        try {
          return parseResourceQuery(queryParams(c), me);
        } catch (error) {
          return error instanceof ApiError ? error.options.parameter : error;
        }
      });
    expect(await read("?include=avatar")).toEqual({ include: ["avatar"], fields: new Map() });
    expect(await read("?filter%5Bq%5D=x")).toBe("filter[q]");
    expect(await read("?page%5Bsize%5D=1")).toBe("page[size]");
  });
});

describe("페이지 링크", () => {
  it("page[number] 밖의 파라미터를 받은 순서대로 두고, Python의 urlencode처럼 인코딩한다", async () => {
    const query =
      "?sort=-createdAt,lastUsedAt&page%5Bnumber%5D=2&fields%5Bsessions%5D=current+id&x=a*b~c'(!)%C3%A9";
    const { links, meta } = await withQuery(query, (c) => pagination(c, { number: 2, size: 2 }, 5));
    const encoded =
      "/api/v1/users?sort=-createdAt%2ClastUsedAt&fields%5Bsessions%5D=current+id" +
      "&x=a%2Ab~c%27%28%21%29%C3%A9&page%5Bnumber%5D=";
    expect(links).toEqual({
      first: `${encoded}1`,
      last: `${encoded}3`,
      prev: `${encoded}1`,
      next: `${encoded}3`,
    });
    expect(meta).toEqual({ page: { number: 2, size: 2, total: 5, totalPages: 3 } });
  });

  it("결과가 없으면 totalPages는 0이고 first와 last는 1쪽이다", async () => {
    const { links, meta } = await withQuery("", (c) => pagination(c, { number: 1, size: 20 }, 0));
    expect(links).toEqual({
      first: "/api/v1/users?page%5Bnumber%5D=1",
      last: "/api/v1/users?page%5Bnumber%5D=1",
      prev: null,
      next: null,
    });
    expect(meta.page.totalPages).toBe(0);
  });
});
