import { defineOperation } from "../../core/jsonapi/operation.js";
import { jsonInteger } from "../../core/jsonapi/schemas.js";
import "./schemas.js";
const failure = { schema: "ErrorDocument", description: "요청에 실패했다" };
export const listPermissions = defineOperation({
  operationId: "Permissions_list",
  method: "GET",
  path: "/api/v1/permissions",
  tags: ["permissions"],
  summary: "권한 목록을 조회한다",
  auth: "required",
  permission: "roles:read",
  query: {
    sort: ["id"],
    defaultSort: "id",
    fields: { permissions: ["description", "group"] },
    page: { defaultSize: 20, maxSize: 100 },
  },
  responses: {
    200: { schema: "PermissionCollectionDocument", description: "권한 목록이다" },
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
  },
  errors: [
    "auth.unauthenticated",
    "auth.token_invalid",
    "auth.token_expired",
    "permission.denied",
    "jsonapi.invalid_query",
    "jsonapi.unsupported_sort",
    "jsonapi.not_acceptable",
    "rate_limit.exceeded",
    "internal.unexpected",
    "service.unavailable",
  ],
});
