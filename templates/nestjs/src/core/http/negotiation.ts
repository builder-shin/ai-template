import type { Request } from "express";
import { ApiError } from "../jsonapi/errors.js";
import { JSONAPI_MEDIA_TYPE } from "../jsonapi/render.js";

export function qualityOf(parameter: string): number | undefined {
  const match = /^q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.exec(parameter);
  return match ? Number(match[1]) : undefined;
}

export function hasBody(req: Request): boolean {
  return (
    req.headers["transfer-encoding"] !== undefined || Number(req.headers["content-length"] ?? 0) > 0
  );
}

function acceptsJsonApi(header: string | undefined): boolean {
  if (!header) return true;
  let specificity = -1;
  let quality = 0;
  // 쉼표가 들어간 인용 매개변수를 하나의 미디어 범위로 읽는다.
  const ranges = header.match(/(?:[^," ]|\s|"[^"]*")+/g) ?? [];
  for (const range of ranges) {
    const [type, ...parameters] = range
      .trim()
      .toLowerCase()
      .split(";")
      .map((value) => value.trim());
    const rank =
      type === JSONAPI_MEDIA_TYPE ? 2 : type === "application/*" ? 1 : type === "*/*" ? 0 : -1;
    if (rank < 0) continue;
    let q = 1;
    let valid = true;
    for (const parameter of parameters) {
      const value = qualityOf(parameter);
      if (value === undefined) {
        valid = false;
        break;
      }
      q = value;
    }
    if (!valid) continue;
    if (rank > specificity) {
      specificity = rank;
      quality = q;
    } else if (rank === specificity) quality = Math.max(quality, q);
  }
  return quality > 0;
}

export function negotiate(req: Request): void {
  if (hasBody(req) && req.headers["content-type"]?.trim().toLowerCase() !== JSONAPI_MEDIA_TYPE)
    throw new ApiError({
      status: 415,
      code: "jsonapi.unsupported_media_type",
      title: "Unsupported media type",
    });
  if (!acceptsJsonApi(req.headers.accept))
    throw new ApiError({ status: 406, code: "jsonapi.not_acceptable", title: "Not acceptable" });
}
