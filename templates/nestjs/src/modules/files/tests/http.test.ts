import "reflect-metadata";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { testApp, mediaType, errorDocument } from "../../../core/http/tests/fixtures.js";
import { PRINCIPAL_RESOLVER } from "../../../core/security/principal.js";
import { FilesService } from "../index.js";
import { fixture, attributes, principal } from "./fixtures.js";
import { registerFileReadRule } from "../index.js";
const id = "01900000-0000-7000-8000-000000000001";
const fixtures: ReturnType<typeof fixture>[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
});
async function appFixture() {
  const f = fixture();
  fixtures.push(f);
  f.add({ id });
  const { app, http } = await testApp([], {
    providers: [
      { provide: PRINCIPAL_RESOLVER, useValue: { resolve: () => Promise.resolve(principal) } },
      { provide: FilesService, useValue: f.service },
    ],
  });
  const target = app.get(FilesService);
  vi.spyOn(target, "create").mockImplementation(f.service.create.bind(f.service));
  vi.spyOn(target, "get").mockImplementation(f.service.get.bind(f.service));
  vi.spyOn(target, "complete").mockImplementation(f.service.complete.bind(f.service));
  vi.spyOn(target, "delete").mockImplementation(f.service.delete.bind(f.service));
  return { app, http, f };
}
it("파일 생성 라우트는 201과 리소스 meta의 PUT 정보를 돌려준다", async () => {
  const { http } = await appFixture();
  const response = await http
    .post("/api/v1/files")
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "files", attributes } });
  expect(response.status).toBe(201);
  expect(JSON.parse(response.text) as unknown).toMatchObject({
    data: {
      type: "files",
      attributes: { status: "pending", size: 23 },
      meta: { upload: { method: "PUT", headers: { "Content-Type": "image/png" } } },
    },
  });
});
it("파일 조회는 희소 필드 요청을 적용한다", async () => {
  const { http } = await appFixture();
  const response = await http
    .get(`/api/v1/files/${id}?fields[files]=filename`)
    .set("Authorization", "Bearer fixture");
  expect(response.status).toBe(200);
  expect(JSON.parse(response.text) as unknown).toMatchObject({
    data: { attributes: { filename: "그림.png" } },
  });
  const doc = z
    .object({ data: z.object({ attributes: z.record(z.string(), z.unknown()) }) })
    .parse(JSON.parse(response.text) as unknown);
  expect(Object.keys(doc.data.attributes)).toEqual(["filename"]);
});
it("완료 상태를 보내면 객체 없는 파일은 422다", async () => {
  const { http } = await appFixture();
  const response = await http
    .patch(`/api/v1/files/${id}`)
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "files", id, attributes: { status: "ready" } } });
  expect(response.status).toBe(422);
  expect(errorDocument(response.text).errors[0]?.code).toBe("file.upload_incomplete");
});
it("속성이 없는 수정은 업로드 완료로 처리하지 않는다", async () => {
  const { http, f } = await appFixture();
  const response = await http
    .patch(`/api/v1/files/${id}`)
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "files", id } });
  expect(response.status).toBe(200);
  expect(f.files[0]?.status).toBe("pending");
  expect(f.events.some((event) => event.startsWith("head:"))).toBe(false);
});
it("파일 삭제 응답은 204와 빈 본문이다", async () => {
  const { http, f } = await appFixture();
  const response = await http.delete(`/api/v1/files/${id}`).set("Authorization", "Bearer fixture");
  expect(response.status).toBe(204);
  expect(response.text).toBe("");
  expect(f.files).toEqual([]);
});
it("파일 생성에는 인증이 필요하다", async () => {
  const { http } = await testApp([]);
  const response = await http
    .post("/api/v1/files")
    .set("Content-Type", mediaType)
    .send({ data: { type: "files", attributes } });
  expect(response.status).toBe(401);
  expect(response.headers["www-authenticate"]).toBe("Bearer");
});
it("읽기 규칙으로 보이는 남의 파일은 빈 수정도 403이다", async () => {
  const { http, f } = await appFixture();
  const record = f.files[0];
  if (!record) throw new Error("fixture 파일이 없다");
  record.ownerId = "u2";
  registerFileReadRule((_tx, _viewer, ids) =>
    Promise.resolve(new Set(ids.filter((candidate) => candidate === id))),
  );
  const response = await http
    .patch(`/api/v1/files/${id}`)
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", mediaType)
    .send({ data: { type: "files", id } });
  expect(response.status).toBe(403);
  expect(errorDocument(response.text).errors[0]?.code).toBe("permission.denied");
});
