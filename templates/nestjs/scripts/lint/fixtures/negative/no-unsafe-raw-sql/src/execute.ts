export function execute(prisma: { $executeRawUnsafe: (sql: string) => unknown }) {
  return prisma["$executeRawUnsafe"]("DELETE FROM posts");
}
