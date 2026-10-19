import { Controller, Inject, Res } from "@nestjs/common";
import type { Response } from "express";
import { JsonLogger } from "../../core/logging/json-logger.js";
import { dependencyFailure } from "../../core/telemetry/diagnostics.js";
import { Operation } from "../../core/jsonapi/decorators.js";
import { HEALTH_CHECKS, type HealthCheck } from "./checks.js";
import { live, ready } from "./operations.js";
const READY_CHECK_TIMEOUT_MS = 2000;
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
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              Promise.resolve().then(() => check.check()),
              new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => {
                  reject(
                    Object.assign(new Error("의존 대상 확인 시간이 지났다"), { code: "ETIMEDOUT" }),
                  );
                }, READY_CHECK_TIMEOUT_MS);
              }),
            ]);
            return [check.name, "ok"] as const;
          } catch (error) {
            this.logger.warn("의존 대상 확인이 실패했다", {
              check: check.name,
              failureKind: dependencyFailure(error),
            });
            return [check.name, "unavailable"] as const;
          } finally {
            clearTimeout(timer);
          }
        }),
      ),
    );
    const unavailable = Object.values(checks).includes("unavailable");
    res.status(unavailable ? 503 : 200).setHeader("Content-Type", "application/json");
    res.end(Buffer.from(JSON.stringify({ status: unavailable ? "unavailable" : "ok", checks })));
  }
}
