import { expect, it } from "vitest";
import { adminFixture, collection, resourceDocument } from "./admin-fixture.js";
import { sessionDocument } from "./session-fixture.js";
import { newOpaqueToken } from "../../src/core/security/tokens.js";
it("현재 구현한 열두 감사 행위는 실제 원인 API를 통해 기록되고 목록에서 조회된다", async () => {
  const f = await adminFixture(),
    member = await f.addUser("member");
  const original = "me-fixture-password"; // betterleaks:allow 사유: CI의 가짜 비밀번호다
  const replacement = "audit-replacement-password"; // betterleaks:allow 사유: CI의 가짜 비밀번호다
  expect(
    (
      await f.post("sessions", {
        grantType: "password",
        email: "absent@example.test",
        password: original,
      })
    ).status,
  ).toBe(401);
  expect(
    (await f.post("session-revocations", { scope: "all" }, member.session.attributes.accessToken))
      .status,
  ).toBe(201);
  const fresh = await member.login();
  expect(fresh.status).toBe(201);
  const access = sessionDocument(fresh.text).data.attributes.accessToken;
  expect(
    (
      await f.post(
        "password-changes",
        { currentPassword: original, newPassword: replacement },
        access,
      )
    ).status,
  ).toBe(201);
  const opaque = newOpaqueToken();
  await f.unit.run((tx) =>
    tx.verificationToken.create({
      data: {
        userId: member.user.id,
        purpose: "reset",
        tokenHash: opaque.hash,
        expiresAt: new Date(Date.now() + 3600000),
      },
    }),
  );
  expect(
    (await f.post("password-resets", { token: opaque.token, password: replacement })).status,
  ).toBe(201);
  const created = await f.post("roles", { name: "audit-writer", permissions: ["posts:create"] });
  expect(created.status).toBe(201);
  const role = resourceDocument(created.text).data;
  expect(
    (
      await f.patch("users", member.user.id, {
        relationships: { roles: { data: [{ type: "roles", id: role.id }] } },
      })
    ).status,
  ).toBe(200);
  expect((await f.patch("roles", role.id, { attributes: { permissions: [] } })).status).toBe(200);
  for (const status of ["deactivated", "active"])
    expect((await f.patch("users", member.user.id, { attributes: { status } })).status).toBe(200);
  expect(
    (await f.http.delete("/api/v1/roles/" + role.id).set("Authorization", "Bearer " + f.token))
      .status,
  ).toBe(204);
  const login = await f.post("sessions", {
    grantType: "password",
    email: member.user.email,
    password: replacement,
  });
  expect(login.status).toBe(201);
  expect(
    (
      await f.http
        .delete("/api/v1/me")
        .set("Authorization", "Bearer " + sessionDocument(login.text).data.attributes.accessToken)
    ).status,
  ).toBe(204);
  const listed = await f.get("audit-logs?page[size]=100");
  expect(listed.status).toBe(200);
  expect([...new Set(collection(listed.text).data.map((r) => r.attributes.action))].sort()).toEqual(
    [
      "role.created",
      "role.deleted",
      "role.updated",
      "session.all_revoked",
      "session.login_failed",
      "session.login_succeeded",
      "user.deactivated",
      "user.deleted",
      "user.password_changed",
      "user.password_reset",
      "user.reactivated",
      "user.roles_changed",
    ].sort(),
  );
});
it("감사만 읽을 수 있는 사용자에게 공개 actor와 고정 대상 투영만 반환한다", async () => {
  const f = await adminFixture(),
    reader = await f.addUser("member");
  await f.unit.run(async (tx) => {
    const role = await tx.role.create({
      data: { name: "auditor", permissions: ["audit-logs:read"] },
    });
    await tx.userRole.create({ data: { userId: reader.user.id, roleId: role.id } });
  });
  const access = reader.session.attributes.accessToken;
  const listed = await f.get(
    "audit-logs?filter[actor]=" +
      f.user.id +
      "&filter[action]=session.login_succeeded&include=actor&sort=-createdAt",
    access,
  );
  expect(listed.status).toBe(200);
  const doc = collection(listed.text);
  expect(doc.data.length).toBeGreaterThan(0);
  expect(doc.data[0]?.attributes).toMatchObject({
    targetType: null,
    targetId: null,
    ipAddress: null,
  });
  expect(doc.included?.[0]?.attributes).toEqual({ name: "내 정보 회원" });
  expect(JSON.stringify(doc)).not.toContain(f.user.email);
  expect((await f.get("users", access)).status).toBe(403);
  const id = doc.data[0]?.id;
  if (!id) throw new Error("원인 감사가 없다");
  const single = await f.get("audit-logs/" + id + "?include=actor", access);
  expect(single.status).toBe(200);
  expect(resourceDocument(single.text).data.id).toBe(id);
  const empty = await f.get(
    "audit-logs?filter[createdFrom]=2099-01-01T00:00:00Z&filter[createdTo]=2099-01-01T00:00:00Z",
    access,
  );
  expect(empty.status).toBe(200);
  expect(collection(empty.text).data).toEqual([]);
});
