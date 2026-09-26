import { describe, expect, it } from "vitest";
import { resourceType, schema, spec } from "./spec.ts";

interface RealtimeEvent {
  name: string;
  rooms: string[];
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
    expect(events.map((event) => event.name)).toEqual([
      "session.revoked",
      "me.updated",
      "post.created",
      "post.updated",
      "post.published",
      "post.deleted",
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
});
