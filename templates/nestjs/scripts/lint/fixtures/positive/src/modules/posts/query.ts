export function query(prisma: { $queryRaw: (parts: TemplateStringsArray) => unknown }) {
  return prisma.$queryRaw`SELECT 1`;
}
