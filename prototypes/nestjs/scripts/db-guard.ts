import { Pool } from "pg";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const appTables = new Set([
  "users",
  "roles",
  "user_roles",
  "sessions",
  "refresh_tokens",
  "account_tokens",
  "audit_logs",
]);
export function assertLocalDatabase(url: string): void {
  const target = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(target.hostname))
    throw new Error("db:reset requires localhost or 127.0.0.1.");
}
export function assertTestDatabase(url: string, redisUrl: string): void {
  if (new URL(url).pathname !== "/app_test" || new URL(redisUrl).pathname !== "/15")
    throw new Error("Integration tests require app_test and Valkey DB 15.");
  assertLocalDatabase(url);
}
export function inspectTables(tables: readonly string[]): void {
  if (tables.length && !tables.includes("_prisma_migrations"))
    throw new Error("Refusing foreign database without _prisma_migrations.");
  if (tables.some((table) => table !== "_prisma_migrations" && !appTables.has(table)))
    throw new Error("Refusing foreign database tables.");
}
export async function guardDatabase(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    const result = await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    inspectTables(result.rows.map((row) => row.tablename));
  } finally {
    await pool.end();
  }
}
export function assertOwnedPostgres(url: string): void {
  assertLocalDatabase(url);
  const result = spawnSync(
    "docker",
    ["compose", "-f", resolve(import.meta.dirname, "../compose.yaml"), "port", "postgres", "5432"],
    { encoding: "utf8" },
  );
  const address = result.stdout.trim();
  if (result.status !== 0 || address !== `127.0.0.1:${new URL(url).port || "5432"}`)
    throw new Error("Database is not the running NestJS compose postgres.");
}
