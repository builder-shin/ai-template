/**
 * 테스트 통로: 메일 보관함(/_test/mail). MOCK_TEST_ENDPOINTS가 켜져 있을 때만 붙는다.
 * JSON:API가 아닌 JSON이다. 적합성 스위트와 E2E가 인증·재설정 메일을 읽는다(Mailpit 대신).
 *
 * - GET /_test/mail[?to=<주소>]: { messages: [{ id, to, subject, text, receivedAt }] }, 최신순.
 *   to를 주면 그 주소(대소문자 무시)로 간 메일만 준다.
 * - DELETE /_test/mail: 모두 지운다(204).
 */

import { Hono } from "hono";
import type { AppEnv } from "../context.ts";
import type { Outbox } from "../mail/outbox.ts";

export function mailTestRoutes(outbox: Outbox): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get("/", (c) => c.json({ messages: outbox.list(c.req.query("to")) }));
  routes.delete("/", (c) => {
    outbox.clear();
    return c.body(null, 204);
  });
  return routes;
}
