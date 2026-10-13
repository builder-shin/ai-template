import { performance } from "node:perf_hooks";
import type { Request, Response } from "express";
import { currentTraceId, requestContext } from "./context.js";
import type { JsonLogger } from "./json-logger.js";

export function accessLog(req: Request, res: Response, logger: JsonLogger): void {
  if (["/health/live", "/health/ready"].includes(req.path)) return;
  const start = performance.now();
  const traceId = currentTraceId();
  res.once("finish", () => {
    const write = () => {
      logger.log("요청 완료", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: performance.now() - start,
      });
    };
    if (traceId) requestContext.run({ traceId }, write);
    else write();
  });
}
