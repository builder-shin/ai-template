import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AppModule } from "./app.module.js";
import { JobQueue } from "./core/jobs/queue.js";
import type { INestApplicationContext } from "@nestjs/common";
import type { Job } from "bullmq";
import type { JobData } from "./core/jobs/queue.js";
export async function worker(
  onAttempt?: (job: Job<JobData>) => void,
  configure?: (app: INestApplicationContext) => void,
) {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  app.enableShutdownHooks();
  const jobs = app.get(JobQueue);
  jobs.register("realtime.scheduler_tick", () => Promise.resolve());
  configure?.(app);
  await jobs.startWorker(onAttempt);
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await worker();
