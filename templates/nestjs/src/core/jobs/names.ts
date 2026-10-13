import type { JobsOptions } from "bullmq";
export type JobName = `${string}.${string}`;
export const JOB_ATTEMPTS = 5;
export type JobHandler = (
  data: { readonly id: string },
  context: { readonly attempt: number },
) => Promise<void>;
export interface PeriodicJob {
  readonly name: JobName;
  readonly pattern: string;
  readonly tz: "UTC";
}
export const JOB_OPTIONS = {
  attempts: JOB_ATTEMPTS,
  backoff: { type: "aitpl" },
  removeOnComplete: true,
} satisfies JobsOptions;
export const jobHandlers = new Map<JobName, JobHandler>();
export const periodicJobs = new Map<JobName, PeriodicJob>();
export function registerJob(name: JobName, handler: JobHandler): void {
  jobHandlers.set(name, handler);
}
export function registerPeriodic(job: PeriodicJob): void {
  periodicJobs.set(job.name, { ...job });
}
