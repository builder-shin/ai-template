import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import type { AfterCommit } from "../db/unit-of-work.js";
import { RedisClients } from "../redis/clients.js";
import { JOB_OPTIONS, type JobName } from "./names.js";
@Injectable()
export class JobQueue implements OnModuleDestroy {
  readonly name = "jobs";
  readonly connection;
  readonly prefix: string;
  readonly queue: Queue<{ readonly id: string }, void, JobName>;
  constructor(redis: RedisClients) {
    this.connection = redis.connection("bullmq");
    this.prefix = `${redis.prefix}:bull`;
    this.queue = new Queue(this.name, { connection: this.connection, prefix: this.prefix });
  }
  enqueue(afterCommit: AfterCommit, name: JobName, data: { readonly id: string }): void {
    const payload = { id: data.id };
    afterCommit(async () => {
      await this.queue.add(name, payload, JOB_OPTIONS);
    });
  }
  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
