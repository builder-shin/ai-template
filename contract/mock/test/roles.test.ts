/**
 * 역할과 권한 API: 권한 선언, 목록(검색, 정렬, 페이지), 만들기·고치기·지우기, 권한 상승 금지, 시스템 역할
 * 보호, 이름 중복, 감사 로그, 역할을 가진 사용자에게 가는 me.updated, 권한 목록. FastAPI 템플릿의
 * roles/tests/test_api.py와 test_events.py와 같은 경우를 본다.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "../src/core/permissions.ts";
import { findRoleByName } from "../src/modules/roles/service.ts";
import type { MockState } from "../src/state.ts";
import { newAccount, send, type SignedIn, signIn, userWith } from "./accounts.ts";
import { codesOf, errorsOf, realtimeLog, TIMESTAMP, testApp } from "./support.ts";

type App = ReturnType<typeof testApp>["app"];

const ROLES = "/api/v1/roles";
const MANAGER = ["roles:read", "roles:manage", "users:read"] as const;
const EVERY_PERMISSION = PERMISSIONS.map((permission) => permission.code);

interface RoleBody {
  data: { id: string; attributes: Record<string, unknown> };
}

function roleDocument(name: string, permissions: string[], extra: Record<string, unknown> = {}) {
  return { data: { type: "roles", attributes: { name, permissions, ...extra } } };
}

function updateDocument(roleId: string, attributes?: Record<string, unknown>) {
  return {
    data: { type: "roles", id: roleId, ...(attributes === undefined ? {} : { attributes }) },
  };
}

async function create(app: App, actor: SignedIn, name: string, permissions: string[] = []) {
  const response = await send(app, "POST", ROLES, {
    document: roleDocument(name, permissions),
    token: actor.accessToken,
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return ((await response.json()) as RoleBody).data.id;
}

function patch(app: App, actor: SignedIn, roleId: string, attributes?: Record<string, unknown>) {
  const document = updateDocument(roleId, attributes);
  return send(app, "PATCH", `${ROLES}/${roleId}`, { document, token: actor.accessToken });
}

function roleId(state: MockState, name: string): string {
  const role = findRoleByName(state.store, name);
  if (role === undefined) throw new Error(`역할 ${name}이 없다`);
  return role.id;
}

function actions(state: MockState): string[] {
  return state.store.auditLogs
    .filter((row) => row.action.startsWith("role."))
    .map((row) => row.action);
}

describe("역할 읽기", () => {
  it("roles:read가 있어야 보고, 기본 정렬은 이름순이다", async () => {
    const { app, state } = testApp();
    const member = await userWith(app, state, []);
    expect(await codesOf(await send(app, "GET", ROLES), 401)).toEqual(["auth.unauthenticated"]);
    const denied = await send(app, "GET", ROLES, { token: member.accessToken });
    expect(await codesOf(denied, 403)).toEqual(["permission.denied"]);
    const reader = await userWith(app, state, ["roles:read"]);
    const response = await send(app, "GET", ROLES, { token: reader.accessToken });
    const body = (await response.json()) as { data: RoleBody["data"][] };
    const names = body.data.map((role) => String(role.attributes.name));
    expect(names).toEqual(expect.arrayContaining(["admin", "member"]));
    expect(names).toEqual([...names].sort());
  });

  it("filter[q]는 이름의 부분 일치(대소문자 무시)이고, 정렬과 페이지를 따른다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    for (const name of ["kappa-editor", "kappa-writer", "kappa-viewer"]) {
      await create(app, manager, name, ["users:read"]);
    }
    const query = "?filter%5Bq%5D=KAPPA&sort=-name&page%5Bsize%5D=2";
    const response = await send(app, "GET", `${ROLES}${query}`, { token: manager.accessToken });
    const body = (await response.json()) as {
      data: RoleBody["data"][];
      links: { next: string };
      meta: { page: unknown };
    };
    expect(body.data.map((role) => role.attributes.name)).toEqual(["kappa-writer", "kappa-viewer"]);
    expect(body.meta.page).toEqual({ number: 1, size: 2, total: 3, totalPages: 2 });
    expect(body.links.next.endsWith("page%5Bnumber%5D=2")).toBe(true);
  });

  it("admin 역할은 늘 등록된 모든 권한을 보이고, 없는 역할은 404다", async () => {
    const { app, state } = testApp();
    const reader = await userWith(app, state, ["roles:read"]);
    const admin = await send(app, "GET", `${ROLES}/${roleId(state, "admin")}`, {
      token: reader.accessToken,
    });
    const body = (await admin.json()) as RoleBody;
    expect(body.data.attributes.permissions).toEqual(EVERY_PERMISSION);
    const missing = randomUUID();
    const response = await send(app, "GET", `${ROLES}/${missing}`, { token: reader.accessToken });
    expect((await errorsOf(response, 404)).map((error) => error.detail)).toEqual([
      `Role ${missing} does not exist.`,
    ]);
  });
});

describe("역할 만들기", () => {
  it("권한을 겹치지 않게 코드 순으로 저장하고 감사 로그를 남긴다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const document = roleDocument(" auditor ", ["users:read", "roles:read", "users:read"]);
    const response = await send(app, "POST", ROLES, { document, token: manager.accessToken });
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as RoleBody;
    expect(data.attributes).toEqual({
      name: "auditor",
      description: null,
      permissions: ["roles:read", "users:read"],
      isSystem: false,
      createdAt: expect.stringMatching(TIMESTAMP) as unknown,
      updatedAt: expect.stringMatching(TIMESTAMP) as unknown,
    });
    const [log] = state.store.auditLogs.filter((row) => row.action === "role.created");
    expect([log?.actorId, log?.targetType, log?.targetId, log?.metadata]).toEqual([
      manager.userId,
      "roles",
      data.id,
      { name: "auditor", permissions: ["roles:read", "users:read"] },
    ]);
  });

  it.each([
    [roleDocument("boss", ["users:manage"]), 403, "permission.denied", undefined],
    [roleDocument("admin", []), 422, "validation.already_taken", "/data/attributes/name"],
    [
      roleDocument("x", ["nope:code"]),
      422,
      "validation.invalid_choice",
      "/data/attributes/permissions/0",
    ],
    [roleDocument("x".repeat(51), []), 422, "validation.too_long", "/data/attributes/name"],
    [
      roleDocument("x", [], { description: "d".repeat(201) }),
      422,
      "validation.too_long",
      "/data/attributes/description",
    ],
  ])("%j는 %i %s다", async (document, status, code, pointer) => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const response = await send(app, "POST", ROLES, { document, token: manager.accessToken });
    const errors = await errorsOf(response, status);
    const source = pointer === undefined ? undefined : { pointer };
    expect(errors.map((error) => [error.code, error.source])).toEqual([[code, source]]);
    expect(actions(state)).toEqual([]);
  });

  it("이름 중복은 422 validation.already_taken이다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    await create(app, manager, "twin");
    const response = await send(app, "POST", ROLES, {
      document: roleDocument("twin", []),
      token: manager.accessToken,
    });
    expect(await errorsOf(response, 422)).toEqual([
      {
        status: "422",
        code: "validation.already_taken",
        title: "Unprocessable Content",
        detail: "A role named twin already exists.",
        source: { pointer: "/data/attributes/name" },
      },
    ]);
  });
});

describe("역할 고치기", () => {
  it("이름을 바꾸면 updatedAt을 바꾸고 바뀐 항목을 감사 로그에 남긴다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const id = await create(app, manager, "editor", ["users:read"]);
    const before = state.store.roles.get(id)?.updatedAt ?? 0;
    const response = await patch(app, manager, id, { name: "chief-editor", description: null });
    const body = (await response.json()) as RoleBody;
    expect(body.data.attributes.name).toBe("chief-editor");
    expect(state.store.roles.get(id)?.updatedAt).toBeGreaterThan(before);
    expect(actions(state)).toEqual(["role.created", "role.updated"]);
    expect(state.store.auditLogs.at(-1)?.metadata).toEqual({ changed: ["name"] });
  });

  it("바뀐 것이 없으면 아무것도 바꾸거나 남기지 않는다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const id = await create(app, manager, "same", ["users:read"]);
    const before = state.store.roles.get(id)?.updatedAt;
    const same = { name: "same", description: null, permissions: ["users:read", "users:read"] };
    expect((await patch(app, manager, id, same)).status).toBe(200);
    expect([state.store.roles.get(id)?.updatedAt, actions(state)]).toEqual([
      before,
      ["role.created"],
    ]);
  });

  it("이미 쓰는 이름으로 바꾸면서 권한도 바꾸면 422이고 아무것도 바꾸거나 알리지 않는다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    await create(app, manager, "taken");
    const id = await create(app, manager, "editor", ["users:read"]);
    newAccount(state, { roleNames: ["editor"] });
    const log = realtimeLog(state);
    const response = await patch(app, manager, id, { name: "taken", permissions: [] });
    const errors = await errorsOf(response, 422);
    expect(errors.map((error) => [error.code, error.source])).toEqual([
      ["validation.already_taken", { pointer: "/data/attributes/name" }],
    ]);
    expect(log).toEqual([]);
    const role = state.store.roles.get(id);
    expect([role?.name, role?.permissions]).toEqual(["editor", ["users:read"]]);
  });

  it.each([
    ["member", { name: "members" }, 422, "role.system_role_protected"],
    ["admin", { description: "everything" }, 403, "permission.denied"],
    ["member", { permissions: ["posts:create", "users:manage"] }, 403, "permission.denied"],
  ])("%s 역할을 %j로 고치면 %i %s다", async (name, attributes, status, code) => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER, "posts:create"]);
    const response = await patch(app, manager, roleId(state, name), attributes);
    expect(await codesOf(response, status)).toEqual([code]);
  });

  it("admin의 권한은 관리자도 고치지 못한다", async () => {
    const { app, state, config } = testApp();
    const admin = await signIn(app, config.seedAdmin.email, config.seedAdmin.password);
    const response = await patch(app, admin, roleId(state, "admin"), {
      permissions: ["users:read"],
    });
    expect(await errorsOf(response, 422)).toEqual([
      {
        status: "422",
        code: "role.system_role_protected",
        title: "Unprocessable Content",
        detail: "The admin role always has every permission.",
      },
    ]);
    const unchanged = await patch(app, admin, roleId(state, "admin"), {
      permissions: EVERY_PERMISSION,
    });
    expect(unchanged.status).toBe(200);
  });

  it("attributes가 없으면 권한도 검사하지 않고 그대로 준다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const admin = roleId(state, "admin");
    expect((await patch(app, manager, admin)).status).toBe(200);
    expect(await codesOf(await patch(app, manager, admin, {}), 403)).toEqual(["permission.denied"]);
  });

  it("본문의 id가 경로와 다르면 409이고, 없는 역할이어도 409가 먼저다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const id = await create(app, manager, "reviewer");
    for (const path of [id, randomUUID()]) {
      const document = updateDocument(randomUUID(), { name: "other" });
      const response = await send(app, "PATCH", `${ROLES}/${path}`, {
        document,
        token: manager.accessToken,
      });
      const errors = await errorsOf(response, 409);
      expect(errors.map((error) => error.source)).toEqual([{ pointer: "/data/id" }]);
    }
  });
});

describe("역할 지우기", () => {
  it("시스템 역할은 지우지 못하고, 다른 역할은 지우면 가진 사용자에게서도 빠진다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const member = await send(app, "DELETE", `${ROLES}/${roleId(state, "member")}`, {
      token: manager.accessToken,
    });
    expect(await errorsOf(member, 422)).toEqual([
      {
        status: "422",
        code: "role.system_role_protected",
        title: "Unprocessable Content",
        detail: "System roles cannot be deleted.",
      },
    ]);
    const id = await create(app, manager, "temporary");
    const holder = newAccount(state, { roleNames: ["member", "temporary"] });
    const path = `${ROLES}/${id}`;
    expect((await send(app, "DELETE", path, { token: manager.accessToken })).status).toBe(204);
    expect((await send(app, "GET", path, { token: manager.accessToken })).status).toBe(404);
    expect(state.store.userRoles.get(holder.id)?.has(id)).toBe(false);
    expect(actions(state)).toEqual(["role.created", "role.deleted"]);
    expect(state.store.auditLogs.at(-1)?.metadata).toEqual({ name: "temporary" });
  });

  it("내 권한을 넘는 역할은 지우지 못한다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const powerful = await userWith(app, state, ["audit-logs:read"]);
    const response = await send(app, "DELETE", `${ROLES}/${powerful.roleId}`, {
      token: manager.accessToken,
    });
    expect(await codesOf(response, 403)).toEqual(["permission.denied"]);
  });
});

describe("역할을 가진 사용자에게 알리기", () => {
  it("권한이 바뀌거나 역할이 지워지면 그 역할을 가진 사용자에게만 me.updated(roles)가 간다", async () => {
    const { app, state, config } = testApp();
    const admin = await signIn(app, config.seedAdmin.email, config.seedAdmin.password);
    const member = await userWith(app, state, ["posts:create"]);
    const bystander = newAccount(state);
    const log = realtimeLog(state);
    for (const attributes of [{ description: "설명만" }, { permissions: ["posts:manage"] }]) {
      expect((await patch(app, admin, member.roleId, attributes)).status).toBe(200);
    }
    const path = `${ROLES}/${member.roleId}`;
    expect((await send(app, "DELETE", path, { token: admin.accessToken })).status).toBe(204);
    const notified = ["me.updated", [`user:${member.userId}`], { meta: { changed: ["roles"] } }];
    const recheck = ["recheck", [member.userId]];
    expect(log).toEqual([notified, recheck, notified, recheck]);
    expect(JSON.stringify(log)).not.toContain(bystander.id);
  });
});

describe("권한 목록", () => {
  it("등록된 권한을 코드 순으로 주고, 역순으로도 정렬한다", async () => {
    const { app, state } = testApp();
    const reader = await userWith(app, state, ["roles:read"]);
    const list = async (query = "") => {
      const response = await send(app, "GET", `/api/v1/permissions${query}`, {
        token: reader.accessToken,
      });
      expect(response.status).toBe(200);
      return (await response.json()) as {
        data: { id: string; attributes: unknown }[];
        meta: { page: unknown };
      };
    };
    const body = await list();
    expect(body.data.map((permission) => permission.id)).toEqual(EVERY_PERMISSION);
    expect(body.data[0]).toEqual({
      type: "permissions",
      id: "admin:access",
      attributes: { description: "Sign in to the admin app.", group: "admin" },
    });
    const reverse = await list("?sort=-id");
    expect(reverse.data.map((permission) => permission.id)).toEqual(EVERY_PERMISSION.toReversed());
    const second = await list("?page%5Bsize%5D=3&page%5Bnumber%5D=2");
    expect(second.data.map((permission) => permission.id)).toEqual(EVERY_PERMISSION.slice(3, 6));
    expect(second.meta.page).toEqual({ number: 2, size: 3, total: 8, totalPages: 3 });
  });

  it("roles:read가 없으면 보지 못하고, 필터는 받지 않는다", async () => {
    const { app, state } = testApp();
    const member = await userWith(app, state, []);
    const denied = await send(app, "GET", "/api/v1/permissions", { token: member.accessToken });
    expect(await codesOf(denied, 403)).toEqual(["permission.denied"]);
    const reader = await userWith(app, state, ["roles:read"]);
    const filtered = await send(app, "GET", "/api/v1/permissions?filter%5Bq%5D=x", {
      token: reader.accessToken,
    });
    const errors = await errorsOf(filtered, 400);
    expect(errors.map((error) => [error.source, error.detail])).toEqual([
      [{ parameter: "filter[q]" }, "Extra inputs are not permitted"],
    ]);
  });
});
