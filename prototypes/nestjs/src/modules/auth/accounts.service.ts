import { Injectable } from "@nestjs/common";
import { UnitOfWork } from "../../core/db/unit-of-work.js";
import { isUniqueViolation } from "../../core/db/errors.js";
import { JobQueue } from "../../core/jobs/queue.js";
import { digest } from "../../core/security/tokens.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { UsersService } from "../users/index.js";
import { AuthRepository } from "./repository.js";
@Injectable()
export class AccountsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly users: UsersService,
    private readonly repository: AuthRepository,
    private readonly jobs: JobQueue,
  ) {}
  async register(
    data: { email: string; password: string; name: string; locale?: "ko" | "en" | undefined },
    language?: string,
  ) {
    try {
      const user = await this.uow.run(async (tx, afterCommit) => {
        const user = await this.users.create(tx, {
          ...data,
          locale: data.locale ?? (language?.toLowerCase().startsWith("en") ? "en" : "ko"),
        });
        this.jobs.enqueueAfterCommit(afterCommit, "auth.send_verification_mail", { id: user.id });
        return user;
      });
      return {
        data: {
          type: "registrations",
          id: user.id,
          attributes: { email: user.email, createdAt: user.createdAt.toISOString() },
          relationships: { user: { data: { type: "users", id: user.id } } },
        },
      };
    } catch (error) {
      if (isUniqueViolation(error, "email"))
        throw new ApiError(
          422,
          "validation.already_taken",
          "The email address is already registered.",
          { pointer: "/data/attributes/email" },
        );
      throw error;
    }
  }
  async requestVerification(email: string): Promise<void> {
    await this.uow.run(async (tx, afterCommit) => {
      const user = await this.users.find(email, tx);
      if (user?.status === "active" && user.emailVerifiedAt === null)
        this.jobs.enqueueAfterCommit(afterCommit, "auth.send_verification_mail", { id: user.id });
    });
  }
  async verify(token: string) {
    return this.uow.run(async (tx) => {
      const row = await this.repository.consumeVerification(tx, digest(token));
      const user = row ? await this.users.get(row.userId, tx) : null;
      if (!row || user?.status !== "active")
        throw new ApiError(
          422,
          "auth.verification_token_invalid",
          "The token is wrong or has expired.",
          { pointer: "/data/attributes/token" },
        );
      const verifiedAt = user.emailVerifiedAt ?? new Date();
      await this.users.verify(tx, user.id, verifiedAt);
      return {
        data: {
          type: "email-verifications",
          id: row.id,
          attributes: { verifiedAt: verifiedAt.toISOString() },
        },
      };
    });
  }
}
