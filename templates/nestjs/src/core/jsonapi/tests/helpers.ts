import { expect } from "vitest";
import { ApiError, ApiErrors } from "../errors.js";
import type { ErrorCode } from "../error-codes.js";

export function errorsOf(run: () => unknown): ApiErrors {
  try {
    run();
  } catch (error) {
    if (error instanceof ApiErrors) return error;
    if (error instanceof ApiError) return new ApiErrors(error.init.status, [error]);
    throw error;
  }
  throw new Error("API 오류가 발생해야 한다");
}
export function toThrowApiError(
  run: () => unknown,
  status: number,
  code: ErrorCode,
  source?: object,
) {
  const error = errorsOf(run);
  expect(error.status).toBe(status);
  expect(error.errors[0]?.init).toMatchObject({ status, code, ...(source ? { source } : {}) });
}
