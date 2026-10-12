import { Injectable, Inject } from "@nestjs/common";
import nodemailer from "nodemailer";
import { SETTINGS } from "../config/settings.js";
import type { Settings } from "../config/settings.js";
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}
@Injectable()
export class MailSender {
  constructor(@Inject(SETTINGS) private readonly settings: Settings) {}
  async send(mail: Mail): Promise<void> {
    await nodemailer
      .createTransport(this.settings.SMTP_URL)
      .sendMail({ from: this.settings.MAIL_FROM, ...mail });
  }
}
