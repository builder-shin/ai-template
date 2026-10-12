import { Pool } from "pg";
import { spawnSync } from "node:child_process";
import { loadSettings } from "../src/core/config/settings.js";
import { assertLocalDatabase, assertOwnedPostgres, guardDatabase } from "./db-guard.js";
import { prisma } from "./prisma.js";
const settings = loadSettings(process.env);
assertLocalDatabase(settings.DATABASE_URL);
assertOwnedPostgres(settings.DATABASE_URL);
await guardDatabase(settings.DATABASE_URL);
const url = new URL(settings.DATABASE_URL),
  name = url.pathname.slice(1);
if (!["app", "app_test", "app_e2e"].includes(name)) throw new Error("Unsupported reset database.");
url.pathname = "/postgres";
const admin = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
try {
  await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
} finally {
  await admin.end();
}
prisma(["migrate", "deploy"]);
const result = spawnSync("pnpm", ["build"], { stdio: "inherit" });
if (result.status !== 0) throw new Error("Seed build failed.");
const seeded = spawnSync(process.execPath, ["dist/seed.js"], { stdio: "inherit" });
if (seeded.status !== 0) throw new Error("Seed failed.");
