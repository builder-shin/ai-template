import { STATUS_CODES } from "node:http";
import type { ErrorCode } from "./error-codes.js";
export interface ErrorOptions {
  pointer?: string;
  parameter?: string;
  params?: Readonly<Record<string, unknown>>;
  headers?: Readonly<Record<string, string>>;
}
export interface ErrorObject {
  status: string;
  code: ErrorCode;
  title: string;
  detail?: string;
  source?: { pointer?: string; parameter?: string };
  meta?: { params: Readonly<Record<string, unknown>> };
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    detail?: string,
    readonly options: ErrorOptions = {},
  ) {
    super(detail ?? code);
    this.detail = detail;
  }
  readonly detail: string | undefined;
  toObject(): ErrorObject {
    return {
      status: String(this.status),
      code: this.code,
      title: STATUS_CODES[this.status] ?? "Error",
      ...(this.detail === undefined ? {} : { detail: this.detail }),
      ...(this.options.pointer !== undefined || this.options.parameter !== undefined
        ? {
            source: {
              ...(this.options.pointer === undefined ? {} : { pointer: this.options.pointer }),
              ...(this.options.parameter === undefined
                ? {}
                : { parameter: this.options.parameter }),
            },
          }
        : {}),
      ...(this.options.params ? { meta: { params: this.options.params } } : {}),
    };
  }
}
export class RequestErrors extends Error {
  readonly status: number;
  constructor(readonly errors: readonly ApiError[]) {
    super("Request validation failed.");
    const statuses = new Set(errors.map((e) => e.status));
    this.status = statuses.size === 1 ? (errors[0]?.status ?? 400) : 400;
  }
}
export const STATUS_ERROR_CODES: Readonly<Record<number, ErrorCode>> = {
  400: "jsonapi.invalid_document",
  401: "auth.unauthenticated",
  403: "permission.denied",
  404: "resource.not_found",
  409: "resource.conflict",
  413: "jsonapi.content_too_large",
  429: "rate_limit.exceeded",
  503: "service.unavailable",
};
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
