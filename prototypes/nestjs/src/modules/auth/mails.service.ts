import { Injectable, Inject } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { resolve } from "node:path";
import { SETTINGS } from "../../core/config/settings.js";
import type { Settings } from "../../core/config/settings.js";
import { UnitOfWork } from "../../core/db/unit-of-work.js";
import { newToken, digest } from "../../core/security/tokens.js";
import { JobQueue } from "../../core/jobs/queue.js";
import { MailSender } from "../../core/mail/sender.js";
import { renderVerification } from "../../core/mail/templates.js";
import { UsersService } from "../users/index.js";
import { AuthRepository } from "./repository.js";
@Injectable()
export class VerificationMailService implements OnModuleInit {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly users: UsersService,
    private readonly repository: AuthRepository,
    private readonly jobs: JobQueue,
    private readonly sender: MailSender,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}
  onModuleInit(): void {
    this.jobs.register("auth.send-verification", ({ id }) => this.send(id));
  }
  async send(id: string): Promise<void> {
    await this.uow.run(async (tx, afterCommit) => {
      const user = await this.users.get(id, tx);
      if (!user?.email || user.status !== "active" || user.emailVerifiedAt !== null) return;
      const email = user.email;
      const token = newToken();
      await this.repository.issueVerification(tx, id, digest(token));
      afterCommit(async () => {
        const mail = renderVerification(
          resolve(import.meta.dirname, "templates"),
          user.locale,
          email,
          {
            name: user.name ?? "",
            link: `${this.settings.FRONTEND_URL.replace(/\/$/, "")}/verify-email?token=${token}`,
          },
        );
        await this.sender.send(mail);
      });
    });
  }
}
