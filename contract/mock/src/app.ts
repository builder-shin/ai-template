/**
 * 목 서버 앱 조립. 미들웨어는 FastAPI 템플릿(create_app, install_jsonapi)과 같은 순서로 건다.
 *
 * 1. trace id: 가장 바깥이라 협상 에러에도 같은 id가 붙는다.
 * 2. 콘텐츠 협상(415, 406)
 * 3. 본문 한도(413)
 * 4. 라우트. `/api/` 아래의 없는 경로와 허용하지 않은 메서드는 404 resource.not_found다.
 *
 * 테스트 통로(/_test)는 MOCK_TEST_ENDPOINTS가 켜져 있을 때만 붙는다.
 */

import { Hono } from "hono";
import type { MockConfig } from "./config.ts";
import type { AppEnv } from "./context.ts";
import { healthRoutes } from "./health.ts";
import { bodyLimitMiddleware } from "./jsonapi/body-limit.ts";
import { handleError, handleNotFound } from "./jsonapi/errors.ts";
import { negotiationMiddleware } from "./jsonapi/negotiation.ts";
import { createState, type MockState } from "./state.ts";
import { mailTestRoutes } from "./test-endpoints/mail.ts";
import { traceIdMiddleware } from "./trace-id.ts";

/** 앱을 만든다. state를 주지 않으면 빈 상태로 시작한다(테스트는 상태를 넘겨 들여다본다). */
export function createApp(config: MockConfig, state: MockState = createState()): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use(traceIdMiddleware);
  app.use(negotiationMiddleware);
  app.use(bodyLimitMiddleware);
  app.route("/health", healthRoutes());
  if (config.testEndpoints) {
    app.route("/_test/mail", mailTestRoutes(state.outbox));
  }
  app.notFound(handleNotFound);
  app.onError(handleError);
  return app;
}
