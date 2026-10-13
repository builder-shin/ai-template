import { Injectable } from "@nestjs/common";
import { JOB_OPTIONS, periodicJobs } from "./names.js";
import { JobQueue } from "./queue.js";
@Injectable()
export class SchedulerHost {
  constructor(private readonly jobs: JobQueue) {}
  async start(): Promise<void> {
    for (const job of periodicJobs.values())
      await this.jobs.queue.upsertJobScheduler(
        job.name,
        { pattern: job.pattern, tz: job.tz },
        {
          name: job.name,
          data: { id: job.name },
          opts: JOB_OPTIONS,
        },
      );
  }
}
