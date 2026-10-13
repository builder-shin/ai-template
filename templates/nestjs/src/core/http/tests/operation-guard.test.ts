import "reflect-metadata";
import { Controller, Module } from "@nestjs/common";
import { expect, it } from "vitest";
import { Operation, JsonApiRequest } from "../../jsonapi/decorators.js";
import { defineOperation } from "../../jsonapi/operation.js";
import type { ValidatedRequest } from "../../jsonapi/validation.js";
import { ApiError } from "../../jsonapi/errors.js";
import {
  PRINCIPAL_RESOLVER,
  UnavailablePrincipalResolver,
  type PrincipalResolver,
} from "../../security/principal.js";
import { testApp, errorDocument } from "./fixtures.js";
import { buildOpenApi } from "../../jsonapi/openapi/emit.js";
import { operations } from "../../jsonapi/operation.js";
import { components } from "../../jsonapi/schemas.js";

const none = defineOperation({
  operationId: "GuardFixture_none",
  method: "GET",
  path: "/api/v1/guard-none",
  tags: ["fixture"],
  summary: "공개 요청이다",
  auth: "none",
  responses: { 200: { description: "응답이다" } },
  errors: [],
});
const optional = defineOperation({
  ...none,
  operationId: "GuardFixture_optional",
  path: "/api/v1/guard-optional",
  auth: "optional",
});
@Controller()
class GuardFixtureController {
  @Operation(none) none(@JsonApiRequest() req: ValidatedRequest) {
    return { userId: req.principal?.userId ?? null };
  }
  @Operation(optional) optional(@JsonApiRequest() req: ValidatedRequest) {
    return { userId: req.principal?.userId ?? null };
  }
}
@Module({ controllers: [GuardFixtureController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class GuardFixtureModule {}
function resolver(calls: (string | undefined)[]): PrincipalResolver {
  return {
    resolve: (authorization) => {
      calls.push(authorization);
      if (authorization === "Bearer broken")
        throw new ApiError({ status: 401, code: "auth.token_invalid", title: "Invalid token" });
      return Promise.resolve(
        authorization
          ? {
              userId: "u1",
              sessionId: "s1",
              permissions: new Set(authorization === "Bearer reader" ? ["roles:read"] : []),
            }
          : undefined,
      );
    },
  };
}
async function fixture() {
  const calls: (string | undefined)[] = [];
  return {
    ...(await testApp([GuardFixtureModule], {
      providers: [{ provide: PRINCIPAL_RESOLVER, useValue: resolver(calls) }],
    })),
    calls,
  };
}
it("공개 operation은 잘못된 토큰이 있어도 해석하지 않는다", async () => {
  const { http, calls } = await fixture();
  const res = await http.get("/api/v1/guard-none").set("Authorization", "Bearer broken");
  expect(res.status).toBe(200);
  expect(JSON.parse(res.text) as unknown).toEqual({ userId: null });
  expect(calls).toEqual([]);
});
it("선택 인증은 헤더가 없으면 해석하지 않는다", async () => {
  const { http, calls } = await fixture();
  expect((await http.get("/api/v1/guard-optional")).status).toBe(200);
  expect(calls).toEqual([]);
});
it("선택 인증은 헤더가 있으면 주체를 요청에 연결한다", async () => {
  const { http, calls } = await fixture();
  const res = await http.get("/api/v1/guard-optional").set("Authorization", "Bearer reader");
  expect(JSON.parse(res.text) as unknown).toEqual({ userId: "u1" });
  expect(calls).toEqual(["Bearer reader"]);
});
it("선택 인증도 잘못된 토큰이면 401과 Bearer 헤더를 준다", async () => {
  const { http } = await fixture();
  const res = await http.get("/api/v1/guard-optional").set("Authorization", "Bearer broken");
  expect(res.status).toBe(401);
  expect(res.headers["www-authenticate"]).toBe("Bearer");
  expect(errorDocument(res.text).errors[0]?.code).toBe("auth.token_invalid");
});
it("필수 인증에서 토큰이 없으면 401과 Bearer 헤더를 준다", async () => {
  const { http, calls } = await fixture();
  const res = await http.get("/api/v1/permissions");
  expect(res.status).toBe(401);
  expect(res.headers["www-authenticate"]).toBe("Bearer");
  expect(errorDocument(res.text).errors[0]?.code).toBe("auth.unauthenticated");
  expect(calls).toEqual([]);
});
it("주체에 roles:read가 없으면 403이다", async () => {
  const { http } = await fixture();
  const res = await http.get("/api/v1/permissions").set("Authorization", "Bearer member");
  expect(res.status).toBe(403);
  expect(errorDocument(res.text).errors[0]?.code).toBe("permission.denied");
});
const ascending = [
  "admin:access",
  "audit-logs:read",
  "posts:create",
  "posts:manage",
  "roles:manage",
  "roles:read",
  "users:manage",
  "users:read",
];
it.each([undefined, "-id"])("권한 목록은 코드 순서와 역순을 지원한다: %s", async (sort) => {
  const { http } = await fixture();
  const res = await http
    .get(`/api/v1/permissions${sort ? `?sort=${sort}` : ""}`)
    .set("Authorization", "Bearer reader");
  expect(res.status).toBe(200);
  const doc = JSON.parse(res.text) as {
    data: { id: string; type: string; attributes: { description: string; group: string } }[];
  };
  expect(doc.data.map((p) => p.id)).toEqual(sort ? [...ascending].reverse() : ascending);
  expect(
    doc.data.every(
      (p) =>
        p.type === "permissions" &&
        p.attributes.description.length > 0 &&
        p.attributes.group === p.id.split(":")[0],
    ),
  ).toBe(true);
});
it("권한 목록은 페이지와 희소 필드를 적용하고 전체 개수를 보존한다", async () => {
  const { http } = await fixture();
  const res = await http
    .get("/api/v1/permissions?page[size]=2&page[number]=2&fields[permissions]=group")
    .set("Authorization", "Bearer reader");
  expect(res.status).toBe(200);
  expect(JSON.parse(res.text) as unknown).toMatchObject({
    data: [
      { id: "posts:create", attributes: { group: "posts" } },
      { id: "posts:manage", attributes: { group: "posts" } },
    ],
    meta: { page: { number: 2, size: 2, total: 8, totalPages: 4 } },
  });
  const data = (JSON.parse(res.text) as { data: { attributes: object }[] }).data;
  expect(Object.keys(data[0]?.attributes ?? {})).toEqual(["group"]);
});
it("권한 목록의 허용하지 않은 정렬은 400이다", async () => {
  const { http } = await fixture();
  const res = await http.get("/api/v1/permissions?sort=name").set("Authorization", "Bearer reader");
  expect(res.status).toBe(400);
  expect(errorDocument(res.text).errors[0]?.code).toBe("jsonapi.unsupported_sort");
});
it("권한 여덟 개의 설명은 플랫폼의 영어 문구와 정확히 같다", async () => {
  const { http } = await fixture();
  const res = await http.get("/api/v1/permissions").set("Authorization", "Bearer reader");
  expect(res.status).toBe(200);
  const doc = JSON.parse(res.text) as {
    data: { id: string; attributes: { description: string } }[];
  };
  expect(Object.fromEntries(doc.data.map((p) => [p.id, p.attributes.description]))).toEqual({
    "admin:access": "Sign in to the admin app.",
    "users:read": "Read every user's full profile.",
    "users:manage": "Change a user's status and roles.",
    "roles:read": "Read roles and permissions.",
    "roles:manage": "Create, change and delete roles.",
    "audit-logs:read": "Read audit logs.",
    "posts:create": "Write posts.",
    "posts:manage": "Manage every post, including drafts.",
  });
});
it("기본 해석기는 헤더가 없으면 익명이고 모든 토큰을 거절한다", async () => {
  const resolver = new UnavailablePrincipalResolver();
  await expect(resolver.resolve(undefined)).resolves.toBeUndefined();
  for (const token of ["Bearer reader", "Basic x", ""]) {
    await expect(resolver.resolve(token)).rejects.toMatchObject({
      init: { status: 401, code: "auth.token_invalid" },
    });
  }
});
it("기본 앱에 실제 인증 대신 거절하는 해석기가 연결된다", async () => {
  const { http } = await testApp([]);
  const res = await http.get("/api/v1/permissions").set("Authorization", "Bearer reader");
  expect(res.status).toBe(401);
  expect(errorDocument(res.text).errors[0]?.code).toBe("auth.token_invalid");
});
it("권한 목록 선언은 오류 문서와 계약 enum을 참조하는 OpenAPI로 생성된다", async () => {
  await testApp([]);
  const document = buildOpenApi(operations(), components());
  expect(document.paths["/api/v1/permissions"]?.get).toMatchObject({
    operationId: "Permissions_list",
    security: [{ BearerAuth: [] }],
    "x-permission": "roles:read",
    responses: {
      429: {
        headers: {
          "Retry-After": { required: true, schema: { type: "integer", format: "int32" } },
        },
      },
      401: {
        content: {
          "application/vnd.api+json": { schema: { $ref: "#/components/schemas/ErrorDocument" } },
        },
      },
    },
  });
  expect(document.components.schemas).toMatchObject({
    PaginationLinks: {
      properties: { prev: { format: "uri-reference" }, next: { format: "uri-reference" } },
    },
    AuditLogAction: {
      enum: [
        "session.login_succeeded",
        "session.login_failed",
        "session.all_revoked",
        "user.password_changed",
        "user.password_reset",
        "user.roles_changed",
        "user.deactivated",
        "user.reactivated",
        "user.deleted",
        "role.created",
        "role.updated",
        "role.deleted",
        "post.deleted_by_admin",
      ],
    },
    Locale: { enum: ["ko", "en"] },
    UserStatus: { enum: ["active", "deactivated", "deleted"] },
  });
});
