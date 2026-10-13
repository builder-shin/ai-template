import "reflect-metadata";
import { pathToFileURL } from "node:url";
import { loadSettings, type Settings } from "./core/config/settings.js";
import { PrismaService } from "./core/db/prisma.service.js";
import { UnitOfWork } from "./core/db/unit-of-work.js";
import { seedSystem } from "./modules/roles/index.js";

export async function seed(settings: Settings = loadSettings()): Promise<void> {
  const prisma = new PrismaService(settings);
  try {
    await new UnitOfWork(prisma).run((tx) => seedSystem(tx, settings));
  } finally {
    await prisma.$disconnect();
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await seed();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "시드에 실패했다"}\n`);
    process.exitCode = 1;
  }
}
