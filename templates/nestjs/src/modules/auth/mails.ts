import { fileURLToPath } from "node:url";
import { Inject, Injectable } from "@nestjs/common";
import { SETTINGS, type Settings } from "../../core/config/settings.js";
import { localeSchema } from "../../core/config/locale.js";
import { UnitOfWork } from "../../core/db/unit-of-work.js";
import { MailSender } from "../../core/mail/sender.js";
import { loadMailTemplates } from "../../core/mail/templates.js";
import { renderMail } from "../../core/mail/render.js";
import { newOpaqueToken } from "../../core/security/tokens.js";
import { AuthRepository, type AuthUser } from "./repository.js";
const moduleDir = fileURLToPath(new URL(".", import.meta.url));
@Injectable()
export class AuthMails {
  constructor(
    @Inject(UnitOfWork) private readonly unit: UnitOfWork,
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(MailSender) private readonly sender: MailSender,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}
  async sendVerification(id: string): Promise<void> {
    const prepared = await this.unit.run(async (tx) => {
      await this.repository.lockUser(tx, id);
      const user = await this.repository.findById(tx, id);
      if (!user?.email || user.status !== "active" || user.emailVerifiedAt) return undefined;
      const { token, hash } = newOpaqueToken();
      await this.repository.rotateVerification(
        tx,
        id,
        hash,
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      );
      return { user, token };
    });
    if (prepared)
      await this.send(prepared.user, "verify_email", {
        link: `${this.settings.FRONTEND_URL.replace(/\/$/, "")}/verify-email?token=${prepared.token}`,
      });
  }
  async sendWelcome(id: string): Promise<void> {
    const user = await this.unit.run((tx) => this.repository.findById(tx, id));
    if (user?.email && user.status === "active" && user.emailVerifiedAt)
      await this.send(user, "welcome", {});
  }
  private async send(user: AuthUser, mail: string, values: Record<string, string>): Promise<void> {
    const locale = localeSchema.parse(user.locale);
    const greeting =
      locale === "ko"
        ? user.name
          ? `${user.name}님, 안녕하세요.`
          : "안녕하세요."
        : user.name
          ? `Hello, ${user.name}.`
          : "Hello.";
    const rendered = renderMail(loadMailTemplates(moduleDir, mail, locale), {
      greeting,
      ...values,
    });
    await this.sender.send({
      to: user.email ?? "",
      ...rendered,
      subject: rendered.subject.replace(/[\r\n]+$/, ""),
    });
  }
}
