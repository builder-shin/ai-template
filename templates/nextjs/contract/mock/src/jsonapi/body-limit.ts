/**
 * 요청 본문 한도(413). FastAPI 템플릿의 core/jsonapi/body_limit.py와 같은 규칙이다.
 *
 * - `/api/` 아래 본문을 받는 요청(POST, PATCH, PUT)의 본문은 MAX_BODY_SIZE(1 MiB)까지다. 넘으면
 *   413 jsonapi.content_too_large다.
 * - 초과 본문은 버린 뒤 413을 답해 업로드와 연결 종료가 경합하지 않게 한다(uvicorn처럼 연결 유지).
 *   버리기는 총 16 MiB, 초과 확인 뒤 5초까지다. 그 한도를 넘으면 즉시 413과 Connection: close다.
 * - 길이를 알리지 않은 본문(chunked)은 API 한도까지 읽어 뒤의 핸들러에 다시 넘긴다.
 * - 협상(415, 406) 다음, 본문 JSON 검사(400) 앞이다.
 * - 한도는 설정이 아니라 API 설계 값이다(docs/conventions/jsonapi.md의 에러 우선순위).
 */

import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../context.ts";
import { API_PREFIX, errorObject, errorResponse } from "./errors.ts";
import { BODY_METHODS } from "./negotiation.ts";

export const MAX_BODY_SIZE = 1024 * 1024;
const MAX_DRAIN_SIZE = 16 * 1024 * 1024;
const DRAIN_TIMEOUT_MS = 5_000;

/**
 * 413 응답. 버리기 한도 때문에 읽지 못한 본문이 있을 때만 연결 종료를 알린다. @hono/node-server의
 * 응답 뒤 버리기는 500ms뿐이므로, 보통 초과 본문은 응답 전에 버려 느린 업로드도 413을 받게 한다.
 */
function tooLarge(c: Context<AppEnv>, close: boolean): Response {
  const detail = `The request body must be at most ${String(MAX_BODY_SIZE)} bytes.`;
  const errors = [errorObject(413, "jsonapi.content_too_large", detail)];
  return errorResponse(c, 413, errors, close ? { Connection: "close" } : {});
}

/** 남은 본문을 저장하지 않고 버린다. 바이트·시간 한도까지 끝나지 않으면 false다. */
async function drain(reader: ReadableStreamDefaultReader<Uint8Array>, size = 0): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      resolve(null);
    }, DRAIN_TIMEOUT_MS);
  });
  try {
    while (size <= MAX_DRAIN_SIZE) {
      const part = await Promise.race([reader.read(), expired]);
      if (part === null) return false;
      if (part.done) return true;
      size += part.value.byteLength;
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
}

type LimitedBody = { body: Buffer } | { body: undefined; close: boolean };

/** API 한도까지 저장한다. 초과하면 나머지를 버리고 연결을 유지할 수 있는지 돌려준다. */
async function readUpTo(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  oversized: boolean,
): Promise<LimitedBody> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (oversized) return { body: undefined, close: !(await drain(reader)) };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { body: Buffer.concat(chunks) };
      size += value.byteLength;
      if (size > limit) return { body: undefined, close: !(await drain(reader, size)) };
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export const bodyLimitMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const body = c.req.raw.body;
  if (!BODY_METHODS.has(c.req.method) || !c.req.path.startsWith(API_PREFIX) || body === null) {
    await next();
    return;
  }
  const length = c.req.header("content-length");
  const declared = length !== undefined && /^\d+$/.test(length) ? Number(length) : 0;
  if (declared > MAX_DRAIN_SIZE) return tooLarge(c, true);
  const result = await readUpTo(body, MAX_BODY_SIZE, declared > MAX_BODY_SIZE);
  if (result.body === undefined) return tooLarge(c, result.close);
  // 읽은 본문으로 요청을 다시 만든다. 뒤의 핸들러는 c.req.text() 등으로 그대로 읽는다.
  c.req.raw = new Request(c.req.raw, { body: result.body });
  await next();
};
