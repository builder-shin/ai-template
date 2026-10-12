import { request as httpRequest } from "node:http";
import { gzipSync } from "node:zlib";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSampleApp } from "./sample.js";
import { MAX_BODY_BYTES } from "../body.js";
import { JSONAPI_MEDIA_TYPE as media } from "../render.js";
let app: INestApplication;
let baseUrl: string;
beforeAll(async () => {
  app = await createSampleApp();
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
});
afterAll(async () => {
  await app.close();
});
function raw(chunks: Buffer[], extraHeaders: Record<string, string> = {}) {
  return new Promise<{
    status: number | undefined;
    headers: Record<string, unknown>;
    text: string;
  }>((ok, fail) => {
    const req = httpRequest(
      `${baseUrl}/api/v1/registrations`,
      { method: "POST", headers: { "Content-Type": media, ...extraHeaders } },
      (res) => {
        const output: Buffer[] = [];
        res.on("data", (v: Buffer) => output.push(v));
        res.on("error", fail);
        res.on("end", () => {
          ok({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(output).toString(),
          });
        });
      },
    );
    req.on("error", fail);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}
it("counts chunked bytes and accepts exactly the limit before document validation", async () => {
  const allowed = await raw([Buffer.from("{}"), Buffer.alloc(MAX_BODY_BYTES - 2, 32)]);
  expect(allowed.status).toBe(400);
  expect(allowed.text).toContain("jsonapi.invalid_document");
  const excess = await raw([Buffer.alloc(MAX_BODY_BYTES, 32), Buffer.from("x")]);
  expect(excess.status).toBe(413);
  expect(excess.headers["content-type"]).toBe(media);
  expect(excess.text).toContain("jsonapi.content_too_large");
});
it("rejects invalid UTF-8 and compressed JSON without decompressing", async () => {
  const invalid = await raw([Buffer.from([0x22, 0xc3, 0x28, 0x22])]);
  const compressed = await raw([gzipSync(Buffer.from("{}"))], { "Content-Encoding": "gzip" });
  for (const result of [invalid, compressed]) {
    expect(result.status).toBe(400);
    expect(result.text).toContain("jsonapi.invalid_document");
    expect(result.headers["content-type"]).toBe(media);
  }
});
it.each(["1", true, 1.5, 0])(
  "validates authenticated numeric size %s rather than coercing",
  async (size) => {
    const result = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post("/api/v1/files")
      .set("Authorization", "Bearer good")
      .set("Content-Type", media)
      .send({
        data: { type: "files", attributes: { filename: "x", contentType: "image/png", size } },
      })
      .expect(422);
    expect(result.body as unknown).toMatchObject({
      errors: [{ source: { pointer: "/data/attributes/size" } }],
    });
  },
);
it("renders an actual HTTP error with lowercase unpaired-surrogate escapes", async () => {
  const result = await request(app.getHttpServer() as Parameters<typeof request>[0])
    .get("/api/v1/sample-detail")
    .expect(422)
    .expect("Content-Type", media);
  expect(result.text).toContain("a\\ud800b\\udcff");
});
it("permission denial precedes invalid query and body", async () => {
  const denied = await createSampleApp({
    authenticator: { authenticate: () => Promise.resolve({ id: "limited", permissions: [] }) },
  });
  try {
    const result = await request(denied.getHttpServer() as Parameters<typeof request>[0])
      .post("/api/v1/posts?bad=1")
      .set("Content-Type", media)
      .send("{}")
      .expect(403);
    expect(result.body as unknown).toMatchObject({ errors: [{ code: "permission.denied" }] });
  } finally {
    await denied.close();
  }
});
it("permits profile and wildcard negotiation but rejects charset on every API path", async () => {
  await request(app.getHttpServer() as Parameters<typeof request>[0])
    .get("/api/v1/sample")
    .set("Accept", "*/*")
    .expect(200);
  await request(app.getHttpServer() as Parameters<typeof request>[0])
    .post("/api/v1/registrations")
    .set("Content-Type", `${media};profile="https://example.test/profile"`)
    .send("{}")
    .expect(400);
  await request(app.getHttpServer() as Parameters<typeof request>[0])
    .post("/api/v1/no-route")
    .set("Content-Type", `${media};charset=utf-8`)
    .send("{}")
    .expect(415);
});
