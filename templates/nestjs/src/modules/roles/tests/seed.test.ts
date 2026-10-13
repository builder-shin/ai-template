import { expect, it } from "vitest";
import { seedSystem, RolesRepository } from "../index.js";
import { databaseFixture, required } from "./fixtures.js";
import { settings } from "../../../core/http/tests/fixtures.js";
import { verifyPassword } from "../../../core/security/passwords.js";
import { components } from "../../../core/jsonapi/schemas.js";
import "../../../core/config/locale.js";
import "../../users/index.js";

it("시드를 두 번 실행해도 시스템 역할 둘과 관리자 하나다", async () => {
  const db = databaseFixture();
  const first = await seedSystem(db.tx, settings);
  const originalHash = db.users[0]?.passwordHash;
  const second = await seedSystem(db.tx, settings);
  expect(second).toEqual(first);
  expect(db.users).toHaveLength(1);
  expect(db.roles).toHaveLength(2);
  expect(db.users[0]?.passwordHash).toBe(originalHash);
  expect(db.roles.find((r) => r.name === "member")).toMatchObject({
    system: true,
    permissions: ["posts:create"],
    description: "Given to everyone who signs up.",
  });
  expect(db.roles.find((r) => r.name === "admin")?.permissions).toHaveLength(8);
});
it("시드 관리자의 이메일은 정규화하고 비밀번호는 surrogatepass로 해시한다", async () => {
  const db = databaseFixture();
  await seedSystem(db.tx, {
    ...settings,
    SEED_ADMIN_EMAIL: " Admin@Example.COM ",
    SEED_ADMIN_PASSWORD: "a\uD800b-password", // betterleaks:allow 사유: 서로게이트 검증용 가짜 비밀번호다
  });
  const user = required(db.users[0]);
  expect(user).toMatchObject({ email: "admin@example.com", status: "active" });
  expect(user.emailVerifiedAt).toBeInstanceOf(Date);
  expect(await verifyPassword(required(user.passwordHash), "a\uD800b-password")).toBe(true);
  expect(await verifyPassword(required(user.passwordHash), "a\uFFFDb-password")).toBe(false);
});
it("반복 시드는 기존 관리자와 수정한 시스템 역할 설정을 보존한다", async () => {
  const db = databaseFixture();
  await seedSystem(db.tx, settings);
  Object.assign(required(db.users[0]), {
    name: "새 이름",
    locale: "en",
    passwordHash: "변경된 해시",
  });
  required(db.roles.find((r) => r.name === "admin")).permissions = [];
  const member = required(db.roles.find((r) => r.name === "member"));
  member.permissions = ["roles:read"];
  member.description = "수정한 member 설명";
  const before = structuredClone(db.roles);
  await seedSystem(db.tx, settings);
  expect(db.users[0]).toMatchObject({ name: "새 이름", locale: "en", passwordHash: "변경된 해시" });
  expect(db.roles).toEqual(before);
  expect(await new RolesRepository().permissionsOf(db.tx, required(db.users[0]).id)).toEqual(
    new Set([
      "admin:access",
      "users:read",
      "users:manage",
      "roles:read",
      "roles:manage",
      "audit-logs:read",
      "posts:create",
      "posts:manage",
    ]),
  );
});
it("시드는 같은 이름의 기존 일반 역할을 시스템 역할로 승격하지 않는다", async () => {
  const db = databaseFixture();
  db.roles.push({
    id: "r1",
    name: "admin",
    system: false,
    permissions: ["roles:read"],
    description: "기존 일반 역할",
  });
  const { adminUserId } = await seedSystem(db.tx, settings);
  expect(db.roles.find((r) => r.name === "admin")).toEqual({
    id: "r1",
    name: "admin",
    system: false,
    permissions: ["roles:read"],
    description: "기존 일반 역할",
  });
  expect(await new RolesRepository().permissionsOf(db.tx, adminUserId)).toEqual(
    new Set(["roles:read", "posts:create"]),
  );
});
it("로케일과 사용자 상태 컴포넌트는 계약 값만 허용한다", () => {
  const schemas = components();
  for (const value of ["ko", "en"])
    expect(schemas.get("Locale")?.schema.safeParse(value).success).toBe(true);
  for (const value of ["active", "deactivated", "deleted"])
    expect(schemas.get("UserStatus")?.schema.safeParse(value).success).toBe(true);
  expect(schemas.get("Locale")?.schema.safeParse("fr").success).toBe(false);
  expect(schemas.get("UserStatus")?.schema.safeParse("blocked").success).toBe(false);
});
