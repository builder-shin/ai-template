import { expect, it } from "vitest";
import { adminFixture, collection, resourceDocument } from "./admin-fixture.js";
import { errorCode } from "./session-fixture.js";
it("역할 CRUD의 필터·정렬·희소 필드·시간과 실제 구성원 권한이 반영된다", async () => {
  const f = await adminFixture(),
    member = await f.addUser("member");
  const created = await f.post("roles", {
    name: "writer-ci",
    description: "초안",
    permissions: ["users:read"],
  });
  expect(created.status).toBe(201);
  const role = resourceDocument(created.text).data;
  expect(role.attributes).toMatchObject({
    createdAt: expect.any(String) as unknown,
    updatedAt: expect.any(String) as unknown,
  });
  expect(
    (
      await f.patch("users", member.user.id, {
        relationships: { roles: { data: [{ type: "roles", id: role.id }] } },
      })
    ).status,
  ).toBe(200);
  expect((await f.get("users", member.session.attributes.accessToken)).status).toBe(200);
  const updated = await f.patch("roles", role.id, {
    attributes: { permissions: ["roles:read"], description: null },
  });
  expect(updated.status).toBe(200);
  const changed = resourceDocument(updated.text).data;
  expect(Date.parse(String(changed.attributes.updatedAt))).toBeGreaterThan(
    Date.parse(String(role.attributes.updatedAt)),
  );
  expect((await f.get("users", member.session.attributes.accessToken)).status).toBe(403);
  expect((await f.get("roles", member.session.attributes.accessToken)).status).toBe(200);
  const listed = await f.get(
    "roles?filter[q]=WRITER-CI&sort=-createdAt&fields[roles]=name&page[size]=1",
  );
  expect(listed.status).toBe(200);
  expect(collection(listed.text).data).toEqual([
    { type: "roles", id: role.id, attributes: { name: "writer-ci" } },
  ]);
  expect(
    (await f.http.delete("/api/v1/roles/" + role.id).set("Authorization", "Bearer " + f.token))
      .status,
  ).toBe(204);
  expect((await f.get("roles", member.session.attributes.accessToken)).status).toBe(403);
  expect(await f.unit.run((tx) => tx.userRole.count({ where: { roleId: role.id } }))).toBe(0);
});
it("시스템 역할 삭제와 admin 권한 수정과 중복 이름 생성을 거절한다", async () => {
  const f = await adminFixture();
  const rows = await f.unit.run((tx) => tx.role.findMany({ where: { system: true } }));
  for (const role of rows) {
    const r = await f.http
      .delete("/api/v1/roles/" + role.id)
      .set("Authorization", "Bearer " + f.token);
    expect(r.status).toBe(422);
    expect(errorCode(r.text)).toBe("role.system_role_protected");
    if (role.name === "admin")
      expect((await f.patch("roles", role.id, { attributes: { permissions: [] } })).status).toBe(
        422,
      );
  }
  const duplicate = await f.post("roles", { name: "member", permissions: [] });
  expect(duplicate.status).toBe(422);
  expect(errorCode(duplicate.text)).toBe("validation.already_taken");
  const member = await f.addUser("member");
  expect(
    (
      await f.post(
        "roles",
        { name: "blocked", permissions: [] },
        member.session.attributes.accessToken,
      )
    ).status,
  ).toBe(403);
});
