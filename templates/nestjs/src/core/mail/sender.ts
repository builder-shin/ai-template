import { Inject, Injectable } from "@nestjs/common";
import { createTransport } from "nodemailer";
import { SETTINGS, type Settings } from "../config/settings.js";
@Injectable()
export class MailSender {
  private readonly transport;
  constructor(@Inject(SETTINGS) private readonly settings: Settings) {
    this.transport = createTransport(settings.SMTP_URL);
  }
  async send(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
    await this.transport.sendMail({ ...message, from: this.settings.MAIL_FROM });
  }
}
