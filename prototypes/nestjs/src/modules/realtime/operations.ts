import {
  defineOperation,
  COMMON_ERRORS,
  BODY_ERRORS,
  AUTH_ERRORS,
  CONFLICT,
} from "../../core/jsonapi/operation.js";
import { RealtimeTicketCreateDocument, RealtimeTicketDocument } from "./schemas.js";
export const RealtimeTickets_create = defineOperation({
  interface: "RealtimeTickets",
  name: "create",
  method: "POST",
  path: "/api/v1/realtime-tickets",
  tag: "realtime",
  auth: "required",
  errors: [COMMON_ERRORS, BODY_ERRORS, AUTH_ERRORS, CONFLICT],
  body: RealtimeTicketCreateDocument,
  responses: [{ status: 201, schema: RealtimeTicketDocument }],
});
export const REALTIME_OPERATIONS = [RealtimeTickets_create];
