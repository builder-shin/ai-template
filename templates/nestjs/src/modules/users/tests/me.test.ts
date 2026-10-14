import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { required, fixture, now, principal, userId, fileId } from "./fixtures.js";
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
it("내 정보는 전체 속성과 현재 역할의 실제 권한을 돌려준다", async () => {
  const f = setup();
  expect(await f.service.get(principal)).toMatchObject({
    data: {
      type: "users",
      id: userId,
      attributes: { email: "me@example.test", name: "회원", status: "active" },
      relationships: { roles: { data: [{ type: "roles", id: "member" }] }, avatar: { data: null } },
    },
    meta: { permissions: ["posts:create"] },
  });
});
it("이름과 로케일을 바꾸면 commit 뒤 profile 이벤트를 보낸다", async () => {
  const f = setup();
  expect(
    await f.service.update(principal, {
      id: userId,
      attributes: { name: "새 이름", locale: "en" },
    }),
  ).toMatchObject({ data: { attributes: { name: "새 이름", locale: "en" } } });
  expect(f.state.users[0]).toMatchObject({ name: "새 이름", locale: "en" });
  expect(f.events).toEqual([
    { name: "me.updated", rooms: ["user:" + userId], payload: { meta: { changed: ["profile"] } } },
  ]);
});
it("값이 같거나 빈 수정이면 이벤트를 보내지 않는다", async () => {
  const f = setup();
  await f.service.update(principal, { id: userId, attributes: { name: "회원" } });
  await f.service.update(principal, { id: userId });
  expect(f.events).toEqual([]);
});
it("본문 id가 본인과 다르면 409이고 개인정보를 바꾸지 않는다", async () => {
  const f = setup();
  await expect(
    f.service.update(principal, { id: "다른 회원", attributes: { name: "남" } }),
  ).rejects.toMatchObject({
    init: { status: 409, code: "resource.conflict", source: { pointer: "/data/id" } },
  });
  expect(f.state.users[0]?.name).toBe("회원");
});
it.each(["없는 파일", "\ud800"])("없는 아바타 %s는 404다", async (id) => {
  const f = setup();
  await expect(
    f.service.update(principal, {
      id: userId,
      relationships: { avatar: { data: { type: "files", id } } },
    }),
  ).rejects.toMatchObject({
    init: {
      status: 404,
      code: "resource.not_found",
      source: { pointer: "/data/relationships/avatar/data" },
    },
  });
});
it.each([
  { ownerId: "다른 회원", status: "ready", code: "resource.not_found", errorStatus: 404 },
  { ownerId: userId, status: "pending", code: "file.upload_incomplete", errorStatus: 422 },
])(
  "$status 아바타의 소유권과 완료 상태를 검증한다",
  async ({ ownerId, status, code, errorStatus }) => {
    const f = setup();
    Object.assign(required(f.state.files[0]), { ownerId, status });
    await expect(
      f.service.update(principal, {
        id: userId,
        relationships: { avatar: { data: { type: "files", id: fileId } } },
      }),
    ).rejects.toMatchObject({ init: { status: errorStatus, code } });
    expect(f.state.users[0]?.avatarFileId).toBeNull();
  },
);
it("아바타를 교체하면 이전 파일을 분리하고 새 파일의 분리를 해제한다", async () => {
  const f = setup();
  required(f.state.users[0]).avatarFileId = "old";
  f.state.files.push({ ...required(f.state.files[0]), id: "old" });
  required(f.state.files[0]).detachedAt = now;
  await f.service.update(principal, {
    id: userId,
    relationships: { avatar: { data: { type: "files", id: fileId } } },
  });
  expect(f.state.users[0]?.avatarFileId).toBe(fileId);
  expect(f.state.files.find((x) => x.id === "old")?.detachedAt).toEqual(now);
  expect(f.state.files[0]?.detachedAt).toBeNull();
});
it("아바타를 null로 바꾸면 기존 파일을 분리한다", async () => {
  const f = setup();
  required(f.state.users[0]).avatarFileId = fileId;
  await f.service.update(principal, { id: userId, relationships: { avatar: { data: null } } });
  expect(f.state.users[0]?.avatarFileId).toBeNull();
  expect(f.state.files[0]?.detachedAt).toEqual(now);
});
it("commit이 실패하면 수정과 실시간 알림이 모두 남지 않는다", async () => {
  const f = setup();
  f.failCommit = true;
  await expect(
    f.service.update(principal, { id: userId, attributes: { name: "실패" } }),
  ).rejects.toThrow("commit 실패");
  expect(f.state.users[0]?.name).toBe("회원");
  expect(f.events).toEqual([]);
});
it("최근 로그인 창을 넘은 세션은 재인증이 필요하다", async () => {
  const f = setup();
  required(f.state.sessions[0]).authenticatedAt = new Date(now.getTime() - 600001);
  await expect(f.service.delete(principal)).rejects.toMatchObject({
    init: {
      status: 401,
      code: "auth.reauthentication_required",
      headers: {
        "WWW-Authenticate": 'Bearer error="insufficient_user_authentication", max_age=600',
      },
    },
  });
  expect(f.state.users[0]?.status).toBe("active");
});
it("최근 사용 시각이 갱신되어도 로그인 창은 늘어나지 않는다", async () => {
  const f = setup();
  required(f.state.sessions[0]).authenticatedAt = new Date(now.getTime() - 601000);
  required(f.state.sessions[0]).lastUsedAt = now;
  await expect(f.service.delete(principal)).rejects.toMatchObject({
    init: { code: "auth.reauthentication_required" },
  });
});
it("최근 로그인 창의 정확한 경계는 탈퇴를 허용한다", async () => {
  const f = setup();
  required(f.state.sessions[0]).authenticatedAt = new Date(now.getTime() - 600000);
  await f.service.delete(principal);
  expect(f.state.users[0]?.status).toBe("deleted");
});
it("마지막 활성 admin은 탈퇴하지 못한다", async () => {
  const f = setup();
  required(f.state.assignments[0]).roleId = "admin";
  await expect(f.service.delete(principal)).rejects.toMatchObject({
    init: { status: 422, code: "role.last_admin_protected" },
  });
  expect(f.state.users[0]?.status).toBe("active");
  expect(f.trace).toContain("role:admin");
  expect(f.events).toEqual([]);
});
it.each([undefined, "다른 회원", "revoked", "expired"])(
  "유효하지 않은 현재 세션 %s는 탈퇴하지 못한다",
  async (state) => {
    const f = setup();
    if (state === undefined) f.state.sessions.splice(0, 1);
    else if (state === "다른 회원") required(f.state.sessions[0]).userId = state;
    else if (state === "revoked") required(f.state.sessions[0]).revokedAt = now;
    else required(f.state.sessions[0]).expiresAt = now;
    await expect(f.service.delete(principal)).rejects.toMatchObject({
      init: { status: 401, code: "auth.token_invalid" },
    });
    expect(f.state.users[0]?.status).toBe("active");
  },
);

it("내 정보의 권한은 principal의 이전 값 대신 현재 역할에서 계산한다", async () => {
  const f = setup();
  required(f.state.roles[0]).permissions = ["users:read"];
  expect(await f.service.get(principal)).toMatchObject({ meta: { permissions: ["users:read"] } });
});
it("공개 사용자 로더는 본인을 읽어도 이메일과 상태와 역할을 노출하지 않는다", async () => {
  const f = setup();
  expect(await f.unit.run((tx) => f.users.load(tx, [userId]))).toEqual([
    {
      type: "users",
      id: userId,
      attributes: { name: "회원" },
      relationships: { avatar: { data: null } },
    },
  ]);
});
it("탈퇴한 사용자의 공개 형태는 이름 null과 아바타 null이다", async () => {
  const f = setup();
  await f.service.delete(principal);
  expect(await f.unit.run((tx) => f.users.load(tx, [userId]))).toEqual([
    {
      type: "users",
      id: userId,
      attributes: { name: null },
      relationships: { avatar: { data: null } },
    },
  ]);
});
