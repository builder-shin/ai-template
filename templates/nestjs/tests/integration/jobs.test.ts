import { performance } from "node:perf_hooks";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { JobQueue } from "../../src/core/jobs/queue.js";
import { WorkerHost } from "../../src/core/jobs/worker-host.js";
import { SchedulerHost } from "../../src/core/jobs/scheduler-host.js";
import { registerJob, registerPeriodic } from "../../src/modules/registry.js";
import { MailSender } from "../../src/core/mail/sender.js";
import type { AfterCommit } from "../../src/core/db/unit-of-work.js";
import { getState } from "./state.js";

it("실패 잡은 처음 포함 다섯 번 실행하고 실측 지연 뒤 최종 failed 기록을 남긴다", async () => {
  const { redis } = getState();
  const queue = new JobQueue(redis);
  const host = new WorkerHost(queue);
  const attempts: { attempt: number; time: number }[] = [];
  const jitter = vi.spyOn(Math, "random").mockReturnValue(0.5);
  registerJob("test.always_fails", (_data, context) => {
    attempts.push({ attempt: context.attempt, time: performance.now() });
    return Promise.reject(new Error("시험 처리기는 늘 실패한다"));
  });
  try {
    await host.start();
    expect(queue.queue.opts.connection).toBe(redis.connection("bullmq"));
    expect(host.worker?.opts.connection).toBe(queue.queue.opts.connection);
    const hooks: (() => Promise<void> | void)[] = [];
    const afterCommit: AfterCommit = (hook) => {
      hooks.push(hook);
    };
    queue.enqueue(afterCommit, "test.always_fails", { id: "u1" });
    expect(attempts).toHaveLength(0);
    await hooks[0]?.();
    await expect
      .poll(() => queue.queue.getFailedCount(), { timeout: 75000, interval: 100 })
      .toBe(1);
    const delays = attempts
      .slice(1)
      .map((entry, index) => entry.time - (attempts[index]?.time ?? 0));
    process.stdout.write(`잡 재시도 실측: ${JSON.stringify({ attempts, delays })}\n`);
    expect(attempts.map(({ attempt }) => attempt)).toEqual([1, 2, 3, 4, 5]);
    expect(delays).toHaveLength(4);
    for (const [index, delay] of delays.entries()) {
      expect(delay).toBeGreaterThanOrEqual(5000 * (index + 1));
      expect(delay).toBeLessThanOrEqual(5000 * (index + 1) + 1000);
    }
    const [failed] = await queue.queue.getFailed();
    expect(await failed?.getState()).toBe("failed");
    expect(failed?.attemptsMade).toBe(5);
    expect(await queue.queue.getDelayedCount()).toBe(0);
  } finally {
    jitter.mockRestore();
    await host.onModuleDestroy();
    await queue.onModuleDestroy();
  }
}, 80000);

it("성공 잡은 완료 뒤 큐에서 지운다", async () => {
  const queue = new JobQueue(getState().redis);
  const host = new WorkerHost(queue);
  const delivered: string[] = [];
  registerJob("test.succeeds", (data) => {
    delivered.push(data.id);
    return Promise.resolve();
  });
  try {
    await host.start();
    const hooks: (() => Promise<void> | void)[] = [];
    queue.enqueue(
      (hook) => {
        hooks.push(hook);
      },
      "test.succeeds",
      { id: "u2" },
    );
    await hooks[0]?.();
    await expect.poll(() => delivered).toEqual(["u2"]);
    await expect.poll(() => queue.queue.getJobs(["wait", "active", "completed"])).toEqual([]);
  } finally {
    await host.onModuleDestroy();
    await queue.onModuleDestroy();
  }
});

it("주기 작업을 두 번 등록해도 scheduler 항목은 하나다", async () => {
  const queue = new JobQueue(getState().redis);
  const host = new SchedulerHost(queue);
  registerPeriodic({ name: "test.periodic", pattern: "0 0 1 1 *", tz: "UTC" });
  registerPeriodic({ name: "test.periodic", pattern: "0 0 1 1 *", tz: "UTC" });
  try {
    await host.start();
    await host.start();
    const schedulers = await queue.queue.getJobSchedulers();
    expect(schedulers).toHaveLength(1);
    expect(schedulers[0]).toMatchObject({ key: "test.periodic", pattern: "0 0 1 1 *", tz: "UTC" });
  } finally {
    await queue.onModuleDestroy();
  }
});

it("SMTP로 보낸 제목과 텍스트와 HTML이 Mailpit에 도착한다", async () => {
  const { settings, mailpitUrl } = getState();
  await new MailSender(settings).send({
    to: "recipient@example.test",
    subject: "잡 메일 시험",
    text: "텍스트 본문",
    html: "<p>HTML 본문</p>",
  });
  const listing = z.object({
    messages: z.array(z.object({ ID: z.string(), Subject: z.string() })),
  });
  const response = await fetch(`${mailpitUrl}/api/v1/messages`, {
    signal: AbortSignal.timeout(5000),
  });
  expect(response.ok).toBe(true);
  const messages = listing.parse(await response.json()).messages;
  expect(messages).toHaveLength(1);
  expect(messages[0]?.Subject).toBe("잡 메일 시험");
  const detail = await fetch(`${mailpitUrl}/api/v1/message/${messages[0]?.ID ?? ""}`, {
    signal: AbortSignal.timeout(5000),
  });
  expect(detail.ok).toBe(true);
  expect(z.object({ Text: z.string(), HTML: z.string() }).parse(await detail.json())).toEqual({
    Text: "텍스트 본문",
    HTML: "<p>HTML 본문</p>",
  });
});
