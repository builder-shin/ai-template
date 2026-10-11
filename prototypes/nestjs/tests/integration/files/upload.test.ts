import { expect, it } from "vitest";
import { api, db, codes, settings } from "../helpers.js";
import {
  domainSuite,
  actor,
  createFile,
  complete,
  uploaded,
  createPost,
  changePost,
  postData,
  app,
} from "../domain-helpers.js";
import { FileDocument } from "../../../src/modules/files/index.js";
import { Storage } from "../../../src/core/storage/client.js";
import { mkdirSync, writeFileSync } from "node:fs";
domainSuite("files-upload");
it("uploads, completes, downloads exact bytes and signs public endpoint with 15/10-minute expiries", async () => {
  const owner = await actor(),
    bytes = Buffer.from([1, 2, 3, 4]);
  const created = await createFile(owner.authorization);
  expect(created.status).toBe(201);
  const pending = FileDocument.parse(created.body).data;
  expect(pending.attributes.status).toBe("pending");
  expect(pending.meta?.downloadUrl).toBeUndefined();
  expect(pending.relationships.owner.data).toEqual({ type: "users", id: owner.user.id });
  const upload = pending.meta?.upload;
  if (!upload) throw new Error("Missing upload request.");
  expect(new URL(upload.url).searchParams.get("X-Amz-SignedHeaders")).toBe(
    "content-length;content-type;host",
  );
  expect(new URL(upload.url).searchParams.get("X-Amz-Expires")).toBe("900");
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: { ...upload.headers, "Content-Length": String(bytes.length) },
    body: bytes,
  });
  expect(put.ok, await put.text()).toBe(true);
  const completed = await complete(owner.authorization, pending.id);
  expect(completed.status).toBe(200);
  const ready = FileDocument.parse(completed.body).data;
  expect(ready.attributes.status).toBe("ready");
  expect(ready.meta?.upload).toBeUndefined();
  if (!ready.meta?.downloadUrl) throw new Error("Missing download URL.");
  expect(new URL(ready.meta.downloadUrl).searchParams.get("X-Amz-Expires")).toBe("600");
  const downloaded = await fetch(ready.meta.downloadUrl);
  expect(downloaded.ok).toBe(true);
  expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(bytes);
  expect((await complete(owner.authorization, pending.id)).status).toBe(200);
});
it("requires actual Seaweed rejection of correctly transmitted signed +1-byte length and changed type; completion remains422", async () => {
  const owner = await actor(),
    storage = app.get(Storage);
  const created = await createFile(owner.authorization, 4);
  expect(created.status).toBe(201);
  const file = FileDocument.parse(created.body).data,
    upload = file.meta?.upload;
  if (!upload) throw new Error("Missing upload request.");
  const body = Buffer.alloc(5, 7);
  // The transmitted header matches the transmitted body; a local fetch mismatch is not acceptance evidence.
  const put = await fetch(upload.url, {
    method: "PUT",
    headers: { ...upload.headers, "Content-Length": String(body.length) },
    body,
  });
  const responseBody = await put.text(),
    objectSize = await storage.size(`files/${file.id}`);
  const observation = {
    signedSize: 4,
    transmittedBytes: body.length,
    transmittedContentLength: body.length,
    responseStatus: put.status,
    responseBody,
    objectSize,
  };
  mkdirSync(".cache/integration", { recursive: true });
  writeFileSync(".cache/integration/tampered-put.json", JSON.stringify(observation, null, 2));
  console.log(JSON.stringify({ tamperedPut: observation }));
  if (put.ok)
    throw new Error(
      "STOP: SeaweedFS accepted a correctly transmitted PUT with a changed signed content-length; coordinator must decide an alternative.",
    );
  expect(put.status).toBe(403);
  expect(responseBody).toContain("SignatureDoesNotMatch");
  expect(objectSize).toBeNull();
  const typePut = await fetch(upload.url, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg", "Content-Length": "4" },
    body: Buffer.alloc(4),
  });
  expect(typePut.status, await typePut.text()).toBe(403);
  const finished = await complete(owner.authorization, file.id);
  expect(finished.status).toBe(422);
  expect(codes(finished)).toEqual(["file.upload_incomplete"]);
});
it("checks size then type, records numeric limits, and deletes mismatched existing objects on completion", async () => {
  const owner = await actor();
  const huge = await createFile(owner.authorization, 10 ** 12, "application/pdf");
  expect(huge.status).toBe(422);
  expect(codes(huge)).toEqual(["file.too_large"]);
  expect(huge.body).toMatchObject({
    errors: [
      {
        source: { pointer: "/data/attributes/size" },
        meta: { params: { max: settings.FILE_MAX_SIZE } },
      },
    ],
  });
  const pdf = await createFile(owner.authorization, 10, "application/pdf");
  expect(pdf.status).toBe(422);
  expect(codes(pdf)).toEqual(["file.type_not_allowed"]);
  const pending = FileDocument.parse((await createFile(owner.authorization, 4)).body).data;
  const storage = app.get(Storage);
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  await storage.client.send(
    new PutObjectCommand({
      Bucket: storage.settings.S3_BUCKET,
      Key: storage.key(`files/${pending.id}`),
      Body: Buffer.alloc(5),
    }),
  );
  expect(await storage.size(`files/${pending.id}`)).toBe(5);
  const finished = await complete(owner.authorization, pending.id);
  expect(finished.status).toBe(422);
  expect(codes(finished)).toEqual(["file.upload_incomplete"]);
  expect(await storage.size(`files/${pending.id}`)).toBeNull();
  expect((await db.file.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("pending");
});
it("distinguishes owner, visible nonowner403 and hidden nonowner404; anonymous reads only published covers", async () => {
  const owner = await actor(),
    other = await actor("other@example.com");
  const file = await uploaded(owner.authorization);
  for (const authorization of [undefined, other.authorization]) {
    const get = api().get(`/api/v1/files/${file.id}`);
    if (authorization) get.set("Authorization", authorization);
    expect((await get).status).toBe(404);
  }
  expect((await complete(other.authorization, file.id, {})).status).toBe(404);
  const draft = postData(
    await createPost(owner.authorization, { title: "Cover", body: "Body" }, file.id),
  );
  expect((await api().get(`/api/v1/files/${file.id}`)).status).toBe(404);
  expect((await changePost(owner.authorization, draft.id, { status: "published" })).status).toBe(
    200,
  );
  expect((await api().get(`/api/v1/files/${file.id}`)).status).toBe(200);
  expect((await complete(other.authorization, file.id, {})).status).toBe(403);
  expect(
    (await api().delete(`/api/v1/files/${file.id}`).set("Authorization", other.authorization))
      .status,
  ).toBe(403);
  expect(
    (await api().delete(`/api/v1/files/${file.id}`).set("Authorization", owner.authorization))
      .status,
  ).toBe(204);
  expect((await db.post.findUniqueOrThrow({ where: { id: draft.id } })).coverImageId).toBeNull();
  expect(
    (await api().get(`/api/v1/files/${file.id}`).set("Authorization", owner.authorization)).status,
  ).toBe(404);
  expect(await app.get(Storage).size(`files/${file.id}`)).toBeNull();
});
