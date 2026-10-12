export const CHANNELS = [
  {
    name: "posts",
    permission: null,
    description: "발행된 글의 이벤트. 익명 연결도 구독할 수 있다.",
  },
  { name: "posts:all", permission: "posts:manage", description: "모든 글의 이벤트." },
] as const;
export const EVENTS = [
  { name: "session.revoked", rooms: ["user:{userId}"], payload: "SessionRevokedEventDocument" },
  { name: "me.updated", rooms: ["user:{userId}"], payload: "UserMeUpdatedEventDocument" },
  {
    name: "post.created",
    rooms: ["posts:all", "user:{authorId}"],
    payload: "PostCreatedEventDocument",
  },
  {
    name: "post.updated",
    rooms: ["posts:all", "user:{authorId}"],
    conditionalRooms: [{ room: "posts", when: "published" }],
    payload: "PostUpdatedEventDocument",
  },
  {
    name: "post.published",
    rooms: ["posts", "posts:all", "user:{authorId}"],
    payload: "PostPublishedEventDocument",
  },
  { name: "post.unpublished", rooms: ["posts"], payload: "PostUnpublishedEventDocument" },
  {
    name: "post.deleted",
    rooms: ["posts:all", "user:{authorId}"],
    conditionalRooms: [{ room: "posts", when: "wasPublished" }],
    payload: "PostDeletedEventDocument",
  },
] as const;
export const MESSAGES = [
  { name: "subscribe", payload: "RealtimeSubscription", ack: "RealtimeAck" },
  { name: "unsubscribe", payload: "RealtimeSubscription", ack: "RealtimeAck" },
] as const;
