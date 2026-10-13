import "reflect-metadata";
import type { DynamicModule, INestApplicationContext, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule, logLevels } from "./app.module.js";
import { loadSettings } from "./core/config/settings.js";
import { JsonLogger } from "./core/logging/json-logger.js";
export async function startJobsContext(
  imports: readonly (Type<unknown> | DynamicModule)[],
  Host: Type<{ start(): Promise<void> }>,
): Promise<INestApplicationContext> {
  const settings = loadSettings();
  const logger = new JsonLogger(logLevels(settings.LOG_LEVEL));
  const app = await NestFactory.createApplicationContext(
    AppModule.register(settings, logger, { imports, providers: [Host] }, true),
    { logger, abortOnError: false },
  );
  app.enableShutdownHooks();
  try {
    AppModule.registerDomain(app);
    await app.get(Host).start();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
