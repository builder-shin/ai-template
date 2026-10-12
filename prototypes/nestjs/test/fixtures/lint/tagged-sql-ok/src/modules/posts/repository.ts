export function run(db: { $queryRaw(parts: TemplateStringsArray, ...values: unknown[]): unknown }, id: string) { return db.$queryRaw`SELECT * FROM posts WHERE id = ${id}`; }
