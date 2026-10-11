import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { loadSettings } from "../src/core/config/settings.js";
import { assertTestDatabase, guardDatabase } from "./db-guard.js";
import { valkey } from "./valkey.js";
import { childEnvironment } from "./preflight-tmp.mjs";
const base = loadSettings(process.env),
  db = new URL(base.DATABASE_URL),
  redis = new URL(base.REDIS_URL);
db.pathname = "/app_test";
redis.pathname = "/15";
assertTestDatabase(db.toString(), redis.toString());
const pool = new Pool({ connectionString: db.toString(), connectionTimeoutMillis: 5000 });
try {
  await pool.query("SELECT 1");
  await guardDatabase(db.toString());
  await valkey(redis.toString(), "PING");
} catch {
  throw new Error("Integration infrastructure is unavailable. setup을 실행하라.");
} finally {
  await pool.end();
}
const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "--config", "vitest.integration.config.ts"],
  {
    env: {
      ...childEnvironment(),
      DATABASE_URL: db.toString(),
      REDIS_URL: redis.toString(),
      NODE_ENV: "test",
    },
    stdio: "inherit",
  },
);
process.exitCode = result.status ?? 1;
