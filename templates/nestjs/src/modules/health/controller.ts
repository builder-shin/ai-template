import { JsonLogger } from "../../core/logging/json-logger.js";
import { dependencyFailure } from "../../core/telemetry/diagnostics.js";
import { Controller, Inject, Res } from "@nestjs/common";
import type { Response } from "express";
import { Operation } from "../../core/jsonapi/decorators.js";
import { HEALTH_CHECKS, type HealthCheck } from "./checks.js";
import { live, ready } from "./operations.js";
@Controller()
export class HealthController {
  constructor(
    @Inject(HEALTH_CHECKS) private readonly checks: readonly HealthCheck[],
    @Inject(JsonLogger) private readonly logger: JsonLogger,
  ) {}
  @Operation(live)
  live(@Res() res: Response): void {
    res.status(200).setHeader("Content-Type", "application/json");
    res.end(Buffer.from(JSON.stringify({ status: "ok", checks: {} })));
  }
  @Operation(ready)
  async ready(@Res() res: Response): Promise<void> {
    const checks = Object.fromEntries(
      await Promise.all(
        this.checks.map(async (check) => {
          try {
            await check.check();
            return [check.name, "ok"] as const;
          } catch (error) {
            this.logger.warn("의존 대상 확인이 실패했다", {
              check: check.name,
              failureKind: dependencyFailure(error),
            });
            return [check.name, "unavailable"] as const;
          }
        }),
      ),
    );
    const unavailable = Object.values(checks).includes("unavailable");
    res.status(unavailable ? 503 : 200).setHeader("Content-Type", "application/json");
    res.end(Buffer.from(JSON.stringify({ status: unavailable ? "unavailable" : "ok", checks })));
  }
}
