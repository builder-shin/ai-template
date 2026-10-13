import "reflect-metadata";
import { pathToFileURL } from "node:url";
import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule, logLevels } from "./app.module.js";
import { loadSettings } from "./core/config/settings.js";
import { JobsModule } from "./core/jobs/jobs.module.js";
import { SchedulerHost } from "./core/jobs/scheduler-host.js";
import { JsonLogger } from "./core/logging/json-logger.js";
export async function scheduler(): Promise<INestApplicationContext> {
  const settings = loadSettings();
  const logger = new JsonLogger(logLevels(settings.LOG_LEVEL));
  const app = await NestFactory.createApplicationContext(
    AppModule.register(
      settings,
      logger,
      { imports: [JobsModule], providers: [SchedulerHost] },
      true,
    ),
    { logger, abortOnError: false },
  );
  app.enableShutdownHooks();
  try {
    AppModule.registerDomain(app);
    await app.get(SchedulerHost).start();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void scheduler().catch((error: unknown) => {
    new JsonLogger().error(error);
    process.exitCode = 1;
  });
}
