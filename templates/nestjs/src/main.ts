import "reflect-metadata";
import { pathToFileURL } from "node:url";
import { createApp } from "./core/http/create-app.js";
import { SETTINGS, type Settings } from "./core/config/settings.js";
import { JsonLogger } from "./core/logging/json-logger.js";

export async function bootstrap(): Promise<void> {
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(app.get<Settings>(SETTINGS).PORT, "0.0.0.0");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void bootstrap().catch((error: unknown) => {
    new JsonLogger().error(error);
    process.exitCode = 1;
  });
}
