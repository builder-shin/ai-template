import request from "supertest";
import type { Response } from "express";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createSampleApp, testAuthenticator } from "./sample.js";
import { createApp } from "../../../main.js";
import { ApiError } from "../errors.js";
import { JSONAPI_MEDIA_TYPE as media } from "../render.js";
import { MAX_BODY_BYTES } from "../body.js";
let app: INestApplication;
beforeAll(async () => {
  app = await createSampleApp();
});
afterAll(async () => {
  await app.close();
});
const valid = { data: { type: "posts", attributes: { title: "Title", body: "Body" } } };
function api() {
  return request(app.getHttpServer() as Parameters<typeof request>[0]);
}
it("serves real permission page two, total eight and contract example links", async () => {
  const production = await createApp({ authenticator: testAuthenticator });
  production.useLogger(false);
  await production.init();
  try {
    const r = await request(production.getHttpServer() as Parameters<typeof request>[0])
      .get("/api/v1/permissions?page%5Bsize%5D=3&page%5Bnumber%5D=2")
      .set("Authorization", "Bearer good")
      .expect(200)
      .expect("Content-Type", media);
    expect(r.body as unknown).toMatchObject({
      data: [{ id: "posts:manage" }, { id: "roles:manage" }, { id: "roles:read" }],
      meta: { page: { number: 2, size: 3, total: 8, totalPages: 3 } },
      links: {
        first: "/api/v1/permissions?page%5Bsize%5D=3&page%5Bnumber%5D=1",
        last: "/api/v1/permissions?page%5Bsize%5D=3&page%5Bnumber%5D=3",
        prev: "/api/v1/permissions?page%5Bsize%5D=3&page%5Bnumber%5D=1",
        next: "/api/v1/permissions?page%5Bsize%5D=3&page%5Bnumber%5D=3",
      },
    });
    await request(production.getHttpServer() as Parameters<typeof request>[0])
      .get("/api/v1/posts")
      .expect(404);
  } finally {
    await production.close();
  }
});
it("includes full linkage once and projects sparse fields without mutating source", async () => {
  const r = await api()
    .get(
      "/api/v1/sample?include=author.avatar,coverImage,author.avatar&fields[posts]=title,author&fields[users]=avatar&sort=-title,title&filter[q]=a+b&page[size]=3&page[number]=2",
    )
    .expect(200);
  expect(r.body as unknown).toMatchObject({
    data: [
      { attributes: { title: "Title" }, relationships: { author: { data: { id: "author" } } } },
    ],
    included: [
      {
        type: "users",
        id: "author",
        attributes: {},
        relationships: { avatar: { data: { id: "file" } } },
      },
      { type: "files", id: "file" },
    ],
    links: {
      first:
        "/api/v1/sample?include=author.avatar%2CcoverImage%2Cauthor.avatar&fields%5Bposts%5D=title%2Cauthor&fields%5Busers%5D=avatar&sort=-title%2Ctitle&filter%5Bq%5D=a+b&page%5Bsize%5D=3&page%5Bnumber%5D=1",
    },
  });
  const full = await api().get("/api/v1/sample");
  expect(full.body as unknown).toMatchObject({ data: [{ attributes: { body: "Body" } }] });
});
it.each([
  ["?include=author,,coverImage", "jsonapi.invalid_query", "include"],
  ["?include=bad", "jsonapi.unsupported_include", "include"],
  ["?include=author&include=coverImage", "jsonapi.invalid_query", "include"],
  ["?sort=bad", "jsonapi.unsupported_sort", "sort"],
  ["?filter[created_from]=x", "jsonapi.invalid_query", "filter[created_from]"],
  ["?filter[createdFrom]=2026-10-11T12:00:00", "jsonapi.invalid_query", "filter[createdFrom]"],
  ["?filter[status=draft", "jsonapi.invalid_query", "filter[status"],
  ["?page[size]=true", "jsonapi.invalid_query", "page[size]"],
  ["?page[size]=101", "jsonapi.invalid_query", "page[size]"],
  ["?page[number]=1.0", "jsonapi.invalid_query", "page[number]"],
])("rejects raw query %s with a parameter source", async (query, code, parameter) => {
  const r = await api().get(`/api/v1/sample${query}`).expect(400).expect("Content-Type", media);
  expect(r.body as unknown).toMatchObject({ errors: [{ code, source: { parameter } }] });
});
it.each([
  [
    "media beats length",
    undefined,
    "application/json",
    "x".repeat(MAX_BODY_BYTES + 1),
    "?bad=1",
    415,
    "jsonapi.unsupported_media_type",
  ],
  [
    "accept beats length",
    "Bearer good",
    media,
    "x".repeat(MAX_BODY_BYTES + 1),
    "",
    406,
    "jsonapi.not_acceptable",
  ],
  [
    "length beats authentication",
    undefined,
    media,
    "x".repeat(MAX_BODY_BYTES + 1),
    "?bad=1",
    413,
    "jsonapi.content_too_large",
  ],
  ["JSON beats authentication", undefined, media, "{", "?bad=1", 400, "jsonapi.invalid_document"],
  [
    "authentication beats query",
    undefined,
    media,
    JSON.stringify(valid),
    "?bad=1",
    401,
    "auth.unauthenticated",
  ],
  ["query beats body", "Bearer good", media, "{}", "?bad=1", 400, "jsonapi.invalid_query"],
  ["validation beats strict rate", "Bearer good", media, "{}", "", 400, "jsonapi.invalid_document"],
  [
    "strict rate beats domain",
    "Bearer good",
    media,
    JSON.stringify(valid),
    "",
    429,
    "rate_limit.exceeded",
  ],
] as const)("priority: %s", async (label, auth, content, body, query, status, code) => {
  let pending = api().post(`/api/v1/posts${query}`).set("Content-Type", content).send(body);
  if (auth) pending = pending.set("Authorization", auth);
  pending = pending.set("Connection", "keep-alive");
  if (label.startsWith("accept")) pending = pending.set("Accept", `${media}; ext=x`);
  const r = await pending.expect(status).expect("Content-Type", media);
  expect(r.body as unknown).toMatchObject({ errors: [{ code }] });
  if (status === 401) expect(r.headers["www-authenticate"]).toBe("Bearer");
  if (status === 429) expect(r.headers["retry-after"]).toBe("2");
});
it("global port rate limit wins over negotiation", async () => {
  const limited = await createSampleApp({
    globalRateLimit: () => {
      throw new ApiError(429, "rate_limit.exceeded", undefined, {
        headers: { "Retry-After": "3" },
      });
    },
  });
  try {
    await request(limited.getHttpServer() as Parameters<typeof request>[0])
      .post("/api/v1/posts")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(429)
      .expect("Retry-After", "3")
      .expect("Content-Type", media);
  } finally {
    await limited.close();
  }
});
it("aggregates invalid path 404 and field 422 into HTTP 400 with both errors", async () => {
  const r = await api()
    .patch("/api/v1/posts/bad")
    .set("Authorization", "Bearer good")
    .set("Content-Type", media)
    .send({ data: { type: "posts", id: "bad", attributes: { title: "" } } })
    .expect(400);
  expect(r.body as unknown).toMatchObject({
    errors: [
      { status: "404", code: "resource.not_found" },
      {
        status: "422",
        code: "validation.too_short",
        source: { pointer: "/data/attributes/title" },
        meta: { params: { min: 1 } },
      },
    ],
  });
});
it("returns domain conflict after all request checks and strips Allow", async () => {
  await api()
    .patch("/api/v1/posts/00000000-0000-0000-0000-000000000001")
    .set("Authorization", "Bearer good")
    .set("Content-Type", media)
    .send({ data: { type: "posts", id: "00000000-0000-0000-0000-000000000001" } })
    .expect(409);
  const r = await api().delete("/api/v1/sample").expect(404);
  expect(r.headers.allow).toBeUndefined();
});
it("renders unpaired surrogate details as lowercase escapes", async () => {
  const r = await api().get("/api/v1/sample?include=%ED%A0%80").expect(400);
  expect(r.headers["content-type"]).toBe(media);
  const { writeDocument } = await import("../render.js");
  const chunks: Buffer[] = [];
  const fake = { status: () => fake, set: () => fake, end: (chunk: Buffer) => chunks.push(chunk) };
  writeDocument(fake as unknown as Response, 422, { errors: [{ detail: "a\uD800b\uDCFF" }] });
  expect(Buffer.concat(chunks).toString()).toContain("a\\ud800b\\udcff");
});
