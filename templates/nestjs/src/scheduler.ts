import "reflect-metadata";
import { isEntrypoint } from "./core/config/runtime.js";
import { writeReadiness } from "./core/runtime/readiness.js";
import type { INestApplicationContext } from "@nestjs/common";
import { JobsModule } from "./core/jobs/jobs.module.js";
import { SchedulerHost } from "./core/jobs/scheduler-host.js";
import { JsonLogger } from "./core/logging/json-logger.js";
import { startJobsContext } from "./jobs-context.js";
export async function scheduler(): Promise<INestApplicationContext> {
  const app = await startJobsContext([JobsModule], SchedulerHost);
  writeReadiness("scheduler");
  return app;
}
if (isEntrypoint(import.meta.url)) {
  void scheduler().catch((error: unknown) => {
    new JsonLogger().error(error);
    process.exitCode = 1;
  });
}
