import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { codes, newUser, signInAdmin, target, userWith } from "./support.ts";

describe(`감사 로그 (${target.name})`, () => {
  it("로그인은 감사 로그에 남고, 행위자는 이메일 없는 공개 사용자로 포함된다", async () => {
    const [manager, user] = await Promise.all([signInAdmin(), newUser()]);
    const { data, response } = await manager.api.GET("/api/v1/audit-logs", {
      params: {
        query: {
          "filter[actor]": user.userId,
          "filter[action]": "session.login_succeeded",
          include: "actor",
        },
      },
    });
    expect(response.status).toBe(200);
    expect(data?.data.map((log) => [log.attributes.targetType, log.attributes.targetId])).toEqual([
      ["users", user.userId],
    ]);
    expect(data?.included).toEqual([
      {
        type: "users",
        id: user.userId,
        attributes: { name: "적합성" },
        relationships: { avatar: { data: null } },
      },
    ]);

    const id = data?.data[0]?.id ?? "";
    const one = await manager.api.GET("/api/v1/audit-logs/{id}", { params: { path: { id } } });
    expect(one.data?.data.attributes.action).toBe("session.login_succeeded");
    const missing = await manager.api.GET("/api/v1/audit-logs/{id}", {
      params: { path: { id: randomUUID() } },
    });
    expect(missing.response.status).toBe(404);
  });

  it("관리자가 역할을 바꾸면 user.roles_changed로 남는다", async () => {
    const [manager, reader] = await Promise.all([signInAdmin(), userWith(["users:read"])]);
    const { data } = await manager.api.GET("/api/v1/audit-logs", {
      params: {
        query: {
          "filter[actor]": manager.userId,
          "filter[action]": "user.roles_changed",
          "filter[targetType]": "users",
          "page[size]": 100,
        },
      },
    });
    const log = data?.data.find((entry) => entry.attributes.targetId === reader.userId);
    expect(log?.attributes.metadata).toMatchObject({ removed: [] });
  });

  it("기간 필터는 그 기간에 남은 기록만 준다", async () => {
    const manager = await signInAdmin();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data } = await manager.api.GET("/api/v1/audit-logs", {
      params: { query: { "filter[createdFrom]": future } },
    });
    expect(data?.data).toEqual([]);
    expect(data?.meta.page.total).toBe(0);
  });

  it("audit-logs:read가 없으면 감사 로그를 보지 못한다", async () => {
    const user = await newUser();
    const { error, response } = await user.api.GET("/api/v1/audit-logs");
    expect(response.status).toBe(403);
    expect(codes(error)).toEqual(["permission.denied"]);
  });
});
