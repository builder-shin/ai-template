import { defineOperation } from "../../core/jsonapi/operation.js";
import { jsonInteger } from "../../core/jsonapi/schemas.js";
import { userMeUpdateDocumentSchema } from "./schemas.js";
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
export const getMe = defineOperation({
  operationId: "Me_get",
  method: "GET",
  path: "/api/v1/me",
  tags: ["me"],
  summary: "내 정보와 실제 권한을 조회한다",
  auth: "required",
  query: {
    include: ["roles", "avatar"],
    fields: {
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
    },
  },
  responses: { 200: { schema: "UserMeDocument", description: "내 정보를 조회했다" }, ...failures },
  errors: [...errors, "jsonapi.unsupported_include"],
});
export const updateMe = defineOperation({
  operationId: "Me_update",
  method: "PATCH",
  path: "/api/v1/me",
  tags: ["me"],
  summary: "내 이름과 로케일과 아바타를 바꾼다",
  auth: "required",
  body: userMeUpdateDocumentSchema,
  bodyIdSource: "principal",
  responses: {
    200: { schema: "UserMeDocument", description: "내 정보를 바꿨다" },
    ...failures,
    404: failure,
    409: failure,
    413: failure,
    415: failure,
    422: failure,
  },
  errors: [
    ...errors,
    "jsonapi.invalid_document",
    "jsonapi.unsupported_media_type",
    "jsonapi.content_too_large",
    "validation.required",
    "validation.invalid_format",
    "validation.too_short",
    "validation.too_long",
    "validation.invalid_choice",
    "resource.conflict",
    "resource.not_found",
    "file.upload_incomplete",
  ],
});
export const deleteMe = defineOperation({
  operationId: "Me_delete",
  method: "DELETE",
  path: "/api/v1/me",
  tags: ["me"],
  summary: "내 정보를 익명화하고 탈퇴한다",
  auth: "required",
  responses: { 204: { description: "탈퇴했다" }, ...failures, 422: failure },
  errors: [...errors, "auth.reauthentication_required", "role.last_admin_protected"],
});
