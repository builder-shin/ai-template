import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/db/prisma.service.js";
import type { Tx } from "../../core/db/unit-of-work.js";
@Injectable()
export class RolesRepository {
  constructor(private readonly db: PrismaService) {}
  async ofUser(userId: string, tx: Tx = this.db) {
    return (
      await tx.userRole.findMany({
        where: { userId },
        include: { role: true },
        orderBy: { role: { name: "asc" } },
      })
    ).map((item) => item.role);
  }
  async assign(tx: Tx, userId: string, names: readonly string[]): Promise<void> {
    const roles = await tx.role.findMany({ where: { name: { in: [...names] } } });
    if (roles.length !== new Set(names).size) throw new Error("Run seed to create system roles.");
    for (const role of roles)
      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId: role.id } },
        create: { userId, roleId: role.id },
        update: {},
      });
  }
  async seed(tx: Tx): Promise<void> {
    for (const name of ["admin", "member"])
      await tx.role.upsert({
        where: { name },
        update: {},
        create: {
          name,
          isSystem: true,
          permissions: name === "member" ? ["posts:create"] : [],
          description:
            name === "admin"
              ? "Has every permission, including ones added later."
              : "Given to everyone who signs up.",
        },
      });
  }
}
