import "reflect-metadata";
import { isEntrypoint } from "./core/config/runtime.js";
import { loadSettings, type Settings } from "./core/config/settings.js";
import { PrismaService } from "./core/db/prisma.service.js";
import { UnitOfWork } from "./core/db/unit-of-work.js";
import { seedSystem } from "./modules/roles/index.js";
import { seedPosts } from "./modules/posts/index.js";

export async function seed(settings: Settings = loadSettings()): Promise<void> {
  const prisma = new PrismaService(settings);
  try {
    await new UnitOfWork(prisma).run(async (tx) => {
      const { adminUserId } = await seedSystem(tx, settings);
      await seedPosts(tx, adminUserId);
    });
  } finally {
    await prisma.$disconnect();
  }
}
if (isEntrypoint(import.meta.url)) {
  try {
    await seed();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "시드에 실패했다"}\n`);
    process.exitCode = 1;
  }
}
