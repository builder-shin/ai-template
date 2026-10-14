import { Inject, Injectable } from "@nestjs/common";
import type { Server } from "socket.io";
import type { AfterCommit } from "../db/unit-of-work.js";
import { RedisClients } from "../redis/clients.js";
import { RealtimeEmitter } from "./emitter.js";
import type { RealtimeEventName } from "./declarations.js";
export abstract class RealtimePublisher {
  abstract queue(
    afterCommit: AfterCommit,
    name: RealtimeEventName,
    rooms: readonly string[],
    payload: () => unknown,
  ): void;
}
@Injectable()
export class RuntimeRealtimePublisher extends RealtimePublisher {
  private server: Server | undefined;
  private readonly emitter: RealtimeEmitter;
  constructor(@Inject(RedisClients) private readonly redis: RedisClients) {
    super();
    this.emitter = new RealtimeEmitter(redis.adapterPublisher, redis.prefix);
  }
  bind(server: Server): void {
    this.server = server;
  }
  queue(
    afterCommit: AfterCommit,
    name: RealtimeEventName,
    rooms: readonly string[],
    payload: () => unknown,
  ): void {
    if (!rooms.length) return;
    const targets = [...rooms];
    afterCommit(async () => {
      const value = await payload();
      if (this.server) {
        this.server.to(targets).emit(name, value);
        await this.redis.adapterPublisher.ping();
      } else await this.emitter.publish(name, targets, value);
    });
  }
}
