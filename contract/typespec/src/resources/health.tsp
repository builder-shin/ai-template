import "@typespec/http";
import "@typespec/openapi";

using Http;
using OpenAPI;

namespace Platform;

/** 헬스체크 결과. JSON:API가 아닌 예외 엔드포인트라 application/json으로 응답한다. */
model HealthReport {
  status: "ok" | "unavailable";

  /** 의존 대상별 상태. 예: { "database": "ok", "redis": "ok" } */
  checks: Record<"ok" | "unavailable">;
}

@route("/health")
@tag("health")
interface Health {
  /** 프로세스가 살아 있는지 확인한다. */
  @get
  @route("live")
  live(): {
    @statusCode _: 200;
    @body body: HealthReport;
  };

  /** DB, Redis, 스토리지 연결까지 확인한다. 하나라도 실패하면 503이다. */
  @get
  @route("ready")
  ready():
    | {
        @statusCode _: 200;
        @body body: HealthReport;
      }
    | {
        @statusCode _: 503;
        @body body: HealthReport;
      };
}
