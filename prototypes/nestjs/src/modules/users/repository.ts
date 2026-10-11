import { Injectable } from "@nestjs/common";
import type { User } from "../../generated/prisma/client.js";
import { PrismaService } from "../../core/db/prisma.service.js";
import type { Tx } from "../../core/db/unit-of-work.js";
export type UserRecord = User;
@Injectable()
export class UsersRepository {
  constructor(private readonly db: PrismaService) {}
  get(id: string, tx: Tx = this.db) {
    return tx.user.findUnique({ where: { id } });
  }
  many(ids: readonly string[], tx: Tx = this.db) {
    return ids.length
      ? tx.user.findMany({ where: { id: { in: [...new Set(ids)] } }, orderBy: { id: "asc" } })
      : Promise.resolve([]);
  }
  async avatarReferences(tx: Tx, ids: readonly string[]): Promise<ReadonlySet<string>> {
    return new Set(
      (
        await tx.user.findMany({
          where: { avatarId: { in: [...ids] } },
          select: { avatarId: true },
        })
      ).flatMap((u) => (u.avatarId ? [u.avatarId] : [])),
    );
  }
  find(email: string, tx: Tx = this.db) {
    return tx.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  }
  create(
    tx: Tx,
    data: {
      email: string;
      name: string;
      locale: string;
      passwordHash: string;
      emailVerifiedAt?: Date;
    },
  ) {
    return tx.user.create({ data: { ...data, email: data.email.trim().toLowerCase() } });
  }
  verify(tx: Tx, id: string, at: Date) {
    return tx.user.update({ where: { id }, data: { emailVerifiedAt: at } });
  }
}
