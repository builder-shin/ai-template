import { z } from "zod";
import type { Query, QueryClient } from "@tanstack/react-query";
import { realtimeEventNames, type RealtimeEventPayloads } from "../api/generated/realtime";
export type EventName = keyof RealtimeEventPayloads;
const reasons: Record<RealtimeEventPayloads["session.revoked"]["meta"]["reason"], true> = {
  logout: true,
  password_reset: true,
  account_deactivated: true,
  revoked: true,
  password_changed: true,
  refresh_token_reused: true,
  account_deleted: true,
};
const changes: Record<RealtimeEventPayloads["me.updated"]["meta"]["changed"][number], true> = {
  roles: true,
  status: true,
  profile: true,
};
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function isEventName(name: string): name is EventName {
  return realtimeEventNames.some((known) => known === name);
}
export function validEvent(name: EventName, payload: unknown): boolean {
  if (!record(payload)) return false;
  if (name === "session.revoked")
    return (
      record(payload.meta) &&
      typeof payload.meta.reason === "string" &&
      Object.hasOwn(reasons, payload.meta.reason)
    );
  if (name === "me.updated")
    return (
      record(payload.meta) &&
      Array.isArray(payload.meta.changed) &&
      payload.meta.changed.length > 0 &&
      payload.meta.changed.every(
        (item: unknown) => typeof item === "string" && Object.hasOwn(changes, item),
      )
    );
  return (
    record(payload.data) &&
    payload.data.type === "posts" &&
    z.uuid().safeParse(payload.data.id).success
  );
}
export function revalidateForeground(client: QueryClient, generation: number) {
  void client.invalidateQueries(
    { predicate: (query) => query.queryKey[0] === "session" && query.queryKey[1] === generation },
    { cancelRefetch: false },
  );
}
export function invalidateEvent(
  client: QueryClient,
  generation: number,
  name: Exclude<EventName, "session.revoked">,
  payload: unknown,
) {
  const scoped = (query: Query) =>
    query.queryKey[0] === "session" && query.queryKey[1] === generation;
  if (name === "me.updated") {
    const changed =
      record(payload) && record(payload.meta) && Array.isArray(payload.meta.changed)
        ? payload.meta.changed
        : [];
    // Permission changes can remove private rows from lists as well as details.
    // Profile changes keep an open editor mounted while authoritative data reloads.
    if (changed.some((item) => item === "roles" || item === "status"))
      void client.resetQueries({
        predicate: (query) => scoped(query) && query.queryKey[3] === "posts",
      });
    void client.invalidateQueries(
      {
        predicate: (query) => scoped(query) && ["me", "posts"].includes(String(query.queryKey[3])),
      },
      { cancelRefetch: false },
    );
    return;
  }
  const id = record(payload) && record(payload.data) ? payload.data.id : undefined;
  const detail = (query: Query) =>
    scoped(query) &&
    query.queryKey[3] === "posts" &&
    query.queryKey[4] === "detail" &&
    query.queryKey[5] === id;
  if (name === "post.deleted" || name === "post.unpublished")
    void client.resetQueries({ predicate: detail });
  else void client.invalidateQueries({ predicate: detail }, { cancelRefetch: false });
  // Read authoritative lists rather than appending event payloads or following remote links.
  void client.invalidateQueries(
    {
      predicate: (query) =>
        scoped(query) && query.queryKey[3] === "posts" && query.queryKey[4] === "list",
    },
    { cancelRefetch: false },
  );
}
