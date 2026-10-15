import { PrismaService } from "../../core/db/prisma.service.js";
export function list(prisma: PrismaService) {
  return prisma.user.findMany();
}
