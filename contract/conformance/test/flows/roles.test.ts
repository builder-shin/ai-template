import { describe, expect, it } from "vitest";
import {
  codes,
  newUser,
  type PermissionCode,
  problems,
  type Session,
  signInAdmin,
  target,
  uniqueName,
  userWith,
} from "./support.ts";

function createRole(session: Session, name: string, permissions: PermissionCode[]) {
  return session.api.POST("/api/v1/roles", {
    body: { data: { type: "roles", attributes: { name, permissions } } },
  });
}

async function systemRole(session: Session, name: "admin" | "member"): Promise<string> {
  const { data } = await session.api.GET("/api/v1/roles", {
    params: { query: { "filter[q]": name, "page[size]": 100 } },
  });
  const found = data?.data.find((role) => role.attributes.name === name);
  if (found === undefined) throw new Error(`시스템 역할 ${name}이 없다`);
  return found.id;
}

describe(`역할 (${target.name})`, () => {
  it("역할을 만들고, 읽고, 고치고, 지운다", async () => {
    const manager = await signInAdmin();
    const name = uniqueName("editor");
    const created = await createRole(manager, name, ["posts:create"]);
    expect(created.response.status).toBe(201);
    expect(created.data?.data.attributes).toMatchObject({
      name,
      description: null,
      permissions: ["posts:create"],
      isSystem: false,
    });
    const id = created.data?.data.id ?? "";
    const path = { params: { path: { id } } };

    const renamed = uniqueName("writer");
    const updated = await manager.api.PATCH("/api/v1/roles/{id}", {
      ...path,
      body: {
        data: {
          type: "roles",
          id,
          attributes: {
            name: renamed,
            description: "글을 쓴다",
            permissions: ["posts:create", "posts:manage"],
          },
        },
      },
    });
    expect(updated.data?.data.attributes).toMatchObject({
      name: renamed,
      description: "글을 쓴다",
      permissions: ["posts:create", "posts:manage"],
    });
    const listed = await manager.api.GET("/api/v1/roles", {
      params: { query: { "filter[q]": renamed } },
    });
    expect(listed.data?.data.map((role) => role.id)).toEqual([id]);

    expect((await manager.api.DELETE("/api/v1/roles/{id}", path)).response.status).toBe(204);
    expect((await manager.api.GET("/api/v1/roles/{id}", path)).response.status).toBe(404);
  });

  it("같은 이름의 역할은 둘 수 없다", async () => {
    const manager = await signInAdmin();
    const name = uniqueName("twin");
    const first = await createRole(manager, name, []);
    const second = await createRole(manager, name, []);
    expect(second.response.status).toBe(422);
    expect(problems(second.error)).toEqual([["validation.already_taken", "/data/attributes/name"]]);
    await manager.api.DELETE("/api/v1/roles/{id}", {
      params: { path: { id: first.data?.data.id ?? "" } },
    });
  });

  it("시스템 역할은 지우지 못하고, admin의 권한은 고치지 못한다", async () => {
    const manager = await signInAdmin();
    const member = await systemRole(manager, "member");
    const removed = await manager.api.DELETE("/api/v1/roles/{id}", {
      params: { path: { id: member } },
    });
    expect(removed.response.status).toBe(422);
    expect(codes(removed.error)).toEqual(["role.system_role_protected"]);

    const adminRole = await systemRole(manager, "admin");
    const narrowed = await manager.api.PATCH("/api/v1/roles/{id}", {
      params: { path: { id: adminRole } },
      body: {
        data: { type: "roles", id: adminRole, attributes: { permissions: ["posts:create"] } },
      },
    });
    expect(narrowed.response.status).toBe(422);
    expect(codes(narrowed.error)).toEqual(["role.system_role_protected"]);
  });

  it("내 권한을 넘는 역할은 만들지 못한다", async () => {
    const manager = await userWith(["roles:read", "roles:manage"]);
    const beyond = await createRole(manager, uniqueName("beyond"), ["users:manage"]);
    expect(beyond.response.status).toBe(403);
    expect(codes(beyond.error)).toEqual(["permission.denied"]);
    const within = await createRole(manager, uniqueName("within"), ["roles:read"]);
    expect(within.response.status).toBe(201);
    await manager.api.DELETE("/api/v1/roles/{id}", {
      params: { path: { id: within.data?.data.id ?? "" } },
    });
  });

  it("roles:read가 없으면 역할을 보지 못한다", async () => {
    const user = await newUser();
    const { error, response } = await user.api.GET("/api/v1/roles");
    expect(response.status).toBe(403);
    expect(codes(error)).toEqual(["permission.denied"]);
  });
});
