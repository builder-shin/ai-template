declare const prisma: {
  $queryRawUnsafe: (sql: string) => unknown;
  $executeRawUnsafe: (sql: string) => unknown;
};
const { $queryRawUnsafe, $executeRawUnsafe: execute } = prisma;
$queryRawUnsafe("SELECT 1");
execute("SELECT 1");
declare const $executeRawUnsafe: (sql: string) => unknown;
$executeRawUnsafe("SELECT 1");
