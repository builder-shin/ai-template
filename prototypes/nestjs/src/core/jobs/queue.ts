import { Injectable } from "@nestjs/common";
import type { AfterCommit } from "../db/unit-of-work.js";
/** Prototype in-process broker; a production queue is Task 5. */
@Injectable()
export class JobQueue {
  private readonly handlers = new Map<string, (payload: { id: string }) => Promise<void>>();
  register(name: string, handler: (payload: { id: string }) => Promise<void>): void {
    this.handlers.set(name, handler);
  }
  enqueueAfterCommit(afterCommit: AfterCommit, name: string, payload: { id: string }): void {
    afterCommit(async () => {
      const handler = this.handlers.get(name);
      if (!handler) throw new Error(`Unknown job: ${name}`);
      await handler(payload);
    });
  }
}
