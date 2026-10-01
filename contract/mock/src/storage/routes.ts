/**
 * 가짜 스토리지의 HTTP 쪽(/_storage/<키>). 브라우저가 presigned URL로 직접 올리고(PUT) 내려받는다
 * (GET). S3처럼 답한다. 테스트 통로가 아니라 MOCK_TEST_ENDPOINTS와 관계없이 늘 붙는다(web의
 * 업로드가 쓴다).
 *
 * - 서명과 만료를 확인한다(bucket.ts). 서명이 없거나 맞지 않으면 403 SignatureDoesNotMatch, 만료됐으면
 *   403 AccessDenied다. 업로드는 Content-Type과 Content-Length가 서명과 같아야 한다.
 * - 올리기는 본문을 저장하고 200과 ETag(본문의 MD5)를 준다. 본문을 읽기 전에 거절하면 연결을
 *   닫는다고 알린다(Connection: close). API의 초과 본문과 달리 미리 버리지 않으므로,
 *   @hono/node-server의 응답 뒤 버리기 한도(500ms)가 지나면 업로드 중에도 연결이 닫힐 수 있다.
 * - 내려받기는 저장할 때의 Content-Type으로 준다. 객체가 없으면 404 NoSuchKey다.
 * - 에러 본문은 S3의 XML 에러 문서다.
 * - CORS: 설정의 Origin(STORAGE_ALLOWED_ORIGINS)에 GET, PUT, HEAD를 허용하고, 요청 헤더는 모두 받고,
 *   ETag를 드러낸다. FastAPI 템플릿이 개발 버킷에 거는 CORS 규칙(tools/infra.py)과 같다.
 */

import { createHash } from "node:crypto";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import type { MockConfig } from "../config.ts";
import type { AppEnv } from "../context.ts";
import { type SignatureCheck, STORAGE_PATH, type Storage } from "./bucket.ts";

/** 브라우저가 preflight 결과를 기억하는 시간(초). FastAPI 템플릿의 버킷 CORS와 같다. */
const CORS_MAX_AGE = 3000;

/** S3 XML 에러 문서의 응답. */
function s3Error(
  status: 400 | 403 | 404,
  code: string,
  message: string,
  headers: Readonly<Record<string, string>> = {},
): Response {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>${code}</Code><Message>${message}</Message></Error>`;
  return new Response(body, { status, headers: { ...headers, "Content-Type": "application/xml" } });
}

function denied(
  check: Exclude<SignatureCheck, "valid">,
  headers: Readonly<Record<string, string>> = {},
): Response {
  if (check === "expired") return s3Error(403, "AccessDenied", "Request has expired.", headers);
  const message = "The request signature does not match the presigned URL.";
  return s3Error(403, "SignatureDoesNotMatch", message, headers);
}

function etag(body: Uint8Array): string {
  return `"${createHash("md5").update(body).digest("hex")}"`;
}

/** 요청 경로의 객체 키(/_storage/ 뒤). */
function keyOf(c: Context<AppEnv>): string {
  return c.req.path.slice(STORAGE_PATH.length + 1);
}

function checkSignature(storage: Storage, c: Context<AppEnv>, key: string): SignatureCheck {
  return storage.check({
    method: c.req.method,
    key,
    expires: c.req.query("expires"),
    signature: c.req.query("signature"),
    contentType: c.req.header("content-type"),
    contentLength: c.req.header("content-length"),
  });
}

export function storageRoutes(config: MockConfig, storage: Storage): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use(
    "*",
    cors({
      origin: [...config.storageAllowedOrigins],
      allowMethods: ["GET", "PUT", "HEAD"],
      exposeHeaders: ["ETag"],
      maxAge: CORS_MAX_AGE,
    }),
  );

  routes.put("/*", async (c) => {
    const key = keyOf(c);
    const check = checkSignature(storage, c, key);
    if (check !== "valid") return denied(check, { Connection: "close" });
    const body = new Uint8Array(await c.req.arrayBuffer());
    // 서명한 Content-Length와 받은 본문이 다르면 받지 않는다(HTTP로는 Node가 길이를 지킨다).
    if (String(body.byteLength) !== c.req.header("content-length")?.trim()) {
      const message = "The body does not have the number of bytes in Content-Length.";
      return s3Error(400, "IncompleteBody", message);
    }
    storage.put(key, { body, contentType: c.req.header("content-type")?.trim() ?? "" });
    return c.body(null, 200, { ETag: etag(body) });
  });

  routes.get("/*", (c) => {
    const key = keyOf(c);
    const check = checkSignature(storage, c, key);
    if (check !== "valid") return denied(check);
    const object = storage.get(key);
    if (object === undefined) return s3Error(404, "NoSuchKey", "The specified key does not exist.");
    return c.body(object.body, 200, {
      "Content-Type": object.contentType,
      ETag: etag(object.body),
    });
  });

  return routes;
}
