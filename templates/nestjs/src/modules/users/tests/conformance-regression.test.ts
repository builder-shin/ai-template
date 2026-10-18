import { afterEach, expect, it } from "vitest";
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
    f,
    service: new UsersAdminService(f.unit, f.users, f.roles, f.sessions, f.control, f.includes),
  };
}
const missingId = "01900000-0000-7000-8000-000000000099";

it.each([
  { name: "없는 UUID", ids: [memberId, missingId], index: 1 },
  { name: "중복 뒤 없는 UUID", ids: [memberId, memberId, missingId], index: 2 },
  { name: "서로게이트", ids: ["\ud800"], index: 0 },
  { name: "없는 UUID 뒤 서로게이트", ids: [missingId, "\ud800"], index: 0 },
])("$name 관계는 원래 배열의 실제 요소 $index 를 가리킨다", async ({ ids, index }) => {
  const { f, service } = setup();
  const before = structuredClone(f.state);
  await expect(
    service.update(admin, otherId, {
      relationships: {
        roles: { data: ids.map((id) => ({ type: "roles" as const, id })) },
      },
    }),
  ).rejects.toMatchObject({
    init: {
      status: 404,
      code: "resource.not_found",
      source: { pointer: `/data/relationships/roles/data/${String(index)}` },
    },
  });
  expect(f.state).toEqual(before);
  expect(f.events).toEqual([]);
});

it.each(["추가", "교체", "회수"])(
  "역할 감사에는 정렬된 added와 removed 이름이 있다: %s",
  async (kind) => {
    const { f, service } = setup();
    const ids = kind === "추가" ? [customId, memberId] : kind === "교체" ? [customId] : [];
    await service.update(admin, otherId, {
      relationships: {
        roles: { data: ids.map((id) => ({ type: "roles" as const, id })) },
      },
    });
    expect(f.state.audits).toMatchObject([
      {
        action: "user.roles_changed",
        actorUserId: uid,
        targetType: "users",
        targetId: otherId,
        meta: {
          added: kind === "회수" ? [] : ["writer"],
          removed: kind === "추가" ? [] : ["member"],
        },
      },
    ]);
  },
);

it.each(["자신 상태", "자신 역할", "강한 대상 상태", "강한 대상 빈 변경"])(
  "사용자 관리의 %s 요청은 변경과 부수 효과 전에 거절한다",
  async (kind) => {
    const { f, service } = setup();
    const actor = {
      ...admin,
      userId: otherId,
      permissions: new Set(["users:read", "users:manage", "posts:create"] as const),
    };
    const id = kind.startsWith("자신") ? otherId : uid;
    const input =
      kind === "자신 역할"
        ? { relationships: { roles: { data: [] } } }
        : kind === "강한 대상 빈 변경"
          ? {}
          : { attributes: { status: "deactivated" as const } };
    const before = structuredClone(f.state);
    await expect(service.update(actor, id, input)).rejects.toMatchObject({
      init: { status: 403, code: "permission.denied" },
    });
    expect(f.state).toEqual(before);
    expect(f.events).toEqual([]);
  },
);

it("관리자는 자기 권한 밖의 역할을 다른 사용자에게 줄 수 없다", async () => {
  const { f, service } = setup();
  const actor = {
    ...admin,
    permissions: new Set(["users:read", "users:manage", "posts:create"] as const),
  };
  const before = structuredClone(f.state);
  await expect(
    service.update(actor, otherId, {
      relationships: {
        roles: { data: [{ type: "roles", id: adminId }] },
      },
    }),
  ).rejects.toMatchObject({ init: { status: 403, code: "permission.denied" } });
  expect(f.state).toEqual(before);
  expect(f.events).toEqual([]);
});
