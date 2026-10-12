import { Injectable, Inject } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { PrismaService } from "../../core/db/prisma.service.js";
import { RedisClients } from "../../core/redis/clients.js";
import { createStorageClient } from "../../core/storage/client.js";
import { SETTINGS } from "../../core/config/settings.js";
import type { Settings } from "../../core/config/settings.js";
import type { z } from "zod";
import type { HealthReport } from "./schemas.js";
@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly storage;
  constructor(
    private readonly db: PrismaService,
    private readonly redis: RedisClients,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {
    this.storage = createStorageClient(settings);
  }
  async ready(): Promise<z.infer<typeof HealthReport>> {
    const probes = {
      database: () => this.db.$queryRaw`SELECT 1`,
      redis: () => this.redis.command.ping(),
      storage: () => this.storage.send(new HeadBucketCommand({ Bucket: this.settings.S3_BUCKET })),
    };
    const checks = Object.fromEntries(
      await Promise.all(
        Object.entries(probes).map(async ([name, probe]) => {
          try {
            await probe();
            return [name, "ok"] as const;
          } catch {
            return [name, "unavailable"] as const;
          }
        }),
      ),
    );
    return {
      status: Object.values(checks).every((x) => x === "ok") ? "ok" : "unavailable",
      checks,
    };
  }
  onModuleDestroy(): void {
    this.storage.destroy();
  }
}
