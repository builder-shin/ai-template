import { Inject, Injectable, Logger } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";
import { Redis } from "ioredis";
import { SETTINGS } from "../config/settings.js";
import type { Settings } from "../config/settings.js";
import { redisNamespace } from "./keys.js";
@Injectable()
export class RedisClients implements OnApplicationShutdown {
  readonly prefix: string;
  private readonly clients = new Map<string, Redis>();
  private readonly logger = new Logger(RedisClients.name);
  constructor(@Inject(SETTINGS) private readonly settings: Settings) {
    this.prefix = redisNamespace(settings.REDIS_URL);
  }
  private client(name: string, blocking = false): Redis {
    let client = this.clients.get(name);
    if (!client) {
      client = new Redis(this.settings.REDIS_URL, {
        lazyConnect: true,
        connectTimeout: 2000,
        maxRetriesPerRequest: blocking ? null : 1,
        commandTimeout: blocking ? undefined : 2000,
        connectionName: `${this.prefix}:${String(process.pid)}:${name}`,
      });
      client.on("error", () => {
        this.logger.warn(`Redis ${name} unavailable.`);
      });
      this.clients.set(name, client);
    }
    return client;
  }
  get command() {
    return this.client("command");
  }
  get subscriber() {
    return this.client("control-sub", true);
  }
  get adapterPublisher() {
    return this.client("adapter-pub", true);
  }
  get adapterSubscriber() {
    return this.subscriber;
  }
  get bullmq() {
    return this.client("bullmq", true);
  }
  async close(): Promise<void> {
    await Promise.all(
      [...this.clients.values()].map(async (client) => {
        if (client.status === "ready") {
          try {
            await client.quit();
          } finally {
            client.disconnect();
          }
        } else client.disconnect();
      }),
    );
    this.clients.clear();
  }
  onApplicationShutdown() {
    return this.close();
  }
}
