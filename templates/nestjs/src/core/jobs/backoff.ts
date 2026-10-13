export function retryDelay(attemptsMade: number, random: () => number = Math.random): number {
  return Math.min(5000 * attemptsMade, 60000) + Math.floor(random() * 1001);
}
