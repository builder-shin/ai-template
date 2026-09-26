import { describe, expect, it } from "vitest";
import { refName, resourceType, schema, spec } from "./spec.ts";

interface RealtimeEvent {
  name: string;
  rooms: string[];
  conditionalRooms?: { room: string; when: string }[];
  payload: string;
}

interface RealtimeChannel {
  name: string;
  permission: string | null;
}

const events = spec["x-realtime-events"] as RealtimeEvent[];
const channels = spec["x-realtime-channels"] as RealtimeChannel[];

describe("실시간 (§4.7)", () => {
  it("이벤트 목록이 스펙의 표와 같다", () => {
    expect(events).toEqual([
      {
        name: "session.revoked",
        rooms: ["user:{userId}"],
        payload: "SessionRevokedEventDocument",
      },
      {
        name: "me.updated",
        rooms: ["user:{userId}"],
        payload: "UserMeUpdatedEventDocument",
      },
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
      {
        name: "post.deleted",
        rooms: ["posts:all", "user:{authorId}"],
        conditionalRooms: [{ room: "posts", when: "wasPublished" }],
        payload: "PostDeletedEventDocument",
      },
    ]);
  });

  it("모든 이벤트 페이로드가 계약의 스키마로 존재한다", () => {
    for (const event of events) {
      expect(() => schema(event.payload)).not.toThrow();
    }
  });

  it("글 이벤트 페이로드는 posts 리소스 문서다", () => {
    const published = schema("PostPublishedEventDocument").properties?.data;
    expect(published?.$ref).toBe("#/components/schemas/PostResource");
    expect(resourceType(schema("PostResource"))).toBe("posts");
  });

  it("공개 채널과 권한이 필요한 채널을 구분한다", () => {
    expect(channels).toEqual([
      expect.objectContaining({ name: "posts", permission: null }),
      expect.objectContaining({ name: "posts:all", permission: "posts:manage" }),
    ]);
  });

  it("세션 폐기 사유는 FastAPI 설계 §6.1의 일곱 가지다", () => {
    expect(schema("SessionRevokedReason").enum).toEqual([
      "logout",
      "password_reset",
      "account_deactivated",
      "revoked",
      "password_changed",
      "refresh_token_reused",
      "account_deleted",
    ]);
  });

  it("클라이언트 메시지와 ack를 x-realtime-messages와 스키마로 적는다(FastAPI 설계 F22)", () => {
    expect(spec["x-realtime-messages"]).toEqual([
      { name: "subscribe", payload: "RealtimeSubscription", ack: "RealtimeAck" },
      { name: "unsubscribe", payload: "RealtimeSubscription", ack: "RealtimeAck" },
    ]);
    expect(schema("RealtimeChannel").enum).toEqual(channels.map((channel) => channel.name));
    expect(refName(schema("RealtimeSubscription").properties?.channel)).toBe("RealtimeChannel");
    const ack = schema("RealtimeAck");
    expect(ack.required).toEqual(["ok"]);
    expect(refName(ack.properties?.error)).toBe("ErrorObject");
  });
});
