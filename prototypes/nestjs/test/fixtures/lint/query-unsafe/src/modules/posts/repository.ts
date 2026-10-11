export function run(db: { $queryRawUnsafe(sql: string): unknown }) { return db.$queryRawUnsafe("SELECT 1"); }
