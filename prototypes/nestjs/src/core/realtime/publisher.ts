import { Injectable } from "@nestjs/common";
import type { AfterCommit } from "../db/unit-of-work.js";
export interface PublishedEvent {
  name: string;
  rooms: readonly string[];
  payload: unknown;
}
export abstract class RealtimePublisher {
  abstract queue(
    afterCommit: AfterCommit,
    name: string,
    rooms: readonly string[],
    payloadFn: () => unknown,
  ): void;
}
@Injectable()
export class RecordingRealtimePublisher extends RealtimePublisher {
  readonly events: PublishedEvent[] = [];
  queue(
    afterCommit: AfterCommit,
    name: string,
    rooms: readonly string[],
    payloadFn: () => unknown,
  ): void {
    const targets = [...new Set(rooms)];
    if (!targets.length) return;
    afterCommit(async () => {
      this.events.push({ name, rooms: targets, payload: await payloadFn() });
    });
  }
}
