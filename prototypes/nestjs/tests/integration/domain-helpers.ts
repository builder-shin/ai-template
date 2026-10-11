import { beforeAll, beforeEach, afterAll, afterEach, expect } from "vitest";
import type { Response } from "supertest";
import {
  app,
  api,
  start,
  reset,
  stop,
  verifiedAccount,
  login,
  tokens,
  testDurations,
} from "./helpers.js";
import { FileDocument } from "../../src/modules/files/index.js";
import { PostDocument } from "../../src/modules/posts/index.js";
export function domainSuite(name: string): void {
  let began = 0;
  beforeAll(() => start(name));
  beforeEach(async () => {
    began = performance.now();
    await reset();
  });
  afterEach((context) => {
    testDurations.push({ name: context.task.name, durationMs: performance.now() - began });
  });
  afterAll(stop);
}
export async function actor(email = "alice@example.com", admin = false) {
  const user = await verifiedAccount(email, "correct horse", admin); // betterleaks:allow - public test credential
  const signed = await login(email);
  expect(signed.status).toBe(201);
  return { user, authorization: `Bearer ${tokens(signed).accessToken}` };
}
export function createFile(authorization: string, size = 4, contentType = "image/png") {
  return api()
    .post("/api/v1/files")
    .set("Authorization", authorization)
    .set("Content-Type", "application/vnd.api+json")
    .send({ data: { type: "files", attributes: { filename: "x.png", contentType, size } } });
}
export function complete(
  authorization: string,
  id: string,
  attributes: object = { status: "ready" },
) {
  return api()
    .patch(`/api/v1/files/${id}`)
    .set("Authorization", authorization)
    .set("Content-Type", "application/vnd.api+json")
    .send({ data: { type: "files", id, attributes } });
}
export async function uploaded(authorization: string, bytes = Buffer.from([1, 2, 3, 4])) {
  const created = await createFile(authorization, bytes.length);
  expect(created.status).toBe(201);
  const pending = FileDocument.parse(created.body).data;
  if (!pending.meta?.upload) throw new Error("Missing upload request.");
  const put = await fetch(pending.meta.upload.url, {
    method: "PUT",
    headers: { ...pending.meta.upload.headers, "Content-Length": String(bytes.length) },
    body: bytes,
  });
  const body = await put.text();
  expect(put.ok, body).toBe(true);
  const finished = await complete(authorization, pending.id);
  expect(finished.status).toBe(200);
  return FileDocument.parse(finished.body).data;
}
export function createPost(
  authorization: string,
  attributes: object = { title: "Title", body: "Body" },
  coverId?: string,
) {
  return api()
    .post("/api/v1/posts")
    .set("Authorization", authorization)
    .set("Content-Type", "application/vnd.api+json")
    .send({
      data: {
        type: "posts",
        attributes,
        ...(coverId
          ? { relationships: { coverImage: { data: { type: "files", id: coverId } } } }
          : {}),
      },
    });
}
export function changePost(
  authorization: string,
  id: string,
  attributes: object = {},
  cover?: string | null,
) {
  return api()
    .patch(`/api/v1/posts/${id}`)
    .set("Authorization", authorization)
    .set("Content-Type", "application/vnd.api+json")
    .send({
      data: {
        type: "posts",
        id,
        attributes,
        ...(cover === undefined
          ? {}
          : {
              relationships: {
                coverImage: { data: cover === null ? null : { type: "files", id: cover } },
              },
            }),
      },
    });
}
export function postData(response: Response) {
  expect(response.status).toBeLessThan(300);
  return PostDocument.parse(response.body).data;
}
export { app };
