import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Worker } from "bullmq";
import { retryDelay } from "./backoff.js";
import { JOB_ATTEMPTS, jobHandlers, type JobName } from "./names.js";
import { JobQueue } from "./queue.js";
@Injectable()
export class WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(WorkerHost.name);
  worker: Worker<{ readonly id: string }, void, JobName> | undefined;
  constructor(private readonly jobs: JobQueue) {}
  async start(): Promise<void> {
    this.worker = new Worker(
      this.jobs.name,
      async (job) => {
        const handler = jobHandlers.get(job.name);
        if (!handler) throw new Error(`잡 처리기가 없다: ${job.name}`);
        await handler({ id: job.data.id }, { attempt: job.attemptsMade + 1 });
      },
      {
        connection: this.jobs.connection,
        prefix: this.jobs.prefix,
        settings: {
          backoffStrategy: (attemptsMade, type) => {
            if (type !== "aitpl") throw new Error(`재시도 방식이 없다: ${String(type)}`);
            return retryDelay(attemptsMade);
          },
        },
      },
    );
    this.worker.on("error", (error) => {
      this.logger.error("잡 worker 오류", error);
    });
    this.worker.on("failed", (job, error) => {
      if (job && job.attemptsMade >= JOB_ATTEMPTS)
        this.logger.error(`잡 최종 실패: ${job.name}`, error);
    });
    await this.worker.waitUntilReady();
  }
  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
