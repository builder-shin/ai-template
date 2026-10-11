import { z } from "zod";
import {
  contractSchema,
  resource,
  document,
  createDocument,
  datetime,
  schemaRef,
  identifier,
  ErrorObjectSchema,
} from "../../core/jsonapi/schemas.js";
import { codePointString } from "../../core/jsonapi/strings.js";
export const RealtimeTicketAttributes = contractSchema(
  "RealtimeTicketAttributes",
  z.object({ token: codePointString(), expiresAt: datetime() }),
);
export const RealtimeTicketCreateAttributes = contractSchema(
  "RealtimeTicketCreateAttributes",
  z.object({}),
);
export const RealtimeTicketResource = contractSchema(
  "RealtimeTicketResource",
  resource("realtime-tickets", RealtimeTicketAttributes),
);
export const RealtimeTicketDocument = contractSchema(
  "RealtimeTicketDocument",
  document(RealtimeTicketResource),
);
export const RealtimeTicketCreateDocument = contractSchema(
  "RealtimeTicketCreateDocument",
  createDocument("realtime-tickets", RealtimeTicketCreateAttributes),
);
const SessionRevokedReason = contractSchema(
  "SessionRevokedReason",
  z.enum([
    "logout",
    "password_reset",
    "account_deactivated",
    "revoked",
    "password_changed",
    "refresh_token_reused",
    "account_deleted",
  ]),
);
export const SessionRevokedEventDocument = contractSchema(
  "SessionRevokedEventDocument",
  z.object({ meta: z.object({ reason: SessionRevokedReason }) }),
);
export const UserMeUpdatedEventDocument = contractSchema(
  "UserMeUpdatedEventDocument",
  z.object({ meta: z.object({ changed: z.array(z.enum(["roles", "status", "profile"])) }) }),
);
for (const name of [
  "PostCreatedEventDocument",
  "PostUpdatedEventDocument",
  "PostPublishedEventDocument",
] as const)
  contractSchema(name, document(schemaRef("PostResource")));
for (const name of ["PostUnpublishedEventDocument", "PostDeletedEventDocument"] as const)
  contractSchema(name, document(identifier("posts")));
export const RealtimeChannel = contractSchema("RealtimeChannel", z.enum(["posts", "posts:all"]));
export const RealtimeSubscription = contractSchema(
  "RealtimeSubscription",
  z.object({ channel: RealtimeChannel }),
);
export const RealtimeAck = contractSchema(
  "RealtimeAck",
  z.object({ ok: z.boolean(), error: ErrorObjectSchema.optional() }),
);
