import { Global, Module } from "@nestjs/common";
import { SETTINGS, loadSettings } from "../config/settings.js";
import { PrismaService } from "./prisma.service.js";
import { UnitOfWork } from "./unit-of-work.js";
@Global()
@Module({
  providers: [
    { provide: SETTINGS, useFactory: () => loadSettings(process.env) },
    PrismaService,
    UnitOfWork,
  ],
  exports: [SETTINGS, PrismaService, UnitOfWork],
})
export class DbModule {}
