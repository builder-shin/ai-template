import type { INestApplicationContext } from "@nestjs/common";
import { registerJob } from "../../core/jobs/names.js";
import { AuthMails } from "./mails.js";
import { UnitOfWork } from "../../core/db/unit-of-work.js";
import { purgeExpired } from "./purge.js";
export function registerAuthJobs(app: INestApplicationContext): void {
  registerJob("auth.send_verification_mail", ({ id }) => app.get(AuthMails).sendVerification(id));
  registerJob("auth.send_welcome_mail", ({ id }) => app.get(AuthMails).sendWelcome(id));
  registerJob("auth.send_reset_mail", ({ id }) => app.get(AuthMails).sendReset(id));
  registerJob("auth.purge_expired", async () => {
    await app.get(UnitOfWork).run((tx) => purgeExpired(tx, new Date()));
  });
}
