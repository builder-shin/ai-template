import { defineOperation } from "../../core/jsonapi/operation.js";
import { jsonInteger } from "../../core/jsonapi/schemas.js";
import { realtimeTicketCreateDocumentSchema } from "./schemas.js";
const failure = { schema: "ErrorDocument", description: "요청에 실패했다" };
export const createRealtimeTicket = defineOperation({
  operationId: "RealtimeTickets_create",
  method: "POST",
  path: "/api/v1/realtime-tickets",
  tags: ["realtime"],
  summary: "한 번 쓸 수 있는 실시간 연결 티켓을 발급한다",
  auth: "required",
  body: realtimeTicketCreateDocumentSchema,
  responses: {
    201: { schema: "RealtimeTicketDocument", description: "티켓을 발급했다" },
    400: failure,
    401: failure,
    403: failure,
    406: failure,
    409: failure,
    413: failure,
    415: failure,
    422: failure,
    429: {
      ...failure,
      headers: { "Retry-After": { required: true, schema: jsonInteger({ format: "int32" }) } },
    },
    500: failure,
    503: failure,
  },
  errors: [
    "jsonapi.invalid_document",
    "jsonapi.invalid_query",
    "jsonapi.not_acceptable",
    "jsonapi.unsupported_media_type",
    "jsonapi.content_too_large",
    "validation.required",
    "validation.invalid_format",
    "validation.invalid_choice",
    "auth.unauthenticated",
    "auth.token_invalid",
    "auth.token_expired",
    "rate_limit.exceeded",
    "internal.unexpected",
    "service.unavailable",
  ],
});
