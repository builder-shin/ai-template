import type { RequestHandler } from "express";
import { ApiError } from "./errors.js";
import { BODY_METHODS } from "./negotiation.js";
export const MAX_BODY_BYTES = 1_048_576;
export const readBody: RequestHandler = (req, _res, next) => {
  if (!req.path.startsWith("/api/") || !BODY_METHODS.has(req.method)) {
    next();
    return;
  }
  const tooLarge = () => new ApiError(413, "jsonapi.content_too_large");
  const length = req.get("Content-Length");
  if (length && /^\d+$/.test(length) && Number(length) > MAX_BODY_BYTES) {
    next(tooLarge());
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0,
    finished = false;
  req.on("data", (chunk: Buffer) => {
    if (finished) return;
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      finished = true;
      chunks.length = 0;
      next(tooLarge());
    } else chunks.push(chunk);
  });
  req.on("end", () => {
    if (finished) return;
    finished = true;
    try {
      const bytes = Buffer.concat(chunks);
      req.body = bytes.length
        ? (JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown)
        : null;
      next();
    } catch {
      next(new ApiError(400, "jsonapi.invalid_document"));
    }
  });
  req.on("error", () => {
    if (!finished) {
      finished = true;
      next(new ApiError(400, "jsonapi.invalid_document"));
    }
  });
};
