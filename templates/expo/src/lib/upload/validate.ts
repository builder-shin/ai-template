import { DisplayError } from "../forms/errors";
import type { PickedFile } from "./types";
import type { components } from "../api/generated/schema";
export function validatePickedFile(file: PickedFile) {
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > 10485760)
    throw new DisplayError("fileTooLarge");
  if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.mimeType))
    throw new DisplayError("fileTypeNotAllowed");
  if (
    !/^(?:file|content):\/\//.test(file.uri) ||
    !file.name ||
    Array.from(file.name).length > 255 ||
    /[\u0000-\u001f\u007f/\\]/.test(file.name)
  )
    throw new DisplayError("invalidImage");
}
export function validateStorage(
  upload: components["schemas"]["FileUpload"] | undefined,
  file: PickedFile,
  release = false,
) {
  try {
    if (
      !upload ||
      upload.method !== "PUT" ||
      typeof upload.url !== "string" ||
      /[\u0000-\u0020\u007f\\]/.test(upload.url)
    )
      throw new Error();
    const url = new URL(upload.url);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      (release && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.hash ||
      !Number.isFinite(Date.parse(upload.expiresAt)) ||
      Date.parse(upload.expiresAt) <= Date.now()
    )
      throw new Error();
    if (
      !upload.headers ||
      typeof upload.headers !== "object" ||
      Array.isArray(upload.headers) ||
      Object.values(upload.headers).some((value) => typeof value !== "string")
    )
      throw new Error();
    const headers = new Headers(upload.headers);
    for (const name of ["Authorization", "Cookie", "Forwarded", "X-Forwarded-For", "X-Real-IP"])
      if (headers.has(name)) throw new Error();
    if (headers.get("Content-Type") !== file.mimeType) throw new Error();
    return upload; // The original URL/header values are opaque signed input, never reconstructed.
  } catch {
    throw new DisplayError("invalidUpload");
  }
}
