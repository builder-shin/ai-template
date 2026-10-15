import { randomBytes } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { ApiError } from "../jsonapi/errors.js";
import { currentTraceId, requestContext } from "../logging/context.js";
import type { JsonLogger } from "../logging/json-logger.js";
import { accessLog } from "../logging/access-log.js";
import { negotiate } from "./negotiation.js";
import { readBody } from "./body.js";
import type { ApiExceptionFilter } from "./exception.filter.js";
export type GlobalLimiter = (req: Request) => Promise<void>;
export const GLOBAL_LIMITER = Symbol("GLOBAL_LIMITER");

export function pipeline(
  logger: JsonLogger,
  filter: ApiExceptionFilter,
  limiter: GlobalLimiter,
): RequestHandler {
  return (req, res, next) => {
    const traceId = currentTraceId() ?? randomBytes(16).toString("hex");
    res.locals.traceId = traceId;
    requestContext.run({ traceId }, () => {
      accessLog(req, res, logger);
      void (async () => {
        if (req.path.startsWith("/api/")) {
          await limiter(req);
          negotiate(req);
          await readBody(req);
        }
        if (req.method === "HEAD")
          throw new ApiError({ status: 404, code: "resource.not_found", title: "Not found" });
        next();
      })().catch((error: unknown) => {
        req.resume();
        filter.respond(error, res);
      });
    });
  };
}
