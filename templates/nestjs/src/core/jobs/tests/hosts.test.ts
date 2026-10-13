import { afterEach, expect, it, vi } from "vitest";
import type { RedisClients } from "../../redis/clients.js";
import { registerJob, registerPeriodic } from "../../../modules/registry.js";
const boundary = vi.hoisted(() => ({
  queueOptions: undefined as { connection: unknown; prefix: string } | undefined,
  workerOptions: undefined as
    | {
        connection: unknown;
        prefix: string;
        settings: { backoffStrategy: (n: number, type: string) => number };
      }
    | undefined,
  process: undefined as
    | ((job: { name: string; data: { id: string }; attemptsMade: number }) => Promise<void>)
    | undefined,
  schedulers: new Map<string, unknown>(),
  closed: 0,
  readyFailure: undefined as Error | undefined,
}));
vi.mock("bullmq", () => ({
  Queue: class {
    constructor(_name: string, options: typeof boundary.queueOptions) {
      boundary.queueOptions = options;
    }
    upsertJobScheduler(name: string, repeat: unknown, template: unknown) {
      boundary.schedulers.set(name, { repeat, template });
      return Promise.resolve();
    }
    async close() {}
  },
  Worker: class {
    constructor(
      _name: string,
      process: typeof boundary.process,
      options: typeof boundary.workerOptions,
    ) {
      boundary.process = process;
      boundary.workerOptions = options;
    }
    on() {
      return this;
    }
    waitUntilReady() {
      return boundary.readyFailure ? Promise.reject(boundary.readyFailure) : Promise.resolve();
    }
    close() {
      boundary.closed++;
      return Promise.resolve();
    }
  },
}));
import { JobQueue } from "../queue.js";
import { WorkerHost } from "../worker-host.js";
import { SchedulerHost } from "../scheduler-host.js";
const connection = {};
const redis = { prefix: "aitpl:15", connection: () => connection } as unknown as RedisClients;
afterEach(() => {
  boundary.schedulers.clear();
  boundary.closed = 0;
  boundary.process = undefined;
  boundary.readyFailure = undefined;
});
it("worker 연결 준비 실패를 호출자에게 전한다", async () => {
  boundary.readyFailure = new Error("worker 연결 준비 실패");
  await expect(
    Promise.resolve().then(() => new WorkerHost(new JobQueue(redis)).start()),
  ).rejects.toThrow("worker 연결 준비 실패");
});
it("worker와 큐에 같은 연결과 prefix를 넘기고 등록된 처리기에 시도 번호를 전한다", async () => {
  const deliveries: unknown[] = [];
  registerJob("test.dispatch", (data, context) => {
    deliveries.push({ data, context });
    return Promise.resolve();
  });
  const host = new WorkerHost(new JobQueue(redis));
  await host.start();
  expect(boundary.queueOptions).toEqual({ connection, prefix: "aitpl:15:bull" });
  expect(boundary.workerOptions?.connection).toBe(boundary.queueOptions?.connection);
  expect(boundary.workerOptions?.prefix).toBe("aitpl:15:bull");
  await boundary.process?.({ name: "test.dispatch", data: { id: "u1" }, attemptsMade: 3 });
  expect(deliveries).toEqual([{ data: { id: "u1" }, context: { attempt: 4 } }]);
  const delay = boundary.workerOptions?.settings.backoffStrategy(4, "aitpl");
  expect(delay).toBeGreaterThanOrEqual(20000);
  expect(delay).toBeLessThanOrEqual(21000);
  await host.onModuleDestroy();
  expect(boundary.closed).toBe(1);
});
it("처리기 실패를 다시 던져 재시도를 맡긴다", async () => {
  const failure = new Error("발송 실패");
  registerJob("test.failure", () => Promise.reject(failure));
  await new WorkerHost(new JobQueue(redis)).start();
  await expect(
    boundary.process?.({ name: "test.failure", data: { id: "u1" }, attemptsMade: 0 }),
  ).rejects.toBe(failure);
});
it("등록되지 않은 잡을 성공 처리하지 않는다", async () => {
  await new WorkerHost(new JobQueue(redis)).start();
  await expect(
    boundary.process?.({ name: "test.missing", data: { id: "u1" }, attemptsMade: 0 }),
  ).rejects.toThrow("잡 처리기가 없다: test.missing");
});
it("주기 작업을 두 번 선언하고 등록해도 이름별 항목은 하나다", async () => {
  const periodic = { name: "test.periodic" as const, pattern: "0 * * * *", tz: "UTC" as const };
  registerPeriodic(periodic);
  registerPeriodic(periodic);
  const host = new SchedulerHost(new JobQueue(redis));
  await host.start();
  await host.start();
  expect([...boundary.schedulers.entries()]).toEqual([
    [
      "test.periodic",
      {
        repeat: { pattern: "0 * * * *", tz: "UTC" },
        template: {
          name: "test.periodic",
          data: { id: "test.periodic" },
          opts: { attempts: 5, backoff: { type: "aitpl" }, removeOnComplete: true },
        },
      },
    ],
  ]);
});
