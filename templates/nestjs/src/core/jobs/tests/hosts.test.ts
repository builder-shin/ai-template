import { afterEach, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
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
  upserts: [] as unknown[][],
  failed: undefined as
    ((job: { name: string; attemptsMade: number } | undefined, error: Error) => void) | undefined,
  closed: 0,
  readyFailure: undefined as Error | undefined,
}));
vi.mock("bullmq", () => ({
  Queue: class {
    constructor(_name: string, options: typeof boundary.queueOptions) {
      boundary.queueOptions = options;
    }
    upsertJobScheduler(name: string, repeat: unknown, template: unknown) {
      boundary.upserts.push([name, repeat, template]);
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
    on(event: string, listener: unknown) {
      if (event === "failed") boundary.failed = listener as typeof boundary.failed;
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
  boundary.upserts.length = 0;
  boundary.failed = undefined;
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
it("미지원 backoff를 조용히 다른 방식으로 처리하지 않는다", async () => {
  await new WorkerHost(new JobQueue(redis)).start();
  expect(() => boundary.workerOptions?.settings.backoffStrategy(1, "foreign")).toThrow(
    "재시도 방식이 없다: foreign",
  );
});
it("네 번째 실패는 조용하고 다섯 번째 실패만 최종 실패를 기록한다", async () => {
  const log = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
  const failure = new Error("시험 발송 실패");
  try {
    await new WorkerHost(new JobQueue(redis)).start();
    boundary.failed?.({ name: "test.final_failure", attemptsMade: 4 }, failure);
    expect(log).not.toHaveBeenCalled();
    boundary.failed?.({ name: "test.final_failure", attemptsMade: 5 }, failure);
    expect(log.mock.calls).toEqual([["잡 최종 실패: test.final_failure", failure]]);
  } finally {
    log.mockRestore();
  }
});
it("주기 선언을 UTC와 id 전용 템플릿으로 scheduler에 전달한다", async () => {
  const periodic = { name: "test.periodic" as const, pattern: "0 * * * *", tz: "UTC" as const };
  registerPeriodic(periodic);
  registerPeriodic(periodic);
  const host = new SchedulerHost(new JobQueue(redis));
  await host.start();
  await host.start();
  const expected = [
    "test.periodic",
    { pattern: "0 * * * *", tz: "UTC" },
    {
      name: "test.periodic",
      data: { id: "test.periodic" },
      opts: { attempts: 5, backoff: { type: "aitpl" }, removeOnComplete: true },
    },
  ];
  expect(boundary.upserts).toHaveLength(2);
  expect(boundary.upserts).toEqual([expected, expected]);
});
