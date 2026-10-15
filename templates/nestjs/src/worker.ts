import "reflect-metadata";
import { isEntrypoint } from "./core/config/runtime.js";
import { writeReadiness } from "./core/runtime/readiness.js";
import type { INestApplicationContext } from "@nestjs/common";
import { JobsModule } from "./core/jobs/jobs.module.js";
import { WorkerHost } from "./core/jobs/worker-host.js";
import { MailModule } from "./core/mail/mail.module.js";
import { JsonLogger } from "./core/logging/json-logger.js";
import { startJobsContext } from "./jobs-context.js";
export async function worker(): Promise<INestApplicationContext> {
  const app = await startJobsContext([JobsModule, MailModule], WorkerHost);
  writeReadiness("worker");
  return app;
}
if (isEntrypoint(import.meta.url)) {
  void worker().catch((error: unknown) => {
    new JsonLogger().error(error);
    process.exitCode = 1;
  });
}
