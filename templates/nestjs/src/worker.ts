import "reflect-metadata";
import { pathToFileURL } from "node:url";
import type { INestApplicationContext } from "@nestjs/common";
import { JobsModule } from "./core/jobs/jobs.module.js";
import { WorkerHost } from "./core/jobs/worker-host.js";
import { MailModule } from "./core/mail/mail.module.js";
import { JsonLogger } from "./core/logging/json-logger.js";
import { startJobsContext } from "./jobs-context.js";
export async function worker(): Promise<INestApplicationContext> {
  return startJobsContext([JobsModule, MailModule], WorkerHost);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void worker().catch((error: unknown) => {
    new JsonLogger().error(error);
    process.exitCode = 1;
  });
}
