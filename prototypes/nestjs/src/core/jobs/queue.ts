import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import { RedisClients } from "../redis/clients.js";
import type { AfterCommit } from "../db/unit-of-work.js";
import { linearBackoff, jobOptions } from "./backoff.js";
export interface JobData {
  id: string;
}
@Injectable()
export class JobQueue implements OnModuleDestroy {
  private readonly logger = new Logger(JobQueue.name);
  private readonly handlers = new Map<string, (payload: JobData) => Promise<void>>();
  backoffObserver?: (observation: {
    id: string | undefined;
    attemptsMade: number;
    delay: number;
    at: number;
  }) => void;
  private queueInstance?: Queue<JobData>;
  private worker: Worker<JobData> | undefined;
  constructor(private readonly redis: RedisClients) {}
  get queue(): Queue<JobData> {
    if (!this.queueInstance) {
      this.queueInstance = new Queue<JobData>("jobs", {
        connection: this.redis.bullmq,
        prefix: `${this.redis.prefix}:bull`,
        defaultJobOptions: jobOptions,
      });
      this.queueInstance.on("error", () => {
        this.logger.error("Job queue unavailable.");
      });
    }
    return this.queueInstance;
  }
  register(name: string, handler: (payload: JobData) => Promise<void>): void {
    this.handlers.set(name, handler);
  }
  enqueueAfterCommit(afterCommit: AfterCommit, name: string, payload: JobData): void {
    if (!/^[a-z]+\.[a-z_]+$/.test(name) || Object.keys(payload).join() !== "id")
      throw new Error("Jobs require module.verb and id-only data.");
    afterCommit(async () => {
      await this.queue.add(name, { id: payload.id });
    });
  }
  async startWorker(onAttempt?: (job: Job<JobData>) => void): Promise<void> {
    if (this.worker) return;
    this.worker = new Worker<JobData>(
      "jobs",
      async (job) => {
        onAttempt?.(job);
        const handler = this.handlers.get(job.name);
        if (!handler) throw new Error(`Unknown job: ${job.name}`);
        await handler(job.data);
      },
      {
        connection: this.redis.bullmq,
        prefix: `${this.redis.prefix}:bull`,
        maxStartedAttempts: 5,
        settings: {
          backoffStrategy: (attemptsMade, _type, _error, job) => {
            const delay = linearBackoff(attemptsMade);
            this.backoffObserver?.({ id: job?.id, attemptsMade, delay, at: Date.now() });
            return delay;
          },
        },
      },
    );
    this.worker.on("error", () => {
      this.logger.error("Job worker unavailable.");
    });
    await this.worker.waitUntilReady();
  }
  async stopWorker(): Promise<void> {
    await this.worker?.close();
    this.worker = undefined;
  }
  async onModuleDestroy(): Promise<void> {
    await this.stopWorker();
    await this.queueInstance?.close();
  }
}
