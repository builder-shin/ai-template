import { vi } from "vitest";
import type { Redis } from "ioredis";
import type { Request } from "express";
import type { RedisClients } from "../../redis/clients.js";
export function store(result: readonly number[] = [1, 60]) {
  const evalCommand = vi.fn<Redis["eval"]>().mockResolvedValue(result);
  const redis = { eval: evalCommand } as unknown as Redis;
  const clients = {
    command: redis,
    key: (...parts: readonly string[]) => ["aitpl:15", ...parts].join(":"),
  } as RedisClients;
  return { evalCommand, redis, clients };
}
export function incoming(
  path = "/api/v1/posts",
  remoteAddress = "203.0.113.9",
  forwardedFor?: string,
): Request {
  return {
    path,
    socket: { remoteAddress },
    headers: { "x-forwarded-for": forwardedFor },
  } as unknown as Request;
}
