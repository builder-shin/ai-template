import { expect, it } from "vitest";
import { z } from "zod";
import { defineOperation } from "../operation.js";
import { validateRequest } from "../validation.js";
import { buildOpenApi } from "../openapi/emit.js";
import { components } from "../schemas.js";
const authorize = defineOperation({
  operationId: "OrdinaryQuery_authorize",
  method: "GET",
  path: "/api/v1/ordinary-query/authorize",
  tags: ["tests"],
  summary: "일반 쿼리를 받는다",
  auth: "none",
  querySchema: z.strictObject({
    redirectUri: z.url(),
    codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  }),
  responses: { 302: { description: "리다이렉트한다" } },
  errors: ["jsonapi.invalid_query"],
});
const callback = defineOperation({
  operationId: "OrdinaryQuery_callback",
  method: "GET",
  path: "/api/v1/ordinary-query/callback",
  tags: ["tests"],
  summary: "추가 콜백 쿼리를 받는다",
  auth: "none",
  querySchema: z
    .object({ state: z.string(), code: z.string().optional(), error: z.string().optional() })
    .loose(),
  responses: { 302: { description: "리다이렉트한다" } },
  errors: ["jsonapi.invalid_query"],
});
const parse = (search: string) =>
  validateRequest(authorize, { search, params: {}, body: undefined }).query;
it("일반 쿼리는 선언한 필수 문자열을 이름 그대로 검증한다", () => {
  expect(
    parse("redirectUri=https%3A%2F%2Ffront.example%2Fcb&codeChallenge=" + "a".repeat(43)),
  ).toEqual({ redirectUri: "https://front.example/cb", codeChallenge: "a".repeat(43) });
});
it.each([
  ["codeChallenge", "redirectUri=https%3A%2F%2Ffront.example%2Fcb"],
  ["redirectUri", "redirectUri=broken&codeChallenge=" + "a".repeat(43)],
  ["codeChallenge", "redirectUri=https%3A%2F%2Ffront.example%2Fcb&codeChallenge=short"],
  [
    "codeChallenge",
    "redirectUri=https%3A%2F%2Ffront.example%2Fcb&codeChallenge=" +
      "a".repeat(43) +
      "&codeChallenge=" +
      "b".repeat(43),
  ],
  [
    "unknown",
    "redirectUri=https%3A%2F%2Ffront.example%2Fcb&codeChallenge=" + "a".repeat(43) + "&unknown=x",
  ],
])("일반 쿼리 %s 오류는 400 invalid_query의 parameter다", (parameter, search) => {
  expect(() => parse(search)).toThrow(
    expect.objectContaining({
      init: {
        status: 400,
        code: "jsonapi.invalid_query",
        title: expect.any(String) as unknown,
        source: { parameter },
      },
    }),
  );
});
it("콜백은 provider가 더한 쿼리를 받으며 선택 필드는 누락될 수 있다", () => {
  const input = validateRequest(callback, {
    search: "state=s&scope=openid&authuser=0",
    params: {},
    body: undefined,
  });
  expect(input.query).toMatchObject({ state: "s" });
});
it("콜백의 중복된 선언 state는 추가 쿼리 허용과 관계없이 거절한다", () => {
  expect(() =>
    validateRequest(callback, {
      search: "state=s&state=t&scope=openid",
      params: {},
      body: undefined,
    }),
  ).toThrow(
    expect.objectContaining({
      init: {
        status: 400,
        code: "jsonapi.invalid_query",
        title: expect.any(String) as unknown,
        source: { parameter: "state" },
      },
    }),
  );
});
it("OpenAPI 일반 쿼리는 URI·pattern과 필수·선택 여부를 내보낸다", () => {
  const document = buildOpenApi([authorize, callback], components());
  expect(document.paths[authorize.path]?.get?.parameters).toEqual([
    { name: "redirectUri", in: "query", required: true, schema: { type: "string", format: "uri" } },
    {
      name: "codeChallenge",
      in: "query",
      required: true,
      schema: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
    },
  ]);
  expect(document.paths[callback.path]?.get?.parameters).toEqual([
    { name: "state", in: "query", required: true, schema: { type: "string" } },
    { name: "code", in: "query", required: false, schema: { type: "string" } },
    { name: "error", in: "query", required: false, schema: { type: "string" } },
  ]);
});

it("일반 스키마와 JSON:API 쿼리를 함께 선언하면 시작 시 거절한다", () => {
  expect(() =>
    defineOperation({
      ...authorize,
      operationId: "OrdinaryQuery_conflicting",
      query: { filters: {} },
    }),
  ).toThrow("쿼리 선언 방식은 하나만 쓴다");
});
