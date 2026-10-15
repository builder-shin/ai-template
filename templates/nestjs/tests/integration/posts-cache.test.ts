import { expect, it } from "vitest";
import { adminFixture, collection, resourceDocument } from "./admin-fixture.js";
import { RedisClients } from "../../src/core/redis/clients.js";
it("발행과 취소와 삭제가 Valkey 공개 첫 페이지에 바로 드러난다", async () => {
  const f = await adminFixture();
  const publicList = () => f.http.get("/api/v1/posts");
  expect(collection((await publicList()).text).data).toEqual([]);
  const created = await f.post("posts", { title: "캐시 글", body: "본문" });
  expect(created.status).toBe(201);
  const id = resourceDocument(created.text).data.id;
  expect((await f.patch("posts", id, { attributes: { status: "published" } })).status).toBe(200);
  expect(collection((await publicList()).text).data.map((p) => p.id)).toEqual([id]);
  expect((await f.patch("posts", id, { attributes: { status: "draft" } })).status).toBe(200);
  expect(collection((await publicList()).text).data).toEqual([]);
  expect((await f.patch("posts", id, { attributes: { status: "published" } })).status).toBe(200);
  expect(collection((await publicList()).text).data.map((p) => p.id)).toEqual([id]);
  expect(
    (await f.http.delete("/api/v1/posts/" + id).set("Authorization", "Bearer " + f.token)).status,
  ).toBe(204);
  expect(collection((await publicList()).text).data).toEqual([]);
});
it("실제 캐시 연결을 끊어도 DB 목록은 응답한다", async () => {
  const f = await adminFixture();
  expect(
    (await f.post("posts", { title: "연결 없는 글", body: "본문", status: "published" })).status,
  ).toBe(201);
  f.app.get(RedisClients).command.disconnect();
  const response = await f.http.get("/api/v1/posts");
  expect(response.status).toBe(200);
  expect(collection(response.text).data[0]?.attributes.title).toBe("연결 없는 글");
});
