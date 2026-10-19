import { Logger } from "@nestjs/common";
import type { RedisClients } from "../redis/clients.js";
import type { Settings } from "../config/settings.js";
import type { GlobalLimiter } from "../http/pipeline.js";
import { failOpen, rateLimited } from "./limit.js";
import { hitWindow } from "./window.js";

export function createGlobalLimiter(redis: RedisClients, settings: Settings): GlobalLimiter {
  const logger = new Logger("GlobalLimiter");
  return async (req) => {
    if (!req.path.startsWith("/api/")) return;
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const result = await failOpen(logger, () =>
      hitWindow(
        redis.command,
        redis.key("rl", "global", req.ip ?? "", String(minute)),
        settings.RATE_LIMIT_GLOBAL,
        60,
      ),
    );
    if (result && !result.allowed)
      throw rateLimited(Math.max(1, Math.ceil(((minute + 1) * 60000 - now) / 1000)));
  };
}
