import { expect, it } from "vitest";
import { adminFixture, collection, resourceDocument } from "./admin-fixture.js";
import { errorCode } from "./session-fixture.js";
it("사용자 목록의 검색·상태·역할·정렬·페이지와 역할·아바타 include를 조회한다", async () => {
  const f = await adminFixture(),
    member = await f.addUser("member");
  const data = await f.unit.run(async (tx) => {
    const file = await tx.file.create({
      data: {
        ownerId: member.user.id,
        key: "admin-avatar-" + member.user.id,
        filename: "avatar.png",
        contentType: "image/png",
        size: 1n,
        status: "ready",
      },
    });
    await tx.user.update({
      where: { id: member.user.id },
      data: { name: "검색 회원", avatarFileId: file.id },
    });
    const role = await tx.role.findUniqueOrThrow({ where: { name: "member" } });
    return { file, role };
  });
  const r = await f.get(
    "users?filter[q]=" +
      encodeURIComponent("검색") +
      "&filter[status]=active&filter[role]=" +
      data.role.id +
      "&sort=-name,email&include=roles,avatar&page[size]=1",
  );
  expect(r.status).toBe(200);
  const doc = collection(r.text);
  expect(doc.data.map((r) => r.id)).toEqual([member.user.id]);
  expect(doc.meta.page.total).toBe(1);
  expect(doc.included?.map((r) => r.type).sort()).toEqual(["files", "roles"]);
  const single = await f.get("users/" + member.user.id + "?fields[users]=name");
  expect(single.status).toBe(200);
  expect(resourceDocument(single.text).data.attributes).toEqual({ name: "검색 회원" });
  expect((await f.get("users", member.session.attributes.accessToken)).status).toBe(403);
});
it("사용자 역할 교체는 실제 권한을 갱신하고 비활성화는 access와 refresh를 폐기한다", async () => {
  const f = await adminFixture(),
    member = await f.addUser("member");
  const role = await f.unit.run((tx) =>
    tx.role.create({ data: { name: "관리 읽기", permissions: ["users:read"] } }),
  );
  expect(
    (
      await f.patch("users", member.user.id, {
        relationships: { roles: { data: [{ type: "roles", id: role.id }] } },
      })
    ).status,
  ).toBe(200);
  const mine = await f.get("me", member.session.attributes.accessToken);
  expect(JSON.parse(mine.text) as unknown).toMatchObject({ meta: { permissions: ["users:read"] } });
  expect(
    (await f.patch("users", member.user.id, { attributes: { status: "deactivated" } })).status,
  ).toBe(200);
  expect((await f.get("me", member.session.attributes.accessToken)).status).toBe(401);
  const refresh = await f.post("sessions", {
    grantType: "refreshToken",
    refreshToken: member.session.attributes.refreshToken,
  });
  expect(refresh.status).toBe(401);
  expect(
    (await f.patch("users", member.user.id, { attributes: { status: "active" } })).status,
  ).toBe(200);
  expect((await member.login()).status).toBe(201);
  const stored = await f.unit.run((tx) =>
    tx.session.findUniqueOrThrow({ where: { id: member.session.id } }),
  );
  expect(stored.revokedReason).toBe("account_deactivated");
});
it("자신에게 없는 역할 권한은 다른 사용자에게 부여할 수 없다", async () => {
  const f = await adminFixture(),
    member = await f.addUser("member");
  const roles = await f.unit.run(async (tx) => {
    const manager = await tx.role.create({
      data: { name: "사용자 관리자", permissions: ["users:manage"] },
    });
    await tx.userRole.create({ data: { userId: member.user.id, roleId: manager.id } });
    return tx.role.findUniqueOrThrow({ where: { name: "admin" } });
  });
  const r = await f.patch(
    "users",
    f.user.id,
    { relationships: { roles: { data: [{ type: "roles", id: roles.id }] } } },
    member.session.attributes.accessToken,
  );
  expect(r.status).toBe(403);
  expect(errorCode(r.text)).toBe("permission.denied");
});
