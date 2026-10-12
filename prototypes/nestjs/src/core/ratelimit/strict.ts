import { Inject, Injectable, Logger } from "@nestjs/common";
import { RedisClients } from "../redis/clients.js";
import { SETTINGS } from "../config/settings.js";
import type { Settings } from "../config/settings.js";
import { ApiError } from "../jsonapi/errors.js";
const script =
  "local n=redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],ARGV[1],'NX'); return {n,redis.call('TTL',KEYS[1])}";
@Injectable()
export class StrictRateLimiter {
  private readonly logger = new Logger(StrictRateLimiter.name);
  constructor(
    private readonly redis: RedisClients,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}
  async hit(scope: string, key: string, limit: number, window = 60): Promise<void> {
    let result: unknown;
    try {
      result = await this.redis.command.eval(
        script,
        1,
        `${this.redis.prefix}:ratelimit:${scope}:${key}`,
        window,
      );
    } catch {
      this.logger.warn(`Rate limit ${scope} unavailable.`);
      return;
    }
    if (!Array.isArray(result) || typeof result[0] !== "number" || typeof result[1] !== "number")
      throw new Error("Invalid rate-limit reply.");
    if (result[0] > limit) {
      const retryAfter = Math.max(1, result[1]);
      throw new ApiError(429, "rate_limit.exceeded", undefined, {
        params: { retryAfter },
        headers: { "Retry-After": String(retryAfter) },
      });
    }
  }
  check(scope: string, key: string) {
    return this.hit(scope, key, this.settings.RATE_LIMIT_STRICT);
  }
}
