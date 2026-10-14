import { z } from "zod";
import { defineOperation } from "../../core/jsonapi/operation.js";
import { jsonInteger, uuidString } from "../../core/jsonapi/schemas.js";
import { fileCreateDocumentSchema, fileUpdateDocumentSchema } from "./schemas.js";
const failure = { schema: "ErrorDocument", description: "요청에 실패했다" };
const failures = {
  400: failure,
  401: failure,
  403: failure,
  406: failure,
  429: {
    ...failure,
    headers: { "Retry-After": { required: true, schema: jsonInteger({ format: "int32" }) } },
  },
  500: failure,
  503: failure,
};
const writeFailures = { ...failures, 409: failure, 413: failure, 415: failure, 422: failure };
const errors = [
  "jsonapi.invalid_document",
  "jsonapi.invalid_query",
  "jsonapi.not_acceptable",
  "auth.unauthenticated",
  "auth.token_invalid",
  "auth.token_expired",
  "permission.denied",
  "rate_limit.exceeded",
  "internal.unexpected",
  "service.unavailable",
] as const;
const writeErrors = [
  "jsonapi.unsupported_media_type",
  "jsonapi.content_too_large",
  "validation.required",
  "validation.invalid_format",
  "validation.too_short",
  "validation.too_long",
  "validation.invalid_choice",
  "validation.out_of_range",
  "resource.conflict",
] as const;
const params = z.object({ id: uuidString() });
export const createFile = defineOperation({
  operationId: "Files_create",
  method: "POST",
  path: "/api/v1/files",
  tags: ["files"],
  summary: "파일 업로드를 준비한다",
  auth: "required",
  body: fileCreateDocumentSchema,
  responses: {
    201: { schema: "FileDocument", description: "업로드를 준비했다" },
    ...writeFailures,
  },
  errors: [
    ...errors,
    ...writeErrors,
    "file.too_large",
    "file.type_not_allowed",
    "file.quota_exceeded",
  ],
});
export const getFile = defineOperation({
  operationId: "Files_get",
  method: "GET",
  path: "/api/v1/files/{id}",
  tags: ["files"],
  summary: "읽을 수 있는 파일을 조회한다",
  auth: "optional",
  params,
  query: { fields: { files: ["filename", "contentType", "size", "status", "createdAt", "owner"] } },
  responses: {
    200: { schema: "FileDocument", description: "파일을 조회했다" },
    ...failures,
    404: failure,
  },
  errors: [...errors, "resource.not_found"],
});
export const updateFile = defineOperation({
  operationId: "Files_update",
  method: "PATCH",
  path: "/api/v1/files/{id}",
  tags: ["files"],
  summary: "파일 업로드 완료를 확인한다",
  auth: "required",
  params,
  body: fileUpdateDocumentSchema,
  responses: {
    200: { schema: "FileDocument", description: "파일을 확인했다" },
    ...writeFailures,
    404: failure,
  },
  errors: [...errors, ...writeErrors, "resource.not_found", "file.upload_incomplete"],
});
export const deleteFile = defineOperation({
  operationId: "Files_delete",
  method: "DELETE",
  path: "/api/v1/files/{id}",
  tags: ["files"],
  summary: "내 파일을 삭제한다",
  auth: "required",
  params,
  responses: { 204: { description: "파일을 삭제했다" }, ...failures, 404: failure },
  errors: [...errors, "resource.not_found"],
});
