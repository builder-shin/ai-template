import { Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { SETTINGS } from "../config/settings.js";
import type { Settings } from "../config/settings.js";
import { StrictRateLimiter } from "./strict.js";
@Injectable()
export class GlobalRateLimitMiddleware {
  constructor(
    private readonly limiter: StrictRateLimiter,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}
  check(request: Request) {
    return this.limiter.hit("global", request.ip ?? "unknown", this.settings.RATE_LIMIT_GLOBAL);
  }
}
