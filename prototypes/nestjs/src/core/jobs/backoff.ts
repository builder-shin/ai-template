export function linearBackoff(attemptsMade: number, random = Math.random): number {
  return Math.min(attemptsMade * 5000, 60000) + Math.floor(random() * 1001);
}
export const jobOptions = {
  attempts: 5,
  backoff: { type: "linear-jitter" },
  removeOnComplete: true,
} as const;
