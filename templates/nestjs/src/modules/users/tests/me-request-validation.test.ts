import "reflect-metadata";
import { afterEach, expect, it } from "vitest";
import { testApp, mediaType, errorDocument } from "../../../core/http/tests/fixtures.js";
import { PRINCIPAL_RESOLVER } from "../../../core/security/principal.js";
import { MeService } from "../index.js";
import { fixture, principal, required } from "./fixtures.js";
const fixtures: ReturnType<typeof fixture>[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
});
async function setup() {
  const f = fixture();
  fixtures.push(f);
  const { app, http } = await testApp([], {
    providers: [
      { provide: PRINCIPAL_RESOLVER, useValue: { resolve: () => Promise.resolve(principal) } },
      { provide: MeService, useValue: f.service },
    ],
  });
  const target = app.get(MeService);
  for (const method of ["get", "update", "delete"] as const)
    target[method] = f.service[method].bind(f.service) as never;
  return { f, http };
}
it.each([
  {
    label: "id와 이름",
    data: { type: "users", id: "other", attributes: { name: "" } },
    expected: [
      ["409", "resource.conflict", "/data/id"],
      ["422", "validation.too_short", "/data/attributes/name"],
    ],
  },
  {
    label: "id와 이름과 로케일",
    data: { type: "users", id: "other", attributes: { name: "", locale: "ja" } },
    expected: [
      ["409", "resource.conflict", "/data/id"],
      ["422", "validation.too_short", "/data/attributes/name"],
      ["422", "validation.invalid_choice", "/data/attributes/locale"],
    ],
  },
  {
    label: "id와 type과 이름",
    data: { type: "posts", id: "other", attributes: { name: "" } },
    expected: [
      ["409", "resource.conflict", "/data/id"],
      ["409", "resource.conflict", "/data/type"],
      ["422", "validation.too_short", "/data/attributes/name"],
    ],
  },
])("$label 혼합 오류는 모든 오류와 상위 400을 돌려준다", async ({ data, expected }) => {
  const { f, http } = await setup();
  const r = await http
    .patch("/api/v1/me")
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data });
  expect(r.status).toBe(400);
  const doc = errorDocument(r.text);
  expect(doc.errors.map((e) => [e.status, e.code, e.source?.pointer])).toEqual(expected);
  expect(doc.errors.every((e) => !Object.hasOwn(e.meta ?? {}, "traceId"))).toBe(true);
  expect(doc.meta.traceId).toMatch(/^[0-9a-f]{32}$/);
  expect(f.state.users[0]?.name).toBe("회원");
  expect(f.events).toEqual([]);
});
it("로그인하지 않은 혼합 오류 요청은 본문 검증보다 인증 401이 먼저다", async () => {
  const { http } = await setup();
  const r = await http
    .patch("/api/v1/me?unknown=1")
    .set("Content-Type", mediaType)
    .send({ data: { type: "users", id: "other", attributes: { name: "" } } });
  expect(r.status).toBe(401);
  expect(r.headers["www-authenticate"]).toBe("Bearer");
  expect(errorDocument(r.text).errors.map((e) => e.code)).toEqual(["auth.unauthenticated"]);
});
it("인증한 혼합 오류 요청은 본문 검증보다 쿼리 400이 먼저다", async () => {
  const { http } = await setup();
  const r = await http
    .patch("/api/v1/me?unknown=1")
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "users", id: "other", attributes: { name: "" } } });
  expect(r.status).toBe(400);
  expect(errorDocument(r.text).errors.map((e) => [e.code, e.source])).toEqual([
    ["jsonapi.invalid_query", { parameter: "unknown" }],
  ]);
});
it.each([600, 2])("탈퇴 HTTP의 재인증 challenge는 실제 %s초 창과 일치한다", async (seconds) => {
  const { f, http } = await setup();
  f.settings.RECENT_LOGIN_SECONDS = seconds;
  required(f.state.sessions[0]).authenticatedAt = new Date(Date.now() - (seconds + 1) * 1000);
  const r = await http.delete("/api/v1/me").set("Authorization", "Bearer fixture");
  expect(r.status).toBe(401);
  expect(r.headers["www-authenticate"]).toBe(
    `Bearer error="insufficient_user_authentication", max_age=${String(seconds)}`,
  );
  const doc = errorDocument(r.text);
  expect(doc.errors[0]?.code).toBe("auth.reauthentication_required");
  expect(doc.meta.traceId).toMatch(/^[0-9a-f]{32}$/);
  expect(doc.errors[0]?.meta ?? {}).not.toHaveProperty("traceId");
  expect(f.state.users[0]?.status).toBe("active");
});
it("재인증 이외의 잘못된 세션 401은 bare Bearer를 유지한다", async () => {
  const { f, http } = await setup();
  required(f.state.sessions[0]).revokedAt = new Date();
  const r = await http.delete("/api/v1/me").set("Authorization", "Bearer fixture");
  expect(r.status).toBe(401);
  expect(r.headers["www-authenticate"]).toBe("Bearer");
  expect(errorDocument(r.text).errors[0]?.code).toBe("auth.token_invalid");
});
