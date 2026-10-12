import { Pool } from "pg";
import { Redis } from "ioredis";
import { GetBucketCorsCommand, S3ServiceException } from "@aws-sdk/client-s3";
import { loadSettings } from "../src/core/config/settings.js";
import { createStorageClient } from "../src/core/storage/client.js";
import { storageSetup } from "./storage-setup.js";
import { assertOwnedPostgres, guardDatabase } from "./db-guard.js";
import { assertE2eTargets } from "./e2e-options.js";
import { start, stopAll } from "./servers.js";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
export async function prepare(env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<void> {
  assertE2eTargets(env);
  const settings = loadSettings(env);
  const db = new Pool({ connectionString: settings.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const redis = new Redis(settings.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    connectTimeout: 5000,
  });
  redis.on("error", () => {
    /* Connection command errors are handled by the preflight below. */
  });
  try {
    try {
      assertOwnedPostgres(settings.DATABASE_URL, env);
      await db.query("SELECT 1");
      await redis.connect();
      await redis.ping();
      const mail = await fetch(`${settings.MAILPIT_URL}/readyz`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      });
      await mail.arrayBuffer();
      if (!mail.ok) throw new Error("Mailpit unavailable.");
    } catch {
      signal.throwIfAborted();
      throw new Error(
        "E2E infrastructure is unavailable. Run pnpm --dir prototypes/nestjs setup first.",
      );
    }
    await guardDatabase(settings.DATABASE_URL);
    signal.throwIfAborted();
    await command(["pnpm", "exec", "prisma", "migrate", "deploy"], env, signal);
    await guardDatabase(settings.DATABASE_URL);
    assertE2eTargets(env);
    await db.query(
      'TRUNCATE "users", "roles", "user_roles", "sessions", "refresh_tokens", "account_tokens", "audit_logs", "posts", "files" CASCADE',
    );
    await redis.flushdb();
    await command([process.execPath, "dist/seed.js"], env, signal);
    const client = createStorageClient(settings);
    const origins = new Set(
      settings.STORAGE_ALLOWED_ORIGINS.split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    );
    try {
      try {
        const cors = await client.send(new GetBucketCorsCommand({ Bucket: settings.S3_BUCKET }), {
          abortSignal: signal,
        });
        for (const rule of cors.CORSRules ?? [])
          for (const value of rule.AllowedOrigins ?? []) origins.add(value);
      } catch (error) {
        if (
          !(error instanceof S3ServiceException) ||
          (error.name !== "NoSuchCORSConfiguration" && error.$metadata.httpStatusCode !== 404)
        )
          throw error;
      }
    } finally {
      client.destroy();
    }
    await storageSetup({ ...settings, STORAGE_ALLOWED_ORIGINS: [...origins].join(",") });
  } finally {
    redis.disconnect();
    await db.end();
  }
}
async function command(argv: string[], env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const child = start(argv, env, root, "prepare");
  const abort = () => {
    void stopAll([child]);
  };
  signal.addEventListener("abort", abort);
  try {
    const code = await child.exited;
    signal.throwIfAborted();
    if (code !== 0) throw new Error(`E2E preparation failed (${String(code)}):\n${child.tail}`);
  } finally {
    signal.removeEventListener("abort", abort);
    await stopAll([child]);
  }
}
