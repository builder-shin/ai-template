import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { AfterCommit } from "../../core/db/unit-of-work.js";
import { RealtimePublisher } from "../../core/realtime/publisher.js";
import { defineRealtimeEvent } from "../../core/realtime/declarations.js";
type Changed = readonly ("roles" | "status" | "profile")[];
type Listener = (afterCommit: AfterCommit, userId: string, changed: Changed) => void;
const listeners = new Set<Listener>();
defineRealtimeEvent({
  name: "me.updated",
  rooms: ["user:{userId}"],
  payload: "UserMeUpdatedEventDocument",
});
export function publishMeUpdated(afterCommit: AfterCommit, userId: string, changed: Changed): void {
  if (!changed.length) return;
  const snapshot = [...new Set(changed)];
  for (const listener of listeners) listener(afterCommit, userId, snapshot);
}
@Injectable()
export class MeRealtimeBridge implements OnModuleDestroy {
  private listener: Listener | undefined;
  constructor(@Inject(RealtimePublisher) private readonly publisher: RealtimePublisher) {}
  register(): void {
    if (this.listener) return;
    this.listener = (afterCommit, userId, changed) => {
      this.publisher.queue(afterCommit, "me.updated", ["user:" + userId], () => ({
        meta: { changed },
      }));
    };
    listeners.add(this.listener);
  }
  onModuleDestroy(): void {
    if (this.listener) listeners.delete(this.listener);
    this.listener = undefined;
  }
}
