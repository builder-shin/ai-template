/** 목 서버 단위 테스트의 공통 도우미. 앱은 포트를 열지 않고 app.request로 부른다. */

import { expect } from "vitest";
import { createApp } from "../src/app.ts";
import { DEFAULT_CONFIG, type MockConfig } from "../src/config.ts";
import type { ErrorObject } from "../src/jsonapi/errors.ts";
import { JSONAPI_MEDIA_TYPE } from "../src/jsonapi/media.ts";
import { createState, type MockState } from "../src/state.ts";

export const TRACE_ID = /^[0-9a-f]{32}$/;

/** 기본 설정으로 만든 앱과 그 메모리 상태. overrides로 설정 일부를 바꾼다. */
export function testApp(overrides: Partial<MockConfig> = {}) {
  const state: MockState = createState();
  const app = createApp({ ...DEFAULT_CONFIG, ...overrides }, state);
  return { app, state };
}

/**
 * 공통 계층을 지나 핸들러까지 닿는지 보는 시험용 라우트를 단 앱(FastAPI 테스트의 샘플 리소스 역할).
 * GET은 200을, POST는 받은 본문의 바이트 수를 돌려준다.
 */
export function echoApp(overrides: Partial<MockConfig> = {}) {
  const { app, state } = testApp(overrides);
  app.get("/api/v1/echo", (c) => c.json({ ok: true }));
  app.post("/api/v1/echo", async (c) => c.json({ size: (await c.req.arrayBuffer()).byteLength }));
  return { app, state };
}

/** JSON:API 요청 헤더와 본문. */
export function jsonApiBody(body: string): RequestInit {
  return {
    body,
    headers: { "Content-Type": JSONAPI_MEDIA_TYPE, Accept: JSONAPI_MEDIA_TYPE },
  };
}

/** 응답이 이 상태의 JSON:API 에러 문서인지 확인하고 에러 객체 목록을 돌려준다(FastAPI 테스트의 errors_of). */
export async function errorsOf(response: Response, status: number): Promise<ErrorObject[]> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toBe(JSONAPI_MEDIA_TYPE);
  const body = (await response.json()) as { errors: ErrorObject[]; meta: { traceId: string } };
  expect(Object.keys(body)).toEqual(["errors", "meta"]);
  expect(body.meta.traceId).toMatch(TRACE_ID);
  return body.errors;
}

/** 에러 객체의 코드 목록. */
export async function codesOf(response: Response, status: number): Promise<string[]> {
  return (await errorsOf(response, status)).map((error) => error.code);
}
