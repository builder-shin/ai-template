import { expect, it } from "vitest";
import { eventRooms, type PostEventName } from "../index.js";
const cases: {
  name: PostEventName;
  status: "draft" | "published";
  previous?: { status: "published" };
  rooms: string[];
}[] = [
  { name: "post.created", status: "draft", rooms: ["posts:all", "user:a"] },
  { name: "post.created", status: "published", rooms: ["posts:all", "user:a"] },
  { name: "post.updated", status: "draft", rooms: ["posts:all", "user:a"] },
  { name: "post.updated", status: "published", rooms: ["posts:all", "user:a", "posts"] },
  { name: "post.published", status: "published", rooms: ["posts", "posts:all", "user:a"] },
  { name: "post.unpublished", status: "draft", rooms: ["posts"] },
  { name: "post.deleted", status: "draft", rooms: ["posts:all", "user:a"] },
  { name: "post.deleted", status: "published", rooms: ["posts:all", "user:a", "posts"] },
  {
    name: "post.deleted",
    status: "draft",
    previous: { status: "published" },
    rooms: ["posts:all", "user:a", "posts"],
  },
];
for (const { name, status, previous, rooms } of cases)
  it(`${status} 글의 ${name} 이벤트는 ${rooms.join(",")} 룸으로 보낸다${previous ? " (이전 발행)" : ""}`, () => {
    expect(eventRooms(name, { authorId: "a", status }, previous)).toEqual(rooms);
  });
