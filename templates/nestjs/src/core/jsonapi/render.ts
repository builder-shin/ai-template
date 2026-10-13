import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { map, type Observable } from "rxjs";

export const JSONAPI_MEDIA_TYPE = "application/vnd.api+json";
export function writeDocument(
  res: Response,
  status: number,
  document: unknown,
  headers?: Record<string, string>,
): void {
  res.status(status);
  for (const [name, value] of Object.entries(headers ?? {})) res.setHeader(name, value);
  if (status === 204 || status === 304) {
    res.removeHeader("Content-Type");
    res.removeHeader("Content-Length");
    res.end();
    return;
  }
  const json = JSON.stringify(document).replace(
    /[\u007f-\uffff]/g,
    (character) => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"),
  );
  const buffer = Buffer.from(json);
  res.setHeader("Content-Type", JSONAPI_MEDIA_TYPE);
  res.setHeader("Content-Length", buffer.length);
  res.end(buffer);
}

export class DocumentInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    return next.handle().pipe(
      map((document) => {
        if (!req.path.startsWith("/api/") || res.headersSent) return document;
        writeDocument(res, res.statusCode, document ?? null);
        return undefined;
      }),
    );
  }
}
