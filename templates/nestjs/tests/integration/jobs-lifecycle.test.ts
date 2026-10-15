import { expect, it, vi } from "vitest";
import { worker } from "../../src/worker.js";
import { scheduler } from "../../src/scheduler.js";
import { JobQueue } from "../../src/core/jobs/queue.js";
import { WorkerHost } from "../../src/core/jobs/worker-host.js";
import { UnitOfWork } from "../../src/core/db/unit-of-work.js";
import { RedisClients } from "../../src/core/redis/clients.js";
import { registerJob } from "../../src/modules/registry.js";
import { getState } from "./state.js";

function isolateEnvironment() {
  const settings = getState().settings;
  for (const [key, value] of Object.entries({
    DATABASE_URL: settings.DATABASE_URL,
    REDIS_URL: settings.REDIS_URL,
    APP_ENV: "test",
  }))
    vi.stubEnv(key, value);
  return () => {
    vi.unstubAllEnvs();
  };
}
it("실제 worker 컨텍스트는 진행 중 잡의 PostgreSQL commit과 Redis 기록 뒤에 닫힌다", async () => {
  const restore = isolateEnvironment();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const app = await worker();
  let started = false;
  const redis = app.get(RedisClients);
  const key = redis.key("task20", "completed");
  registerJob("test.lifecycle", async () => {
    started = true;
    await gate;
    await app
      .get(UnitOfWork)
      .run((tx) =>
        tx.user.create({ data: { email: "lifecycle@example.test", name: "종료 전 commit" } }),
      );
    await redis.command.set(key, "done");
  });
  try {
    expect(app.get(WorkerHost).worker).toBeDefined();
    const job = await app
      .get(JobQueue)
      .queue.add("test.lifecycle", { id: "lifecycle" }, { removeOnComplete: false });
    if (!job.id) throw new Error("잡 식별자가 없다");
    await expect.poll(() => started, { timeout: 10000 }).toBe(true);
    let closed = false;
    const closing = app.close().then(() => {
      closed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(closed).toBe(false);
    release();
    await closing;
    const state = getState();
    expect(
      await state.prisma.user.findUnique({ where: { email: "lifecycle@example.test" } }),
    ).not.toBeNull();
    expect(await state.redis.command.get(key)).toBe("done");
    expect(
      await state.redis.command.hget(
        `${app.get(JobQueue).prefix}:${app.get(JobQueue).name}:${job.id}`,
        "finishedOn",
      ),
    ).not.toBeNull();
    expect(redis.connection("bullmq").status).toBe("end");
  } finally {
    release();
    await app.close();
    restore();
  }
});
it("실제 scheduler 컨텍스트는 두 도메인 주기 작업을 등록한 뒤 닫힌다", async () => {
  const restore = isolateEnvironment();
  const app = await scheduler();
  try {
    expect((await app.get(JobQueue).queue.getJobSchedulers()).map((job) => job.name)).toEqual(
      expect.arrayContaining(["auth.purge_expired", "files.purge_pending"]),
    );
  } finally {
    await app.close();
    restore();
  }
});
