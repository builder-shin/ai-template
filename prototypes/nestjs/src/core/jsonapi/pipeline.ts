import { randomBytes } from "node:crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { ApiError } from "./errors.js";
import type { JsonApiPorts } from "./decorators.js";
import { negotiation } from "./negotiation.js";
import { readBody } from "./body.js";
import { respondError } from "./filter.js";
export function installJsonApi(server: Express, ports: JsonApiPorts): void {
  server.locals.jsonApiPorts = ports;
  server.use((_req, res, next) => {
    res.locals.traceId = randomBytes(16).toString("hex");
    next();
  });
  server.use((req, _res, next) => {
    if (!req.path.startsWith("/api/")) {
      next();
      return;
    }
    Promise.resolve()
      .then(() => ports.globalRateLimit?.(req))
      .then(() => {
        next();
      }, next);
  });
  server.use(negotiation);
  server.use(readBody);
  server.use((req, _res, next) => {
    next(
      req.path.startsWith("/api/") && req.method === "HEAD"
        ? new ApiError(404, "resource.not_found")
        : undefined,
    );
  });
  server.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    respondError(error, req, res);
  });
}
