import { expect, it, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import { domainSuite, app } from "../domain-helpers.js";
import { post, db, settings } from "../helpers.js";
import { Child, waitFor } from "../processes.js";
import { JobQueue } from "../../../src/core/jobs/queue.js";
import { RedisClients } from "../../../src/core/redis/clients.js";
import { digest } from "../../../src/core/security/tokens.js";
domainSuite("jobs");
let child: Child | undefined;
const observations: unknown[] = [];
async function chaos(fail: boolean) {
  const response = await fetch(`${settings.MAILPIT_URL}/api/v1/chaos`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fail ? { Sender: { ErrorCode: 451, Probability: 100 } } : {}),
  });
  expect(response.ok).toBe(true);
}
async function startWorker() {
  await app.get(JobQueue).stopWorker();
  child = await Child.start("worker");
  return child;
}
async function mail(email: string) {
  const list = await fetch(
    `${settings.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
  );
  const body = (await list.json()) as { messages: { ID: string }[] };
  const first = body.messages[0];
  return first
    ? ((await (await fetch(`${settings.MAILPIT_URL}/api/v1/message/${first.ID}`)).json()) as {
        Text: string;
        HTML: string;
        Subject: string;
      })
    : null;
}
async function signup(locale = "en") {
  const email = `${locale}@example.com`;
  const response = await post("registrations", {
    email,
    password: "correct horse", // betterleaks:allow - public test password
    name: "A < B",
    locale,
  });
  expect(response.status).toBe(201);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  return user;
}
afterEach(async () => {
  await chaos(false);
  if (child) {
    const pid = child.pid;
    const clientList = await app.get(RedisClients).command.client("LIST");
    await child.close();
    expect(child.messages.find((m) => m.type === "closed")).toMatchObject({ warnings: [] });
    const remaining = await app.get(RedisClients).command.client("LIST");
    expect(String(remaining)).not.toContain(`:${String(pid)}:`);
    observations.push({
      workerPid: pid,
      connections: String(clientList)
        .split("\n")
        .filter((line) => line.includes(`:${String(pid)}:`)).length,
      messages: child.messages,
    });
    child = undefined;
  }
  writeFileSync(".cache/integration/jobs-evidence.json", JSON.stringify(observations, null, 2));
});
it("sends ko/en verification links from the real worker and consumes the mailed tokens", async () => {
  await startWorker();
  for (const locale of ["ko", "en"]) {
    const user = await signup(locale);
    const received = await waitFor(
      () => mail(user.email ?? ""),
      (value) => value !== null,
    );
    if (!received) throw new Error("Missing mail.");
    expect(received.Text).toContain(`${settings.FRONTEND_URL}/verify-email?token=`);
    expect(received.HTML).toContain("A &lt; B");
    expect(received.Subject).toContain(locale === "en" ? "Verify" : "인증");
    const token = /token=([A-Za-z0-9_-]{43})/.exec(received.Text)?.[1];
    expect(token).toBeDefined();
    expect((await post("email-verifications", { token })).status).toBe(201);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt,
    ).not.toBeNull();
  }
});
it("retries real SMTP chaos with a new committed token and retains only id data then removes success", async () => {
  const worker = await startWorker();
  await chaos(true);
  const user = await signup();
  const queue = app.get(JobQueue).queue;
  const delayed = await waitFor(
    () => queue.getJobs(["delayed"]),
    (jobs) => jobs.length === 1,
  );
  const job = delayed[0];
  if (!job?.id) throw new Error("Missing delayed mail job.");
  expect(job.attemptsMade).toBe(1);
  expect(job.delay).toBeGreaterThanOrEqual(5000);
  expect(job.delay).toBeLessThanOrEqual(6000);
  const redis = app.get(RedisClients);
  const raw = await redis.command.hget(`${redis.prefix}:bull:jobs:${job.id}`, "data");
  expect(JSON.parse(raw ?? "null")).toEqual({ id: user.id });
  expect(raw).not.toContain(user.email);
  const initial = await db.accountToken.findMany({ where: { userId: user.id } });
  expect(initial).toHaveLength(1);
  await chaos(false);
  await waitFor(
    () => mail(user.email ?? ""),
    (value) => value !== null,
    10000,
  );
  await waitFor(
    () => queue.getJob(job.id ?? ""),
    (value) => value === undefined,
  );
  const attempts = worker.messages.filter((m) => m.type === "attempt" && m.id === job.id);
  expect(attempts).toHaveLength(2);
  const elapsed = Number(attempts[1]?.at) - Number(attempts[0]?.at);
  expect(elapsed).toBeGreaterThanOrEqual(job.delay);
  expect(elapsed).toBeLessThan(job.delay + 2000);
  const tokens = await db.accountToken.findMany({ where: { userId: user.id } });
  expect(tokens).toHaveLength(2);
  expect(new Set(tokens.map((t) => t.tokenHash)).size).toBe(2);
  const received = await mail(user.email ?? "");
  const token = /token=([A-Za-z0-9_-]{43})/.exec(received?.Text ?? "")?.[1] ?? "";
  expect(tokens.some((t) => t.tokenHash === digest(token))).toBe(true);
  expect(initial[0]?.tokenHash).not.toBe(digest(token));
  observations.push({
    selectedDelayMs: job.delay,
    elapsedMs: elapsed,
    tokenCount: tokens.length,
    distinctTokens: true,
    rawJobData: JSON.parse(raw ?? "null") as unknown,
    removedOnComplete: true,
  });
});
it("exhausts exactly five real SMTP attempts with linear delay and fresh tokens", async () => {
  const worker = await startWorker();
  await chaos(true);
  const user = await signup();
  const queue = app.get(JobQueue).queue;
  const failed = await waitFor(
    () => queue.getJobs(["failed"]),
    (jobs) => jobs.length === 1,
    75000,
  );
  const job = failed[0];
  if (!job) throw new Error("Missing failed job.");
  expect(job.attemptsMade).toBe(5);
  const attempts = worker.messages.filter((m) => m.type === "attempt" && m.id === job.id);
  expect(attempts.map((m) => m.attempt)).toEqual([1, 2, 3, 4, 5]);
  const delays = attempts.slice(1).map((m, i) => Number(m.at) - Number(attempts[i]?.at));
  delays.forEach((delay, i) => {
    expect(delay).toBeGreaterThanOrEqual((i + 1) * 5000);
    expect(delay).toBeLessThan((i + 1) * 5000 + 3000);
  });
  const selected = worker.messages.filter((m) => m.type === "backoff" && m.id === job.id);
  expect(selected).toHaveLength(4);
  selected.forEach((backoff, i) => {
    expect(backoff.attemptsMade).toBe(i + 1);
    expect(Number(backoff.delay)).toBeGreaterThanOrEqual((i + 1) * 5000);
    expect(Number(backoff.delay)).toBeLessThanOrEqual((i + 1) * 5000 + 1000);
    expect(delays[i]).toBeGreaterThanOrEqual(Number(backoff.delay));
  });
  const issued = await db.accountToken.findMany({ where: { userId: user.id } });
  expect(issued).toHaveLength(5);
  expect(new Set(issued.map((t) => t.tokenHash)).size).toBe(5);
  expect(job.data).toEqual({ id: user.id });
  expect(await mail(user.email ?? "")).toBeNull();
  observations.push({
    attempts: 5,
    actualDelaysMs: delays,
    selectedBackoffs: selected,
    distinctTokens: 5,
    terminalState: await job.getState(),
  });
}, 90000);
it("deduplicates upsertJobScheduler registration and executions from two scheduler processes", async () => {
  const worker = await startWorker();
  const first = await Child.start("scheduler");
  let second: Child | undefined;
  try {
    second = await Child.start("scheduler");
    const queue = app.get(JobQueue).queue;
    await waitFor(
      () => worker.messages.filter((m) => m.type === "tick"),
      (ticks) => ticks.length >= 3,
    );
    expect(await queue.getJobSchedulersCount()).toBe(1);
    const ticks = worker.messages.filter(
      (m) => m.type === "attempt" && m.name === "realtime.scheduler_tick",
    );
    expect(new Set(ticks.map((m) => m.id)).size).toBe(ticks.length);
    const slots = ticks.map((m) => Math.floor(Number(String(m.id).split(":").at(-1)) / 1000));
    expect(slots.every(Number.isFinite)).toBe(true);
    expect(new Set(slots).size).toBe(slots.length);
    observations.push({
      schedulerPids: [first.pid, second.pid],
      registeredSchedulers: 1,
      executions: ticks,
      operationalDecision: "one scheduler",
    });
  } finally {
    await second?.close();
    await first.close();
  }
});
