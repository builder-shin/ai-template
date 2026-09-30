/** 목 서버 단위 테스트의 공통 도우미. 앱은 포트를 열지 않고 app.request로 부른다. */

import { expect } from "vitest";
import { createApp } from "../src/app.ts";
import { DEFAULT_CONFIG, type MockConfig } from "../src/config.ts";
import type { Clock, Instant } from "../src/core/clock.ts";
import type { RealtimeEvent } from "../src/core/realtime.ts";
import type { ErrorObject } from "../src/jsonapi/errors.ts";
import { JSONAPI_MEDIA_TYPE } from "../src/jsonapi/media.ts";
import { createState, type MockState, type StateOptions } from "../src/state.ts";

export const TRACE_ID = /^[0-9a-f]{32}$/;
/** 목이 내보내는 시각(Pydantic과 같은 모양). */
export const TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{6})?Z$/;

/** 시간을 앞으로 돌릴 수 있는 시계. 부를 때마다 1마이크로초씩 간다(시스템 시계처럼 단조 증가). */
export interface TestClock extends Clock {
  advance(duration: number): void;
}

export function testClock(start: Instant = Date.UTC(2026, 8, 30) * 1000): TestClock {
  let current = start;
  return {
    now() {
      current += 1;
      return current;
    },
    advance(duration) {
      current += duration;
    },
  };
}

/** 기본 설정으로 만든 앱과 그 메모리 상태. overrides로 설정 일부를, options로 시계를 바꾼다. */
export function testApp(overrides: Partial<MockConfig> = {}, options: StateOptions = {}) {
  const state: MockState = createState(options);
  const config: MockConfig = { ...DEFAULT_CONFIG, ...overrides };
  const app = createApp(config, state);
  return { app, state, config };
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

/**
 * 지금부터 사용자의 룸(user:<id>)으로 나가는 이벤트를 모은다. 돌려준 함수는 모은 이벤트를
 * [이름, meta.reason]으로 준다(FastAPI 테스트의 RecordingPublisher).
 */
export function revokedReasons(state: MockState, userId: string): () => unknown[] {
  const events: RealtimeEvent[] = [];
  state.realtime.listen({ event: (event) => events.push(event) });
  return () =>
    events
      .filter((event) => event.rooms.includes(`user:${userId}`))
      .map((event) => [event.name, (event.payload as { meta: { reason: string } }).meta.reason]);
}

/**
 * 지금부터 실시간 허브로 나가는 것을 나간 차례대로 모은다. 이벤트는 [이름, 룸, 페이로드], 연결 재검사는
 * ["recheck", 사용자 id]다(FastAPI 테스트의 RecordingPublisher).
 */
export function realtimeLog(state: MockState): unknown[] {
  const log: unknown[] = [];
  state.realtime.listen({
    event: (event) => log.push([event.name, event.rooms, event.payload]),
    recheck: (userIds) => log.push(["recheck", [...userIds]]),
  });
  return log;
}
