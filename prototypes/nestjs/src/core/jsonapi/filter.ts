import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiError, RequestErrors, STATUS_ERROR_CODES } from "./errors.js";
import { writeDocument } from "./render.js";
export function respondError(error: unknown, req: Request, res: Response): void {
  if (res.headersSent) return;
  if (!req.complete) req.resume();
  let errors: readonly ApiError[];
  let status: number;
  if (error instanceof RequestErrors) {
    errors = error.errors;
    status = error.status;
  } else {
    let e: ApiError;
    if (error instanceof ApiError) e = error;
    else {
      const original = error instanceof HttpException ? error.getStatus() : 500;
      const normalized = original === 405 ? 404 : original;
      e = new ApiError(
        STATUS_ERROR_CODES[normalized] ? normalized : 500,
        STATUS_ERROR_CODES[normalized] ?? "internal.unexpected",
      );
    }
    errors = [e];
    status = e.status;
  }
  for (const e of errors)
    for (const [name, value] of Object.entries(e.options.headers ?? {})) res.set(name, value);
  if (status === 401 && !res.hasHeader("WWW-Authenticate")) res.set("WWW-Authenticate", "Bearer");
  res.removeHeader("Allow");
  writeDocument(res, status, {
    errors: errors.map((e) => e.toObject()),
    meta: { traceId: (res.locals.traceId as unknown) ?? "" },
  });
}
@Catch()
export class JsonApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    respondError(error, http.getRequest<Request>(), http.getResponse<Response>());
  }
}
