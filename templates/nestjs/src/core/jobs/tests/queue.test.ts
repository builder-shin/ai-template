import { afterEach, expect, it, vi } from "vitest";
import type { AfterCommit } from "../../db/unit-of-work.js";
import type { RedisClients } from "../../redis/clients.js";
const boundary = vi.hoisted(() => ({ added: [] as unknown[][], closed: 0 }));
vi.mock("bullmq", () => ({
  Queue: class {
    add(...args: unknown[]) {
      boundary.added.push(args);
      return Promise.resolve();
    }
    close() {
      boundary.closed++;
      return Promise.resolve();
    }
  },
}));
import { JobQueue } from "../queue.js";
const redis = { prefix: "aitpl:15", connection: () => ({}) } as unknown as RedisClients;
afterEach(() => {
  boundary.added.length = 0;
  boundary.closed = 0;
});
it("commit 뒤에만 넣고 id만 담으며 실패 기록을 지우지 않는다", async () => {
  const queue = new JobQueue(redis);
  const hooks: (() => Promise<void> | void)[] = [];
  const afterCommit: AfterCommit = (hook) => {
    hooks.push(hook);
  };
  queue.enqueue(afterCommit, "auth.send_verification_mail", { id: "u1" });
  expect(boundary.added).toEqual([]);
  expect(hooks).toHaveLength(1);
  await hooks[0]?.();
  expect(boundary.added).toEqual([
    [
      "auth.send_verification_mail",
      { id: "u1" },
      {
        attempts: 5,
        backoff: { type: "aitpl" },
        removeOnComplete: true,
      },
    ],
  ]);
});
it("등록 시점 id를 고정하고 추가 키를 큐에 넣지 않는다", async () => {
  const queue = new JobQueue(redis);
  const hooks: (() => Promise<void> | void)[] = [];
  const data = { id: "u1", email: "개인정보" };
  queue.enqueue(
    (hook: () => Promise<void> | void) => {
      hooks.push(hook);
    },
    "auth.welcome",
    data,
  );
  data.id = "u2";
  await hooks[0]?.();
  expect(boundary.added[0]?.[1]).toEqual({ id: "u1" });
});
it("앱 종료 때 큐를 닫는다", async () => {
  await new JobQueue(redis).onModuleDestroy();
  expect(boundary.closed).toBe(1);
});
