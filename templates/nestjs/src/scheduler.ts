import "reflect-metadata";
import { pathToFileURL } from "node:url";
import type { INestApplicationContext } from "@nestjs/common";
import { JobsModule } from "./core/jobs/jobs.module.js";
import { SchedulerHost } from "./core/jobs/scheduler-host.js";
import { JsonLogger } from "./core/logging/json-logger.js";
import { startJobsContext } from "./jobs-context.js";
export async function scheduler(): Promise<INestApplicationContext> {
  return startJobsContext([JobsModule], SchedulerHost);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void scheduler().catch((error: unknown) => {
    new JsonLogger().error(error);
    process.exitCode = 1;
  });
}
