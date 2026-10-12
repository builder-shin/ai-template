import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { SETTINGS } from "../config/settings.js";
import type { Settings } from "../config/settings.js";
@Injectable()
export class PrismaService
  extends PrismaClient<{ adapter: PrismaPg; log: [{ level: "query"; emit: "event" }] }>
  implements OnModuleDestroy
{
  private readonly observers = new Set<(query: Prisma.QueryEvent) => void>();
  constructor(@Inject(SETTINGS) settings: Settings) {
    super({
      log: [{ level: "query", emit: "event" }],
      adapter: new PrismaPg({
        connectionString: settings.DATABASE_URL,
        connectionTimeoutMillis: 5000,
        max: 20,
      }),
    });
    this.$on("query", (query) => {
      for (const observer of this.observers) observer(query);
    });
  }
  observeQueries(observer: (query: Prisma.QueryEvent) => void): () => void {
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
