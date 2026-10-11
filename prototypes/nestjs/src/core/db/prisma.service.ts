import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { SETTINGS } from "../config/settings.js";
import type { Settings } from "../config/settings.js";
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(SETTINGS) settings: Settings) {
    super({
      adapter: new PrismaPg({
        connectionString: settings.DATABASE_URL,
        connectionTimeoutMillis: 5000,
        max: 20,
      }),
    });
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
