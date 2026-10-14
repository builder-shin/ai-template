import { z } from "zod";
import { defineOperation } from "../../core/jsonapi/operation.js";
import { jsonInteger, uuidString } from "../../core/jsonapi/schemas.js";
import { roleCreateDocumentSchema, roleUpdateDocumentSchema } from "./schemas.js";
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
const errors = [
  "auth.unauthenticated",
  "auth.token_invalid",
  "auth.token_expired",
  "permission.denied",
  "jsonapi.invalid_query",
  "jsonapi.not_acceptable",
  "rate_limit.exceeded",
  "internal.unexpected",
  "service.unavailable",
] as const;
const writeErrors = [
  "jsonapi.invalid_document",
  "jsonapi.unsupported_media_type",
  "jsonapi.content_too_large",
  "validation.required",
  "validation.invalid_format",
  "validation.too_short",
  "validation.too_long",
  "validation.invalid_choice",
  "validation.already_taken",
  "resource.conflict",
] as const;
const writeFailures = { ...failures, 409: failure, 413: failure, 415: failure, 422: failure };
const common = { tags: ["roles"], auth: "required", permission: "roles:read" } as const;
const params = z.object({ id: uuidString() });
const fields = {
  roles: ["name", "description", "permissions", "isSystem", "createdAt", "updatedAt"],
};
export const listRoles = defineOperation({
  ...common,
  operationId: "Roles_list",
  method: "GET",
  path: "/api/v1/roles",
  summary: "역할 목록을 조회한다",
  query: {
    fields,
    filters: { q: z.string() },
    sort: ["name", "createdAt"],
    defaultSort: "name",
    page: { defaultSize: 20, maxSize: 100 },
  },
  responses: {
    200: { schema: "RoleCollectionDocument", description: "역할 목록이다" },
    ...failures,
  },
  errors: [...errors, "jsonapi.unsupported_sort"],
});
export const getRole = defineOperation({
  ...common,
  operationId: "Roles_get",
  method: "GET",
  path: "/api/v1/roles/{id}",
  summary: "역할을 조회한다",
  params,
  query: { fields },
  responses: {
    200: { schema: "RoleDocument", description: "역할을 조회했다" },
    ...failures,
    404: failure,
  },
  errors: [...errors, "resource.not_found"],
});
export const createRole = defineOperation({
  ...common,
  permission: "roles:manage",
  operationId: "Roles_create",
  method: "POST",
  path: "/api/v1/roles",
  summary: "역할을 만든다",
  body: roleCreateDocumentSchema,
  responses: { 201: { schema: "RoleDocument", description: "역할을 만들었다" }, ...writeFailures },
  errors: [...errors, ...writeErrors],
});
export const updateRole = defineOperation({
  ...common,
  permission: "roles:manage",
  operationId: "Roles_update",
  method: "PATCH",
  path: "/api/v1/roles/{id}",
  summary: "역할을 바꾼다",
  params,
  body: roleUpdateDocumentSchema,
  responses: {
    200: { schema: "RoleDocument", description: "역할을 바꿨다" },
    ...writeFailures,
    404: failure,
  },
  errors: [...errors, ...writeErrors, "resource.not_found", "role.system_role_protected"],
});
export const deleteRole = defineOperation({
  ...common,
  permission: "roles:manage",
  operationId: "Roles_delete",
  method: "DELETE",
  path: "/api/v1/roles/{id}",
  summary: "역할을 지운다",
  params,
  responses: { 204: { description: "역할을 지웠다" }, ...failures, 404: failure, 422: failure },
  errors: [...errors, "resource.not_found", "role.system_role_protected"],
});
