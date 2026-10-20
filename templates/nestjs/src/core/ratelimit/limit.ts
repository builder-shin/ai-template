import type { LoggerService } from "@nestjs/common";
import { ApiError } from "../jsonapi/errors.js";
import { dependencyFailure } from "../telemetry/diagnostics.js";

export function rateLimited(retryAfter: number): ApiError {
  return new ApiError({
    status: 429,
    code: "rate_limit.exceeded",
    title: "Too many requests",
    headers: { "Retry-After": String(retryAfter) },
    meta: { params: { retryAfter } },
  });
}

export async function failOpen<T>(
  logger: Pick<LoggerService, "warn">,
  run: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await run();
  } catch (error) {
    logger.warn("속도 제한 저장소를 사용할 수 없다", { failureKind: dependencyFailure(error) });
    return undefined;
  }
}
