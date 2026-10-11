export function run(db: { $executeRawUnsafe(sql: string): unknown }) { return db["$executeRawUnsafe"]("DELETE FROM posts"); }
