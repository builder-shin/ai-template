import { z } from "zod";
import { defineOperation } from "../../core/jsonapi/operation.js";
import { jsonInteger, uuidString, dateTimeString } from "../../core/jsonapi/schemas.js";
import { auditLogActionSchema } from "../../core/audit/actions.js";
import { auditLogTargetTypeSchema } from "./schemas.js";
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
  "jsonapi.unsupported_include",
  "jsonapi.not_acceptable",
  "rate_limit.exceeded",
  "internal.unexpected",
  "service.unavailable",
] as const;
const common = { auth: "required", permission: "audit-logs:read", tags: ["audit-logs"] } as const;
const query = {
  include: ["actor"],
  fields: {
    "audit-logs": [
      "action",
      "targetType",
      "targetId",
      "metadata",
      "ipAddress",
      "createdAt",
      "actor",
    ],
    users: ["name", "avatar"],
  },
};
export const listAuditLogs = defineOperation({
  ...common,
  operationId: "AuditLogs_list",
  method: "GET",
  path: "/api/v1/audit-logs",
  summary: "감사 로그 목록을 조회한다",
  query: {
    ...query,
    filters: {
      actor: uuidString(),
      action: auditLogActionSchema,
      targetType: auditLogTargetTypeSchema,
      createdFrom: dateTimeString(),
      createdTo: dateTimeString(),
    },
    sort: ["createdAt"],
    defaultSort: "-createdAt",
    page: { defaultSize: 20, maxSize: 100 },
  },
  responses: {
    200: { schema: "AuditLogCollectionDocument", description: "감사 로그 목록이다" },
    ...failures,
  },
  errors: [...errors, "jsonapi.unsupported_sort"],
});
export const getAuditLog = defineOperation({
  ...common,
  operationId: "AuditLogs_get",
  method: "GET",
  path: "/api/v1/audit-logs/{id}",
  summary: "감사 로그를 조회한다",
  params: z.object({ id: uuidString() }),
  query,
  responses: {
    200: { schema: "AuditLogDocument", description: "감사 로그를 조회했다" },
    ...failures,
    404: failure,
  },
  errors: [...errors, "resource.not_found"],
});
