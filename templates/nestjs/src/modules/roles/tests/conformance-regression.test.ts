import { afterEach, expect, it } from "vitest";
import { RolesAdminService } from "../index.js";
import { AuditLogsRepository } from "../../audit-logs/index.js";
import { adminFixture, admin, adminId, customId } from "../../users/tests/admin-fixture.js";
const fixtures: ReturnType<typeof adminFixture>[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
});

it.each([
  { name: "attributes 없음", patch: {} },
  { name: "빈 attributes", patch: { attributes: {} } },
  { name: "설명 변경", patch: { attributes: { description: "바뀜" } } },
  { name: "권한 축소", patch: { attributes: { permissions: [] } } },
])("권한 밖의 역할은 $name 요청도 거절한다", async ({ patch }) => {
  const f = adminFixture();
  fixtures.push(f);
  const service = new RolesAdminService(f.unit, f.roles, f.control);
  const limited = { ...admin, permissions: new Set(["roles:read", "roles:manage"] as const) };
  const data = { type: "roles", id: adminId, ...patch };
  const before = structuredClone(f.state);
  await expect(service.update(limited, adminId, data.attributes ?? {})).rejects.toMatchObject({
    init: { status: 403, code: "permission.denied" },
  });
  expect(f.state).toEqual(before);
  expect(f.events).toEqual([]);
});
it("권한 안의 역할은 빈 변경을 허용하고 감사와 재검사를 만들지 않는다", async () => {
  const f = adminFixture();
  fixtures.push(f);
  const service = new RolesAdminService(f.unit, f.roles, f.control);
  const principal = { ...admin, permissions: new Set(["roles:manage", "posts:create"] as const) };
  expect(await service.update(principal, customId, {})).toMatchObject({ data: { id: customId } });
  expect(f.state.audits).toEqual([]);
  expect(f.events).toEqual([]);
});
it("역할 생성 감사는 상세 화면에 표시할 이름과 권한 메타데이터를 보존한다", async () => {
  const f = adminFixture();
  fixtures.push(f);
  const service = new RolesAdminService(f.unit, f.roles, f.control);
  const name = "감사역할-격리시험";
  const result = await service.create(admin, {
    name,
    permissions: ["posts:manage", "posts:create", "posts:create"],
  });
  const row = f.state.audits[0] as unknown as Parameters<AuditLogsRepository["resource"]>[0];
  expect(new AuditLogsRepository().resource(row)).toMatchObject({
    attributes: {
      action: "role.created",
      targetType: "roles",
      targetId: result.data.id,
      metadata: { name, permissions: ["posts:create", "posts:manage"] },
    },
  });
});
