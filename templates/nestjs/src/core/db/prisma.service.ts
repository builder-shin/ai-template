import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { SETTINGS, type Settings } from "../config/settings.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(SETTINGS) settings: Settings) {
    super({
      adapter: new PrismaPg({
        connectionString: settings.DATABASE_URL,
        max: 20,
        connectionTimeoutMillis: 5000,
      }),
    });
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
