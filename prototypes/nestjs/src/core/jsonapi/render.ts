import type { Response } from "express";
export const JSONAPI_MEDIA_TYPE = "application/vnd.api+json";
export function writeDocument(res: Response, status: number, document: unknown): void {
  const bytes = Buffer.from(JSON.stringify(document), "utf8");
  res
    .status(status)
    .set("Content-Type", JSONAPI_MEDIA_TYPE)
    .set("Content-Length", String(bytes.length));
  res.end(bytes);
}
