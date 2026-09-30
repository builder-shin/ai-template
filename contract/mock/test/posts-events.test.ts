/**
 * 글 이벤트: 계약의 룸으로 보낸다, 초안은 posts 채널로 새지 않는다, 실패한 쓰기는 보내지 않는다, 룸과
 * 페이로드는 계약의 x-realtime-events 선언과 같다. FastAPI 템플릿의 posts/tests/test_events.py와 같은
 * 경우를 본다.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RealtimeEvent } from "../src/core/realtime.ts";
import { isRecord } from "../src/json.ts";
import { contract, contractValidator } from "../src/jsonapi/contract-schemas.ts";
import type { PostResource } from "../src/modules/posts/documents.ts";
import type { MockState } from "../src/state.ts";
import { newUser, send, type SignedIn } from "./accounts.ts";
import { coverRelationship, patchPost, POSTS, writePost } from "./posts.ts";
import { testApp } from "./support.ts";

type App = ReturnType<typeof testApp>["app"];

interface Declaration {
  /** 늘 보내는 룸. 작성자의 룸은 user:{authorId}로 적혀 있다. */
  readonly rooms: readonly string[];
  /** 조건이 맞을 때만 더하는 룸. */
  readonly conditional: readonly string[];
  /** 페이로드의 계약 스키마 이름. */
  readonly payload: string;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/** 계약의 x-realtime-events. */
const DECLARED: ReadonlyMap<string, Declaration> = new Map(
  (Array.isArray(contract["x-realtime-events"]) ? contract["x-realtime-events"] : [])
    .filter(isRecord)
    .map((event) => [
      String(event.name),
      {
        rooms: strings(event.rooms),
        conditional: (Array.isArray(event.conditionalRooms) ? event.conditionalRooms : [])
          .filter(isRecord)
          .map((room) => String(room.room)),
        payload: String(event.payload),
      },
    ]),
);

/** 지금부터 나가는 이벤트를 모은다(FastAPI 테스트의 RecordingPublisher). */
function recorded(state: MockState): RealtimeEvent[] {
  const events: RealtimeEvent[] = [];
  state.realtime.listen({ event: (event) => events.push(event) });
  return events;
}

function sent(events: readonly RealtimeEvent[]): [string, readonly string[]][] {
  return events.map((event) => [event.name, event.rooms]);
}

function resourceOf(event: RealtimeEvent | undefined): PostResource | undefined {
  return (event?.payload as { data: PostResource } | undefined)?.data;
}

function change(app: App, user: SignedIn, postId: string, attributes: Record<string, unknown>) {
  return patchPost(app, user, postId, { attributes });
}

describe("글 이벤트", () => {
  it("초안은 posts:all과 작성자에게만 알린다", async () => {
    const { app, state } = testApp();
    const author = await newUser(app, state);
    const events = recorded(state);
    const post = await writePost(app, author);
    expect(sent(events)).toEqual([["post.created", ["posts:all", `user:${author.userId}`]]]);
    expect(events[0]?.payload).toEqual({ data: post });
    expect(resourceOf(events[0])?.relationships.author.data).toEqual({
      type: "users",
      id: author.userId,
    });
  });

  it("발행하면 공개 채널에도 알리고, 발행을 취소하면 공개 채널에는 식별자만 보낸다", async () => {
    const { app, state } = testApp();
    const author = await newUser(app, state);
    const everyone = ["posts", "posts:all", `user:${author.userId}`];
    const hidden = ["posts:all", `user:${author.userId}`];
    const events = recorded(state);
    const post = await writePost(app, author, { status: "published" });
    expect(sent(events)).toEqual([
      ["post.created", hidden],
      ["post.published", everyone],
    ]);
    events.length = 0;
    expect((await change(app, author, post.id, { title: "고친 제목" })).status).toBe(200);
    expect((await change(app, author, post.id, { status: "draft" })).status).toBe(200);
    expect((await change(app, author, post.id, { status: "published" })).status).toBe(200);
    expect(sent(events)).toEqual([
      ["post.updated", everyone],
      ["post.updated", hidden],
      ["post.unpublished", ["posts"]],
      ["post.published", everyone],
    ]);
    expect(events[2]?.payload).toEqual({ data: { type: "posts", id: post.id } });
    expect(resourceOf(events[1])?.attributes.status).toBe("draft");
    const edited = resourceOf(events[0])?.attributes;
    expect(edited?.title).toBe("고친 제목");
    expect((edited?.updatedAt ?? "") > (edited?.createdAt ?? "")).toBe(true);
  });

  it("지우면 어느 글이 사라졌는지만 알리고, 발행된 글이었으면 공개 채널에도 알린다", async () => {
    const { app, state } = testApp();
    const author = await newUser(app, state);
    const published = await writePost(app, author, { status: "published" });
    const draft = await writePost(app, author);
    const events = recorded(state);
    for (const post of [published, draft]) {
      const path = `${POSTS}/${post.id}`;
      expect((await send(app, "DELETE", path, { token: author.accessToken })).status).toBe(204);
    }
    expect(sent(events)).toEqual([
      ["post.deleted", ["posts", "posts:all", `user:${author.userId}`]],
      ["post.deleted", ["posts:all", `user:${author.userId}`]],
    ]);
    expect(events.map((event) => event.payload)).toEqual([
      { data: { type: "posts", id: published.id } },
      { data: { type: "posts", id: draft.id } },
    ]);
  });

  it("바뀐 것이 없는 고치기도 post.updated를 보낸다", async () => {
    const { app, state } = testApp();
    const author = await newUser(app, state);
    const post = await writePost(app, author);
    const events = recorded(state);
    expect((await patchPost(app, author, post.id, {})).status).toBe(200);
    expect(sent(events)).toEqual([["post.updated", ["posts:all", `user:${author.userId}`]]]);
    expect(events[0]?.payload).toEqual({ data: post });
  });

  it("거절된 쓰기는 아무것도 보내지 않는다", async () => {
    const { app, state } = testApp();
    const author = await newUser(app, state);
    const stranger = await newUser(app, state);
    const post = await writePost(app, author);
    const events = recorded(state);
    expect((await change(app, stranger, post.id, { title: "남의 글" })).status).toBe(404);
    expect((await change(app, author, post.id, { status: "archived" })).status).toBe(422);
    const cover = coverRelationship(randomUUID());
    expect((await patchPost(app, author, post.id, { relationships: cover })).status).toBe(404);
    const document = { data: { type: "posts", attributes: { title: "", body: "본문" } } };
    const created = await send(app, "POST", POSTS, { document, token: author.accessToken });
    expect(created.status).toBe(422);
    expect(events).toEqual([]);
  });

  it("룸과 페이로드는 계약의 x-realtime-events 선언과 같다", async () => {
    const { app, state } = testApp();
    const author = await newUser(app, state);
    const events = recorded(state);
    const post = await writePost(app, author, { status: "published" });
    for (const attributes of [{ title: "고침" }, { status: "draft" }, { body: "다시" }]) {
      expect((await change(app, author, post.id, attributes)).status).toBe(200);
    }
    expect((await change(app, author, post.id, { status: "published" })).status).toBe(200);
    const path = `${POSTS}/${post.id}`;
    expect((await send(app, "DELETE", path, { token: author.accessToken })).status).toBe(204);
    const postEvents = [...DECLARED.keys()].filter((name) => name.startsWith("post."));
    expect(new Set(events.map((event) => event.name))).toEqual(new Set(postEvents));
    const authorRoom = `user:${author.userId}`;
    for (const event of events) {
      const declared = DECLARED.get(event.name);
      if (declared === undefined) throw new Error(`계약에 ${event.name}이 없다.`);
      const rooms = event.rooms.map((room) => (room === authorRoom ? "user:{authorId}" : room));
      const missing = declared.rooms.filter((room) => !rooms.includes(room));
      const allowed = [...declared.rooms, ...declared.conditional];
      const undeclared = rooms.filter((room) => !allowed.includes(room));
      const valid = contractValidator(declared.payload)(structuredClone(event.payload));
      expect([event.name, missing, undeclared, valid]).toEqual([event.name, [], [], true]);
    }
  });
});
