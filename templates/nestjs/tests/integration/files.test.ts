import { expect, it } from "vitest";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { fileFixture, fileDocument, mediaType, errorCode } from "./file-fixture.js";
const bytes = Buffer.from("01234567890123456789012");
it("파일 생성과 서명 PUT과 완료와 GET은 같은 23바이트를 보존한다", async () => {
  const f = await fileFixture();
  const created = await f.create();
  expect(created.status).toBe(201);
  const pending = fileDocument(created.text);
  const upload = pending.data.meta?.upload;
  if (!upload) throw new Error("업로드 정보가 없다");
  expect(
    (await fetch(upload.url, { method: "PUT", headers: upload.headers, body: bytes })).status,
  ).toBe(200);
  const completed = await f.http
    .patch(`/api/v1/files/${pending.data.id}`)
    .set("Authorization", `Bearer ${f.token}`)
    .set("Content-Type", mediaType)
    .send({ data: { type: "files", id: pending.data.id, attributes: { status: "ready" } } });
  expect(completed.status).toBe(200);
  expect(fileDocument(completed.text).data.attributes.status).toBe("ready");
  const read = await f.http
    .get(`/api/v1/files/${pending.data.id}`)
    .set("Authorization", `Bearer ${f.token}`);
  expect(read.status).toBe(200);
  const ready = fileDocument(read.text);
  expect(ready.data.attributes).toEqual(fileDocument(completed.text).data.attributes);
  const download = await fetch(ready.data.meta?.downloadUrl ?? "");
  expect(download.status).toBe(200);
  expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
  expect((await f.http.get(`/api/v1/files/${pending.data.id}`)).status).toBe(404);
  const other = await f.unit.run((tx) =>
    tx.user.create({ data: { email: "other-files@example.com", name: "다른 회원" } }),
  );
  const { signAccessToken } = await import("../../src/core/security/jwt.js");
  const otherSession = await f.unit.run((tx) =>
    tx.session.create({
      data: {
        userId: other.id,
        authenticatedAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    }),
  );
  const otherToken = await signAccessToken(
    { userId: other.id, sessionId: otherSession.id },
    f.settings.JWT_SECRET,
  );
  expect(
    (
      await f.http
        .get(`/api/v1/files/${pending.data.id}`)
        .set("Authorization", `Bearer ${otherToken}`)
    ).status,
  ).toBe(404);
  expect(
    (
      await f.http
        .delete(`/api/v1/files/${pending.data.id}`)
        .set("Authorization", `Bearer ${f.token}`)
    ).status,
  ).toBe(204);
  expect(
    (await f.http.get(`/api/v1/files/${pending.data.id}`).set("Authorization", `Bearer ${f.token}`))
      .status,
  ).toBe(404);
  const key = [...f.keys][0];
  await expect(
    f.clients.internal.send(new HeadObjectCommand({ Bucket: f.settings.S3_BUCKET, Key: key })),
  ).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
});
it.each([
  {
    name: "크기",
    headers: { "Content-Type": "image/png" },
    body: Buffer.from("012345678901234567890123"),
  },
  { name: "타입", headers: { "Content-Type": "text/plain" }, body: bytes },
])("선언과 다른 $name PUT은 서명이 거절되어 객체가 없다", async ({ headers, body }) => {
  const f = await fileFixture();
  const response = await f.create();
  expect(response.status).toBe(201);
  const pending = fileDocument(response.text);
  const upload = pending.data.meta?.upload;
  if (!upload) throw new Error("업로드 정보가 없다");
  const rejected = await fetch(upload.url, { method: "PUT", headers, body });
  expect(rejected.status).toBe(403);
  expect(await rejected.text()).toContain("SignatureDoesNotMatch");
  const key = [...f.keys][0];
  await expect(
    f.clients.internal.send(new HeadObjectCommand({ Bucket: f.settings.S3_BUCKET, Key: key })),
  ).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
  const completed = await f.http
    .patch(`/api/v1/files/${pending.data.id}`)
    .set("Authorization", `Bearer ${f.token}`)
    .set("Content-Type", mediaType)
    .send({ data: { type: "files", id: pending.data.id, attributes: { status: "ready" } } });
  expect(completed.status).toBe(422);
  expect(errorCode(completed.text)).toBe("file.upload_incomplete");
});
