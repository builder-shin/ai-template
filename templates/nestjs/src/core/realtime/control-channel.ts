import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { z } from "zod";
import { RedisClients } from "../redis/clients.js";
import { JsonLogger } from "../logging/json-logger.js";
const recheckMessage = z.object({ userId: z.string().min(1) });
@Injectable()
export class ControlChannel implements OnModuleDestroy {
  private listener: ((channel: string, message: string) => void) | undefined;
  constructor(
    @Inject(RedisClients) private readonly redis: RedisClients,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
  ) {}
  private get channel(): string {
    return `${this.redis.prefix}:control`;
  }
  async publishRecheck(userId: string): Promise<void> {
    await this.redis.adapterPublisher.ping();
    await this.redis.command.publish(this.channel, JSON.stringify({ userId }));
  }
  async subscribe(handler: (userId: string) => Promise<void>): Promise<void> {
    if (this.listener) throw new Error("제어 채널 구독이 중복된다");
    const listener = (channel: string, message: string) => {
      if (channel !== this.channel) return;
      let data: unknown;
      try {
        data = JSON.parse(message) as unknown;
      } catch {
        this.logger.warn("실시간 재검사 메시지를 읽지 못했다");
        return;
      }
      const parsed = recheckMessage.safeParse(data);
      if (!parsed.success) {
        this.logger.warn("실시간 재검사 메시지가 잘못됐다");
        return;
      }
      void Promise.resolve()
        .then(() => handler(parsed.data.userId))
        .catch(() => {
          this.logger.warn("실시간 재검사를 실행하지 못했다");
        });
    };
    this.listener = listener;
    this.redis.subscriber.on("message", listener);
    try {
      await this.redis.subscriber.subscribe(this.channel);
    } catch (error) {
      this.redis.subscriber.off("message", listener);
      this.listener = undefined;
      throw error;
    }
  }
  async onModuleDestroy(): Promise<void> {
    if (!this.listener) return;
    this.redis.subscriber.off("message", this.listener);
    this.listener = undefined;
    if (this.redis.subscriber.status !== "end")
      await this.redis.subscriber.unsubscribe(this.channel);
  }
}
