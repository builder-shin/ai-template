import { describe, expect, it } from "vitest";
import {
  compareSpecs,
  describeComparison,
  normalizePath,
  type OpenApiLike,
  reachableSchemas,
  realtimeMismatches,
  restrictToImplemented,
} from "../../src/spec-compare/compare.ts";

const contract: OpenApiLike = {
  paths: {
    "/api/v1/posts": { get: {}, post: {} },
    "/api/v1/posts/{id}": { get: {}, parameters: [] },
  },
  components: { schemas: { PostDocument: {}, ErrorDocument: {} } },
};

describe("compareSpecs", () => {
  it("경로 파라미터 이름이 달라도, 보조 스키마가 더 있어도 통과한다", () => {
    const implementation: OpenApiLike = {
      paths: {
        "/api/v1/posts": { get: {}, post: {} },
        "/api/v1/posts/{post_id}": { get: {} },
      },
      components: { schemas: { PostDocument: {}, ErrorDocument: {}, PostCreateData: {} } },
    };
    expect(describeComparison(compareSpecs(contract, implementation))).toEqual([]);
  });

  it("계약의 스키마가 없으면 이름을 알려 준다", () => {
    const implementation: OpenApiLike = {
      ...contract,
      components: { schemas: { PostDocument: {} } },
    };
    expect(compareSpecs(contract, implementation).missingSchemas).toEqual(["ErrorDocument"]);
  });

  it("빠진 operation과 계약에 없는 operation을 모두 잡는다", () => {
    const implementation: OpenApiLike = {
      ...contract,
      paths: {
        "/api/v1/posts": { get: {} },
        "/api/v1/posts/{id}": { get: {}, delete: {} },
      },
    };
    const result = compareSpecs(contract, implementation);
    expect(result.missingOperations).toEqual(["POST /api/v1/posts"]);
    expect(result.extraOperations).toEqual(["DELETE /api/v1/posts/{}"]);
  });
});

describe("normalizePath", () => {
  it("경로 파라미터 이름을 지운다", () => {
    expect(normalizePath("/api/v1/oauth/{provider}/callback")).toBe("/api/v1/oauth/{}/callback");
  });
});

describe("부분 비교(--subset)", () => {
  const referenced: OpenApiLike = {
    paths: {
      "/health/live": {
        get: { responses: { "200": { $ref: "#/components/schemas/HealthReport" } } },
      },
      "/api/v1/posts": {
        get: { responses: { "200": { $ref: "#/components/schemas/PostCollectionDocument" } } },
      },
    },
    components: {
      schemas: {
        HealthReport: { properties: { checks: { $ref: "#/components/schemas/HealthCheck" } } },
        HealthCheck: {},
        PostCollectionDocument: {},
        ErrorCode: {},
      },
    },
  };

  it("구현에 있는 operation만 남기고, 그 operation에서 닿는 스키마만 요구한다", () => {
    const implementation: OpenApiLike = {
      paths: { "/health/live": { get: {} } },
      components: { schemas: { HealthReport: {} } },
    };
    expect(Object.keys(restrictToImplemented(referenced, implementation).paths ?? {})).toEqual([
      "/health/live",
    ]);
    expect([...reachableSchemas(restrictToImplemented(referenced, implementation))].sort()).toEqual(
      ["HealthCheck", "HealthReport"],
    );
    expect(compareSpecs(referenced, implementation, { subset: true })).toEqual({
      missingSchemas: ["HealthCheck"],
      missingOperations: [],
      extraOperations: [],
      realtimeMismatches: [],
    });
  });

  it("부분 모드에서도 계약에 없는 operation은 잡는다", () => {
    const implementation: OpenApiLike = {
      paths: { "/health/live": { get: {} }, "/api/v1/widgets": { get: {} } },
      components: { schemas: { HealthReport: {}, HealthCheck: {} } },
    };
    expect(compareSpecs(referenced, implementation, { subset: true }).extraOperations).toEqual([
      "GET /api/v1/widgets",
    ]);
  });

  it("전체 모드는 지금처럼 모든 operation과 스키마를 요구한다", () => {
    const implementation: OpenApiLike = {
      paths: { "/health/live": { get: {} } },
      components: { schemas: { HealthReport: {}, HealthCheck: {} } },
    };
    const result = compareSpecs(referenced, implementation);
    expect(result.missingOperations).toEqual(["GET /api/v1/posts"]);
    expect(result.missingSchemas).toEqual(["ErrorCode", "PostCollectionDocument"]);
  });
});

describe("실시간 확장", () => {
  const realtime: OpenApiLike = {
    "x-realtime-channels": [{ name: "posts", permission: null, description: "계약의 설명" }],
    "x-realtime-events": [
      { name: "post.created", rooms: ["posts:all"], payload: "PostCreatedEventDocument" },
    ],
    "x-realtime-messages": [
      { name: "subscribe", payload: "RealtimeSubscription", ack: "RealtimeAck" },
    ],
  };

  it("설명이 달라도, 구현의 항목이 더 있어도 통과한다", () => {
    const implementation: OpenApiLike = {
      ...realtime,
      "x-realtime-channels": [
        { name: "posts", permission: null, description: "구현의 설명" },
        { name: "comments", permission: null, description: "프로젝트가 더한 채널" },
      ],
    };
    expect(realtimeMismatches(realtime, implementation)).toEqual([]);
  });

  it("빠졌거나 모양이 다른 항목을 이름으로 알려 준다", () => {
    const implementation: OpenApiLike = {
      "x-realtime-events": [
        { name: "post.created", rooms: ["posts"], payload: "PostCreatedEventDocument" },
      ],
      "x-realtime-messages": realtime["x-realtime-messages"],
    };
    expect(realtimeMismatches(realtime, implementation)).toEqual([
      "x-realtime-channels: posts",
      "x-realtime-events: post.created",
    ]);
  });

  it("부분 모드는 실시간 항목을 보지 않는다", () => {
    expect(compareSpecs(realtime, {}, { subset: true }).realtimeMismatches).toEqual([]);
    expect(compareSpecs(realtime, {}).realtimeMismatches).toHaveLength(3);
  });
});
