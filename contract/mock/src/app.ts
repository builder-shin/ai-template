/**
 * 목 서버 앱 조립. 미들웨어는 FastAPI 템플릿(create_app, install_jsonapi)과 같은 순서로 건다.
 *
 * 1. trace id: 가장 바깥이라 협상 에러에도 같은 id가 붙는다.
 * 2. 콘텐츠 협상(415, 406)
 * 3. 본문 한도(413)
 * 4. 라우트. `/api/` 아래의 없는 경로와 허용하지 않은 메서드는 404 resource.not_found다.
 *
 * 앱을 만들 때 시드를 넣고 모듈 사이의 처리를 건다(seed.ts, modules/registry.ts). 모듈의 API는
 * 계약의 operationId로 JSON:API 라우터에 단다(jsonapi/router.ts). 가짜 스토리지(/_storage)는 늘
 * 붙고, 테스트 통로(/_test/mail, 메일 보관함 화면 /_mock/mail, 가짜 OAuth 서버 /_mock/oauth)는
 * MOCK_TEST_ENDPOINTS가 켜져 있을 때만 붙는다. 실시간(Socket.IO)은 HTTP 서버에 붙으므로 main.ts가 띄운
 * 서버에 attachRealtime으로 붙인다(modules/realtime/server.ts).
 */

import { Hono } from "hono";
import type { MockConfig } from "./config.ts";
import type { AppEnv } from "./context.ts";
import { healthRoutes } from "./health.ts";
import { bodyLimitMiddleware } from "./jsonapi/body-limit.ts";
import { handleError, handleNotFound } from "./jsonapi/errors.ts";
import { negotiationMiddleware } from "./jsonapi/negotiation.ts";
import { createJsonApiRouter } from "./jsonapi/router.ts";
import { auditLogRoutes } from "./modules/audit-logs/routes.ts";
import { createAuthenticator } from "./modules/auth/credentials.ts";
import { authRoutes } from "./modules/auth/routes.ts";
import { fileRoutes } from "./modules/files/routes.ts";
import { postRoutes } from "./modules/posts/routes.ts";
import { realtimeRoutes } from "./modules/realtime/routes.ts";
import { connectModules } from "./modules/registry.ts";
import { roleRoutes } from "./modules/roles/routes.ts";
import { userRoutes } from "./modules/users/routes.ts";
import { oauthServerRoutes } from "./oauth-server/routes.ts";
import { OAUTH_SERVER_PATH } from "./oauth-server/server.ts";
import { seed } from "./seed.ts";
import { createState, type MockState } from "./state.ts";
import { STORAGE_PATH } from "./storage/bucket.ts";
import { storageRoutes } from "./storage/routes.ts";
import { mailTestRoutes } from "./test-endpoints/mail.ts";
import { MAIL_PAGE_PATH, mailPageRoutes } from "./test-endpoints/mail-page.ts";
import { traceIdMiddleware } from "./trace-id.ts";

/** 앱을 만든다. state를 주지 않으면 빈 상태로 시작한다(테스트는 상태를 넘겨 들여다본다). */
export function createApp(config: MockConfig, state: MockState = createState()): Hono<AppEnv> {
  seed(state, config);
  connectModules(state);
  const app = new Hono<AppEnv>();
  app.use(traceIdMiddleware);
  app.use(negotiationMiddleware);
  app.use(bodyLimitMiddleware);
  app.route("/health", healthRoutes());
  const api = createJsonApiRouter(app, createAuthenticator(state));
  authRoutes(api, config, state);
  userRoutes(api, config, state);
  roleRoutes(api, state);
  auditLogRoutes(api, state);
  fileRoutes(api, config, state);
  postRoutes(api, config, state);
  realtimeRoutes(api, state);
  app.route(STORAGE_PATH, storageRoutes(config, state.storage));
  if (config.testEndpoints) {
    app.route("/_test/mail", mailTestRoutes(state.outbox));
    app.route(MAIL_PAGE_PATH, mailPageRoutes(state.outbox));
    app.route(OAUTH_SERVER_PATH, oauthServerRoutes(state.oauthServer));
  }
  app.notFound(handleNotFound);
  app.onError(handleError);
  return app;
}
