import type { FormResult } from "../../lib/api/errors";
import type { components } from "../../lib/api/schema";

export type FileValue = { id: string; url: string };
// 계약의 headers 생성 타입은 never다. 실제 presigned 헤더 값은 문자열이다.
export type FileUploadRequest = Omit<components["schemas"]["FileUpload"], "headers"> & {
  headers: Record<string, string>;
};
export type UploadFailure = Extract<FormResult, { ok: false }> & {
  retryAfter?: number | null;
};
export type CreateFileResult = UploadFailure | { ok: true; id: string; upload: FileUploadRequest };
export type ReadyFileResult = UploadFailure | { ok: true; file: FileValue };
