import "reflect-metadata";
import { afterEach, expect, it } from "vitest";
import { testApp, mediaType, errorDocument } from "../../../core/http/tests/fixtures.js";
import { PRINCIPAL_RESOLVER, type Principal } from "../../../core/security/principal.js";
import { PostsService } from "../index.js";
import { FilesService } from "../../files/index.js";
import { fixture, post, author, member, fileId } from "./fixtures.js";
const owned: ReturnType<typeof fixture>[] = [];
afterEach(() => {
  for (const f of owned.splice(0)) f.close();
});
async function setup(viewer: Principal | undefined = author, initial = [post()]) {
  const f = fixture(initial);
  owned.push(f);
  const { app, http } = await testApp([], {
    providers: [
      { provide: PRINCIPAL_RESOLVER, useValue: { resolve: () => Promise.resolve(viewer) } },
      { provide: PostsService, useValue: f.service },
    ],
  });
  const target = app.get(PostsService);
  for (const method of ["list", "get", "create", "update", "delete"] as const)
    target[method] = f.service[method].bind(f.service) as never;
  app.get(FilesService).get = f.files.get.bind(f.files);
  return { f, http };
}
it("생성·수정·단건·삭제 HTTP 흐름은 리소스 문서와 204를 돌려준다", async () => {
  const { http } = await setup();
  const created = await http
    .post("/api/v1/posts")
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "posts", attributes: { title: "새 글", body: "본문" } } });
  expect(created.status).toBe(201);
  const id = (JSON.parse(created.text) as { data: { id: string } }).data.id;
  expect(
    (
      await http
        .patch("/api/v1/posts/" + id)
        .set("Authorization", "Bearer fixture")
        .set("Content-Type", mediaType)
        .send({ data: { type: "posts", id, attributes: { status: "published" } } })
    ).status,
  ).toBe(200);
  expect((await http.get("/api/v1/posts/" + id + "?fields[posts]=title")).status).toBe(200);
  const removed = await http.delete("/api/v1/posts/" + id).set("Authorization", "Bearer fixture");
  expect(removed.status).toBe(204);
  expect(removed.text).toBe("");
});
it.each([
  { label: "include", search: "include=secret", code: "jsonapi.unsupported_include" },
  { label: "sort", search: "sort=body", code: "jsonapi.unsupported_sort" },
  { label: "filter", search: "filter[other]=x", code: "jsonapi.invalid_query" },
  { label: "fields", search: "fields[posts]=secret", code: "jsonapi.invalid_query" },
])("허용하지 않는 $label 쿼리는 400이다", async ({ search, code }) => {
  const { http } = await setup();
  const r = await http.get("/api/v1/posts?" + search);
  expect(r.status).toBe(400);
  expect(errorDocument(r.text).errors[0]?.code).toBe(code);
});
it.each([100000, 100001])("본문 %s 코드 포인트의 경계를 HTTP에서 검증한다", async (length) => {
  const { http } = await setup();
  const r = await http
    .post("/api/v1/posts")
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "posts", attributes: { title: "글", body: "🐋".repeat(length) } } });
  expect(r.status).toBe(length === 100000 ? 201 : 422);
  if (length > 100000)
    expect(errorDocument(r.text).errors[0]).toMatchObject({
      code: "validation.too_long",
      source: { pointer: "/data/attributes/body" },
    });
});
it("생성 권한이 없으면 403이고 익명 생성은 401이다", async () => {
  const absent = await setup({ ...member, permissions: new Set() });
  expect(
    (
      await absent.http
        .post("/api/v1/posts")
        .set("Authorization", "Bearer fixture")
        .set("Content-Type", mediaType)
        .send({ data: { type: "posts", attributes: { title: "글", body: "" } } })
    ).status,
  ).toBe(403);
  const anon = await testApp([]);
  expect(
    (
      await anon.http
        .post("/api/v1/posts")
        .set("Content-Type", mediaType)
        .send({ data: { type: "posts", attributes: { title: "글", body: "" } } })
    ).status,
  ).toBe(401);
});
it("공개 글의 표지만 익명 files GET에서 읽을 수 있다", async () => {
  const { http, f } = await setup(undefined, [post("published", { coverImageId: fileId })]);
  // setup의 기본 저자 대신 명시적으로 익명 해석을 쓰는 별도 앱을 만든다.
  const { app, http: anonymous } = await testApp([]);
  app.get(FilesService).get = f.files.get.bind(f.files);
  expect((await anonymous.get("/api/v1/files/" + fileId)).status).toBe(200);
  f.state.posts[0] = post("draft", { coverImageId: fileId });
  expect((await anonymous.get("/api/v1/files/" + fileId)).status).toBe(404);
  expect((await http.get("/api/v1/posts")).status).toBe(200);
});
