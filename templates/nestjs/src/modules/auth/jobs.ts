import type { INestApplicationContext } from "@nestjs/common";
import { registerJob } from "../../core/jobs/names.js";
import { AuthMails } from "./mails.js";
export function registerAuthJobs(app: INestApplicationContext): void {
  registerJob("auth.send_verification_mail", ({ id }) => app.get(AuthMails).sendVerification(id));
  registerJob("auth.send_welcome_mail", ({ id }) => app.get(AuthMails).sendWelcome(id));
}
