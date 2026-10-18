import { afterEach, expect, it } from "vitest";
import { parseQuery } from "../../../core/jsonapi/query.js";
import { UsersAdminService } from "../index.js";
import { adminFixture, admin, uid, otherId, adminId, memberId, customId } from "./admin-fixture.js";
const fixtures: ReturnType<typeof adminFixture>[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
});
function setup() {
  const f = adminFixture();
  fixtures.push(f);
  return {
    ...f,
    f,
    service: new UsersAdminService(f.unit, f.users, f.roles, f.sessions, f.control, f.includes),
  };
}
const query = () => parseQuery("", { page: { defaultSize: 20, maxSize: 100 } });
it("역할 목록 갱신은 기존 부여를 교체하고 빈 목록은 전부 회수한다", async () => {
  const { f, service } = setup();
  await service.update(admin, otherId, {
    relationships: { roles: { data: [{ type: "roles", id: customId }] } },
  });
  expect(f.state.assignments.filter((a) => a.userId === otherId)).toEqual([
    { userId: otherId, roleId: customId },
  ]);
  await service.update(admin, otherId, { relationships: { roles: { data: [] } } });
  expect(f.state.assignments.filter((a) => a.userId === otherId)).toEqual([]);
  expect(f.state.audits.map((a) => a.action)).toEqual(["user.roles_changed", "user.roles_changed"]);
});
it("역할 교체는 commit 뒤 roles 알림과 재검사를 보낸다", async () => {
  const { f, service } = setup();
  await service.update(admin, otherId, {
    relationships: { roles: { data: [{ type: "roles", id: customId }] } },
  });
  expect(f.events).toEqual([
    { name: "me.updated", rooms: ["user:" + otherId], payload: { meta: { changed: ["roles"] } } },
    { name: "recheck", userId: otherId },
  ]);
});
it("비활성화는 모든 세션을 account_deactivated로 폐기하고 감사를 남긴다", async () => {
  const { f, service } = setup();
  await service.update(admin, otherId, { attributes: { status: "deactivated" } });
  expect(f.state.users.find((u) => u.id === otherId)?.status).toBe("deactivated");
  expect(f.state.sessions.map((s) => s.revokedReason)).toEqual([
    "account_deactivated",
    "account_deactivated",
  ]);
  expect(f.state.audits).toMatchObject([
    { action: "user.deactivated", actorUserId: uid, targetType: "users", targetId: otherId },
  ]);
  expect(f.events).toContainEqual({
    name: "session.revoked",
    rooms: ["user:" + otherId],
    payload: { meta: { reason: "account_deactivated" } },
  });
  expect(f.events).toContainEqual({
    name: "me.updated",
    rooms: ["user:" + otherId],
    payload: { meta: { changed: ["status"] } },
  });
});
it("재활성화는 user.reactivated를 기록하며 폐기한 세션을 되살리지 않는다", async () => {
  const { f, service } = setup();
  await service.update(admin, otherId, { attributes: { status: "deactivated" } });
  await service.update(admin, otherId, { attributes: { status: "active" } });
  expect(f.state.audits.map((a) => a.action)).toEqual(["user.deactivated", "user.reactivated"]);
  expect(f.state.sessions.every((s) => s.revokedAt !== null)).toBe(true);
});
it.each<Parameters<UsersAdminService["update"]>[2]>([
  { attributes: { status: "deactivated" } },
  { relationships: { roles: { data: [{ type: "roles", id: memberId }] } } },
])("마지막 활성 admin을 제거하는 $attributes $relationships 갱신은 거절한다", async (data) => {
  const { f, service } = setup();
  // 자기 변경의 403을 먼저 통과하도록 다른 관리자가 일반 역할로 같은 실제 권한을 가진다.
  const role = f.state.roles.find((r) => r.id === customId);
  if (!role) throw new Error("관리 역할이 없다");
  role.permissions = [...admin.permissions];
  f.state.assignments.push({ userId: otherId, roleId: customId });
  await expect(service.update({ ...admin, userId: otherId }, uid, data)).rejects.toMatchObject({
    init: { status: 422, code: "role.last_admin_protected" },
  });
  expect(f.state.assignments).toContainEqual({ userId: uid, roleId: adminId });
  expect(f.state.audits).toEqual([]);
  expect(f.events).toEqual([]);
});
it("저장된 admin 권한이 비어 있어도 admin 역할 부여에는 모든 실제 권한이 필요하다", async () => {
  const { f, service } = setup();
  const limited = { ...admin, permissions: new Set(["users:manage"] as const) };
  await expect(
    service.update(limited, otherId, {
      relationships: { roles: { data: [{ type: "roles", id: adminId }] } },
    }),
  ).rejects.toMatchObject({ init: { status: 403, code: "permission.denied" } });
  expect(f.state.assignments.filter((a) => a.userId === otherId)).toEqual([
    { userId: otherId, roleId: memberId },
  ]);
});
it("없는 역할은 404이며 부분 교체나 감사가 남지 않는다", async () => {
  const { f, service } = setup();
  await expect(
    service.update(admin, otherId, {
      relationships: { roles: { data: [{ type: "roles", id: uid }] } },
    }),
  ).rejects.toMatchObject({ init: { status: 404, code: "resource.not_found" } });
  expect(f.state.audits).toEqual([]);
});
it("UUID가 아닌 역할 참조는 DB 오류 대신 404이며 사용자를 바꾸지 않는다", async () => {
  const { f, service } = setup();
  await expect(
    service.update(admin, otherId, {
      relationships: { roles: { data: [{ type: "roles", id: "bad-role" }] } },
    }),
  ).rejects.toMatchObject({ init: { status: 404, code: "resource.not_found" } });
  expect(f.state.assignments).toContainEqual({ userId: otherId, roleId: memberId });
  expect(f.state.audits).toEqual([]);
});
it("동일한 역할 집합과 상태는 알림과 감사를 만들지 않는다", async () => {
  const { f, service } = setup();
  await service.update(admin, otherId, {
    attributes: { status: "active" },
    relationships: {
      roles: {
        data: [
          { type: "roles", id: memberId },
          { type: "roles", id: memberId },
        ],
      },
    },
  });
  expect(f.events).toEqual([]);
  expect(f.state.audits).toEqual([]);
});
it("commit 실패는 사용자와 세션과 감사를 되돌리고 알림을 보내지 않는다", async () => {
  const { f, service } = setup();
  f.failCommit = true;
  await expect(
    service.update(admin, otherId, { attributes: { status: "deactivated" } }),
  ).rejects.toThrow("commit 실패");
  expect(f.state.users[1]?.status).toBe("active");
  expect(f.state.sessions.every((s) => s.revokedAt === null)).toBe(true);
  expect(f.state.audits).toEqual([]);
  expect(f.events).toEqual([]);
});
it("삭제된 사용자는 관리 API로 재활성화할 수 없다", async () => {
  const { f, service } = setup();
  if (f.state.users[1]) f.state.users[1].status = "deleted";
  await expect(
    service.update(admin, otherId, { attributes: { status: "active" } }),
  ).rejects.toMatchObject({ init: { status: 422 } });
  expect(f.state.users[1]?.status).toBe("deleted");
});
it("목록은 검색과 역할과 상태 필터와 정렬과 페이지와 roles include를 적용한다", async () => {
  const { service } = setup();
  const q = {
    ...query(),
    filter: { q: "MEMBER", role: memberId, status: "active" },
    sort: [{ field: "email", descending: true }],
    include: ["roles"],
    fields: { users: ["email", "roles"], roles: ["name"] },
    page: { number: 1, size: 1 },
  };
  expect(await service.list(admin, q, "filter[q]=MEMBER&filter[role]=" + memberId)).toMatchObject({
    data: [{ id: otherId, attributes: { email: "member@example.test" } }],
    included: [{ id: memberId, attributes: { name: "member" } }],
    meta: { page: { total: 1, totalPages: 1 } },
  });
});
it("조회는 없는 사용자를 404로 응답한다", async () => {
  const { service } = setup();
  await expect(service.get(admin, customId, query())).rejects.toMatchObject({
    init: { status: 404, code: "resource.not_found" },
  });
});
