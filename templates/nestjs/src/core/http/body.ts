import type { Request } from "express";
import { ApiError } from "../jsonapi/errors.js";
import { hasBody } from "./negotiation.js";

const MAX_BODY_BYTES = 1048576;
function tooLarge(): ApiError {
  return new ApiError({
    status: 413,
    code: "jsonapi.content_too_large",
    title: "Content too large",
  });
}
function invalidDocument(): ApiError {
  return new ApiError({
    status: 400,
    code: "jsonapi.invalid_document",
    title: "Invalid document",
  });
}

export async function readBody(req: Request): Promise<void> {
  if (!hasBody(req)) return;
  if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) {
    req.resume();
    throw tooLarge();
  }
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const clean = () => {
      req.off("data", data);
      req.off("end", end);
      req.off("error", error);
      req.off("aborted", error);
    };
    const error = () => {
      clean();
      reject(invalidDocument());
    };
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        clean();
        req.resume();
        reject(tooLarge());
      } else chunks.push(chunk);
    };
    const end = () => {
      clean();
      resolve(Buffer.concat(chunks, size));
    };
    req.on("data", data);
    req.once("end", end);
    req.once("error", error);
    req.once("aborted", error);
  });
  if (buffer.length === 0) return;
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw invalidDocument();
    req.body = value;
  } catch {
    throw invalidDocument();
  }
}
