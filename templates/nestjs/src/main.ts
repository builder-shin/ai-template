import "reflect-metadata";
import { isEntrypoint, listenHost } from "./core/config/runtime.js";
import { installShutdown } from "./core/http/shutdown.js";
import { writeReadiness } from "./core/runtime/readiness.js";
import { createApp } from "./core/http/create-app.js";
import { SETTINGS, type Settings } from "./core/config/settings.js";
import { JsonLogger } from "./core/logging/json-logger.js";
import { RedisClients } from "./core/redis/clients.js";
import { RealtimeIoAdapter } from "./core/realtime/adapter.js";

export async function bootstrap(): Promise<void> {
  const app = await createApp(
    {
      configure: (app) => {
        app.useWebSocketAdapter(
          new RealtimeIoAdapter(
            app,
            app.get<Settings>(SETTINGS).REALTIME_ALLOWED_ORIGINS,
            app.get<RedisClients>(RedisClients),
          ),
        );
      },
    },
    true,
  );
  installShutdown(app.getHttpServer(), () => app.close());
  try {
    await app.listen(app.get<Settings>(SETTINGS).PORT, listenHost(), () => {
      writeReadiness("api");
    });
  } catch (error) {
    await app.close();
    throw error;
  }
}

if (isEntrypoint(import.meta.url)) {
  void bootstrap().catch((error: unknown) => {
    new JsonLogger().error(error);
    process.exitCode = 1;
  });
}
