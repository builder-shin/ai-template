/**
 * 헬스체크. JSON:API가 아닌 예외 엔드포인트라 application/json으로 응답한다(계약의 HealthReport).
 *
 * - /health/live: 프로세스가 살아 있는지.
 * - /health/ready: 요청을 받을 준비가 됐는지. FastAPI는 DB, Valkey, 스토리지를 확인하지만 목은
 *   모든 상태를 프로세스 메모리에 두어 확인할 의존 대상이 없다. 떠 있으면 준비된 것이고 checks는
 *   비어 있다. 시드는 서버가 포트를 열기 전에 끝난다.
 */

import { Hono } from "hono";
import type { AppEnv } from "./context.ts";
import type { components } from "./generated/api.ts";

type HealthReport = components["schemas"]["HealthReport"];

const HEALTHY: HealthReport = { status: "ok", checks: {} };

export function healthRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get("/live", (c) => c.json(HEALTHY));
  routes.get("/ready", (c) => c.json(HEALTHY));
  return routes;
}
