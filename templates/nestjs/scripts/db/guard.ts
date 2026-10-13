import pg from "pg";
export function classifyDatabase(tables: readonly string[]): "empty" | "project" | "foreign" {
  if (!tables.length) return "empty";
  if (!tables.includes("_prisma_migrations")) return "foreign";
  return tables.some((table) =>
    [
      "alembic_version",
      "django_migrations",
      "knex_migrations",
      "schema_migrations",
      "flyway_schema_history",
    ].includes(table),
  )
    ? "foreign"
    : "project";
}
export function assertLocalDatabase(url: string): void {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "postgresql:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
  )
    throw new Error("db:reset은 로컬 DB(127.0.0.1, localhost, ::1)만 지운다");
}
export async function assertProjectDatabase(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const result = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    const tables = result.rows.map((row) => row.tablename);
    if (classifyDatabase(tables) === "foreign")
      throw new Error(`다른 프로젝트 DB는 변경하지 않는다 — 표: ${tables.join(", ")}`);
  } finally {
    await client.end();
  }
}
