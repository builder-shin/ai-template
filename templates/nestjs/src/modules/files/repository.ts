import type { Tx } from "../../core/db/unit-of-work.js";
import { Injectable } from "@nestjs/common";
import { advisoryXactLock } from "../../core/db/locks.js";
export interface FileRecord {
  id: string;
  ownerId: string;
  key: string;
  filename: string;
  contentType: string;
  size: bigint;
  status: "pending" | "ready";
  detachedAt: Date | null;
  createdAt: Date;
}
export type NewFile = Pick<FileRecord, "ownerId" | "key" | "filename" | "contentType" | "size">;
export type FileReferenceRule = (tx: Tx, id: string) => Promise<number>;
@Injectable()
export class FilesRepository {
  constructor(private readonly references: readonly FileReferenceRule[] = []) {}
  async lock(tx: Tx, id: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM files WHERE id = ${id}::uuid FOR UPDATE`;
  }
  lockQuota(tx: Tx, id: string): Promise<void> {
    return advisoryXactLock(tx, `files:quota:${id}`);
  }
  async totalSize(tx: Tx, id: string): Promise<bigint> {
    const aggregate = await tx.file.aggregate({
      where: { ownerId: id, status: { in: ["pending", "ready"] } },
      _sum: { size: true },
    });
    return aggregate._sum.size ?? 0n;
  }
  create(tx: Tx, input: NewFile): Promise<FileRecord> {
    return tx.file.create({ data: input });
  }
  find(tx: Tx, id: string): Promise<FileRecord | null> {
    return tx.file.findUnique({ where: { id } });
  }
  findMany(tx: Tx, ids: readonly string[]): Promise<FileRecord[]> {
    return tx.file.findMany({ where: { id: { in: [...ids] } } });
  }
  ready(tx: Tx, id: string): Promise<FileRecord> {
    return tx.file.update({ where: { id }, data: { status: "ready" } });
  }
  async delete(tx: Tx, id: string): Promise<void> {
    await tx.file.delete({ where: { id } });
  }
  async detach(tx: Tx, ids: readonly string[]): Promise<void> {
    await tx.file.updateMany({ where: { id: { in: [...ids] } }, data: { detachedAt: new Date() } });
  }
  async claimDetached(tx: Tx, ids: readonly string[]): Promise<FileRecord[]> {
    const claimed: FileRecord[] = [];
    for (const id of [...new Set(ids.map((id) => id.toLowerCase()))].sort()) {
      await this.lock(tx, id);
      const file = await this.find(tx, id);
      if (!file?.detachedAt) continue;
      let referenced =
        (await tx.user.count({ where: { avatarFileId: id } })) ||
        (await tx.post.count({ where: { coverImageId: id } }));
      for (const reference of this.references) {
        if (referenced) break;
        referenced = await reference(tx, id);
      }
      if (referenced) {
        await tx.file.update({ where: { id }, data: { detachedAt: null } });
        continue;
      }
      await this.delete(tx, id);
      claimed.push(file);
    }
    return claimed;
  }
  async deletePending(tx: Tx, id: string, cutoff: Date): Promise<boolean> {
    const { count } = await tx.file.deleteMany({
      where: { id, status: "pending", detachedAt: null, createdAt: { lt: cutoff } },
    });
    return count === 1;
  }
  purgeCandidates(tx: Tx, cutoff: Date, take: number, after?: string): Promise<FileRecord[]> {
    return tx.file.findMany({
      where: {
        OR: [{ status: "pending", createdAt: { lt: cutoff } }, { detachedAt: { not: null } }],
        ...(after === undefined ? {} : { id: { gt: after } }),
      },
      orderBy: { id: "asc" },
      take,
    });
  }
}
