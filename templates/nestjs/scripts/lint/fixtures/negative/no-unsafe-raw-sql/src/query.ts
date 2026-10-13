export function query(prisma: { $queryRawUnsafe: (sql: string) => unknown }) {
  return prisma.$queryRawUnsafe("SELECT 1");
}
