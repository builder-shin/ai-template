import type { Tx } from "../../core/db/unit-of-work.js";
import { advisoryXactLock } from "../../core/db/locks.js";
import { ApiError } from "../../core/jsonapi/errors.js";
export async function assertNotLastActiveAdmin(tx: Tx, userId: string): Promise<void> {
  await advisoryXactLock(tx, "role:admin");
  const role = { name: "admin", system: true };
  const assignment = await tx.userRole.findFirst({
    where: { userId, role, user: { status: "active" } },
  });
  if (
    assignment &&
    (await tx.user.count({ where: { status: "active", roles: { some: { role } } } })) <= 1
  )
    throw new ApiError({
      status: 422,
      code: "role.last_admin_protected",
      title: "마지막 활성 관리자를 보호한다",
    });
}
export async function anonymizeUser(tx: Tx, userId: string): Promise<void> {
  await tx.oAuthAccount.deleteMany({ where: { userId } });
  await tx.userRole.deleteMany({ where: { userId } });
  await tx.verificationToken.deleteMany({ where: { userId } });
  await tx.refreshToken.deleteMany({ where: { session: { userId } } });
  await tx.user.update({
    where: { id: userId },
    data: {
      email: null,
      name: null,
      passwordHash: null,
      emailVerifiedAt: null,
      lastLoginAt: null,
      avatarFileId: null,
      status: "deleted",
    },
  });
}
