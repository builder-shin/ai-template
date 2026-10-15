import { expect, it } from "vitest";
import { adminFixture, resourceDocument } from "./admin-fixture.js";
import { mediaType, errorCode } from "./session-fixture.js";
import { fileFixture, fileDocument } from "./file-fixture.js";
it("실제 글 API는 저자·회원·관리자·익명의 읽기와 수정과 삭제를 구분한다", async () => {
  const f = await adminFixture(),
    author = await f.addUser("member"),
    member = await f.addUser("member");
  for (const status of ["draft", "published"]) {
    for (const action of ["read", "update", "delete"] as const) {
      for (const who of ["anonymous", "author", "member", "manager"] as const) {
        const created = await f.post(
          "posts",
          { title: "권한 글", body: "본문", status },
          author.session.attributes.accessToken,
        );
        expect(created.status).toBe(201);
        const id = resourceDocument(created.text).data.id;
        const token =
          who === "author"
            ? author.session.attributes.accessToken
            : who === "member"
              ? member.session.attributes.accessToken
              : who === "manager"
                ? f.token
                : undefined;
        const path = "/api/v1/posts/" + id;
        const r =
          action === "read"
            ? f.http.get(path)
            : action === "delete"
              ? f.http.delete(path)
              : f.http
                  .patch(path)
                  .set("Content-Type", mediaType)
                  .send({ data: { type: "posts", id, attributes: { title: "수정" } } });
        if (token) r.set("Authorization", "Bearer " + token);
        const response = await r;
        const allowed = who === "author" || who === "manager";
        const expected =
          action === "read"
            ? status === "published" || allowed
              ? 200
              : 404
            : who === "anonymous"
              ? 401
              : allowed
                ? action === "delete"
                  ? 204
                  : 200
                : status === "draft"
                  ? 404
                  : 403;
        expect(response.status, `${who}/${status}/${action}`).toBe(expected);
      }
    }
  }
});
it("실제 HTTP 본문은 100000 코드 포인트를 받고 100001을 거절한다", async () => {
  const f = await adminFixture();
  expect((await f.post("posts", { title: "경계", body: "🐋".repeat(100000) })).status).toBe(201);
  const long = await f.post("posts", { title: "경계", body: "🐋".repeat(100001) });
  expect(long.status).toBe(422);
  expect(errorCode(long.text)).toBe("validation.too_long");
});
it("완료한 표지는 발행 동안 공개되고 글 삭제 뒤 객체도 지워진다", async () => {
  const f = await fileFixture();
  const upload = await f.create(3);
  expect(upload.status).toBe(201);
  const file = fileDocument(upload.text).data;
  const target = file.meta?.upload;
  if (!target) throw new Error("업로드 정보가 없다");
  expect(
    (
      await fetch(target.url, {
        method: "PUT",
        headers: target.headers,
        body: new Uint8Array([1, 2, 3]),
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await f.http
        .patch("/api/v1/files/" + file.id)
        .set("Authorization", "Bearer " + f.token)
        .set("Content-Type", mediaType)
        .send({ data: { type: "files", id: file.id, attributes: { status: "ready" } } })
    ).status,
  ).toBe(200);
  const created = await f.http
    .post("/api/v1/posts")
    .set("Authorization", "Bearer " + f.token)
    .set("Content-Type", mediaType)
    .send({
      data: {
        type: "posts",
        attributes: { title: "표지 글", body: "본문", status: "published" },
        relationships: { coverImage: { data: { type: "files", id: file.id } } },
      },
    });
  expect(created.status).toBe(201);
  const publicFile = await f.http.get("/api/v1/files/" + file.id);
  expect(publicFile.status).toBe(200);
  const download = fileDocument(publicFile.text).data.meta?.downloadUrl;
  if (!download) throw new Error("다운로드 주소가 없다");
  expect((await fetch(download)).status).toBe(200);
  const id = resourceDocument(created.text).data.id;
  expect(
    (await f.http.delete("/api/v1/posts/" + id).set("Authorization", "Bearer " + f.token)).status,
  ).toBe(204);
  expect((await fetch(download)).status).toBe(404);
  expect((await f.http.get("/api/v1/files/" + file.id)).status).toBe(404);
});
