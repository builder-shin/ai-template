import type { Tx } from "../../core/db/unit-of-work.js";
import { Injectable } from "@nestjs/common";
import { advisoryXactLock } from "../../core/db/locks.js";
export interface AuthUser {
  id: string;
  email: string | null;
  passwordHash: string | null;
  name: string | null;
  locale: string;
  status: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}
export interface NewUser {
  email: string;
  passwordHash: string;
  name: string;
  locale: "ko" | "en";
}
@Injectable()
export class AuthRepository {
  create(tx: Tx, input: NewUser): Promise<AuthUser> {
    return tx.user.create({ data: input });
  }
  findByEmail(tx: Tx, email: string): Promise<AuthUser | null> {
    return tx.user.findUnique({ where: { email } });
  }
  findById(tx: Tx, id: string): Promise<AuthUser | null> {
    return tx.user.findUnique({ where: { id } });
  }
  lockUser(tx: Tx, id: string): Promise<void> {
    return advisoryXactLock(tx, `auth:verification:${id}`);
  }
  async rotateVerification(tx: Tx, id: string, hash: string, expiresAt: Date): Promise<void> {
    await tx.verificationToken.deleteMany({ where: { userId: id, purpose: "verification" } });
    await tx.verificationToken.create({
      data: { userId: id, purpose: "verification", tokenHash: hash, expiresAt },
    });
  }
  async consumeVerification(
    tx: Tx,
    hash: string,
    at: Date,
  ): Promise<{ id: string; userId: string } | undefined> {
    const candidate = await tx.verificationToken.findUnique({ where: { tokenHash: hash } });
    if (!candidate || candidate.purpose !== "verification") return undefined;
    await this.lockUser(tx, candidate.userId);
    const rows = await tx.$queryRaw<{ id: string; userId: string }[]>`
      DELETE FROM verification_tokens
      WHERE token_hash = ${hash} AND purpose = 'verification' AND expires_at > ${at}
      RETURNING id, user_id AS "userId"
    `;
    return rows[0];
  }
  async markVerified(tx: Tx, id: string, at: Date): Promise<void> {
    await tx.user.update({ where: { id }, data: { emailVerifiedAt: at } });
  }
}
