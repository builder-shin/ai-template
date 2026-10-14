import { z } from "zod";
import { defineOperation } from "../../core/jsonapi/operation.js";
import { jsonInteger, uuidString } from "../../core/jsonapi/schemas.js";
import { userStatusSchema, userUpdateDocumentSchema } from "./schemas.js";
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
const fields = {
  users: [
    "email",
    "name",
    "locale",
    "status",
    "emailVerifiedAt",
    "createdAt",
    "updatedAt",
    "roles",
    "avatar",
  ],
  roles: ["name", "description", "permissions", "isSystem", "createdAt", "updatedAt"],
  files: ["filename", "contentType", "size", "status", "createdAt", "owner"],
};
const common = { tags: ["users"], auth: "required", permission: "users:read" } as const;
const query = { include: ["roles", "avatar"], fields };
const params = z.object({ id: uuidString() });
export const listUsers = defineOperation({
  ...common,
  operationId: "Users_list",
  method: "GET",
  path: "/api/v1/users",
  summary: "사용자 목록을 조회한다",
  query: {
    ...query,
    filters: { q: z.string(), status: userStatusSchema, role: uuidString() },
    sort: ["createdAt", "name", "email"],
    defaultSort: "-createdAt",
    page: { defaultSize: 20, maxSize: 100 },
  },
  responses: {
    200: { schema: "UserCollectionDocument", description: "사용자 목록이다" },
    ...failures,
  },
  errors: [...errors, "jsonapi.unsupported_sort", "jsonapi.unsupported_include"],
});
export const getUser = defineOperation({
  ...common,
  operationId: "Users_get",
  method: "GET",
  path: "/api/v1/users/{id}",
  summary: "사용자를 조회한다",
  params,
  query,
  responses: {
    200: { schema: "UserDocument", description: "사용자를 조회했다" },
    ...failures,
    404: failure,
  },
  errors: [...errors, "resource.not_found", "jsonapi.unsupported_include"],
});
export const updateUser = defineOperation({
  ...common,
  permission: "users:manage",
  operationId: "Users_update",
  method: "PATCH",
  path: "/api/v1/users/{id}",
  summary: "사용자의 역할과 상태를 바꾼다",
  params,
  body: userUpdateDocumentSchema,
  responses: {
    200: { schema: "UserDocument", description: "사용자를 바꿨다" },
    ...failures,
    404: failure,
    409: failure,
    413: failure,
    415: failure,
    422: failure,
  },
  errors: [
    ...errors,
    "resource.not_found",
    "resource.conflict",
    "jsonapi.invalid_document",
    "jsonapi.unsupported_media_type",
    "jsonapi.content_too_large",
    "validation.required",
    "validation.invalid_format",
    "validation.invalid_choice",
    "role.last_admin_protected",
  ],
});
