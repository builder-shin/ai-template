import "reflect-metadata";
import { afterEach, expect, it } from "vitest";
import { testApp, mediaType, errorDocument } from "../../../core/http/tests/fixtures.js";
import { PRINCIPAL_RESOLVER, type Principal } from "../../../core/security/principal.js";
import { UsersAdminService } from "../index.js";
import { RolesAdminService } from "../../roles/index.js";
import { AuditLogsService, AuditLogsRepository } from "../../audit-logs/index.js";
import { adminFixture, admin, uid, otherId, customId } from "./admin-fixture.js";
const fixtures: ReturnType<typeof adminFixture>[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
});
const routes = [
  ["GET", "/api/v1/users"],
  ["GET", "/api/v1/users/" + otherId],
  ["PATCH", "/api/v1/users/" + otherId],
  ["GET", "/api/v1/roles"],
  ["GET", "/api/v1/roles/" + customId],
  ["POST", "/api/v1/roles"],
  ["PATCH", "/api/v1/roles/" + customId],
  ["DELETE", "/api/v1/roles/" + customId],
  ["GET", "/api/v1/audit-logs"],
  ["GET", "/api/v1/audit-logs/" + uid],
] as const;
it.each(routes)("%s %s는 인증 없이 401이고 권한이 없으면 403이다", async (method, path) => {
  const { http } = await testApp([]);
  const request = (http: Awaited<ReturnType<typeof testApp>>["http"]) =>
    method === "PATCH"
      ? http.patch(path)
      : method === "POST"
        ? http.post(path)
        : method === "DELETE"
          ? http.delete(path)
          : http.get(path);
  expect((await request(http)).status).toBe(401);
  const limited = await testApp([], {
    providers: [
      {
        provide: PRINCIPAL_RESOLVER,
        useValue: { resolve: () => Promise.resolve({ ...admin, permissions: new Set() }) },
      },
    ],
  });
  const denied = await request(limited.http).set("Authorization", "Bearer fixture");
  expect(denied.status).toBe(403);
  expect(errorDocument(denied.text).errors[0]?.code).toBe("permission.denied");
});
async function setup(principal: Principal = admin) {
  const f = adminFixture();
  fixtures.push(f);
  const app = await testApp([], {
    providers: [
      { provide: PRINCIPAL_RESOLVER, useValue: { resolve: () => Promise.resolve(principal) } },
    ],
  });
  const users = new UsersAdminService(f.unit, f.users, f.roles, f.sessions, f.control, f.includes);
  const roles = new RolesAdminService(f.unit, f.roles, f.control);
  const audit = new AuditLogsService(f.unit, new AuditLogsRepository(), f.includes);
  for (const name of ["list", "get", "update"] as const)
    app.app.get(UsersAdminService)[name] = users[name].bind(users) as never;
  for (const name of ["list", "get", "create", "update", "delete"] as const)
    app.app.get(RolesAdminService)[name] = roles[name].bind(roles) as never;
  for (const name of ["list", "get"] as const)
    app.app.get(AuditLogsService)[name] = audit[name].bind(audit) as never;
  return { ...app, f };
}
it("사용자 GET의 roles include와 희소 필드는 계약 문서를 반환한다", async () => {
  const { http } = await setup();
  const r = await http
    .get("/api/v1/users/" + otherId + "?include=roles&fields[users]=name,roles&fields[roles]=name")
    .set("Authorization", "Bearer fixture");
  expect(r.status).toBe(200);
  const doc = JSON.parse(r.text) as unknown;
  expect(doc).toEqual({
    data: {
      type: "users",
      id: otherId,
      attributes: { name: "회원" },
      relationships: {
        roles: { data: [{ type: "roles", id: "01900000-0000-7000-8000-000000000004" }] },
      },
    },
    included: [
      { type: "roles", id: "01900000-0000-7000-8000-000000000004", attributes: { name: "member" } },
    ],
  });
});
it("사용자 PATCH의 URL과 본문 id가 다르면 409이다", async () => {
  const { http, f } = await setup();
  const r = await http
    .patch("/api/v1/users/" + otherId)
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "users", id: uid, attributes: { status: "deactivated" } } });
  expect(r.status).toBe(409);
  expect(errorDocument(r.text).errors[0]).toMatchObject({
    code: "resource.conflict",
    source: { pointer: "/data/id" },
  });
  expect(f.state.users[1]?.status).toBe("active");
});
it("관리 상태 deleted 요청은 422이고 역할 POST와 DELETE는 201과 빈 204이다", async () => {
  const { http } = await setup();
  const deleted = await http
    .patch("/api/v1/users/" + otherId)
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "users", id: otherId, attributes: { status: "deleted" } } });
  expect(deleted.status).toBe(422);
  const created = await http
    .post("/api/v1/roles")
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({
      data: { type: "roles", attributes: { name: "editor", permissions: ["posts:create"] } },
    });
  expect(created.status).toBe(201);
  const removed = await http
    .delete("/api/v1/roles/" + customId)
    .set("Authorization", "Bearer fixture");
  expect(removed.status).toBe(204);
  expect(removed.text).toBe("");
  expect(removed.headers["content-type"]).toBeUndefined();
});
it.each([
  ["/api/v1/users?filter[role]=bad", "jsonapi.invalid_query"],
  ["/api/v1/users?sort=status", "jsonapi.unsupported_sort"],
  ["/api/v1/audit-logs?filter[action]=role.unknown", "jsonapi.invalid_query"],
  ["/api/v1/audit-logs?filter[createdFrom]=2026-02-30T00:00:00Z", "jsonapi.invalid_query"],
  [
    "/api/v1/audit-logs?filter[createdFrom]=2026-10-16T00:00:00Z&filter[createdTo]=2026-10-15T00:00:00Z",
    "jsonapi.invalid_query",
  ],
  ["/api/v1/audit-logs?fields[users]=email", "jsonapi.invalid_query"],
])("조회 %s의 잘못된 질의는 400 %s다", async (path, code) => {
  const { http } = await setup();
  const r = await http.get(path).set("Authorization", "Bearer fixture");
  expect(r.status).toBe(400);
  expect(errorDocument(r.text).errors[0]?.code).toBe(code);
});
it("감사 HTTP 응답은 sessions 대상을 숨기고 metadata와 공개 actor를 보존한다", async () => {
  const { http, f } = await setup();
  f.state.audits.push({
    id: uid,
    action: "session.login_succeeded",
    targetType: "sessions",
    targetId: "s1",
    actorUserId: uid,
    identifierHash: "internal-only",
    meta: { method: "password" },
    createdAt: new Date("2026-10-15T00:00:00Z"),
  });
  const r = await http
    .get("/api/v1/audit-logs/" + uid + "?include=actor")
    .set("Authorization", "Bearer fixture");
  expect(r.status).toBe(200);
  const doc = JSON.parse(r.text) as unknown;
  expect(doc).toEqual({
    data: {
      type: "audit-logs",
      id: uid,
      attributes: {
        action: "session.login_succeeded",
        targetType: null,
        targetId: null,
        metadata: { method: "password" },
        ipAddress: null,
        createdAt: "2026-10-15T00:00:00.000Z",
      },
      relationships: { actor: { data: { type: "users", id: uid } } },
    },
    included: [
      {
        type: "users",
        id: uid,
        attributes: { name: "관리자" },
        relationships: { avatar: { data: null } },
      },
    ],
  });
  expect(JSON.stringify(doc)).not.toContain("internal-only");
});
it.each([
  [{ name: "", permissions: [] }, "validation.too_short"],
  [{ name: "가".repeat(51), permissions: [] }, "validation.too_long"],
  [{ name: "작가", description: "가".repeat(201), permissions: [] }, "validation.too_long"],
  [{ name: "작가", permissions: ["unknown"] }, "validation.invalid_choice"],
])("역할 생성 속성 %j는 422 %s다", async (attributes, code) => {
  const { http } = await setup();
  const r = await http
    .post("/api/v1/roles")
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "roles", attributes } });
  expect(r.status).toBe(422);
  expect(errorDocument(r.text).errors[0]?.code).toBe(code);
});
