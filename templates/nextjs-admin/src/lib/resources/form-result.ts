import "server-only";
import { ApiError, toFormResult } from "../api/errors";
export function resourceFormResult(
  error: ApiError,
  locale: "ko" | "en",
  fields: readonly string[],
) {
  const mapped = new ApiError({
    status: error.status,
    traceId: error.traceId,
    retryAfter: error.retryAfter,
    errors: error.errors.map((issue) => {
      const match = /^\/data\/relationships\/([^/]+)\/data(?:\/\d+(?:\/(?:id|type))?)?$/.exec(
        issue.pointer ?? "",
      );
      return match ? { ...issue, pointer: `/data/attributes/${match[1]}` } : issue;
    }),
  });
  return toFormResult(mapped, locale, fields);
}
