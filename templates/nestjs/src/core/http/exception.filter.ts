import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { STATUS_CODES } from "node:http";
import type { Response } from "express";
import type { ErrorCode } from "../jsonapi/error-codes.js";
import { ApiError, ApiErrors } from "../jsonapi/errors.js";
import { writeDocument } from "../jsonapi/render.js";
import { currentTraceId } from "../logging/context.js";
import type { JsonLogger } from "../logging/json-logger.js";

const statusCodes: Readonly<Record<number, ErrorCode>> = {
  400: "jsonapi.invalid_document",
  401: "auth.unauthenticated",
  403: "permission.denied",
  404: "resource.not_found",
  409: "resource.conflict",
  413: "jsonapi.content_too_large",
  429: "rate_limit.exceeded",
  503: "service.unavailable",
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}
  catch(exception: unknown, host: ArgumentsHost): void {
    this.respond(exception, host.switchToHttp().getResponse<Response>());
  }
  respond(exception: unknown, res: Response): void {
    if (res.headersSent) return;
    let failure: ApiError | ApiErrors;
    if (exception instanceof ApiError || exception instanceof ApiErrors) failure = exception;
    else {
      const original = exception instanceof HttpException ? exception.getStatus() : 500;
      const status = original === 405 ? 404 : statusCodes[original] ? original : 500;
      if (status === 500)
        this.logger.error(exception instanceof Error ? exception : new Error("예상하지 못한 오류"));
      failure = new ApiError({
        status,
        code: statusCodes[status] ?? "internal.unexpected",
        title: STATUS_CODES[status] ?? "Internal Server Error",
      });
    }
    const status = failure instanceof ApiErrors ? failure.status : failure.init.status;
    const errors = failure instanceof ApiErrors ? failure.errors : [failure];
    const traceId = currentTraceId() ?? (res.locals as { traceId: string }).traceId;
    const headers: Record<string, string> = status === 401 ? { "WWW-Authenticate": "Bearer" } : {};
    const document = {
      errors: errors.map(({ init }) => {
        Object.assign(headers, init.headers);
        return {
          status: String(init.status),
          code: init.code,
          title: init.title,
          ...(init.detail === undefined ? {} : { detail: init.detail }),
          ...(init.source === undefined ? {} : { source: init.source }),
          meta: { ...init.meta, traceId },
        };
      }),
      meta: { traceId },
    };
    res.removeHeader("Allow");
    writeDocument(res, status, document, headers);
  }
}
