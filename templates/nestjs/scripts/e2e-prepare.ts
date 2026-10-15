import { createServer } from "node:net";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { Redis } from "ioredis";
import { assertLocalDatabase, assertProjectDatabase } from "./db/guard.js";
import { loadSettings } from "../src/core/config/settings.js";
import { seed } from "../src/seed.js";
import { storageClients } from "../src/core/storage/client.js";
import { prepareBucket } from "../src/core/storage/setup.js";

export async function prepareE2e(env: Record<string, string>): Promise<void> {
  const port = createServer();
  await new Promise<void>((resolve, reject) => {
    port.once("error", reject);
    port.listen(18000, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve, reject) => {
    port.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  const settings = loadSettings(env);
  if (
    new URL(settings.DATABASE_URL).pathname !== "/app_e2e" ||
    new URL(settings.REDIS_URL).pathname !== "/14"
  )
    throw new Error("E2E 전용 DB만 비운다");
  assertLocalDatabase(settings.DATABASE_URL);
  await assertProjectDatabase(settings.DATABASE_URL);
  const db = new pg.Client({
    connectionString: settings.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await db.connect();
    await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  } finally {
    await db.end();
  }
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    cwd: resolve(import.meta.dirname, ".."),
    env,
    stdio: "inherit",
  });
  const redis = new Redis(settings.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
  const clients = storageClients(settings);
  try {
    await prepareBucket(clients.internal, settings.S3_BUCKET, settings.STORAGE_ALLOWED_ORIGINS);
  } finally {
    clients.internal.destroy();
    clients.public.destroy();
  }
  await seed(settings);
}
