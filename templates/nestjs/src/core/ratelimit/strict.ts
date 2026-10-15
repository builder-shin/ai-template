import { dependencyFailure } from "../telemetry/diagnostics.js";
import { Inject, Injectable } from "@nestjs/common";
import { RedisClients } from "../redis/clients.js";
import { SETTINGS, type Settings } from "../config/settings.js";
import { JsonLogger } from "../logging/json-logger.js";
import { ApiError } from "../jsonapi/errors.js";
import { STRICT_RULES, type StrictRule } from "./rules.js";
import { hitWindow, type WindowResult } from "./window.js";

@Injectable()
export class StrictLimiter {
  constructor(
    @Inject(RedisClients) private readonly redis: RedisClients,
    @Inject(SETTINGS) private readonly settings: Settings,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
  ) {}
  async enforce(rule: StrictRule, subject: string): Promise<void> {
    const { setting, windowSeconds } = STRICT_RULES[rule];
    let result: WindowResult;
    try {
      result = await hitWindow(
        this.redis.command,
        this.redis.key("rl", "strict", rule, subject),
        this.settings[setting],
        windowSeconds,
      );
    } catch (error) {
      this.logger.warn("속도 제한 저장소를 사용할 수 없다", {
        failureKind: dependencyFailure(error),
      });
      return;
    }
    if (!result.allowed)
      throw new ApiError({
        status: 429,
        code: "rate_limit.exceeded",
        title: "Too many requests",
        headers: { "Retry-After": String(result.retryAfter) },
        meta: { retryAfter: result.retryAfter },
      });
  }
}
