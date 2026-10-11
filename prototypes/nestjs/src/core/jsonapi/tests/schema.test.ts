import { expect, it } from "vitest";
import { z } from "zod";
import "../../../modules/registry.js";
import { OPERATIONS } from "../../../modules/registry.js";
import { Health_live } from "../../../modules/health/index.js";
import { Permissions_list } from "../../../modules/roles/index.js";
import { FileCreateAttributes } from "../../../modules/files/index.js";
import { SessionCreateDocument, Registrations_create } from "../../../modules/auth/index.js";
import { emitOpenApi, emitSchemas, emitOperation } from "../openapi/emit.js";
import { normalizeSchema, comparable } from "../openapi/normalize.js";
import { defineOperation } from "../operation.js";
import { REGISTERED_SCHEMAS } from "../schemas.js";
import { SCHEMA_METADATA, codePointString, jsonInteger } from "../strings.js";
import { issueError, parseRequest } from "../validation.js";
import { RequestErrors } from "../errors.js";
import { Posts_create } from "../../../modules/posts/index.js";

it("declares nineteen operations but emits only mounted production paths", () => {
  expect(OPERATIONS).toHaveLength(19);
  const doc = emitOpenApi([Health_live, Permissions_list]);
  expect(Object.keys(doc.paths)).toEqual(["/health/live", "/api/v1/permissions"]);
  expect(doc.openapi).toBe("3.1.0");
  expect(doc.components.securitySchemes).toEqual({
    BearerAuth: { type: "http", scheme: "Bearer" },
  });
  expect(doc["x-realtime-events"]).toHaveLength(7);
  expect(doc["x-realtime-messages"]).toHaveLength(2);
});
it("keeps all 39 error values, contract refs, discriminator and explicit constraints", () => {
  const schemas = emitSchemas();
  expect(schemas.ErrorCode).toMatchObject({ type: "string", enum: expect.any(Array) as unknown });
  expect((schemas.ErrorCode as { enum: string[] }).enum).toHaveLength(39);
  expect(schemas.FileCreateAttributes).toMatchObject({
    properties: {
      size: { type: "integer", format: "int64", minimum: 1 },
      filename: { minLength: 1, maxLength: 255 },
    },
  });
  expect(schemas.SessionGrant).toMatchObject({
    type: "object",
    oneOf: [
      { $ref: "#/components/schemas/SessionPasswordGrant" },
      { $ref: "#/components/schemas/SessionRefreshTokenGrant" },
      { $ref: "#/components/schemas/SessionOAuthCodeGrant" },
    ],
    discriminator: { propertyName: "grantType" },
  });
  expect(schemas.PostCreateAttributes).toMatchObject({
    required: ["title", "body"],
    properties: { title: { minLength: 1, maxLength: 200 }, body: { maxLength: 100000 } },
  });
});
it("preserves semantic constraints, strictness, pattern and explicit numeric limits", () => {
  const raw = z.toJSONSchema(
    z.strictObject({
      count: jsonInteger("int64", { min: 1, max: 100 }),
      tag: z.string().regex(/^abc$/),
    }),
    { io: "input", metadata: SCHEMA_METADATA },
  );
  const out = normalizeSchema(raw);
  expect(out).toMatchObject({
    additionalProperties: false,
    required: ["count", "tag"],
    properties: {
      count: { type: "integer", format: "int64", minimum: 1, maximum: 100 },
      tag: { pattern: "^abc$" },
    },
  });
  expect(comparable({ type: "integer", minimum: 1 })).not.toEqual(comparable({ type: "integer" }));
  expect(comparable({ type: "string", format: "uuid" })).not.toEqual(
    comparable({ type: "string" }),
  );
  for (const name of ["title", "description"]) {
    expect(
      comparable({ type: "object", properties: { [name]: { type: "string", maxLength: 2 } } }),
    ).not.toEqual(
      comparable({ type: "object", properties: { [name]: { type: "string", maxLength: 3 } } }),
    );
  }
  expect(comparable({ type: "string", title: "Annotation", description: "Annotation" })).toEqual(
    comparable({ type: "string" }),
  );
  const constrainedKeys = z.record(z.string().regex(/^[a-z]+$/), z.string());
  expect(constrainedKeys.safeParse({ lower: "value" }).success).toBe(true);
  expect(constrainedKeys.safeParse({ Upper: "value" }).success).toBe(false);
  const normalizedRecord = normalizeSchema(z.toJSONSchema(constrainedKeys, { io: "input" }));
  expect(normalizedRecord).toMatchObject({
    propertyNames: { type: "string", pattern: "^[a-z]+$" },
    unevaluatedProperties: { type: "string" },
  });
  expect(comparable(normalizedRecord)).not.toEqual(
    comparable({
      type: "object",
      propertyNames: { type: "string" },
      unevaluatedProperties: { type: "string" },
    }),
  );
});
it("counts Unicode code points and rejects unpaired surrogates for stored fields", () => {
  const s = codePointString({ min: 1, max: 2 });
  expect(s.safeParse("😀😀").success).toBe(true);
  expect(s.safeParse("😀😀😀").success).toBe(false);
  expect(s.safeParse("\uD800").success).toBe(false);
  expect(normalizeSchema(z.toJSONSchema(s, { metadata: SCHEMA_METADATA }))).toEqual({
    type: "string",
    minLength: 1,
    maxLength: 2,
  });
});
it("validates int64 without coercion or a silent safe-integer bound", () => {
  const s = jsonInteger("int64", { min: 1 });
  for (const v of ["1", true, 1.2, 0, Infinity]) expect(s.safeParse(v).success).toBe(false);
  expect(s.safeParse(1).success).toBe(true);
  expect(s.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(true);
  expect(
    FileCreateAttributes.safeParse({
      filename: "x",
      contentType: "a",
      size: Number.MAX_SAFE_INTEGER + 1,
    }).success,
  ).toBe(true);
  expect(JSON.parse("9007199254740993") as unknown).toBe(9007199254740992);
});
it("maps structured issues independently of English message text", () => {
  const result = codePointString({ max: 2 }).safeParse("abc");
  if (result.success) throw new Error("Expected issue");
  const issue = result.error.issues[0];
  if (!issue) throw new Error("Missing issue");
  const a = issueError(
    { ...issue, path: ["data", "attributes", "title"], message: "arbitrary translated text" },
    { data: { attributes: { title: "abc" } } },
  );
  expect(a.toObject()).toMatchObject({
    code: "validation.too_long",
    meta: { params: { max: 2 } },
    source: { pointer: "/data/attributes/title" },
  });
});
it("keeps discriminated union issue pointers at actual document fields", () => {
  const body = {
    data: { type: "sessions", attributes: { grantType: "password", email: "bad", password: "p" } },
  };
  const result = SessionCreateDocument.safeParse(body);
  if (result.success) throw new Error("Expected issue");
  expect(result.error.issues.map((i) => issueError(i, body).toObject())).toMatchObject([
    { code: "validation.invalid_format", source: { pointer: "/data/attributes/email" } },
  ]);
});
it("rejects client IDs before other create-data fields and aggregates other statuses", () => {
  expect(() =>
    parseRequest(
      Posts_create,
      "/api/v1/posts",
      {},
      { data: { id: "mine", type: "wrong", attributes: { title: "" } } },
    ),
  ).toThrow(RequestErrors);
  try {
    parseRequest(Posts_create, "/api/v1/posts", {}, { data: { id: "mine", type: "wrong" } });
  } catch (e) {
    expect((e as RequestErrors).errors.map((x) => x.toObject())).toEqual([
      expect.objectContaining({ code: "permission.denied", source: { pointer: "/data/id" } }),
    ]);
  }
});
it("requires POST and PATCH conflict declarations and emits body-free redirects only as fixtures", () => {
  expect(() => defineOperation({ ...Posts_create, errors: [] })).toThrow("409");
  expect(() => defineOperation({ ...Registrations_create, errors: [] })).toThrow("403,409");
  expect(() => defineOperation({ ...Posts_create, errors: [[409]] })).not.toThrow();
  expect(() => defineOperation({ ...Posts_create, method: "PATCH", errors: [] })).toThrow("409");
  const fixture = defineOperation({
    ...Health_live,
    path: "/api/v1/oauth/test",
    responses: [{ status: 302, redirect: true }],
  });
  const op = emitOperation(fixture);
  expect(op.responses).toEqual({
    302: {
      description: "Redirection",
      headers: { location: { required: true, schema: { type: "string", format: "uri" } } },
    },
  });
  expect(emitOpenApi([Health_live, Permissions_list]).paths[fixture.path]).toBeUndefined();
});
function hasUtf16Bound(value: unknown, seen = new Set<unknown>()): boolean {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (value instanceof z.ZodString)
    return (value._zod.def.checks ?? []).some((c) =>
      ["min_length", "max_length"].includes(c._zod.def.check),
    );
  if (value instanceof z.ZodType) return hasUtf16Bound(value._zod.def, seen);
  return Object.values(value).some((v) => hasUtf16Bound(v, seen));
}
it("audits the registered graph and rejects raw Zod UTF-16 max strings", () => {
  expect(hasUtf16Bound(z.object({ name: z.string().max(2) }))).toBe(true);
  for (const schema of REGISTERED_SCHEMAS.values()) expect(hasUtf16Bound(schema)).toBe(false);
});
