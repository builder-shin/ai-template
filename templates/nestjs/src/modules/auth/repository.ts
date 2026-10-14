import type { Tx } from "../../core/db/unit-of-work.js";
import { Injectable } from "@nestjs/common";
import { advisoryXactLock } from "../../core/db/locks.js";
type TokenPurpose = "verification" | "reset";
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
  rotateVerification(tx: Tx, id: string, hash: string, expiresAt: Date): Promise<void> {
    return this.rotateToken(tx, id, hash, expiresAt, "verification");
  }
  consumeVerification(
    tx: Tx,
    hash: string,
    at: Date,
  ): Promise<{ id: string; userId: string } | undefined> {
    return this.consumeToken(tx, hash, at, "verification");
  }
  async markVerified(tx: Tx, id: string, at: Date): Promise<void> {
    await tx.user.update({ where: { id }, data: { emailVerifiedAt: at } });
  }
  async updatePassword(tx: Tx, id: string, passwordHash: string): Promise<void> {
    await tx.user.update({ where: { id }, data: { passwordHash } });
  }
  async deleteResetTokens(tx: Tx, id: string): Promise<void> {
    await tx.verificationToken.deleteMany({ where: { userId: id, purpose: "reset" } });
  }
  rotateReset(tx: Tx, id: string, hash: string, expiresAt: Date): Promise<void> {
    return this.rotateToken(tx, id, hash, expiresAt, "reset");
  }
  consumeReset(
    tx: Tx,
    hash: string,
    at: Date,
  ): Promise<{ id: string; userId: string } | undefined> {
    return this.consumeToken(tx, hash, at, "reset");
  }
  private async rotateToken(
    tx: Tx,
    id: string,
    hash: string,
    expiresAt: Date,
    purpose: TokenPurpose,
  ): Promise<void> {
    await tx.verificationToken.deleteMany({ where: { userId: id, purpose } });
    await tx.verificationToken.create({
      data: { userId: id, purpose, tokenHash: hash, expiresAt },
    });
  }
  private async consumeToken(
    tx: Tx,
    hash: string,
    at: Date,
    purpose: TokenPurpose,
  ): Promise<{ id: string; userId: string } | undefined> {
    const candidate = await tx.verificationToken.findUnique({ where: { tokenHash: hash } });
    if (!candidate || candidate.purpose !== purpose) return undefined;
    await this.lockUser(tx, candidate.userId);
    const rows = await tx.$queryRaw<{ id: string; userId: string }[]>`
      DELETE FROM verification_tokens
      WHERE token_hash = ${hash} AND purpose = ${purpose}::"TokenPurpose" AND expires_at > ${at}
      RETURNING id, user_id AS "userId"
    `;
    return rows[0];
  }
}
