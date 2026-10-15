import "reflect-metadata";
import type { DynamicModule, INestApplicationContext, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule, logLevels } from "./app.module.js";
import { loadSettings } from "./core/config/settings.js";
import { JsonLogger } from "./core/logging/json-logger.js";
import { drainBeforeClose } from "./core/runtime/context-shutdown.js";
export async function startJobsContext(
  imports: readonly (Type<unknown> | DynamicModule)[],
  Host: Type<{ start(): Promise<void>; onModuleDestroy?(): Promise<void> }>,
): Promise<INestApplicationContext> {
  const settings = loadSettings();
  const logger = new JsonLogger(logLevels(settings.LOG_LEVEL));
  const app = await NestFactory.createApplicationContext(
    AppModule.register(settings, logger, { imports, providers: [Host] }, true),
    { logger, abortOnError: false },
  );
  let host: { start(): Promise<void>; onModuleDestroy?(): Promise<void> } | undefined;
  drainBeforeClose(app, async () => {
    await host?.onModuleDestroy?.();
  });
  try {
    AppModule.registerDomain(app);
    const current = app.get<{ start(): Promise<void>; onModuleDestroy?(): Promise<void> }>(Host);
    host = current;
    await current.start();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
