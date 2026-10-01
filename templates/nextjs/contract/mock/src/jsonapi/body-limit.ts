/**
 * 요청 본문 한도(413). FastAPI 템플릿의 core/jsonapi/body_limit.py와 같은 규칙이다.
 *
 * - `/api/` 아래 본문을 받는 요청(POST, PATCH, PUT)의 본문은 MAX_BODY_SIZE(1 MiB)까지다. 넘으면
 *   413 jsonapi.content_too_large다.
 * - Content-Length가 한도를 넘으면 본문을 읽지 않고 거절한다. 길이를 알리지 않은 본문(chunked)은
 *   한도까지 읽어 두었다가 뒤의 핸들러에 다시 넘긴다.
 * - 협상(415, 406) 다음, 본문 JSON 검사(400) 앞이다.
 * - 한도는 설정이 아니라 API 설계 값이다(docs/conventions/jsonapi.md의 에러 우선순위).
 */

import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../context.ts";
import { API_PREFIX, errorObject, errorResponse } from "./errors.ts";
import { BODY_METHODS } from "./negotiation.ts";

export const MAX_BODY_SIZE = 1024 * 1024;

/**
 * 413 응답. 본문을 다 읽지 않고 답하므로 연결을 닫는다고 알린다(Connection: close). @hono/node-server는
 * 남은 본문을 잠깐(500ms) 버리다가 다 버리지 못하면 연결을 끊는데, 알리지 않으면 클라이언트가 그
 * 연결을 다음 요청에 다시 쓰다가 실패한다. FastAPI(uvicorn)는 남은 본문을 버리고 연결을 이어 쓴다.
 * 상태와 에러 문서는 같다.
 */
function tooLarge(c: Context<AppEnv>): Response {
  const detail = `The request body must be at most ${String(MAX_BODY_SIZE)} bytes.`;
  const errors = [errorObject(413, "jsonapi.content_too_large", detail)];
  return errorResponse(c, 413, errors, { Connection: "close" });
}

/** 스트림을 limit바이트까지 읽는다. 넘으면 읽기를 멈추고 undefined를 돌려준다. */
async function readUpTo(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Buffer | undefined> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    size += value.byteLength;
    if (size > limit) {
      // 나머지는 읽지 않는다. 이미 끊긴 스트림이면 취소가 실패해도 상관없다.
      reader.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(value);
  }
}

export const bodyLimitMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const body = c.req.raw.body;
  if (!BODY_METHODS.has(c.req.method) || !c.req.path.startsWith(API_PREFIX) || body === null) {
    await next();
    return;
  }
  const length = c.req.header("content-length");
  if (length !== undefined && /^\d+$/.test(length) && Number(length) > MAX_BODY_SIZE) {
    return tooLarge(c);
  }
  const buffered = await readUpTo(body, MAX_BODY_SIZE);
  if (buffered === undefined) return tooLarge(c);
  // 읽은 본문으로 요청을 다시 만든다. 뒤의 핸들러는 c.req.text() 등으로 그대로 읽는다.
  c.req.raw = new Request(c.req.raw, { body: buffered });
  await next();
};
