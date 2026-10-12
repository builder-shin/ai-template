import { JsonApiRoute } from "../../core/jsonapi/decorators.js";
import { Health_live, Health_ready } from "./operations.js";
import { HealthService } from "./service.js";
import { Controller, Res } from "@nestjs/common";

import type { Response } from "express";
@Controller()
export class HealthController {
  constructor(private readonly service: HealthService) {}
  @JsonApiRoute(Health_ready)
  async ready(@Res({ passthrough: true }) response: Response) {
    const report = await this.service.ready();
    response.status(report.status === "ok" ? 200 : 503);
    return report;
  }
  @JsonApiRoute(Health_live)
  live(): { status: "ok"; checks: Record<string, "ok" | "unavailable"> } {
    return { status: "ok", checks: {} };
  }
}
