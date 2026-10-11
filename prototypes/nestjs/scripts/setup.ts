import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { loadSettings } from "../src/core/config/settings.js";
import { clientManifest } from "./client-manifest.js";
import { prisma } from "./prisma.js";
import { guardDatabase, assertLocalDatabase, assertOwnedPostgres } from "./db-guard.js";
import { storageSetup } from "./storage-setup.js";
const settings = loadSettings(process.env);
assertLocalDatabase(settings.DATABASE_URL);
function command(bin: string, args: string[]): void {
  const result = spawnSync(bin, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Setup command failed (${String(result.status)}).`);
}
command("docker", ["compose", "-f", "compose.yaml", "up", "-d", "--wait"]);
assertOwnedPostgres(settings.DATABASE_URL);
const url = new URL(settings.DATABASE_URL);
url.pathname = "/postgres";
const admin = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
try {
  for (const name of ["app", "app_test", "app_e2e"]) {
    const exists = await admin.query<{ present: boolean }>(
      "SELECT EXISTS(SELECT FROM pg_database WHERE datname=$1) AS present",
      [name],
    );
    if (!exists.rows[0]?.present) await admin.query(`CREATE DATABASE "${name}"`);
    url.pathname = `/${name}`;
    await guardDatabase(url.toString());
    prisma(["migrate", "deploy"], { ...process.env, DATABASE_URL: url.toString() });
  }
} finally {
  await admin.end();
}
prisma(["generate"]);
clientManifest();
command("pnpm", ["build"]);
command(process.execPath, ["dist/seed.js"]);
await storageSetup(settings);
