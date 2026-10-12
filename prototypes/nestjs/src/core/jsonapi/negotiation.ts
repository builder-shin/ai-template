import type { RequestHandler } from "express";
import { ApiError } from "./errors.js";
import { JSONAPI_MEDIA_TYPE } from "./render.js";
export const BODY_METHODS = new Set(["POST", "PATCH", "PUT"]);
export function splitQuoted(value: string, separator: string): string[] {
  const result: string[] = [];
  let start = 0,
    quoted = false,
    escaped = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (escaped) escaped = false;
    else if (c === "\\" && quoted) escaped = true;
    else if (c === '"') quoted = !quoted;
    else if (c === separator && !quoted) {
      result.push(value.slice(start, i));
      start = i + 1;
    }
  }
  result.push(value.slice(start));
  return result;
}
export function supportedMedia(value: string): boolean {
  const [type, ...parts] = splitQuoted(value, ";").map((s) => s.trim());
  const names: string[] = [];
  for (const p of parts) {
    const n = p.split("=")[0]?.trim().toLowerCase();
    if (n === "q") break;
    if (n) names.push(n);
  }
  return type?.toLowerCase() === JSONAPI_MEDIA_TYPE && names.every((n) => n === "profile");
}
export const negotiation: RequestHandler = (req, _res, next) => {
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }
  if (BODY_METHODS.has(req.method) && !supportedMedia(req.get("Content-Type") ?? "")) {
    next(new ApiError(415, "jsonapi.unsupported_media_type"));
    return;
  }
  const instances = splitQuoted(req.get("Accept") ?? "", ",").filter(
    (v) => v.split(";")[0]?.trim().toLowerCase() === JSONAPI_MEDIA_TYPE,
  );
  if (instances.length && !instances.some(supportedMedia)) {
    next(new ApiError(406, "jsonapi.not_acceptable"));
    return;
  }
  next();
};
