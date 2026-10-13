import type { Redis } from "ioredis";
export interface WindowResult {
  readonly allowed: boolean;
  readonly count: number;
  readonly retryAfter: number;
}
const WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1], 'NX')
return {count, redis.call('TTL', KEYS[1])}
`;

export async function hitWindow(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<WindowResult> {
  const [count, ttl] = (await redis.eval(WINDOW_SCRIPT, 1, key, windowSeconds)) as [number, number];
  return { allowed: count <= limit, count, retryAfter: Math.max(1, ttl) };
}
