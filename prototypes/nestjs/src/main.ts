import { RealtimeAdapter } from "./core/realtime/adapter.js";
import { RedisClients } from "./core/redis/clients.js";
import { GlobalRateLimitMiddleware } from "./core/ratelimit/global.middleware.js";
import { RealtimeService } from "./modules/realtime/index.js";
import { loadSettings } from "./core/config/settings.js";
import { installJsonApi } from "./core/jsonapi/pipeline.js";
import { JsonApiExceptionFilter } from "./core/jsonapi/filter.js";
import type { JsonApiPorts } from "./core/jsonapi/decorators.js";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import type { NestExpressApplication } from "@nestjs/platform-express";
import express from "express";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Authenticator } from "./modules/auth/index.js";
import { AppModule } from "./app.module.js";
import { registerDomain } from "./modules/registry.js";
import { SETTINGS } from "./core/config/settings.js";
import type { Settings } from "./core/config/settings.js";

export async function createApp(
  ports?: JsonApiPorts,
  infrastructure = false,
): Promise<NestExpressApplication> {
  // ExpressAdapter의 첫 use() 전에 strict routing을 설정해야 Router에도 적용된다.
  const server = express();
  server.set("strict routing", true);
  const settings = loadSettings(process.env);
  server.set(
    "trust proxy",
    settings.FORWARDED_ALLOW_IPS.split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );
  const appPorts: JsonApiPorts = ports ?? {
    ...(infrastructure
      ? { globalRateLimit: (req) => app.get(GlobalRateLimitMiddleware).check(req) }
      : {}),
    authenticator: {
      authenticate: async (request) => {
        const principal = await app.get(Authenticator).authenticate(request.headers.authorization);
        return principal
          ? {
              authentication: principal,
              id: principal.userId,
              permissions: [...principal.permissions],
            }
          : null;
      },
    },
  };
  installJsonApi(server, appPorts);
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
    {
      bodyParser: false,
      abortOnError: false,
      routeResolutionStrategy: "specificity",
      // Nest 12.1.2의 shadow:error는 current/id 선언 순서에 따라 정상 중첩을 거절한다.
      routeConflictPolicy: { duplicate: "error", shadow: "warn" },
    },
  );
  app.set("strict routing", true);
  app.useGlobalFilters(new JsonApiExceptionFilter());
  if (infrastructure)
    app.useWebSocketAdapter(new RealtimeAdapter(app, app.get(RedisClients), settings));
  registerDomain(app);
  return app;
}

export async function bootstrap(): Promise<void> {
  const app = await createApp(undefined, true);
  app.enableShutdownHooks();
  await app.listen(app.get<Settings>(SETTINGS).PORT);
  await app.get(RealtimeService).start();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await bootstrap();
}
