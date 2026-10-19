import { Inject, Injectable } from "@nestjs/common";
import { UnitOfWork } from "../../core/db/unit-of-work.js";
import { JobQueue } from "../../core/jobs/queue.js";
import { StrictLimiter } from "../../core/ratelimit/strict.js";
import { RolesRepository } from "../roles/index.js";
import { AuthRepository } from "./repository.js";
import { hashPassword } from "../../core/security/passwords.js";
import { normalizeEmail } from "../../core/security/identifier.js";
import { isUniqueViolation } from "../../core/db/errors.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { resourceObject } from "../../core/jsonapi/document.js";
import { qualityOf } from "../../core/http/negotiation.js";
export interface RegistrationInput {
  email: string;
  password: string;
  name: string;
  locale?: "ko" | "en" | undefined;
}
@Injectable()
export class RegistrationService {
  constructor(
    @Inject(UnitOfWork) private readonly unit: UnitOfWork,
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(RolesRepository) private readonly roles: RolesRepository,
    @Inject(JobQueue) private readonly queue: JobQueue,
    @Inject(StrictLimiter) private readonly limiter: StrictLimiter,
  ) {}
  async create(input: RegistrationInput, ip: string, language?: string) {
    await this.limiter.enforce("registration.ip", ip);
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.unit.run(async (tx, afterCommit) => {
        const user = await this.repository.create(tx, {
          email: normalizeEmail(input.email),
          passwordHash,
          name: input.name,
          locale: input.locale ?? registrationLocale(language),
        });
        await this.roles.assign(tx, user.id, ["member"]);
        this.queue.enqueue(afterCommit, "auth.send_verification_mail", { id: user.id });
        return {
          data: resourceObject(
            "registrations",
            user.id,
            { email: user.email, createdAt: user.createdAt.toISOString() },
            { user: { data: { type: "users", id: user.id } } },
          ),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error, "email"))
        throw new ApiError({
          status: 422,
          code: "validation.already_taken",
          title: "Email is already taken",
          source: { pointer: "/data/attributes/email" },
        });
      throw error;
    }
  }
}
export function registrationLocale(language = ""): "ko" | "en" {
  const choices = language
    .split(",")
    .map((part) => {
      const [tag = "", ...parameters] = part
        .trim()
        .toLowerCase()
        .split(";")
        .map((value) => value.trim());
      const quality =
        parameters.length === 0
          ? 1
          : parameters.length === 1
            ? qualityOf(parameters[0] ?? "")
            : undefined;
      return {
        tag: tag.split("-")[0],
        quality: quality ?? 0,
      };
    })
    .filter(({ quality }) => quality > 0 && quality <= 1)
    .sort((a, b) => b.quality - a.quality);
  return choices.find(({ tag }) => tag === "ko" || tag === "en")?.tag === "en" ? "en" : "ko";
}
