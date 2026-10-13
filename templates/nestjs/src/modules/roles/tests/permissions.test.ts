import { expect, it, vi } from "vitest";
import { RolesRepository, seedSystem } from "../index.js";
import { databaseFixture, required } from "./fixtures.js";
import type * as SecurityPermissions from "../../../core/security/permissions.js";
import { settings } from "../../../core/http/tests/fixtures.js";
import { IncludeRegistry } from "../../../core/jsonapi/include.js";
import { registerDomain } from "../../registry.js";
import type { INestApplicationContext } from "@nestjs/common";

vi.mock("../../../core/security/permissions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof SecurityPermissions>();
  return { ...actual, PERMISSION_CODES: [...actual.PERMISSION_CODES, "posts:archive"] };
});
it("admin은 저장 목록에 없는 나중에 더한 권한도 얻는다", async () => {
  const db = databaseFixture();
  const { adminUserId } = await seedSystem(db.tx, settings);
  required(db.roles.find((r) => r.name === "admin")).permissions = ["roles:read"];
  expect(await new RolesRepository().permissionsOf(db.tx, adminUserId)).toEqual(
    new Set([
      "admin:access",
      "users:read",
      "users:manage",
      "roles:read",
      "roles:manage",
      "audit-logs:read",
      "posts:create",
      "posts:manage",
      "posts:archive",
    ]),
  );
});
it("일반 역할의 권한은 합집합이고 알 수 없는 코드는 제외한다", async () => {
  const db = databaseFixture();
  db.roles.push(
    {
      id: "r1",
      name: "reader",
      system: false,
      description: null,
      permissions: ["roles:read", "garbage"],
    },
    {
      id: "r2",
      name: "writer",
      system: false,
      description: null,
      permissions: ["roles:read", "posts:create"],
    },
  );
  db.assignments.push({ userId: "u1", roleId: "r1" }, { userId: "u1", roleId: "r2" });
  const repository = new RolesRepository();
  expect(await repository.permissionsOf(db.tx, "u1")).toEqual(
    new Set(["roles:read", "posts:create"]),
  );
  required(db.roles[0]).permissions = ["users:read"];
  expect(await repository.permissionsOf(db.tx, "u1")).toEqual(
    new Set(["users:read", "roles:read", "posts:create"]),
  );
  expect(await repository.permissionsOf(db.tx, "없는-user")).toEqual(new Set());
});
it("같은 역할을 반복해서 추가해도 중복되지 않고 빈 부여는 기존 역할을 지우지 않는다", async () => {
  const db = databaseFixture();
  const { adminUserId } = await seedSystem(db.tx, settings);
  const repository = new RolesRepository();
  await repository.assign(db.tx, adminUserId, ["member", "member"]);
  const before = db.assignments.map((a) => ({ ...a }));
  await repository.assign(db.tx, adminUserId, []);
  await repository.assign(db.tx, adminUserId, ["member"]);
  expect(db.assignments).toEqual(before);
  expect(
    db.assignments.some((a) => a.roleId === db.roles.find((r) => r.name === "member")?.id),
  ).toBe(true);
});
it("등록부가 역할 include 로더를 앱에 연결한다", async () => {
  const db = databaseFixture();
  const { adminUserId } = await seedSystem(db.tx, settings);
  const registry = new IncludeRegistry();
  const app = {
    get: (token: unknown) => (token === IncludeRegistry ? registry : new RolesRepository()),
  } as unknown as INestApplicationContext;
  registerDomain(app);
  const role = required(db.roles.find((r) => r.name === "admin"));
  const included = await registry.load(
    db.tx,
    ["roles"],
    [
      {
        type: "users",
        id: adminUserId,
        attributes: {},
        relationships: { roles: { data: [{ type: "roles", id: role.id }] } },
      },
    ],
    undefined,
  );
  expect(included).toMatchObject([
    {
      type: "roles",
      id: role.id,
      attributes: {
        name: "admin",
        isSystem: true,
        description: "Has every permission, including ones added later.",
      },
    },
  ]);
});
it("역할 include는 등록된 코드를 보존하고 폐기된 코드를 제외한다", async () => {
  const db = databaseFixture();
  db.roles.push({
    id: "r1",
    name: "reader",
    system: false,
    permissions: ["roles:read", "retired:read", "posts:create"],
    description: null,
  });
  expect(await new RolesRepository().load(db.tx, ["r1"])).toEqual([
    {
      type: "roles",
      id: "r1",
      attributes: {
        name: "reader",
        description: null,
        permissions: ["roles:read", "posts:create"],
        isSystem: false,
      },
    },
  ]);
});
it("시스템 admin include는 저장 코드와 관계없이 미래 권한을 포함한다", async () => {
  const db = databaseFixture();
  db.roles.push({
    id: "r1",
    name: "admin",
    system: true,
    permissions: ["retired:read"],
    description: null,
  });
  expect(await new RolesRepository().load(db.tx, ["r1"])).toMatchObject([
    {
      attributes: {
        permissions: [
          "admin:access",
          "users:read",
          "users:manage",
          "roles:read",
          "roles:manage",
          "audit-logs:read",
          "posts:create",
          "posts:manage",
          "posts:archive",
        ],
      },
    },
  ]);
});
it.each([{ names: ["missing"] }, { names: ["member", "missing", "member"] }])(
  "없는 역할이 섞이면 부여 전에 거절하고 기존 관계를 보존한다: $names",
  async ({ names }) => {
    const db = databaseFixture();
    await seedSystem(db.tx, settings);
    const user = await db.tx.user.upsert({
      where: { email: "new@example.com" },
      update: {},
      create: { email: "new@example.com", passwordHash: null },
    });
    const before = structuredClone(db.assignments);
    await expect(new RolesRepository().assign(db.tx, user.id, names)).rejects.toThrow();
    expect(db.assignments).toEqual(before);
  },
);
it("유효한 역할을 추가하면 기존 역할을 유지하고 중복 요청은 한 번만 부여한다", async () => {
  const db = databaseFixture();
  await seedSystem(db.tx, settings);
  const user = await db.tx.user.upsert({
    where: { email: "new@example.com" },
    update: {},
    create: { email: "new@example.com", passwordHash: null },
  });
  db.roles.push({
    id: "r3",
    name: "reader",
    system: false,
    permissions: ["roles:read"],
    description: null,
  });
  const repository = new RolesRepository();
  await repository.assign(db.tx, user.id, ["member"]);
  await repository.assign(db.tx, user.id, ["reader", "reader"]);
  await repository.assign(db.tx, user.id, []);
  expect(db.assignments.filter((a) => a.userId === user.id)).toEqual([
    { userId: user.id, roleId: required(db.roles.find((r) => r.name === "member")).id },
    { userId: user.id, roleId: "r3" },
  ]);
});
