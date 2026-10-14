import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { anonymizeUser, assertNotLastActiveAdmin } from "../index.js";
import { required, fixture, now, principal, userId, fileId } from "./fixtures.js";
import { publishMeUpdated } from "../index.js";
const fixtures: ReturnType<typeof fixture>[] = [];
function setup() {
  const f = fixture();
  fixtures.push(f);
  return f;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
  vi.useRealTimers();
});
it("익명화는 이메일과 이름과 비밀번호와 소셜 연결과 역할과 토큰을 지운다", async () => {
  const f = setup();
  await f.unit.run((tx) => anonymizeUser(tx, userId));
  expect(f.state.users[0]).toMatchObject({
    email: null,
    name: null,
    passwordHash: null,
    emailVerifiedAt: null,
    status: "deleted",
    lastLoginAt: null,
  });
  expect(f.state.oauth).toEqual([]);
  expect(f.state.assignments).toEqual([]);
  expect(f.state.tokens).toEqual([]);
  expect(f.state.refresh).toEqual([]);
});
it("탈퇴는 아바타를 분리하고 만료 세션까지 account_deleted로 폐기한다", async () => {
  const f = setup();
  required(f.state.users[0]).avatarFileId = fileId;
  required(f.state.sessions[1]).expiresAt = now;
  await f.service.delete(principal);
  expect(f.state.users[0]).toMatchObject({ name: null, status: "deleted", avatarFileId: null });
  expect(f.state.files[0]?.detachedAt).toEqual(now);
  expect(f.state.sessions.map((s) => s.revokedReason)).toEqual([
    "account_deleted",
    "account_deleted",
  ]);
  expect(f.state.audits).toEqual([
    {
      action: "user.deleted",
      actorUserId: userId,
      targetType: "users",
      targetId: userId,
      meta: {},
    },
  ]);
  expect(f.events).toEqual([
    {
      name: "session.revoked",
      rooms: ["user:" + userId],
      payload: { meta: { reason: "account_deleted" } },
    },
    { name: "recheck", payload: userId },
  ]);
});
it("탈퇴 commit 실패는 익명화와 세션 폐기와 감사를 되돌리고 알림을 보내지 않는다", async () => {
  const f = setup();
  f.failCommit = true;
  await expect(f.service.delete(principal)).rejects.toThrow("commit 실패");
  expect(f.state.users[0]?.email).toBe("me@example.test");
  expect(f.state.sessions.every((s) => s.revokedAt === null)).toBe(true);
  expect(f.state.audits).toEqual([]);
  expect(f.events).toEqual([]);
});
it("다른 활성 admin이 있으면 보호 잠금 아래 탈퇴할 수 있다", async () => {
  const f = setup();
  required(f.state.assignments[0]).roleId = "admin";
  f.state.users.push({ ...required(f.state.users[0]), id: "other" });
  f.state.assignments.push({ userId: "other", roleId: "admin" });
  await f.unit.run((tx) => assertNotLastActiveAdmin(tx, userId));
  expect(f.trace).toEqual(["role:admin", "commit"]);
});
it("비활성 admin은 마지막 활성 admin 수에 들지 않는다", async () => {
  const f = setup();
  required(f.state.assignments[0]).roleId = "admin";
  f.state.users.push({ ...required(f.state.users[0]), id: "other", status: "deactivated" });
  f.state.assignments.push({ userId: "other", roleId: "admin" });
  await expect(f.unit.run((tx) => assertNotLastActiveAdmin(tx, userId))).rejects.toMatchObject({
    init: { code: "role.last_admin_protected" },
  });
});
it("역할과 상태 변경 이벤트는 commit 뒤 사용자 룸에만 나간다", async () => {
  const f = setup();
  await f.unit.run((_tx, afterCommit) => {
    publishMeUpdated(afterCommit, userId, ["roles", "status"]);
    expect(f.events).toEqual([]);
    return Promise.resolve();
  });
  expect(f.events).toEqual([
    {
      name: "me.updated",
      rooms: ["user:" + userId],
      payload: { meta: { changed: ["roles", "status"] } },
    },
  ]);
});
