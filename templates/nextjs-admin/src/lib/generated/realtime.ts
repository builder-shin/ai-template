// 직접 수정 금지 — pnpm gen으로 생성한다.
import type { components } from "../api/schema";

export const realtimeEventNames = [
  "session.revoked",
  "me.updated",
  "post.created",
  "post.updated",
  "post.published",
  "post.unpublished",
  "post.deleted"
] as const;
export interface RealtimeEventPayloads {
  "session.revoked": components["schemas"]["SessionRevokedEventDocument"];
  "me.updated": components["schemas"]["UserMeUpdatedEventDocument"];
  "post.created": components["schemas"]["PostCreatedEventDocument"];
  "post.updated": components["schemas"]["PostUpdatedEventDocument"];
  "post.published": components["schemas"]["PostPublishedEventDocument"];
  "post.unpublished": components["schemas"]["PostUnpublishedEventDocument"];
  "post.deleted": components["schemas"]["PostDeletedEventDocument"];
}
export type RealtimeEventName = keyof RealtimeEventPayloads;
