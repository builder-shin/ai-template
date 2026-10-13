import type { ErrorCode } from "./error-codes.js";
export interface ApiErrorInit {
  status: number;
  code: ErrorCode;
  title: string;
  detail?: string;
  source?: { pointer: string } | { parameter: string } | { header: string };
  meta?: Record<string, unknown>;
  headers?: Record<string, string>;
}
export class ApiError extends Error {
  constructor(readonly init: ApiErrorInit) {
    super(init.title);
    this.name = "ApiError";
  }
}
export class ApiErrors extends Error {
  constructor(
    readonly status: number,
    readonly errors: readonly ApiError[],
  ) {
    super("API 오류");
    this.name = "ApiErrors";
  }
}
