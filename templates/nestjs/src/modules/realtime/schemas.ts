import { z } from "zod";
import { dateTimeString, registerComponent } from "../../core/jsonapi/schemas.js";
import { errorObjectSchema } from "../../core/jsonapi/errors.js";
import { SESSION_REVOKED_REASONS } from "../auth/index.js";
import {
  defineRealtimeChannel,
  defineRealtimeEvent,
  defineRealtimeMessage,
} from "../../core/realtime/declarations.js";
const channel = registerComponent("RealtimeChannel", z.enum(["posts", "posts:all"]));
export const realtimeSubscriptionSchema = registerComponent(
  "RealtimeSubscription",
  z.object({ channel }),
);
registerComponent(
  "RealtimeAck",
  z.object({ ok: z.boolean(), error: errorObjectSchema.optional() }),
);
export type RealtimeAck = { ok: true } | { ok: false; error: z.infer<typeof errorObjectSchema> };
const createAttributes = registerComponent("RealtimeTicketCreateAttributes", z.object({}));
export const realtimeTicketCreateDocumentSchema = registerComponent(
  "RealtimeTicketCreateDocument",
  z.object({
    data: z.object({ type: z.enum(["realtime-tickets"]), attributes: createAttributes }),
  }),
);
const attributes = registerComponent(
  "RealtimeTicketAttributes",
  z.object({ token: z.string(), expiresAt: dateTimeString() }),
);
const resource = registerComponent(
  "RealtimeTicketResource",
  z.object({ type: z.enum(["realtime-tickets"]), id: z.string(), attributes }),
);
registerComponent("RealtimeTicketDocument", z.object({ data: resource }));
const reason = registerComponent("SessionRevokedReason", z.enum(SESSION_REVOKED_REASONS));
registerComponent("SessionRevokedEventDocument", z.object({ meta: z.object({ reason }) }));
defineRealtimeEvent({
  name: "session.revoked",
  rooms: ["user:{userId}"],
  payload: "SessionRevokedEventDocument",
});
defineRealtimeChannel("posts", null);
defineRealtimeChannel("posts:all", "posts:manage");
defineRealtimeMessage("subscribe", "RealtimeSubscription", "RealtimeAck");
defineRealtimeMessage("unsubscribe", "RealtimeSubscription", "RealtimeAck");
