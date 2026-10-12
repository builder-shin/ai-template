import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/db/prisma.service.js";
import type { Tx } from "../../core/db/unit-of-work.js";
import { lockForUpdate } from "../../core/db/locks.js";
@Injectable()
export class AuthRepository {
  constructor(private readonly db: PrismaService) {}
  activeSession(id: string, userId: string, now: Date) {
    return this.db.loginSession.findFirst({
      where: { id, userId, revokedAt: null, expiresAt: { gt: now }, user: { status: "active" } },
    });
  }
  async lockedRefresh(tx: Tx, hash: string) {
    const rows = await lockForUpdate<{ id: string }[]>(
      tx,
    )`SELECT id FROM refresh_tokens WHERE token_hash = ${hash} FOR UPDATE`;
    // Raw snake_case rows are not claimed to be mapped Prisma model values.
    return rows.length ? tx.refreshToken.findUnique({ where: { tokenHash: hash } }) : null;
  }
  getSession(tx: Tx, id: string) {
    return tx.loginSession.findUnique({ where: { id }, include: { user: true } });
  }
  open(tx: Tx, userId: string, userAgent: string | null, now: Date, expiresAt: Date) {
    return tx.loginSession.create({
      data: { userId, userAgent, createdAt: now, lastUsedAt: now, expiresAt },
    });
  }
  refresh(tx: Tx, sessionId: string, tokenHash: string, expiresAt: Date) {
    return tx.refreshToken.create({ data: { sessionId, tokenHash, expiresAt } });
  }
  use(tx: Tx, id: string, now: Date) {
    return tx.refreshToken.update({ where: { id }, data: { usedAt: now } });
  }
  touch(tx: Tx, id: string, now: Date, expiresAt: Date) {
    return tx.loginSession.update({ where: { id }, data: { lastUsedAt: now, expiresAt } });
  }
  revoke(tx: Tx, id: string) {
    return tx.loginSession.update({ where: { id }, data: { revokedAt: new Date() } });
  }
  issueVerification(tx: Tx, userId: string, tokenHash: string) {
    return tx.accountToken.create({
      data: {
        userId,
        tokenHash,
        purpose: "email_verification",
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  }
  async consumeVerification(tx: Tx, hash: string) {
    const rows = await tx.$queryRaw<
      { id: string; user_id: string }[]
    >`DELETE FROM account_tokens WHERE token_hash = ${hash} AND purpose = 'email_verification' AND expires_at > ${new Date()} RETURNING id, user_id`;
    const row = rows[0];
    if (row)
      await tx.accountToken.deleteMany({
        where: { userId: row.user_id, purpose: "email_verification" },
      });
    return row ? { id: row.id, userId: row.user_id } : null;
  }
}
