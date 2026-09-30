/**
 * 시드: 시스템 역할과 관리자. FastAPI 템플릿의 tests/test_seed.py와 같은 경우를 본다. 권한 레지스트리는
 * 계약의 PermissionCode와 같아야 한다(FastAPI의 test_registry.py).
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PERMISSIONS } from "../src/core/permissions.ts";
import { contractSchemas } from "../src/jsonapi/contract-schemas.ts";
import { rolesOfUser } from "../src/modules/roles/service.ts";
import { findAccount } from "../src/modules/users/accounts.ts";
import { seed } from "../src/seed.ts";
import { createState } from "../src/state.ts";

describe("시드", () => {
  it("시스템 역할 admin, member와 인증을 마친 관리자를 만든다", () => {
    const state = createState();
    const config = {
      ...DEFAULT_CONFIG,
      seedAdmin: { email: " Root@Example.com ", password: "x".repeat(8) },
    };
    expect(seed(state, config)).toEqual(["역할 admin", "역할 member", "관리자 root@example.com"]);
    const roles = [...state.store.roles.values()].map((role) => ({
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      isSystem: role.isSystem,
    }));
    expect(roles).toEqual([
      {
        name: "admin",
        description: "Has every permission, including ones added later.",
        permissions: [],
        isSystem: true,
      },
      {
        name: "member",
        description: "Given to everyone who signs up.",
        permissions: ["posts:create"],
        isSystem: true,
      },
    ]);
    const admin = findAccount(state.store, "root@example.com");
    expect(admin).toMatchObject({
      email: "root@example.com",
      name: "Admin",
      locale: "ko",
      status: "active",
    });
    expect(admin?.emailVerifiedAt).not.toBeNull();
    expect(rolesOfUser(state.store, admin?.id ?? "").map((role) => role.name)).toEqual(["admin"]);
  });

  it("여러 번 불러도 이미 있는 것은 건드리지 않는다", () => {
    const state = createState();
    seed(state, DEFAULT_CONFIG);
    expect(seed(state, DEFAULT_CONFIG)).toEqual([]);
    expect(state.store.users.size).toBe(1);
    expect(state.store.roles.size).toBe(2);
  });
});

describe("권한 레지스트리", () => {
  it("계약의 PermissionCode와 같은 코드를 코드 순으로 등록한다", () => {
    const codes = contractSchemas.PermissionCode?.enum as string[];
    expect(PERMISSIONS.map((permission) => permission.code)).toEqual(codes.toSorted());
    expect(PERMISSIONS.find((permission) => permission.code === "posts:manage")).toEqual({
      code: "posts:manage",
      description: "Manage every post, including drafts.",
      group: "posts",
    });
  });
});
