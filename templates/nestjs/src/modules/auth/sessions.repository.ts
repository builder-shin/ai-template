import type { Tx } from "../../core/db/unit-of-work.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import { Injectable } from "@nestjs/common";
export interface SessionRow {
  id: string;
  userId: string;
  authenticatedAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  userAgent: string | null;
}
export interface RefreshRow {
  id: string;
  sessionId: string;
  tokenHash: string;
  usedAt: Date | null;
  expiresAt: Date;
}
@Injectable()
export class SessionsRepository {
  create(
    tx: Tx,
    input: { userId: string; at: Date; expiresAt: Date; userAgent?: string },
  ): Promise<SessionRow> {
    return tx.session.create({
      data: {
        userId: input.userId,
        authenticatedAt: input.at,
        createdAt: input.at,
        lastUsedAt: input.at,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent ?? null,
      },
    });
  }
  find(tx: Tx, id: string): Promise<SessionRow | null> {
    return tx.session.findUnique({ where: { id } });
  }
  async lock(tx: Tx, id: string): Promise<SessionRow | undefined> {
    const rows = await tx.$queryRaw<SessionRow[]>`
      SELECT id, user_id AS "userId", authenticated_at AS "authenticatedAt",
        created_at AS "createdAt", last_used_at AS "lastUsedAt", expires_at AS "expiresAt",
        revoked_at AS "revokedAt", revoked_reason AS "revokedReason", user_agent AS "userAgent"
      FROM sessions WHERE id = ${id}::uuid FOR UPDATE
    `;
    return rows[0];
  }
  findRefresh(tx: Tx, hash: string): Promise<RefreshRow | null> {
    return tx.refreshToken.findUnique({ where: { tokenHash: hash } });
  }
  async addRefresh(tx: Tx, sessionId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await tx.refreshToken.create({ data: { sessionId, tokenHash, expiresAt } });
  }
  async consumeRefresh(tx: Tx, id: string, at: Date): Promise<void> {
    await tx.refreshToken.update({ where: { id }, data: { usedAt: at } });
  }
  async touch(tx: Tx, id: string, at: Date, expiresAt: Date): Promise<void> {
    await tx.session.update({ where: { id }, data: { lastUsedAt: at, expiresAt } });
  }
  async revoke(tx: Tx, ids: readonly string[], at: Date, reason: string): Promise<void> {
    await tx.session.updateMany({
      where: { id: { in: [...ids] }, revokedAt: null },
      data: { revokedAt: at, revokedReason: reason },
    });
  }
  active(tx: Tx, userId: string, at: Date, query?: ParsedQuery): Promise<SessionRow[]> {
    return tx.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: at } },
      orderBy: [
        ...(query?.sort ?? [{ field: "createdAt", descending: true }]).map((s) => ({
          [s.field]: s.descending ? ("desc" as const) : ("asc" as const),
        })),
        { id: "asc" },
      ],
    });
  }
  async loginAt(tx: Tx, userId: string, at: Date): Promise<void> {
    await tx.user.update({ where: { id: userId }, data: { lastLoginAt: at } });
  }
}
