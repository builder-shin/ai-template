import { Injectable } from "@nestjs/common";
import type { File } from "../../generated/prisma/client.js";
import { PrismaService } from "../../core/db/prisma.service.js";
import type { Tx } from "../../core/db/unit-of-work.js";
import { advisoryXactLock } from "../../core/db/locks.js";
export type FileRecord = File;
@Injectable()
export class FilesRepository {
  constructor(private readonly db: PrismaService) {}
  get(id: string, tx: Tx = this.db) {
    return tx.file.findUnique({ where: { id } });
  }
  many(ids: readonly string[], tx: Tx = this.db) {
    return ids.length
      ? tx.file.findMany({ where: { id: { in: [...new Set(ids)] } }, orderBy: { id: "asc" } })
      : Promise.resolve([]);
  }
  lockOwner(tx: Tx, id: string) {
    return advisoryXactLock(tx, `files:quota:${id}`);
  }
  async used(tx: Tx, ownerId: string): Promise<bigint> {
    return (await tx.file.aggregate({ where: { ownerId }, _sum: { size: true } }))._sum.size ?? 0n;
  }
  create(tx: Tx, data: { ownerId: string; filename: string; contentType: string; size: bigint }) {
    return tx.file.create({ data });
  }
  ready(tx: Tx, id: string) {
    return tx.file.update({ where: { id }, data: { status: "ready" } });
  }
  remove(tx: Tx, ids: readonly string[]) {
    return tx.file.deleteMany({ where: { id: { in: [...ids] } } });
  }
}
