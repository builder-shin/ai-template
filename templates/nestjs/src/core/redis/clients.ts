import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { Redis } from "ioredis";
import { SETTINGS, type Settings } from "../config/settings.js";
import { instrumentRedis } from "../telemetry/redis-spans.js";
import { getTracer } from "../telemetry/tracer.js";
import { redisNamespace } from "./keys.js";
@Injectable()
export class RedisClients implements OnApplicationShutdown {
  readonly prefix: string;
  readonly command: Redis;
  readonly subscriber: Redis;
  readonly adapterPublisher: Redis;
  private readonly connections = new Map<string, Redis>();
  constructor(@Inject(SETTINGS) private readonly settings: Settings) {
    this.prefix = redisNamespace(settings.REDIS_URL);
    this.command = this.connection("command");
    this.subscriber = this.connection("subscriber");
    this.adapterPublisher = this.connection("adapterPublisher");
  }
  key(...parts: readonly string[]): string {
    return [this.prefix, ...parts].join(":");
  }
  connection(name: string): Redis {
    const existing = this.connections.get(name);
    if (existing) return existing;
    const url = new URL(this.settings.REDIS_URL);
    url.pathname = "/" + this.prefix.slice("aitpl:".length);
    for (const option of [
      "db",
      "lazyConnect",
      "commandTimeout",
      "maxRetriesPerRequest",
      "connectionName",
    ])
      url.searchParams.delete(option);
    const client = new Redis(url.href, {
      lazyConnect: true,
      ...(name === "bullmq" ? {} : { commandTimeout: 2000 }),
      maxRetriesPerRequest: name === "bullmq" ? null : 1,
      connectionName: `${this.prefix}:${String(process.pid)}:${name}`,
    });
    instrumentRedis(client, getTracer());
    this.connections.set(name, client);
    return client;
  }
  async close(): Promise<void> {
    await Promise.all(
      [...this.connections.values()].map(async (client) => {
        if (client.status === "ready") {
          try {
            await client.quit();
          } catch {
            client.disconnect();
          }
        } else client.disconnect();
      }),
    );
  }
  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }
}
