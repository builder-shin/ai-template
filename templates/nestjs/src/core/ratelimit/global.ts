import { Logger } from "@nestjs/common";
import type { RedisClients } from "../redis/clients.js";
import type { Settings } from "../config/settings.js";
import type { GlobalLimiter } from "../http/pipeline.js";
import { clientIp } from "../http/client-ip.js";
import { ApiError } from "../jsonapi/errors.js";
import { hitWindow, type WindowResult } from "./window.js";

export function createGlobalLimiter(redis: RedisClients, settings: Settings): GlobalLimiter {
  const logger = new Logger("GlobalLimiter");
  return async (req) => {
    if (!req.path.startsWith("/api/")) return;
    const forwarded = req.headers["x-forwarded-for"];
    const ip = clientIp(
      req.socket.remoteAddress ?? "",
      typeof forwarded === "string" ? forwarded : undefined,
      settings.FORWARDED_ALLOW_IPS,
    );
    const minute = String(Math.floor(Date.now() / 60000));
    let result: WindowResult;
    try {
      result = await hitWindow(
        redis.command,
        redis.key("rl", "global", ip, minute),
        settings.RATE_LIMIT_GLOBAL,
        60,
      );
    } catch {
      logger.warn("Rate limit store unavailable.");
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
  };
}
