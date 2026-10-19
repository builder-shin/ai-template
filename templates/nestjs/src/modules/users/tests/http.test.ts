import "reflect-metadata";
import { afterEach, expect, it } from "vitest";
import { testApp, mediaType, errorDocument } from "../../../core/http/tests/fixtures.js";
import { PRINCIPAL_RESOLVER } from "../../../core/security/principal.js";
import { MeService } from "../index.js";
import { FilesService } from "../../files/index.js";
import { required, fixture, principal, userId, fileId } from "./fixtures.js";
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
  const targetFiles = app.get(FilesService);
  for (const method of ["get", "load"] as const)
    targetFiles[method] = f.files[method].bind(f.files) as never;
  return { f, http };
}
it("내 정보 라우트는 로그인하지 않으면 401이다", async () => {
  const { http } = await testApp([]);
  const r = await http.get("/api/v1/me");
  expect(r.status).toBe(401);
  expect(errorDocument(r.text).errors[0]?.code).toBe("auth.unauthenticated");
});
it("내 정보는 역할 include와 희소 필드를 적용하고 권한 meta를 보존한다", async () => {
  const { http } = await setup();
  const r = await http
    .get("/api/v1/me?include=roles&fields[users]=name,roles&fields[roles]=name")
    .set("Authorization", "Bearer fixture");
  expect(r.status).toBe(200);
  expect(JSON.parse(r.text) as unknown).toMatchObject({
    data: { attributes: { name: "회원" } },
    included: [{ type: "roles", attributes: { name: "member" } }],
    meta: { permissions: ["posts:create"] },
  });
  const doc = JSON.parse(r.text) as {
    data: { attributes: object };
    included: { attributes: object }[];
  };
  expect(Object.keys(doc.data.attributes)).toEqual(["name"]);
  expect(Object.keys(required(doc.included[0]).attributes)).toEqual(["name"]);
  const names = await http
    .get("/api/v1/me?fields[users]=name")
    .set("Authorization", "Bearer fixture");
  expect(names.status).toBe(200);
  expect(JSON.parse(names.text) as unknown).toHaveProperty("data.relationships", {});
});
it("내 아바타 include는 다운로드 URL을 돌려주고 공개 조회도 허용한다", async () => {
  const { http, f } = await setup();
  required(f.state.users[0]).avatarFileId = fileId;
  const r = await http.get("/api/v1/me?include=avatar").set("Authorization", "Bearer fixture");
  expect(r.status).toBe(200);
  expect(JSON.parse(r.text) as unknown).toMatchObject({
    included: [
      {
        type: "files",
        id: fileId,
        meta: { downloadUrl: expect.stringContaining("https://assets.example.test/") as unknown },
      },
    ],
  });
  const publicRead = await http.get("/api/v1/files/" + fileId);
  expect(publicRead.status).toBe(200);
});
it.each([
  { attributes: { name: "" }, status: 422, code: "validation.too_short" },
  { attributes: { name: "가".repeat(101) }, status: 422, code: "validation.too_long" },
  { attributes: { locale: "ja" }, status: 422, code: "validation.invalid_choice" },
])("프로필의 $code 오류는 $status 응답이다", async ({ attributes, status, code }) => {
  const { http, f } = await setup();
  const r = await http
    .patch("/api/v1/me")
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "users", id: userId, attributes } });
  expect(r.status).toBe(status);
  expect(errorDocument(r.text).errors[0]?.code).toBe(code);
  expect(f.state.users[0]?.name).toBe("회원");
});
it("PATCH의 다른 id는 409와 data.id 포인터다", async () => {
  const { http } = await setup();
  const r = await http
    .patch("/api/v1/me")
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "users", id: "\ud800", attributes: { name: "남" } } });
  expect(r.status).toBe(409);
  expect(errorDocument(r.text).errors[0]).toMatchObject({
    code: "resource.conflict",
    source: { pointer: "/data/id" },
  });
});
it("이름의 길이는 유니코드 코드 포인트로 센다", async () => {
  const { http } = await setup();
  const r = await http
    .patch("/api/v1/me")
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "users", id: userId, attributes: { name: "🐋".repeat(100) } } });
  expect(r.status).toBe(200);
  expect(JSON.parse(r.text) as unknown).toMatchObject({
    data: { attributes: { name: "🐋".repeat(100) } },
  });
});
it("탈퇴 라우트는 204와 빈 본문을 돌려준다", async () => {
  const { http, f } = await setup();
  required(f.state.sessions[0]).authenticatedAt = new Date();
  const r = await http.delete("/api/v1/me").set("Authorization", "Bearer fixture");
  expect(r.status).toBe(204);
  expect(r.text).toBe("");
  expect(r.headers["content-type"]).toBeUndefined();
  expect(f.state.users[0]?.status).toBe("deleted");
});

it("계약 밖의 속성은 개인정보를 바꾸지 않고 무시한다", async () => {
  const { http, f } = await setup();
  const r = await http
    .patch("/api/v1/me")
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "users", id: userId, attributes: { email: "hijack@example.test" } } });
  expect(r.status).toBe(200);
  expect(f.state.users[0]?.email).toBe("me@example.test");
  expect(f.events).toEqual([]);
});
