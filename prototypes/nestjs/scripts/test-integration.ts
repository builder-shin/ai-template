import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { loadSettings } from "../src/core/config/settings.js";
import { assertTestDatabase, guardDatabase } from "./db-guard.js";
import { valkey } from "./valkey.js";
import { childEnvironment } from "./preflight-tmp.mjs";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
const base = loadSettings(process.env),
  db = new URL(base.DATABASE_URL),
  redis = new URL(base.REDIS_URL);
const suites = [
  "auth",
  "posts-read",
  "posts-write",
  "posts-query",
  "files-upload",
  "files-quota",
  "storage-setup",
  "jobs",
  "realtime",
  "ratelimit",
];
const directory = resolve(".cache/integration");
mkdirSync(directory, { recursive: true });
for (const suite of suites) {
  const file = resolve(directory, `${suite}.json`);
  if (existsSync(file)) unlinkSync(file);
}
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
      S3_KEY_PREFIX: `aitpl-nestjs-proto-integration-${randomUUID()}/`,
      FILE_USER_QUOTA: "1024",
    },
    stdio: "inherit",
  },
);
const measured = suites
  .filter((suite) => existsSync(resolve(directory, `${suite}.json`)))
  .map(
    (suite) =>
      JSON.parse(readFileSync(resolve(directory, `${suite}.json`), "utf8")) as {
        suite: string;
        testCount: number;
        tests: unknown[];
        truncateMs: number[];
        lifecycle: unknown;
      },
  );
const truncations = measured.flatMap((s) => s.truncateMs);
const measurements = {
  executedAt: new Date().toISOString(),
  nativeExit: result.status,
  testCount: measured.reduce((n, s) => n + s.testCount, 0),
  suites: measured,
  truncateMeanMs: truncations.length
    ? truncations.reduce((a, b) => a + b, 0) / truncations.length
    : null,
};
writeFileSync(resolve(directory, "measurements.json"), JSON.stringify(measurements, null, 2));
console.log(JSON.stringify({ integrationMeasurements: measurements }));
if (
  result.status === 0 &&
  (measured.length !== suites.length ||
    measured.find((s) => s.suite === "auth")?.testCount !== 13 ||
    measurements.testCount !== 43)
)
  throw new Error("Integration measurements omitted a required suite or test.");
process.exitCode = result.status ?? 1;
