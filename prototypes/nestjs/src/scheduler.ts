import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AppModule } from "./app.module.js";
import { Schedulers } from "./core/jobs/schedulers.js";
export async function scheduler() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  app.enableShutdownHooks();
  await app.get(Schedulers).start();
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await scheduler();
