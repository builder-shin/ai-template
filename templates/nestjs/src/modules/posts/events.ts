import type { PostStatus } from "./policies.js";
import { defineRealtimeEvent } from "../../core/realtime/declarations.js";
export type PostEventName =
  "post.created" | "post.updated" | "post.published" | "post.unpublished" | "post.deleted";
export function eventRooms(
  name: PostEventName,
  post: { authorId: string; status: PostStatus },
  previous?: { status: PostStatus },
): readonly string[] {
  if (name === "post.unpublished") return ["posts"];
  const privateRooms = ["posts:all", "user:" + post.authorId];
  if (name === "post.published") return ["posts", ...privateRooms];
  return (name === "post.updated" && post.status === "published") ||
    (name === "post.deleted" && (previous?.status ?? post.status) === "published")
    ? [...privateRooms, "posts"]
    : privateRooms;
}
for (const [name, payload] of [
  ["post.created", "PostCreatedEventDocument"],
  ["post.updated", "PostUpdatedEventDocument"],
  ["post.published", "PostPublishedEventDocument"],
  ["post.unpublished", "PostUnpublishedEventDocument"],
  ["post.deleted", "PostDeletedEventDocument"],
] as const) {
  defineRealtimeEvent({
    name,
    payload,
    rooms:
      name === "post.unpublished"
        ? ["posts"]
        : name === "post.published"
          ? ["posts", "posts:all", "user:{authorId}"]
          : ["posts:all", "user:{authorId}"],
    ...(name === "post.updated"
      ? { conditionalRooms: [{ room: "posts", when: "published" }] }
      : name === "post.deleted"
        ? { conditionalRooms: [{ room: "posts", when: "wasPublished" }] }
        : {}),
  });
}
