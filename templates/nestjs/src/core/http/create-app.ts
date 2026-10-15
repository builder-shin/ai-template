import type { Provider, Type, DynamicModule } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter, type NestExpressApplication } from "@nestjs/platform-express";
import express from "express";
import { loadSettings, type Settings } from "../config/settings.js";
import { AppModule, logLevels } from "../../app.module.js";
import { JsonLogger } from "../logging/json-logger.js";
import { OperationInterceptor } from "./operation.interceptor.js";
import { DocumentInterceptor } from "./document.interceptor.js";
import { ApiExceptionFilter } from "./exception.filter.js";
import { GLOBAL_LIMITER, pipeline, type GlobalLimiter } from "./pipeline.js";
export interface AppOverrides {
  readonly configure?: (app: NestExpressApplication) => void;
  readonly settings?: Settings;
  readonly providers?: readonly Provider[];
  readonly imports?: readonly (Type<unknown> | DynamicModule)[];
}
export async function createApp(
  overrides: AppOverrides = {},
  infrastructure = true,
): Promise<NestExpressApplication> {
  const settings = overrides.settings ?? loadSettings();
  const logger = new JsonLogger(logLevels(settings.LOG_LEVEL));
  const server = express();
  server.enable("strict routing");
  server.disable("x-powered-by");
  server.set("trust proxy", settings.FORWARDED_ALLOW_IPS);
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(settings, logger, overrides, infrastructure),
    new ExpressAdapter(server),
    {
      bodyParser: false,
      routeResolutionStrategy: "specificity",
      routeConflictPolicy: { duplicate: "error", shadow: "warn" },
      abortOnError: false,
      logger,
    },
  );
  const filter = new ApiExceptionFilter(logger);
  app.use(pipeline(logger, filter, app.get<GlobalLimiter>(GLOBAL_LIMITER)));
  app.useGlobalFilters(filter);
  app.useGlobalInterceptors(new OperationInterceptor(), new DocumentInterceptor());
  try {
    overrides.configure?.(app);
    await app.init();
    AppModule.registerDomain(app);
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
