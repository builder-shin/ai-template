/**
 * 사용자 관리(GET/PATCH /users): 권한, 목록(검색, 필터, 정렬, 페이지, 포함), 단건, 상태·역할 변경, 권한
 * 상승 금지, 마지막 admin, 감사 로그와 실시간 알림. FastAPI 템플릿의 users/tests/test_admin.py와
 * test_events.py와 같은 경우를 본다.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "../src/core/permissions.ts";
import { findRoleByName } from "../src/modules/roles/service.ts";
import type { MockState } from "../src/state.ts";
import {
  newAccount,
  newRole,
  newUser,
  passwordGrant,
  send,
  type SignedIn,
  signIn,
  userWith,
} from "./accounts.ts";
import { codesOf, errorsOf, realtimeLog, testApp } from "./support.ts";

type App = ReturnType<typeof testApp>["app"];

const USERS = "/api/v1/users";
const MANAGER = ["users:read", "users:manage"] as const;

interface UserList {
  data: { id: string; attributes: Record<string, unknown> }[];
  included?: { type: string; id: string; attributes: Record<string, unknown> }[];
  meta: { page: Record<string, number> };
}

interface Changes {
  readonly status?: string;
  readonly roles?: readonly string[];
}

function updateDocument(userId: string, changes: Changes = {}) {
  const data: Record<string, unknown> = { type: "users", id: userId };
  if (changes.status !== undefined) data.attributes = { status: changes.status };
  if (changes.roles !== undefined) {
    const identifiers = changes.roles.map((id) => ({ type: "roles", id }));
    data.relationships = { roles: { data: identifiers } };
  }
  return { data };
}

/** PATCH /users/{userId}. document를 주지 않으면 changes로 만든다. */
function update(app: App, actor: SignedIn, userId: string, changes: Changes, document?: unknown) {
  return send(app, "PATCH", `${USERS}/${userId}`, {
    document: document ?? updateDocument(userId, changes),
    token: actor.accessToken,
  });
}

async function listed(app: App, reader: SignedIn, query: string): Promise<UserList> {
  const response = await send(app, "GET", `${USERS}${query}`, { token: reader.accessToken });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as UserList;
}

function ids(body: UserList): string[] {
  return body.data.map((resource) => resource.id);
}

function roleId(state: MockState, name: string): string {
  const role = findRoleByName(state.store, name);
  if (role === undefined) throw new Error(`역할 ${name}이 없다`);
  return role.id;
}

/** 관리 행위의 감사 로그: [행위, 행위자, 대상, metadata]. */
function audits(state: MockState) {
  const actions = ["user.roles_changed", "user.deactivated", "user.reactivated"];
  return state.store.auditLogs
    .filter((row) => actions.includes(row.action))
    .map((row) => [row.action, row.actorId, row.targetId, row.metadata]);
}

describe("사용자 읽기", () => {
  it("users:read가 있어야 목록과 단건을 본다", async () => {
    const { app, state } = testApp();
    const member = await newUser(app, state);
    expect(await codesOf(await send(app, "GET", USERS), 401)).toEqual(["auth.unauthenticated"]);
    for (const path of [USERS, `${USERS}/${member.userId}`]) {
      const response = await send(app, "GET", path, { token: member.accessToken });
      expect(await codesOf(response, 403)).toEqual(["permission.denied"]);
    }
  });

  it("목록은 이름·이메일 검색, 상태, 역할로 거르고 정렬하고 역할을 포함한다", async () => {
    const { app, state } = testApp();
    const reader = await userWith(app, state, ["users:read"]);
    const marker = randomUUID().replaceAll("-", "").slice(0, 10);
    const extra = newRole(state);
    const older = newAccount(state, { name: `${marker}-b` });
    const tagged = newAccount(state, { name: `${marker}-a`, roleNames: ["member", extra.name] });
    const byEmail = newAccount(state, { email: `${marker}@example.com`, name: "x" });
    older.status = "deactivated";
    const search = `?filter%5Bq%5D=${marker}`;
    const newestFirst = await listed(app, reader, search);
    expect(ids(newestFirst)).toEqual([byEmail.id, tagged.id, older.id]);
    expect(newestFirst.meta.page).toEqual({ number: 1, size: 20, total: 3, totalPages: 1 });
    const upper = await listed(app, reader, `?filter%5Bq%5D=${marker.toUpperCase()}`);
    expect(ids(upper)).toEqual(ids(newestFirst));
    const byName = await listed(app, reader, `${search}&sort=name`);
    expect(ids(byName)).toEqual([tagged.id, older.id, byEmail.id]);
    const deactivated = await listed(app, reader, `${search}&filter%5Bstatus%5D=deactivated`);
    expect(ids(deactivated)).toEqual([older.id]);
    const query = `${search}&filter%5Brole%5D=${extra.id}&include=roles`;
    const withRoles = await listed(app, reader, query);
    expect(ids(withRoles)).toEqual([tagged.id]);
    const names = withRoles.included?.map((resource) => resource.attributes.name);
    expect(names).toEqual(["member", extra.name].sort());
    expect(withRoles.data[0]?.attributes.email).toBe(tagged.email);
    expect(Object.keys(withRoles)).toEqual(["data", "links", "meta", "included"]);
  });

  it("검색어의 %와 _는 글자 그대로 찾고, 빈 검색어는 거르지 않는다", async () => {
    const { app, state } = testApp();
    const reader = await userWith(app, state, ["users:read"]);
    const percent = newAccount(state, { name: "100% 확실" });
    newAccount(state, { name: "1000 확실" });
    expect(ids(await listed(app, reader, "?filter%5Bq%5D=100%25"))).toEqual([percent.id]);
    expect(ids(await listed(app, reader, "?filter%5Bq%5D=_"))).toEqual([]);
    const everyone = await listed(app, reader, "?filter%5Bq%5D=&page%5Bsize%5D=100");
    expect(everyone.meta.page.total).toBe(state.store.users.size);
  });

  it("탈퇴한 사용자는 status deleted로 남고, 이메일 정렬에서 null은 오름차순의 맨 뒤다", async () => {
    const { app, state } = testApp();
    const reader = await userWith(app, state, ["users:read"]);
    const gone = newAccount(state);
    Object.assign(gone, { email: null, name: null, status: "deleted" });
    const deleted = await listed(app, reader, "?filter%5Bstatus%5D=deleted");
    expect(deleted.data.map((user) => [user.id, user.attributes.email])).toEqual([[gone.id, null]]);
    const ascending = ids(await listed(app, reader, "?sort=email&page%5Bsize%5D=100"));
    expect(ascending.at(-1)).toBe(gone.id);
    const descending = ids(await listed(app, reader, "?sort=-email&page%5Bsize%5D=100"));
    expect(descending[0]).toBe(gone.id);
  });

  it.each([
    [
      "filter%5Brole%5D=admin",
      "filter[role]",
      "Input should be a valid UUID, invalid character: found `m` at 3",
    ],
    [
      "filter%5Bstatus%5D=gone",
      "filter[status]",
      "Input should be 'active', 'deactivated' or 'deleted'",
    ],
    ["filter%5Bnope%5D=x", "filter[nope]", "Extra inputs are not permitted"],
  ])("틀린 필터 %s는 400 jsonapi.invalid_query다", async (query, parameter, detail) => {
    const { app, state } = testApp();
    const reader = await userWith(app, state, ["users:read"]);
    const response = await send(app, "GET", `${USERS}?${query}`, { token: reader.accessToken });
    const errors = await errorsOf(response, 400);
    expect(errors.map((error) => [error.code, error.source, error.detail])).toEqual([
      ["jsonapi.invalid_query", { parameter }, detail],
    ]);
  });

  it("단건은 전체 속성과 역할을 주고, 없으면 404다", async () => {
    const { app, state } = testApp();
    const reader = await userWith(app, state, ["users:read"]);
    const user = await newUser(app, state);
    const path = `${USERS}/${user.userId}?include=roles,avatar`;
    const response = await send(app, "GET", path, { token: reader.accessToken });
    const body = (await response.json()) as {
      data: { attributes: Record<string, unknown> };
      included: { attributes: { name: string } }[];
    };
    expect(body.data.attributes.email).toBe(user.email);
    expect(body.included.map((role) => role.attributes.name)).toEqual(["member"]);
    const missing = randomUUID();
    const notFound = await send(app, "GET", `${USERS}/${missing}`, { token: reader.accessToken });
    expect((await errorsOf(notFound, 404)).map((error) => error.detail)).toEqual([
      `User ${missing} does not exist.`,
    ]);
  });
});

describe("상태 바꾸기", () => {
  it("비활성화하면 세션이 끝나고 로그인하지 못하며, 다시 활성화하면 로그인한다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const target = await newUser(app, state);
    const updatedAt = state.store.users.get(target.userId)?.updatedAt ?? 0;
    const log = realtimeLog(state);
    const deactivated = await update(app, manager, target.userId, { status: "deactivated" });
    const body = (await deactivated.json()) as { data: { attributes: Record<string, unknown> } };
    expect(body.data.attributes.status).toBe("deactivated");
    expect(state.store.users.get(target.userId)?.updatedAt).toBeGreaterThan(updatedAt);
    const me = await send(app, "GET", "/api/v1/me", { token: target.accessToken });
    expect(await codesOf(me, 401)).toEqual(["auth.token_invalid"]);
    const document = passwordGrant(target.email);
    const login = await send(app, "POST", "/api/v1/sessions", { document });
    expect(await codesOf(login, 403)).toEqual(["auth.account_deactivated"]);
    const room = [`user:${target.userId}`];
    const statusChanged = ["me.updated", room, { meta: { changed: ["status"] } }];
    expect(log).toEqual([
      ["session.revoked", room, { meta: { reason: "account_deactivated" } }],
      statusChanged,
      ["recheck", [target.userId]],
    ]);
    log.length = 0;
    const reactivated = await update(app, manager, target.userId, { status: "active" });
    expect(reactivated.status).toBe(200);
    expect(log).toEqual([statusChanged, ["recheck", [target.userId]]]);
    await signIn(app, target.email);
    expect(audits(state)).toEqual([
      ["user.deactivated", manager.userId, target.userId, {}],
      ["user.reactivated", manager.userId, target.userId, {}],
    ]);
  });

  it("지금과 같은 상태로 바꾸면 아무것도 남기지 않는다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const target = await newUser(app, state);
    const log = realtimeLog(state);
    expect((await update(app, manager, target.userId, { status: "active" })).status).toBe(200);
    expect([log, audits(state)]).toEqual([[], []]);
  });
});

describe("역할 바꾸기", () => {
  it("감사 로그와 me.updated(roles)를 남기고, 같은 요청을 다시 보내면 남기지 않는다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const target = await newUser(app, state);
    const writer = newRole(state, ["posts:create"]);
    const updatedAt = state.store.users.get(target.userId)?.updatedAt;
    const log = realtimeLog(state);
    const roles = [writer.id, writer.id];
    const response = await update(app, manager, target.userId, { roles });
    const body = (await response.json()) as { data: { relationships: { roles: unknown } } };
    expect(body.data.relationships.roles).toEqual({ data: [{ type: "roles", id: writer.id }] });
    const metadata = { added: [writer.name], removed: ["member"] };
    expect(audits(state)).toEqual([
      ["user.roles_changed", manager.userId, target.userId, metadata],
    ]);
    expect(state.store.users.get(target.userId)?.updatedAt).toBe(updatedAt);
    expect(log).toEqual([
      ["me.updated", [`user:${target.userId}`], { meta: { changed: ["roles"] } }],
      ["recheck", [target.userId]],
    ]);
    expect((await update(app, manager, target.userId, { roles })).status).toBe(200);
    expect([audits(state).length, log.length]).toEqual([1, 2]);
  });

  it("역할을 받으면 다음 요청부터 그 권한을 쓴다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const target = await newUser(app, state);
    const reader = newRole(state, ["users:read"]);
    const roles = [roleId(state, "member"), reader.id];
    expect((await update(app, manager, target.userId, { roles })).status).toBe(200);
    const me = await send(app, "GET", "/api/v1/me", { token: target.accessToken });
    const body = (await me.json()) as { meta: { permissions: string[] } };
    expect(body.meta.permissions).toEqual(["posts:create", "users:read"]);
    expect((await send(app, "GET", USERS, { token: target.accessToken })).status).toBe(200);
  });

  it("역할과 상태를 함께 바꾸면 알림을 모았다가 FastAPI의 commit처럼 보낸다", async () => {
    const { app, state, config } = testApp();
    const admin = await signIn(app, config.seedAdmin.email, config.seedAdmin.password);
    const target = await newUser(app, state);
    const log = realtimeLog(state);
    const changes = { status: "deactivated", roles: [roleId(state, "admin")] };
    expect((await update(app, admin, target.userId, changes)).status).toBe(200);
    const room = [`user:${target.userId}`];
    expect(log).toEqual([
      ["session.revoked", room, { meta: { reason: "account_deactivated" } }],
      ["me.updated", room, { meta: { changed: ["roles", "status"] } }],
      ["recheck", [target.userId]],
    ]);
    expect(audits(state).map(([action]) => action)).toEqual([
      "user.roles_changed",
      "user.deactivated",
    ]);
  });

  it("관계의 역할 id는 FastAPI처럼 Python의 uuid.UUID()로 읽는다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const target = await newUser(app, state);
    const loose = `{${roleId(state, "member").replaceAll("-", "").toUpperCase()}}`;
    expect((await update(app, manager, target.userId, { roles: [loose] })).status).toBe(200);
    expect(audits(state)).toEqual([]);
  });
});

describe("막는 변경", () => {
  it("자기 자신, 나보다 권한이 큰 사용자, 내 권한을 넘는 역할은 403이고 아무것도 남기지 않는다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const member = await newUser(app, state);
    const admin = newAccount(state, { roleNames: ["admin"] });
    const powerful = newRole(state, ["roles:manage"]);
    const cases = [
      [manager.userId, { status: "deactivated" }, "You cannot change your own status or roles."],
      [
        admin.id,
        { status: "deactivated" },
        "You cannot change a user who has permissions you do not have.",
      ],
      [
        member.userId,
        { roles: [roleId(state, "member"), powerful.id] },
        `The role ${powerful.name} has permissions you do not have.`,
      ],
    ] as const;
    const log = realtimeLog(state);
    for (const [userId, changes, detail] of cases) {
      const errors = await errorsOf(await update(app, manager, userId, changes), 403);
      expect(errors.map((error) => [error.code, error.detail])).toEqual([
        ["permission.denied", detail],
      ]);
    }
    expect([audits(state), log]).toEqual([[], []]);
  });

  it("탈퇴 상태, 없는 역할, 본문의 다른 id는 FastAPI와 같은 에러다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const target = await newUser(app, state);
    const missing = randomUUID();
    const other = randomUUID();
    const cases = [
      [
        { status: "deleted" },
        {
          status: "422",
          code: "validation.invalid_choice",
          title: "Unprocessable Content",
          detail: "An admin can only deactivate or reactivate a user. Users leave with DELETE /me.",
          source: { pointer: "/data/attributes/status" },
          meta: { params: { expected: "'active' or 'deactivated'" } },
        },
      ],
      [
        { roles: [roleId(state, "member"), missing] },
        {
          status: "404",
          code: "resource.not_found",
          title: "Not Found",
          detail: `Role ${missing} does not exist.`,
          source: { pointer: "/data/relationships/roles/data/1" },
        },
      ],
    ] as const;
    for (const [changes, error] of cases) {
      const response = await update(app, manager, target.userId, changes);
      expect(await errorsOf(response, Number(error.status))).toEqual([error]);
    }
    const mismatch = updateDocument(other, { status: "active" });
    const conflict = await update(app, manager, target.userId, {}, mismatch);
    expect(await errorsOf(conflict, 409)).toEqual([
      {
        status: "409",
        code: "resource.conflict",
        title: "Conflict",
        detail: `data.id ${other} does not match the resource ${target.userId}.`,
        source: { pointer: "/data/id" },
      },
    ]);
  });

  it("탈퇴한 사용자는 409, 없는 사용자는 404이고, 탈퇴 상태로 바꾸는 요청은 그보다 먼저 422다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const left = await newUser(app, state);
    expect((await send(app, "DELETE", "/api/v1/me", { token: left.accessToken })).status).toBe(204);
    const conflict = await update(app, manager, left.userId, { status: "active" });
    expect(await errorsOf(conflict, 409)).toEqual([
      {
        status: "409",
        code: "resource.conflict",
        title: "Conflict",
        detail: `User ${left.userId} has left and cannot be changed.`,
      },
    ]);
    const unknown = randomUUID();
    const missing = await update(app, manager, unknown, { status: "active" });
    expect(await codesOf(missing, 404)).toEqual(["resource.not_found"]);
    const deleted = await update(app, manager, unknown, { status: "deleted" });
    expect(await codesOf(deleted, 422)).toEqual(["validation.invalid_choice"]);
  });

  it("마지막 활성 admin은 비활성화하거나 admin 역할을 빼지 못한다", async () => {
    const { app, state, config } = testApp();
    const everything = PERMISSIONS.map((permission) => permission.code);
    const superuser = await userWith(app, state, everything);
    const admin = await signIn(app, config.seedAdmin.email, config.seedAdmin.password);
    for (const changes of [{ status: "deactivated" }, { roles: [roleId(state, "member")] }]) {
      const response = await update(app, superuser, admin.userId, changes);
      expect(await codesOf(response, 422)).toEqual(["role.last_admin_protected"]);
    }
    newAccount(state, { roleNames: ["admin"] });
    const response = await update(app, superuser, admin.userId, { status: "deactivated" });
    expect(response.status).toBe(200);
  });
});
