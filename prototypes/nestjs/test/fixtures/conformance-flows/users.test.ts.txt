import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  api,
  codes,
  LONE_SURROGATE,
  newUser,
  problems,
  signIn,
  signInAdmin,
  target,
  userWith,
} from "./support.ts";

type Status = "active" | "deactivated" | "deleted";

describe(`사용자 관리 (${target.name})`, () => {
  it("관리자는 사용자를 찾아 전체 속성과 역할을 본다", async () => {
    const [manager, user] = await Promise.all([signInAdmin(), newUser()]);
    const { data, response } = await manager.api.GET("/api/v1/users", {
      params: { query: { "filter[q]": user.email, include: "roles" } },
    });
    expect(response.status).toBe(200);
    expect(data?.data.map((found) => [found.id, found.attributes.email])).toEqual([
      [user.userId, user.email],
    ]);
    expect(data?.included?.map((resource) => resource.type)).toEqual(["roles"]);
    const one = await manager.api.GET("/api/v1/users/{id}", {
      params: { path: { id: user.userId } },
    });
    expect(one.data?.data.attributes.email).toBe(user.email);
    const missing = await manager.api.GET("/api/v1/users/{id}", {
      params: { path: { id: randomUUID() } },
    });
    expect(missing.response.status).toBe(404);
  });

  it("users:read가 없으면 사용자를 보지 못한다", async () => {
    const user = await newUser();
    const { error, response } = await user.api.GET("/api/v1/users");
    expect(response.status).toBe(403);
    expect(codes(error)).toEqual(["permission.denied"]);
  });

  it("비활성화하면 세션이 끝나고 로그인하지 못하며, 다시 활성화하면 로그인한다", async () => {
    const [manager, user] = await Promise.all([signInAdmin(), newUser()]);
    const setStatus = (status: Status) =>
      manager.api.PATCH("/api/v1/users/{id}", {
        params: { path: { id: user.userId } },
        body: { data: { type: "users", id: user.userId, attributes: { status } } },
      });
    const deactivated = await setStatus("deactivated");
    expect(deactivated.data?.data.attributes.status).toBe("deactivated");
    expect((await user.api.GET("/api/v1/me")).response.status).toBe(401);
    const { error } = await api().POST("/api/v1/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: { grantType: "password", email: user.email, password: user.password },
        },
      },
    });
    expect(codes(error)).toEqual(["auth.account_deactivated"]);
    expect((await setStatus("active")).response.status).toBe(200);
    await signIn(user);
  });

  it("역할을 바꾸면 그 사용자의 권한에 곧바로 반영된다", async () => {
    const reader = await userWith(["users:read"]);
    const { data } = await reader.api.GET("/api/v1/me");
    expect(data?.meta.permissions).toEqual(["posts:create", "users:read"]);
    expect((await reader.api.GET("/api/v1/users")).response.status).toBe(200);
  });

  it("탈퇴 상태로 바꾸거나 없는 역할을 주지 못한다", async () => {
    const [manager, user] = await Promise.all([signInAdmin(), newUser()]);
    const update = (data: Record<string, unknown>) =>
      manager.api.PATCH("/api/v1/users/{id}", {
        params: { path: { id: user.userId } },
        body: { data: { type: "users", id: user.userId, ...data } },
      });
    const deleted = await update({ attributes: { status: "deleted" } });
    expect(deleted.response.status).toBe(422);
    expect(problems(deleted.error)).toEqual([
      ["validation.invalid_choice", "/data/attributes/status"],
    ]);
    const current = await manager.api.GET("/api/v1/users/{id}", {
      params: { path: { id: user.userId } },
    });
    const held = current.data?.data.relationships.roles.data ?? [];
    const missingRole = await update({
      relationships: { roles: { data: [...held, { type: "roles", id: randomUUID() }] } },
    });
    expect(missingRole.response.status).toBe(404);
    expect(problems(missingRole.error)).toEqual([
      ["resource.not_found", `/data/relationships/roles/data/${String(held.length)}`],
    ]);
  });

  it("역할 id에 짝 없는 서로게이트가 있어도 없는 역할과 같은 404다", async () => {
    // 없는 역할의 detail은 id를 그대로 담는다. 응답은 그 글자를 \uXXXX로 이스케이프해야 한다.
    const [manager, user] = await Promise.all([signInAdmin(), newUser()]);
    const { error, response } = await manager.api.PATCH("/api/v1/users/{id}", {
      params: { path: { id: user.userId } },
      body: {
        data: {
          type: "users",
          id: user.userId,
          relationships: { roles: { data: [{ type: "roles", id: LONE_SURROGATE }] } },
        },
      },
    });
    expect(response.status).toBe(404);
    expect(problems(error)).toEqual([["resource.not_found", "/data/relationships/roles/data/0"]]);
  });

  it("자기 자신이나 나보다 권한이 큰 사용자는 바꾸지 못하고, 내 권한을 넘는 역할은 주지 못한다", async () => {
    const manager = await userWith(["users:read", "users:manage"]);
    const stronger = await userWith(["roles:manage"]);
    const powerful = await userWith(["audit-logs:read"]);
    const deactivate = (userId: string) =>
      manager.api.PATCH("/api/v1/users/{id}", {
        params: { path: { id: userId } },
        body: { data: { type: "users", id: userId, attributes: { status: "deactivated" } } },
      });
    for (const userId of [manager.userId, stronger.userId]) {
      const { error, response } = await deactivate(userId);
      expect(response.status).toBe(403);
      expect(codes(error)).toEqual(["permission.denied"]);
    }
    const member = await newUser();
    const grant = await manager.api.PATCH("/api/v1/users/{id}", {
      params: { path: { id: member.userId } },
      body: {
        data: {
          type: "users",
          id: member.userId,
          relationships: { roles: { data: [{ type: "roles", id: powerful.roleId }] } },
        },
      },
    });
    expect(grant.response.status).toBe(403);
    expect(codes(grant.error)).toEqual(["permission.denied"]);
  });
});
