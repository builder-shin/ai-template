import { execFileSync } from "node:child_process";
import { databaseUrls, ensureDatabases } from "./db/databases.js";
import { migrate } from "./db/migrate.js";
import { generate } from "./gen.js";
import { prepareEnvironment } from "./setup-env.js";
import { prepareHarness } from "./setup-harness.js";
import { isMain, main, scriptSettings } from "./runtime.js";
import { storageClients } from "../src/core/storage/client.js";
import { prepareBucket } from "../src/core/storage/setup.js";
export async function setup(): Promise<void> {
  prepareEnvironment(".env", ".env.example");
  await prepareHarness();
  const settings = scriptSettings();
  execFileSync("docker", ["compose", "up", "-d", "--wait"], { stdio: "inherit" });
  ensureDatabases(settings.DATABASE_URL);
  await generate();
  for (const url of databaseUrls(settings.DATABASE_URL)) await migrate(url);
  const clients = storageClients(settings);
  try {
    await prepareBucket(clients.internal, settings.S3_BUCKET, settings.STORAGE_ALLOWED_ORIGINS);
  } finally {
    clients.internal.destroy();
    clients.public.destroy();
  }
  const { seed } = await import("../src/seed.js");
  await seed(settings);
}
if (isMain(import.meta.url)) await main(setup);
