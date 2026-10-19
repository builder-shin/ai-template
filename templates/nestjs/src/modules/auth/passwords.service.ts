import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { SETTINGS, type Settings } from "../../core/config/settings.js";
import { UnitOfWork } from "../../core/db/unit-of-work.js";
import { JobQueue } from "../../core/jobs/queue.js";
import { StrictLimiter } from "../../core/ratelimit/strict.js";
import { hashOpaqueToken } from "../../core/security/tokens.js";
import { normalizeEmail, hashIdentifier } from "../../core/security/identifier.js";
import { hashPassword, verifyPassword, dummyVerify } from "../../core/security/passwords.js";
import type { Principal } from "../../core/security/principal.js";
import { recordAudit } from "../../core/audit/record.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { resourceObject } from "../../core/jsonapi/document.js";
import { AuthRepository } from "./repository.js";
import { SessionsService } from "./sessions.service.js";
@Injectable()
export class PasswordsService {
  constructor(
    @Inject(UnitOfWork) private readonly unit: UnitOfWork,
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(JobQueue) private readonly queue: JobQueue,
    @Inject(StrictLimiter) private readonly limiter: StrictLimiter,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}
  async request(email: string, ip: string): Promise<void> {
    const normalized = normalizeEmail(email);
    await this.limiter.enforce("mail.ip", ip);
    await this.limiter.enforce(
      "mail.email",
      hashIdentifier(normalized, this.settings.IDENTIFIER_HASH_SECRET),
    );
    await this.unit.run(async (tx, afterCommit) => {
      const user = await this.repository.findByEmail(tx, normalized);
      if (user?.email && user.status === "active")
        this.queue.enqueue(afterCommit, "auth.send_reset_mail", { id: user.id });
    });
  }
  async reset(input: { token: string; password: string }) {
    const hash = hashOpaqueToken(input.token);
    return this.unit.run(async (tx, afterCommit) => {
      const at = new Date();
      const consumed = await this.repository.consumeReset(tx, hash, at);
      const user = consumed && (await this.repository.findById(tx, consumed.userId));
      if (!consumed || !user || user.status !== "active")
        throw new ApiError({
          status: 422,
          code: "auth.verification_token_invalid",
          title: "Invalid reset token",
          source: { pointer: "/data/attributes/token" },
        });
      await this.repository.updatePassword(tx, user.id, await hashPassword(input.password));
      await this.sessions.revokeForPassword(tx, afterCommit, user.id, at, "password_reset");
      await this.repository.deleteResetTokens(tx, user.id);
      await recordAudit(tx, { action: "user.password_reset", actorUserId: user.id });
      return {
        data: resourceObject("password-resets", randomUUID(), { createdAt: at.toISOString() }),
      };
    });
  }
  async change(principal: Principal, input: { currentPassword: string; newPassword: string }) {
    await this.limiter.enforce("password_change.user", principal.userId);
    return this.unit.run(async (tx, afterCommit) => {
      await this.repository.lockUser(tx, principal.userId);
      const user = await this.repository.findById(tx, principal.userId);
      let valid = false;
      if (user?.passwordHash)
        valid = await verifyPassword(user.passwordHash, input.currentPassword);
      else await dummyVerify(input.currentPassword);
      if (!valid || !user || user.status !== "active")
        throw new ApiError({
          status: 401,
          code: "auth.invalid_credentials",
          title: "Invalid credentials",
          source: { pointer: "/data/attributes/currentPassword" },
          headers: { "WWW-Authenticate": "Bearer" },
        });
      const at = new Date();
      await this.repository.updatePassword(tx, user.id, await hashPassword(input.newPassword));
      await this.sessions.revokeForPassword(
        tx,
        afterCommit,
        user.id,
        at,
        "password_changed",
        principal.sessionId,
      );
      await this.repository.deleteResetTokens(tx, user.id);
      await recordAudit(tx, { action: "user.password_changed", actorUserId: user.id });
      return {
        data: resourceObject("password-changes", randomUUID(), { createdAt: at.toISOString() }),
      };
    });
  }
}
