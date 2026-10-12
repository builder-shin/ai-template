import { Injectable } from "@nestjs/common";
import { Emitter } from "@socket.io/redis-emitter";
import type { Server } from "socket.io";
import { RedisClients } from "../redis/clients.js";
import { RealtimePublisher } from "./publisher.js";
import type { PublishedEvent } from "./publisher.js";
import type { AfterCommit } from "../db/unit-of-work.js";
@Injectable()
export class RuntimeRealtimePublisher extends RealtimePublisher {
  server: Server | undefined;
  observer?: (event: PublishedEvent) => void;
  constructor(private readonly redis: RedisClients) {
    super();
  }
  queue(
    afterCommit: AfterCommit,
    name: string,
    rooms: readonly string[],
    payloadFn: () => unknown,
  ): void {
    const targets = [...new Set(rooms)];
    if (!targets.length) return;
    afterCommit(async () => {
      const payload: unknown = await payloadFn();
      this.observer?.({ name, rooms: targets, payload });
      if (this.server) {
        this.server.to(targets).emit(name, payload);
        await this.redis.adapterPublisher.ping();
      } else {
        // Emitter.emit returns true; observe the Redis Promise at its publish port.
        await new Promise<void>((resolve, reject) => {
          new Emitter(
            {
              publish: (channel: string, message: Buffer) =>
                this.redis.command.publish(channel, message).then(() => {
                  resolve();
                }, reject),
            },
            { key: `${this.redis.prefix}:socket.io` },
          )
            .to(targets)
            .emit(name, payload);
        });
      }
    });
  }
}
