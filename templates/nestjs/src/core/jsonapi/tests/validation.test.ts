import { expect, it } from "vitest";
import { z } from "zod";
import { defineOperation } from "../operation.js";
import { validateRequest } from "../validation.js";
import { codePointString, jsonInteger, emailString, uuidString } from "../schemas.js";
import { errorsOf } from "./helpers.js";
const base = {
  method: "PATCH",
  path: "/api/v1/posts/{id}",
  tags: ["posts"],
  summary: "글 수정",
  auth: "optional",
  responses: { 200: { description: "성공" } },
  errors: [],
} as const;
const post = defineOperation({
  ...base,
  operationId: "Task5ValidationPost",
  params: z.object({ id: uuidString() }),
  body: z.strictObject({
    data: z.strictObject({
      type: z.literal("posts"),
      id: z.string(),
      attributes: z.strictObject({
        title: codePointString({ min: 2, max: 3 }),
        size: jsonInteger({ min: 1, max: 10, format: "int64" }),
        status: z.enum(["draft", "published"]),
      }),
    }),
  }),
});
const id = "019a096b-4980-7a52-bf1b-dcfb48964944";
const valid = {
  data: { type: "posts", id, attributes: { title: "😀😀", size: 2, status: "draft" } },
};
const raw = (body: unknown = valid, params = { id }) => ({ search: "", params, body });
it("쿼리 오류가 있으면 본문을 보지 않고 쿼리 400만 낸다", () => {
  let parsed = false;
  const declaration = defineOperation({
    ...base,
    operationId: "Task5QueryFirst",
    body: z.unknown().transform(() => {
      parsed = true;
      return {};
    }),
  });
  const error = errorsOf(() =>
    validateRequest(declaration, { search: "secret=1", params: {}, body: {} }),
  );
  expect(error.errors.map((e) => e.init.code)).toEqual(["jsonapi.invalid_query"]);
  expect(parsed).toBe(false);
});
it("경로 404와 필드 422가 함께면 둘을 담은 400이다", () => {
  const error = errorsOf(() =>
    validateRequest(
      post,
      raw(
        {
          data: { ...valid.data, id: "bad", attributes: { ...valid.data.attributes, title: "x" } },
        },
        { id: "bad" },
      ),
    ),
  );
  expect(error.status).toBe(400);
  expect(error.errors.map((e) => e.init)).toMatchObject([
    { status: 404, code: "resource.not_found", source: { parameter: "id" } },
    {
      status: 422,
      code: "validation.too_short",
      source: { pointer: "/data/attributes/title" },
      meta: { params: { min: 2 } },
    },
  ]);
});
it("판별 유니온 필드 오류의 pointer는 본문의 실제 위치다", () => {
  const sessions = defineOperation({
    ...base,
    operationId: "Task5SessionGrant",
    method: "POST",
    path: "/api/v1/sessions",
    body: z.object({
      data: z.object({
        type: z.literal("sessions"),
        attributes: z.discriminatedUnion("grantType", [
          z.object({ grantType: z.literal("refreshToken"), refreshToken: z.string() }),
          z.object({
            grantType: z.literal("password"),
            email: emailString(),
            password: z.string(),
          }),
        ]),
      }),
    }),
  });
  const body = (attributes: object) => ({
    search: "",
    params: {},
    body: { data: { type: "sessions", attributes } },
  });
  expect(
    errorsOf(() => validateRequest(sessions, body({ grantType: "refreshToken", refreshToken: 5 })))
      .errors[0]?.init,
  ).toMatchObject({
    code: "validation.invalid_format",
    source: { pointer: "/data/attributes/refreshToken" },
  });
  expect(
    errorsOf(() =>
      validateRequest(sessions, body({ grantType: "password", email: "bad", password: "x" })),
    ).errors[0]?.init,
  ).toMatchObject({
    code: "validation.invalid_format",
    source: { pointer: "/data/attributes/email" },
    meta: { params: { format: "email" } },
  });
});
it.each([
  [{ title: "xxxx" }, "validation.too_long", { max: 3 }, "title"],
  [{ title: undefined }, "validation.required", {}, "title"],
  [{ size: 0 }, "validation.out_of_range", { min: 1 }, "size"],
  [{ size: 11 }, "validation.out_of_range", { max: 10 }, "size"],
  [{ size: "10" }, "validation.invalid_format", {}, "size"],
  [
    { status: "secret" },
    "validation.invalid_choice",
    { choices: ["draft", "published"] },
    "status",
  ],
] as const)("오류 코드와 params는 issue 정보에서 정한다: %s", (attributes, code, params, field) => {
  const error = errorsOf(() =>
    validateRequest(
      post,
      raw({ data: { ...valid.data, attributes: { ...valid.data.attributes, ...attributes } } }),
    ),
  );
  expect(error.status).toBe(422);
  expect(error.errors[0]?.init).toMatchObject({
    code,
    source: { pointer: `/data/attributes/${field}` },
    meta: { params },
  });
});
it("영어 오류 메시지가 달라도 코드 매핑은 바뀌지 않는다", () => {
  const declaration = defineOperation({
    ...base,
    operationId: "Task5Localized",
    body: z.object({
      data: z.object({
        attributes: z.object({ title: z.string().min(2, "이 문구는 파싱하지 않는다") }),
      }),
    }),
  });
  expect(
    errorsOf(() => validateRequest(declaration, raw({ data: { attributes: { title: "x" } } })))
      .errors[0]?.init,
  ).toMatchObject({ code: "validation.too_short", meta: { params: { min: 2 } } });
});
it.each(
  [null, [], {}, { data: null }, { data: { type: "posts", id, attributes: [] } }].map((body) => [
    body,
  ]),
)("잘못된 문서 구조는 400이다: %s", (body) => {
  expect(errorsOf(() => validateRequest(post, raw(body))).status).toBe(400);
});
it("type 불일치는 409이고 경로와 다른 id도 409다", () => {
  for (const data of [
    { ...valid.data, type: "users" },
    { ...valid.data, id: "different" },
  ]) {
    const error = errorsOf(() => validateRequest(post, raw({ data })));
    expect(error.status).toBe(409);
    expect(error.errors[0]?.init.code).toBe("resource.conflict");
  }
});
it("생성 요청의 클라이언트 id는 403이다", () => {
  const declaration = defineOperation({
    ...base,
    operationId: "Task5CreateId",
    method: "POST",
    body: z.object({
      data: z.object({ type: z.literal("posts"), attributes: z.object({ title: z.string() }) }),
    }),
  });
  const error = errorsOf(() => validateRequest(declaration, raw(valid)));
  expect(error.status).toBe(403);
  expect(error.errors[0]?.init).toMatchObject({
    code: "permission.denied",
    source: { pointer: "/data/id" },
  });
});
it("JSON Pointer의 슬래시와 물결표와 배열 위치를 보존한다", () => {
  const declaration = defineOperation({
    ...base,
    operationId: "Task5Pointer",
    body: z.object({ data: z.object({ attributes: z.object({ "a/b~c": z.array(z.string()) }) }) }),
  });
  expect(
    errorsOf(() => validateRequest(declaration, raw({ data: { attributes: { "a/b~c": [5] } } })))
      .errors[0]?.init.source,
  ).toEqual({ pointer: "/data/attributes/a~1b~0c/0" });
});
it("유효한 요청은 파싱한 본문과 경로 및 빈 주체를 돌려준다", () => {
  expect(validateRequest(post, raw())).toMatchObject({
    params: { id },
    body: valid,
    principal: undefined,
  });
});
it("data.type의 짝 없는 서로게이트는 충돌이 아니라 문서 오류다", () => {
  const error = errorsOf(() =>
    validateRequest(post, raw({ data: { ...valid.data, type: "\ud800" } })),
  );
  expect(error.status).toBe(400);
  expect(error.errors[0]?.init).toMatchObject({
    code: "jsonapi.invalid_document",
    source: { pointer: "/data/type" },
  });
});
it("수정 문서의 빠진 id는 문서 구조 오류다", () => {
  const error = errorsOf(() =>
    validateRequest(post, raw({ data: { type: "posts", attributes: valid.data.attributes } })),
  );
  expect(error.status).toBe(400);
  expect(error.errors[0]?.init).toMatchObject({
    code: "jsonapi.invalid_document",
    source: { pointer: "/data/id" },
  });
});

const choices = defineOperation({
  ...base,
  operationId: "Task5MalformedChoices",
  method: "POST",
  path: "/api/v1/choices",
  body: z.object({
    data: z.object({
      type: z.literal("choices"),
      attributes: z.object({
        enumChoice: z.enum(["draft", "😀"]),
        literalChoice: z.literal("😀"),
        unionChoice: z.union([z.literal("draft"), z.literal("😀")]),
        grant: z.discriminatedUnion("grantType", [
          z.object({ grantType: z.literal("password"), payload: z.string() }),
          z.object({ grantType: z.literal("😀"), payload: z.string() }),
        ]),
        token: z.string(),
      }),
    }),
  }),
});
const choiceRaw = (attributes: object, type = "choices") => ({
  search: "",
  params: {},
  body: {
    data: {
      type,
      attributes: {
        enumChoice: "draft",
        literalChoice: "😀",
        unionChoice: "draft",
        grant: { grantType: "password", payload: "x" },
        token: "\ud800",
        ...attributes,
      },
    },
  },
});
it.each([
  ["열거 상위", { enumChoice: "\ud800" }, "/data/attributes/enumChoice"],
  ["열거 하위", { enumChoice: "\udc00" }, "/data/attributes/enumChoice"],
  ["리터럴 상위", { literalChoice: "\ud800" }, "/data/attributes/literalChoice"],
  ["리터럴 하위", { literalChoice: "\udc00" }, "/data/attributes/literalChoice"],
  ["유니온 상위", { unionChoice: "\ud800" }, "/data/attributes/unionChoice"],
  ["유니온 하위", { unionChoice: "\udc00" }, "/data/attributes/unionChoice"],
  [
    "판별자 상위",
    { grant: { grantType: "\ud800", payload: "x" } },
    "/data/attributes/grant/grantType",
  ],
  [
    "판별자 하위",
    { grant: { grantType: "\udc00", payload: "x" } },
    "/data/attributes/grant/grantType",
  ],
] as const)(
  "제약 선택 문자열의 짝 없는 서로게이트는 형식 오류다: %s",
  (_name, attributes, pointer) => {
    const error = errorsOf(() => validateRequest(choices, choiceRaw(attributes)));
    expect(error.status).toBe(422);
    expect(error.errors.map((e) => e.init)).toMatchObject([
      {
        code: "validation.invalid_format",
        source: { pointer },
        meta: { params: { format: "unicode" } },
      },
    ]);
  },
);
it.each(["\ud800", "\udc00"])(
  "data.type의 짝 없는 서로게이트는 문서 오류를 유지한다: %s",
  (type) => {
    const error = errorsOf(() => validateRequest(choices, choiceRaw({}, type)));
    expect(error.status).toBe(400);
    expect(error.errors[0]?.init).toMatchObject({
      code: "jsonapi.invalid_document",
      source: { pointer: "/data/type" },
    });
  },
);
it("짝을 이룬 이모지 선택지와 제약 없는 문자열은 받는다", () => {
  expect(
    validateRequest(
      choices,
      choiceRaw({ enumChoice: "😀", unionChoice: "😀", grant: { grantType: "😀", payload: "x" } }),
    ).body,
  ).toEqual({
    data: {
      type: "choices",
      attributes: {
        enumChoice: "😀",
        literalChoice: "😀",
        unionChoice: "😀",
        grant: { grantType: "😀", payload: "x" },
        token: "\ud800",
      },
    },
  });
});
it.each([
  ["열거", { enumChoice: "secret" }, "/data/attributes/enumChoice", { choices: ["draft", "😀"] }],
  ["리터럴", { literalChoice: "secret" }, "/data/attributes/literalChoice", { choices: ["😀"] }],
  ["유니온", { unionChoice: "secret" }, "/data/attributes/unionChoice", {}],
  [
    "판별자",
    { grant: { grantType: "secret", payload: "x" } },
    "/data/attributes/grant/grantType",
    {},
  ],
] as const)(
  "일반 미지원 선택지는 기존 코드와 params를 유지한다: %s",
  (_name, attributes, pointer, params) => {
    const error = errorsOf(() => validateRequest(choices, choiceRaw(attributes)));
    expect(error.status).toBe(422);
    expect(error.errors[0]?.init).toMatchObject({
      code: "validation.invalid_choice",
      source: { pointer },
      meta: { params },
    });
  },
);
it.each(["users", "😀"])("일반 type 불일치는 충돌과 기존 params를 유지한다: %s", (type) => {
  const error = errorsOf(() => validateRequest(choices, choiceRaw({}, type)));
  expect(error.status).toBe(409);
  expect(error.errors[0]?.init).toMatchObject({
    code: "resource.conflict",
    source: { pointer: "/data/type" },
    meta: { params: { choices: ["choices"] } },
  });
});
