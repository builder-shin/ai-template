import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { RedisClients } from "../redis/clients.js";
import type { AfterCommit } from "../db/unit-of-work.js";
@Injectable()
export class ControlChannel implements OnModuleDestroy {
  private readonly logger = new Logger(ControlChannel.name);
  private listening = false;
  private handler?: (id: string) => Promise<void>;
  constructor(private readonly redis: RedisClients) {}
  get channel() {
    return `${this.redis.prefix}:control`;
  }
  queue(afterCommit: AfterCommit, userId: string): void {
    afterCommit(() => this.publish(userId));
  }
  async publish(id: string): Promise<void> {
    await this.redis.command.publish(this.channel, id);
  }
  private readonly listener = (channel: string, id: string) => {
    if (channel === this.channel)
      void this.handler?.(id).catch(() => {
        this.logger.warn("Realtime recheck unavailable; preserving connections.");
      });
  };
  async start(handler: (id: string) => Promise<void>): Promise<void> {
    if (this.listening) return;
    this.handler = handler;
    this.redis.subscriber.on("message", this.listener);
    await this.redis.subscriber.subscribe(this.channel);
    this.listening = true;
  }
  async onModuleDestroy(): Promise<void> {
    if (this.listening) await this.redis.subscriber.unsubscribe(this.channel);
    this.redis.subscriber.off("message", this.listener);
    this.listening = false;
  }
}
