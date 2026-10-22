/**
 * 시드: 시스템 역할, 관리자, 예제 글. FastAPI 템플릿의 tests/test_seed.py와 같은 경우를 본다. 권한
 * 레지스트리는 계약의 PermissionCode와 같아야 한다(FastAPI의 test_registry.py).
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
  it("시스템 역할 admin, member와 인증을 마친 관리자, 관리자의 예제 글을 만든다", () => {
    const state = createState();
    const config = {
      ...DEFAULT_CONFIG,
      seedAdmin: { email: " Root@Example.com ", password: "x".repeat(8) },
    };
    expect(seed(state, config)).toEqual([
      "역할 admin",
      "역할 member",
      "관리자 root@example.com",
      "글 환영합니다",
      "글 마크다운으로 쓰기",
      "글 초안",
    ]);
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
    const posts = [...state.store.posts.values()];
    expect(posts.map((post) => [post.title, post.authorId, post.status])).toEqual([
      ["환영합니다", admin?.id, "published"],
      ["마크다운으로 쓰기", admin?.id, "published"],
      ["초안", admin?.id, "draft"],
    ]);
  });

  it("여러 번 불러도 이미 있는 것은 건드리지 않는다", () => {
    const state = createState();
    seed(state, DEFAULT_CONFIG);
    expect(seed(state, DEFAULT_CONFIG)).toEqual([]);
    expect(state.store.users.size).toBe(1);
    expect(state.store.roles.size).toBe(2);
    expect(state.store.posts.size).toBe(3);
  });

  it("관리자가 이미 있어도 글이 하나도 없으면 예제 글을 만든다", () => {
    const state = createState();
    seed(state, DEFAULT_CONFIG);
    state.store.posts.clear();
    expect(seed(state, DEFAULT_CONFIG)).toEqual([
      "글 환영합니다",
      "글 마크다운으로 쓰기",
      "글 초안",
    ]);
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
