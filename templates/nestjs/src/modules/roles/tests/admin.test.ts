import { afterEach, expect, it } from "vitest";
import { RolesAdminService } from "../index.js";
import { parseQuery } from "../../../core/jsonapi/query.js";
import {
  adminFixture,
  admin,
  uid,
  otherId,
  adminId,
  memberId,
  customId,
  at,
} from "../../users/tests/admin-fixture.js";
const fixtures: ReturnType<typeof adminFixture>[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
});
function setup() {
  const f = adminFixture();
  fixtures.push(f);
  return { f, service: new RolesAdminService(f.unit, f.roles, f.control) };
}
it.each([adminId, memberId])("시스템 역할 %s는 삭제할 수 없다", async (id) => {
  const { service } = setup();
  await expect(service.delete(admin, id)).rejects.toMatchObject({
    init: { status: 422, code: "role.system_role_protected" },
  });
});
it("admin 권한과 시스템 역할 이름은 바꿀 수 없다", async () => {
  const { service } = setup();
  await expect(
    service.update(admin, adminId, { permissions: ["posts:create"] }),
  ).rejects.toMatchObject({ init: { status: 422, code: "role.system_role_protected" } });
  await expect(service.update(admin, adminId, { name: "other" })).rejects.toMatchObject({
    init: { status: 422, code: "role.system_role_protected" },
  });
});
it("자신에게 없는 권한으로 역할을 만들거나 수정할 수 없다", async () => {
  const { f, service } = setup();
  const limited = { ...admin, permissions: new Set(["roles:manage"] as const) };
  await expect(
    service.create(limited, { name: "elevated", permissions: ["users:manage"] }),
  ).rejects.toMatchObject({ init: { status: 403, code: "permission.denied" } });
  await expect(
    service.update(limited, customId, { permissions: ["users:manage"] }),
  ).rejects.toMatchObject({ init: { status: 403, code: "permission.denied" } });
  expect(f.state.audits).toEqual([]);
});
it("역할 생성과 수정과 삭제는 원인 트랜잭션에 세 감사를 남긴다", async () => {
  const { f, service } = setup();
  expect(
    await service.create(admin, {
      name: "editor",
      permissions: ["posts:create"],
      description: "편집자",
    }),
  ).toMatchObject({
    data: { attributes: { name: "editor", isSystem: false, createdAt: at.toISOString() } },
  });
  await service.update(admin, customId, { name: "renamed", description: null });
  await service.delete(admin, customId);
  expect(f.state.roles.some((r) => r.id === customId)).toBe(false);
  expect(f.state.audits.map((a) => a.action)).toEqual([
    "role.created",
    "role.updated",
    "role.deleted",
  ]);
  expect(f.state.audits.every((a) => a.actorUserId === uid && a.targetType === "roles")).toBe(true);
});
it("역할 권한 변경은 commit 뒤 각 구성원에게 roles 알림과 재검사를 보낸다", async () => {
  const { f, service } = setup();
  f.state.assignments.push(
    { userId: otherId, roleId: customId },
    { userId: uid, roleId: customId },
  );
  await service.update(admin, customId, { permissions: ["posts:manage"] });
  expect(f.state.roles.find((r) => r.id === customId)?.permissions).toEqual(["posts:manage"]);
  for (const id of [uid, otherId]) {
    expect(f.events).toContainEqual({
      name: "me.updated",
      rooms: ["user:" + id],
      payload: { meta: { changed: ["roles"] } },
    });
    expect(f.events).toContainEqual({ name: "recheck", userId: id });
  }
  expect(f.events).toHaveLength(4);
});
it("역할 삭제는 구성원 부여도 제거하고 각 구성원의 권한을 재검사한다", async () => {
  const { f, service } = setup();
  f.state.assignments.push({ userId: otherId, roleId: customId });
  await service.delete(admin, customId);
  expect(f.state.assignments.some((a) => a.roleId === customId)).toBe(false);
  expect(f.events).toContainEqual({ name: "recheck", userId: otherId });
});
it("중복만 다른 권한 수정은 감사와 재검사를 만들지 않는다", async () => {
  const { f, service } = setup();
  await service.update(admin, customId, { permissions: ["posts:create", "posts:create"] });
  expect(f.events).toEqual([]);
  expect(f.state.audits).toEqual([]);
});
it("권한 순서만 바뀐 수정은 감사와 재검사를 만들지 않는다", async () => {
  const { f, service } = setup();
  const role = f.state.roles.find((r) => r.id === customId);
  if (!role) throw new Error("역할이 없다");
  role.permissions = ["posts:create", "users:read"];
  f.state.assignments.push({ userId: otherId, roleId: customId });
  await service.update(admin, customId, { permissions: ["users:read", "posts:create"] });
  expect(f.state.roles.find((r) => r.id === customId)?.permissions).toEqual([
    "posts:create",
    "users:read",
  ]);
  expect(f.events).toEqual([]);
  expect(f.state.audits).toEqual([]);
});
it("역할 이름 충돌은 validation.already_taken이며 부분 생성이 없다", async () => {
  const { f, service } = setup();
  await expect(service.create(admin, { name: "writer", permissions: [] })).rejects.toMatchObject({
    init: { status: 422, code: "validation.already_taken" },
  });
  expect(f.state.roles).toHaveLength(3);
  expect(f.state.audits).toEqual([]);
});
it("역할 수정 commit 실패는 권한과 감사와 알림을 되돌린다", async () => {
  const { f, service } = setup();
  f.failCommit = true;
  await expect(service.update(admin, customId, { permissions: [] })).rejects.toThrow("commit 실패");
  expect(f.state.roles.find((r) => r.id === customId)?.permissions).toEqual(["posts:create"]);
  expect(f.state.audits).toEqual([]);
  expect(f.events).toEqual([]);
});
it("역할 검색과 정렬과 희소 필드와 타임스탬프를 반환한다", async () => {
  const { service } = setup();
  const q = parseQuery("", { page: { defaultSize: 20, maxSize: 100 } });
  expect(
    await service.list(
      admin,
      {
        ...q,
        filter: { q: "WRIT" },
        sort: [{ field: "name", descending: true }],
        fields: { roles: ["name", "updatedAt"] },
      },
      "filter[q]=WRIT",
    ),
  ).toMatchObject({
    data: [{ id: customId, attributes: { name: "writer", updatedAt: at.toISOString() } }],
    meta: { page: { total: 1 } },
  });
  await expect(service.get(admin, uid, q)).rejects.toMatchObject({
    init: { status: 404, code: "resource.not_found" },
  });
});
