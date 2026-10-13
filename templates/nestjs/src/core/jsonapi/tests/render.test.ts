import express from "express";
import request from "supertest";
import { expect, it } from "vitest";
import { writeDocument } from "../render.js";

it("응답은 상태와 헤더를 유지하고 Buffer 바이트로 비 ASCII를 쓴다", async () => {
  const app = express();
  app.get("/", (_req, res) => {
    writeDocument(
      res,
      201,
      { data: { attributes: { text: "가😀\ud800" } } },
      { Location: "/api/v1/echo/1" },
    );
  });
  const res = await request(app).get("/");
  expect(res.status).toBe(201);
  expect(res.headers.location).toBe("/api/v1/echo/1");
  expect(res.headers["content-type"]).toBe("application/vnd.api+json");
  expect(res.text).toBe('{"data":{"attributes":{"text":"\\uac00\\ud83d\\ude00\\ud800"}}}');
  expect(Number(res.headers["content-length"])).toBe(Buffer.byteLength(res.text));
});
it("204 응답은 문서와 콘텐츠 헤더를 내보내지 않는다", async () => {
  const app = express();
  app.delete("/", (_req, res) => {
    writeDocument(res, 204, { data: null });
  });
  const res = await request(app).delete("/");
  expect(res.status).toBe(204);
  expect(res.text).toBe("");
  expect(res.headers["content-type"]).toBeUndefined();
});
