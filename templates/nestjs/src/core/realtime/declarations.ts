import type { PermissionCode } from "../security/permissions.js";
export type RealtimeEventName =
  | "session.revoked"
  | "me.updated"
  | "post.created"
  | "post.updated"
  | "post.published"
  | "post.unpublished"
  | "post.deleted";
export interface RealtimeEventDeclaration {
  name: RealtimeEventName;
  rooms: readonly string[];
  conditionalRooms?: readonly { room: string; when: string }[];
  payload: string;
}
export type RealtimeChannelName = "posts" | "posts:all";
const events = new Map<RealtimeEventName, RealtimeEventDeclaration>();
const channels = new Map<
  RealtimeChannelName,
  { name: RealtimeChannelName; permission: PermissionCode | null }
>();
const messages = new Map<string, { name: string; payload: string; ack: string }>();
export function defineRealtimeEvent(declaration: RealtimeEventDeclaration): void {
  if (events.has(declaration.name))
    throw new Error("실시간 이벤트가 중복된다: " + declaration.name);
  events.set(declaration.name, declaration);
}
export function defineRealtimeChannel(
  name: RealtimeChannelName,
  permission: PermissionCode | null,
): void {
  if (channels.has(name)) throw new Error("실시간 채널이 중복된다: " + name);
  channels.set(name, { name, permission });
}
export function defineRealtimeMessage(
  name: "subscribe" | "unsubscribe",
  payload: string,
  ack: string,
): void {
  if (messages.has(name)) throw new Error("실시간 메시지가 중복된다: " + name);
  messages.set(name, { name, payload, ack });
}
export function realtimeDeclarations() {
  return {
    events: [...events.values()],
    channels: [...channels.values()],
    messages: [...messages.values()],
  };
}
