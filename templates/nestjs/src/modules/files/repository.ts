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
@Injectable()
export class FilesRepository {
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
    for (const id of [...new Set(ids)].sort()) {
      await this.lock(tx, id);
      const file = await this.find(tx, id);
      if (!file?.detachedAt) continue;
      const referenced =
        (await tx.user.count({ where: { avatarFileId: id } })) ||
        (await tx.post.count({ where: { coverImageId: id } }));
      if (referenced) {
        await tx.file.update({ where: { id }, data: { detachedAt: null } });
        continue;
      }
      await this.delete(tx, id);
      claimed.push(file);
    }
    return claimed;
  }
  purgeCandidates(tx: Tx, cutoff: Date): Promise<FileRecord[]> {
    return tx.file.findMany({
      where: {
        OR: [{ status: "pending", createdAt: { lt: cutoff } }, { detachedAt: { not: null } }],
      },
    });
  }
}
