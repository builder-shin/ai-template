import pg from "pg";
import { PrismaService } from "../../src/core/db/prisma.service.js";
import { RedisClients } from "../../src/core/redis/clients.js";
import { redisNamespace } from "../../src/core/redis/keys.js";
import { assertProjectDatabase } from "../../scripts/db/guard.js";
import { scriptSettings } from "../../scripts/runtime.js";
import type { Settings } from "../../src/core/config/settings.js";
let state:
  | { settings: Settings; prisma: PrismaService; redis: RedisClients; mailpitUrl: string }
  | undefined;
export function getState() {
  if (state) return state;
  const configured = scriptSettings();
  const database = new URL(configured.DATABASE_URL);
  database.pathname = "/app_test";
  const redis = new URL(configured.REDIS_URL);
  redis.pathname = "/15";
  const smtp = new URL(configured.SMTP_URL);
  const mailpit = new URL(`http://${smtp.hostname}`);
  const ports: Record<string, string> = { "21025": "28025", "1025": "8025" };
  const apiPort = ports[smtp.port];
  if (!apiPort) throw new Error(`Mailpit API 포트를 알 수 없다: SMTP ${smtp.port}`);
  mailpit.port = apiPort;
  const settings = {
    ...configured,
    APP_ENV: "test" as const,
    DATABASE_URL: database.href,
    REDIS_URL: redis.href,
  };
  state = {
    settings,
    prisma: new PrismaService(settings),
    redis: new RedisClients(settings),
    mailpitUrl: mailpit.origin,
  };
  return state;
}
export async function closeState(): Promise<void> {
  const current = state;
  state = undefined;
  if (current) await Promise.all([current.prisma.$disconnect(), current.redis.close()]);
}
export async function resetState(): Promise<void> {
  const { settings, redis, mailpitUrl } = getState();
  if (
    new URL(settings.DATABASE_URL).pathname !== "/app_test" ||
    redisNamespace(settings.REDIS_URL) !== "aitpl:15"
  )
    throw new Error("통합 시험은 app_test와 Redis 15만 지운다");
  await assertProjectDatabase(settings.DATABASE_URL);
  const client = new pg.Client({
    connectionString: settings.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const tables = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename",
    );
    const identifiers = tables.rows.map(
      ({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`,
    );
    if (identifiers.length)
      await client.query(`TRUNCATE TABLE ${identifiers.join(", ")} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
  await redis.command.flushdb();
  const response = await fetch(`${mailpitUrl}/api/v1/messages`, {
    method: "DELETE",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Mailpit 메시지를 지우지 못했다");
}
