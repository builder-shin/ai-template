import type { PrismaService } from "../../core/db/prisma.service.js";
import type { RedisClients } from "../../core/redis/clients.js";
export const HEALTH_CHECKS: unique symbol = Symbol("HEALTH_CHECKS");
export interface HealthCheck {
  readonly name: "database" | "redis" | "storage";
  check(): Promise<void>;
}
export function databaseCheck(prisma: Pick<PrismaService, "$queryRaw">): HealthCheck {
  return {
    name: "database",
    async check() {
      await prisma.$queryRaw`SELECT 1`;
    },
  };
}
export function redisCheck(redis: Pick<RedisClients, "command">): HealthCheck {
  return {
    name: "redis",
    async check() {
      const response: unknown = await redis.command.ping();
      if (response !== "PONG") throw new Error("Redis PING 응답이 잘못됐다");
    },
  };
}
