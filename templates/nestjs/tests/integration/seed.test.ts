import { expect, it } from "vitest";
import { getState } from "./state.js";
import { UnitOfWork } from "../../src/core/db/unit-of-work.js";
import { seedSystem, RolesRepository } from "../../src/modules/roles/index.js";
import { verifyPassword } from "../../src/core/security/passwords.js";
import { recordAudit } from "../../src/core/audit/record.js";

it("실제 DB에서 시드를 두 번 실행해도 역할·관리자·권한이 늘지 않는다", async () => {
  const { prisma, settings } = getState();
  const unit = new UnitOfWork(prisma);
  const first = await unit.run((tx) => seedSystem(tx, settings));
  const original = await prisma.user.findUniqueOrThrow({ where: { id: first.adminUserId } });
  const second = await unit.run((tx) => seedSystem(tx, settings));
  expect(second).toEqual(first);
  expect(await prisma.role.count()).toBe(2);
  expect(await prisma.user.count()).toBe(1);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: first.adminUserId } });
  expect(user.passwordHash).toBe(original.passwordHash);
  if (!user.passwordHash) throw new Error("관리자 비밀번호 해시가 없다");
  expect(await verifyPassword(user.passwordHash, settings.SEED_ADMIN_PASSWORD)).toBe(true);
  expect(
    await unit.run((tx) => new RolesRepository().permissionsOf(tx, first.adminUserId)),
  ).toEqual(
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
it("실제 트랜잭션이 실패하면 원인 행위와 감사 기록이 함께 사라진다", async () => {
  const { prisma } = getState();
  await expect(
    new UnitOfWork(prisma).run(async (tx) => {
      const user = await tx.user.create({ data: { email: "audit@example.com" } });
      await recordAudit(tx, {
        action: "user.roles_changed",
        actorUserId: user.id,
        target: { type: "users", id: user.id },
        meta: { roles: ["member"] },
      });
      throw new Error("원인 행위를 취소한다");
    }),
  ).rejects.toThrow("원인 행위를 취소한다");
  expect(await prisma.user.count()).toBe(0);
  expect(await prisma.auditLog.count()).toBe(0);
});
