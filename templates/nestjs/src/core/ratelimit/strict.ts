import { Inject, Injectable } from "@nestjs/common";
import { RedisClients } from "../redis/clients.js";
import { SETTINGS, type Settings } from "../config/settings.js";
import { JsonLogger } from "../logging/json-logger.js";
import { failOpen, rateLimited } from "./limit.js";
import { STRICT_RULES, type StrictRule } from "./rules.js";
import { hitWindow } from "./window.js";

@Injectable()
export class StrictLimiter {
  constructor(
    @Inject(RedisClients) private readonly redis: RedisClients,
    @Inject(SETTINGS) private readonly settings: Settings,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
  ) {}
  async enforce(rule: StrictRule, subject: string): Promise<void> {
    const { setting, windowSeconds } = STRICT_RULES[rule];
    const result = await failOpen(this.logger, () =>
      hitWindow(
        this.redis.command,
        this.redis.key("rl", "strict", rule, subject),
        this.settings[setting],
        windowSeconds,
      ),
    );
    if (result && !result.allowed) throw rateLimited(result.retryAfter);
  }
}
