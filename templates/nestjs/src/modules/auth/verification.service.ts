import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { SETTINGS, type Settings } from "../../core/config/settings.js";
import { UnitOfWork } from "../../core/db/unit-of-work.js";
import { JobQueue } from "../../core/jobs/queue.js";
import { StrictLimiter } from "../../core/ratelimit/strict.js";
import { AuthRepository } from "./repository.js";
import { hashIdentifier, normalizeEmail } from "../../core/security/identifier.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { resourceObject } from "../../core/jsonapi/document.js";
@Injectable()
export class VerificationService {
  constructor(
    @Inject(UnitOfWork) private readonly unit: UnitOfWork,
    @Inject(AuthRepository) private readonly repository: AuthRepository,
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
      if (user?.email && user.status === "active" && !user.emailVerifiedAt)
        this.queue.enqueue(afterCommit, "auth.send_verification_mail", { id: user.id });
    });
  }
  verify(token: string) {
    const hash = createHash("sha256").update(token).digest("hex");
    return this.unit.run(async (tx, afterCommit) => {
      const at = new Date();
      const consumed = await this.repository.consumeVerification(tx, hash, at);
      const user = consumed && (await this.repository.findById(tx, consumed.userId));
      if (!consumed || !user || user.status !== "active" || user.emailVerifiedAt)
        throw new ApiError({
          status: 422,
          code: "auth.verification_token_invalid",
          title: "Invalid verification token",
          source: { pointer: "/data/attributes/token" },
        });
      await this.repository.markVerified(tx, user.id, at);
      this.queue.enqueue(afterCommit, "auth.send_welcome_mail", { id: user.id });
      return {
        data: resourceObject("email-verifications", consumed.id, { verifiedAt: at.toISOString() }),
      };
    });
  }
}
