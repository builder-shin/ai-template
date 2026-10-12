import { Injectable } from "@nestjs/common";
import { JobQueue } from "./queue.js";
@Injectable()
export class Schedulers {
  constructor(private readonly jobs: JobQueue) {}
  async start(): Promise<void> {
    await this.jobs.queue.upsertJobScheduler(
      "prototype-heartbeat",
      { every: 1000 },
      { name: "realtime.scheduler_tick", data: { id: "prototype-heartbeat" } },
    );
  }
}
