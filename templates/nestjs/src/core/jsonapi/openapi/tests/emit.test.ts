import { expect, it } from "vitest";
import { z } from "zod";
import { buildOpenApi } from "../emit.js";
import { normalizeSchema } from "../normalize.js";
import { components, registerComponent, codePointString, jsonInteger } from "../../schemas.js";
import { defineOperation, operations, type OperationDeclaration } from "../../operation.js";
import { errorCodeSchema, ERROR_CODES } from "../../error-codes.js";
import { permissionCodeSchema, PERMISSION_CODES } from "../../../security/permissions.js";
import "../../../../modules/health/index.js";

it("레지스트리에서 OpenAPI 3.1.0과 헬스 응답 참조를 만든다", () => {
  const doc = buildOpenApi(operations(), components());
  expect(doc.openapi).toBe("3.1.0");
  expect(doc.info).toMatchObject({ title: "AI Template Platform API", version: "1.0.0" });
  expect(doc.servers).toEqual([{ url: "http://localhost:8000" }]);
  expect(doc.tags).toContainEqual({ name: "health" });
  expect(doc.components.securitySchemes).toEqual({
    BearerAuth: { type: "http", scheme: "Bearer" },
  });
  expect(doc.paths["/health/ready"]?.get?.responses).toMatchObject({
    "200": {
      content: { "application/json": { schema: { $ref: "#/components/schemas/HealthReport" } } },
    },
    "503": {
      content: { "application/json": { schema: { $ref: "#/components/schemas/HealthReport" } } },
    },
  });
  expect(JSON.stringify(doc)).not.toContain('"$id"');
  expect(JSON.stringify(doc)).not.toContain('"$schema"');
});
it("등록한 중첩 컴포넌트는 응답과 본문에서 같은 참조를 쓴다", () => {
  registerComponent(
    "ErrorDocument",
    z.object({ errors: z.array(z.object({ code: errorCodeSchema })) }),
  );
  const child = registerComponent(
    "EmitChild",
    z.object({ title: codePointString({ min: 1, max: 200 }) }),
  );
  const body = registerComponent("EmitBody", z.object({ data: child }));
  const op = defineOperation({
    operationId: "Emit_create",
    method: "POST",
    path: "/api/v1/emit",
    tags: ["emit"],
    summary: "입력을 저장한다",
    auth: "required",
    permission: "posts:create",
    body,
    responses: { 201: { schema: "EmitBody", description: "생성했다" } },
    errors: [],
  });
  const doc = buildOpenApi([op], components());
  expect(doc.components.schemas.EmitBody).toMatchObject({
    properties: { data: { $ref: "#/components/schemas/EmitChild" } },
  });
  expect(doc.components.schemas.EmitChild).toMatchObject({
    properties: { title: { type: "string", minLength: 1, maxLength: 200 } },
  });
  expect(doc.paths["/api/v1/emit"]?.post).toMatchObject({
    operationId: "Emit_create",
    security: [{ BearerAuth: [] }],
    "x-permission": "posts:create",
    requestBody: {
      required: true,
      content: {
        "application/vnd.api+json": { schema: { $ref: "#/components/schemas/EmitBody" } },
      },
    },
    responses: {
      "201": {
        content: {
          "application/vnd.api+json": { schema: { $ref: "#/components/schemas/EmitBody" } },
        },
      },
      "403": {},
      "409": {},
    },
  });
});
it("nullable은 type 배열이고 판별 유니온은 선언한 discriminator를 낸다", () => {
  const a = registerComponent(
    "EmitGrantA",
    z.object({ grantType: z.literal("a"), name: z.string().nullable() }),
  );
  const b = registerComponent("EmitGrantB", z.object({ grantType: z.literal("b") }));
  const schema = registerComponent("EmitGrant", z.discriminatedUnion("grantType", [a, b]), {
    discriminator: {
      propertyName: "grantType",
      mapping: { a: "#/components/schemas/EmitGrantA", b: "#/components/schemas/EmitGrantB" },
    },
  });
  const doc = buildOpenApi([], components());
  expect(doc.components.schemas.EmitGrantA).toMatchObject({
    properties: { name: { type: ["string", "null"] } },
  });
  expect(doc.components.schemas.EmitGrant).toMatchObject({
    oneOf: [
      { $ref: "#/components/schemas/EmitGrantA" },
      { $ref: "#/components/schemas/EmitGrantB" },
    ],
    discriminator: {
      propertyName: "grantType",
      mapping: { a: "#/components/schemas/EmitGrantA", b: "#/components/schemas/EmitGrantB" },
    },
  });
  expect(schema.safeParse({ grantType: "a", name: null }).success).toBe(true);
});
it("int64와 int32는 명시한 경계와 format만 낸다", () => {
  registerComponent(
    "EmitIntegers",
    z.object({
      size: jsonInteger({ min: 1, format: "int64" }),
      page: jsonInteger({ format: "int32" }),
      bounded: jsonInteger({ min: 0, max: 10, format: "int32" }),
    }),
  );
  const doc = buildOpenApi([], components());
  expect(doc.components.schemas.EmitIntegers).toMatchObject({
    properties: {
      size: { type: "integer", format: "int64", minimum: 1 },
      page: { type: "integer", format: "int32" },
      bounded: { maximum: 10 },
    },
  });
  expect(JSON.stringify(doc.components.schemas.EmitIntegers)).not.toContain("9007199254740991");
  const schema = doc.components.schemas.EmitIntegers as { properties: Record<string, unknown> };
  expect(schema.properties.size).not.toHaveProperty("maximum");
  expect(schema.properties.page).not.toHaveProperty("minimum");
  expect(schema.properties.page).not.toHaveProperty("maximum");
});
it("오류와 권한 enum의 모든 값을 문서에 보존한다", () => {
  expect(errorCodeSchema).toBeDefined();
  expect(permissionCodeSchema).toBeDefined();
  const doc = buildOpenApi([], components());
  expect(doc.components.schemas.ErrorCode).toEqual({ type: "string", enum: [...ERROR_CODES] });
  expect(doc.components.schemas.PermissionCode).toEqual({
    type: "string",
    enum: [...PERMISSION_CODES],
  });
});
it("경로와 쿼리 매개변수 및 선택 인증을 선언에서 만든다", () => {
  const op: OperationDeclaration = {
    operationId: "Emit_list",
    method: "GET",
    path: "/api/v1/emit/{id}",
    tags: ["emit"],
    summary: "조회한다",
    auth: "optional",
    params: z.object({ id: z.string() }),
    query: {
      filters: { title: codePointString({ min: 1 }) },
      sort: ["title"],
      include: ["author"],
      fields: { emit: ["title"] },
      page: { defaultSize: 20, maxSize: 100 },
    },
    responses: { 200: { description: "조회했다" } },
    errors: [],
  };
  const doc = buildOpenApi([op], components());
  expect(doc.paths[op.path]?.get).toMatchObject({
    security: [{}, { BearerAuth: [] }],
    "x-jsonapi-sort": ["title"],
    "x-jsonapi-include": ["author"],
  });
  expect(doc.paths[op.path]?.get?.parameters).toEqual(
    expect.arrayContaining([
      { name: "id", in: "path", required: true, schema: { type: "string" } },
      {
        name: "filter[title]",
        in: "query",
        required: false,
        explode: false,
        schema: { type: "string", minLength: 1 },
      },
      {
        name: "page[size]",
        in: "query",
        required: false,
        explode: false,
        schema: { type: "integer", format: "int32", minimum: 1, maximum: 100, default: 20 },
      },
    ]),
  );
});
it("응답이 존재하지 않는 컴포넌트를 참조하면 생성하지 않는다", () => {
  const op: OperationDeclaration = {
    operationId: "Emit_missing",
    method: "GET",
    path: "/missing",
    tags: [],
    summary: "조회한다",
    auth: "none",
    responses: { 200: { schema: "Missing", description: "성공" } },
    errors: [],
  };
  expect(() => buildOpenApi([op], new Map())).toThrow(/Missing/);
});
it("정규화는 레지스트리 표식을 없애고 명시한 계약 제약을 보존한다", () => {
  const input = {
    $id: "#/components/schemas/Sample",
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: {
      n: { type: "integer", format: "int32", minimum: -2147483648, maximum: 2147483647 },
      text: { type: "string", pattern: "^a", minLength: 1 },
      marker: { const: "$id" },
    },
  };
  expect(normalizeSchema(input)).toEqual({
    type: "object",
    additionalProperties: false,
    properties: input.properties,
  });
  expect(input).toHaveProperty("$id");
});
it("문자열 키 record의 값 제약을 계약의 unevaluatedProperties로 보존한다", () => {
  const doc = buildOpenApi(
    operations().filter((op) => op.operationId.startsWith("Health_")),
    components(),
  );
  expect(doc.components.schemas.HealthReport).toMatchObject({
    properties: {
      checks: {
        type: "object",
        unevaluatedProperties: { type: "string", enum: ["ok", "unavailable"] },
      },
    },
  });
  expect(JSON.stringify(doc.components.schemas.HealthReport)).not.toContain("propertyNames");
});
it("인라인 본문의 등록된 하위 스키마도 컴포넌트 참조로 둔다", () => {
  const child = registerComponent("EmitInlineChild", z.object({ name: z.string() }));
  const op: OperationDeclaration = {
    operationId: "Emit_inline",
    method: "POST",
    path: "/inline",
    tags: [],
    summary: "저장한다",
    auth: "none",
    body: z.object({ data: child }),
    responses: { 201: { description: "성공" } },
    errors: [],
  };
  const doc = buildOpenApi([op], components());
  expect(doc.paths["/inline"]?.post?.requestBody).toMatchObject({
    content: {
      "application/vnd.api+json": {
        schema: { properties: { data: { $ref: "#/components/schemas/EmitInlineChild" } } },
      },
    },
  });
});
