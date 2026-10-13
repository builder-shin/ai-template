import "reflect-metadata";
import { pathToFileURL } from "node:url";
import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule, logLevels } from "./app.module.js";
import { loadSettings } from "./core/config/settings.js";
import { JobsModule } from "./core/jobs/jobs.module.js";
import { WorkerHost } from "./core/jobs/worker-host.js";
import { MailModule } from "./core/mail/mail.module.js";
import { JsonLogger } from "./core/logging/json-logger.js";
export async function worker(): Promise<INestApplicationContext> {
  const settings = loadSettings();
  const logger = new JsonLogger(logLevels(settings.LOG_LEVEL));
  const app = await NestFactory.createApplicationContext(
    AppModule.register(
      settings,
      logger,
      { imports: [JobsModule, MailModule], providers: [WorkerHost] },
      true,
    ),
    { logger, abortOnError: false },
  );
  app.enableShutdownHooks();
  try {
    AppModule.registerDomain(app);
    await app.get(WorkerHost).start();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void worker().catch((error: unknown) => {
    new JsonLogger().error(error);
    process.exitCode = 1;
  });
}
