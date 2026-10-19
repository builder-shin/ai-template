import { expect, it } from "vitest";
import { eventRooms, POST_STATUSES, type PostEventName } from "../index.js";
import { realtimeDeclarations } from "../../../core/realtime/declarations.js";
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
for (const name of [
  "post.created",
  "post.updated",
  "post.published",
  "post.unpublished",
  "post.deleted",
] as const)
  for (const status of POST_STATUSES)
    for (const prior of [undefined, ...POST_STATUSES])
      it(`${name}의 현재 ${status}·이전 ${prior ?? "없음"} 룸은 선언과 일치한다`, () => {
        const declaration = realtimeDeclarations().events.find((event) => event.name === name);
        if (!declaration) throw new Error("글 이벤트 선언이 없다");
        const conditional = (declaration.conditionalRooms ?? []).filter(({ when }) => {
          if (when === "published") return status === "published";
          if (when === "wasPublished") return (prior ?? status) === "published";
          throw new Error("모르는 글 이벤트 조건이다: " + when);
        });
        const expected = [...declaration.rooms, ...conditional.map(({ room }) => room)].map(
          (room) => room.replace("{authorId}", "a"),
        );
        expect(
          eventRooms(name, { authorId: "a", status }, prior ? { status: prior } : undefined),
        ).toEqual(expected);
      });
