import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { map, type Observable } from "rxjs";
import { writeDocument } from "../jsonapi/render.js";

export class DocumentInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    if (context.getType() === "ws") return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    return next.handle().pipe(
      map((document) => {
        if (!req.path.startsWith("/api/") || res.headersSent) return document;
        if (res.statusCode === 204) {
          res.removeHeader("Content-Type");
          res.removeHeader("Content-Length");
          return undefined;
        }
        writeDocument(res, res.statusCode, document ?? null);
        return undefined;
      }),
    );
  }
}
