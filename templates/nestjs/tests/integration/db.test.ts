import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, it } from "vitest";
import { PrismaService } from "../../src/core/db/prisma.service.js";
import { UnitOfWork } from "../../src/core/db/unit-of-work.js";
import { advisoryXactLock } from "../../src/core/db/locks.js";
import { getState, resetState } from "./state.js";

const others: PrismaService[] = [];
afterEach(async () => {
  await Promise.all(others.splice(0).map((db) => db.$disconnect()));
});
function second() {
  const db = new PrismaService(getState().settings);
  others.push(db);
  return db;
}
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function waitForBlocked(pid: number) {
  const db = getState().prisma;
  const until = performance.now() + 5000;
  while (performance.now() < until) {
    const rows = await db.$queryRaw<
      { waiting: boolean }[]
    >`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid = ${pid} AND NOT granted) AS waiting`;
    if (rows[0]?.waiting) return;
    await delay(10);
  }
  throw new Error("두 번째 연결의 잠금 대기를 관찰하지 못했다");
}
it("실제 commit 뒤에 저장 결과를 보며 훅을 순서대로 기다린다", async () => {
  const db = getState().prisma,
    observer = second(),
    order: string[] = [];
  const result = await new UnitOfWork(db).run(async (tx, afterCommit) => {
    const user = await tx.user.create({ data: { email: "commit@example.com" } });
    afterCommit(async () => {
      expect(await observer.user.findUnique({ where: { id: user.id } })).not.toBeNull();
      order.push("a");
    });
    afterCommit(() => {
      order.push("b");
    });
    return user.id;
  });
  expect(await db.user.findUnique({ where: { id: result } })).not.toBeNull();
  expect(order).toEqual(["a", "b"]);
});
it("실제 rollback은 쓰기와 등록한 훅을 버린다", async () => {
  const db = getState().prisma,
    error = new Error("취소"),
    hooks: string[] = [];
  await expect(
    new UnitOfWork(db).run(async (tx, afterCommit) => {
      await tx.user.create({ data: { email: "rollback@example.com" } });
      afterCommit(() => {
        hooks.push("실행하면 안 된다");
      });
      throw error;
    }),
  ).rejects.toBe(error);
  expect(await db.user.count()).toBe(0);
  expect(hooks).toEqual([]);
});
it("같은 advisory 키의 두 번째 연결은 첫 commit까지 대기한다", async () => {
  const db = getState().prisma,
    other = second(),
    acquired = gate(),
    release = gate(),
    attempted = gate();
  let pid = 0;
  const order: string[] = [];
  let releasedAt: number,
    secondAt = 0;
  const first = db.$transaction(
    async (tx) => {
      await advisoryXactLock(tx, "role:admin");
      order.push("첫 잠금");
      acquired.resolve();
      await release.promise;
    },
    { timeout: 10000 },
  );
  await acquired.promise;
  const next = other.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const row = rows[0];
      if (!row) throw new Error("연결 PID가 없다");
      pid = row.pid;
      attempted.resolve();
      await advisoryXactLock(tx, "role:admin");
      secondAt = performance.now();
      order.push("둘째 잠금");
    },
    { timeout: 10000 },
  );
  try {
    await attempted.promise;
    await waitForBlocked(pid);
    expect(order).toEqual(["첫 잠금"]);
    releasedAt = performance.now();
    release.resolve();
    await Promise.all([first, next]);
    expect(order).toEqual(["첫 잠금", "둘째 잠금"]);
    expect(secondAt).toBeGreaterThanOrEqual(releasedAt);
  } finally {
    release.resolve();
    await Promise.allSettled([first, next]);
  }
});
it("FOR UPDATE는 두 번째 갱신을 첫 commit까지 기다리게 한다", async () => {
  const db = getState().prisma,
    other = second(),
    user = await db.user.create({ data: { email: "lock@example.com" } });
  const locked = gate(),
    release = gate(),
    attempted = gate();
  let pid = 0,
    updated = false;
  const first = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      locked.resolve();
      await release.promise;
      await tx.user.update({ where: { id: user.id }, data: { name: "첫 변경" } });
    },
    { timeout: 10000 },
  );
  await locked.promise;
  const next = other.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const row = rows[0];
      if (!row) throw new Error("연결 PID가 없다");
      pid = row.pid;
      attempted.resolve();
      await tx.user.update({ where: { id: user.id }, data: { name: "둘째 변경" } });
      updated = true;
    },
    { timeout: 10000 },
  );
  try {
    await attempted.promise;
    await waitForBlocked(pid);
    expect(updated).toBe(false);
    release.resolve();
    await Promise.all([first, next]);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe("둘째 변경");
  } finally {
    release.resolve();
    await Promise.allSettled([first, next]);
  }
});
it("resetState는 계정·역할·감사 표와 시험 Redis 키를 비운다", async () => {
  const { prisma: db, redis } = getState();
  const user = await db.user.create({ data: { email: "reset@example.com" } });
  const role = await db.role.create({ data: { name: "reader", permissions: ["posts.read"] } });
  await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  await db.auditLog.create({ data: { actorUserId: user.id, action: "test.reset", meta: {} } });
  await redis.command.set(redis.key("marker"), "시험");
  await resetState();
  expect(
    await Promise.all([db.user.count(), db.role.count(), db.userRole.count(), db.auditLog.count()]),
  ).toEqual([0, 0, 0, 0]);
  expect(await redis.command.get(redis.key("marker"))).toBeNull();
  const migrations = await db.$queryRaw<
    { count: bigint }[]
  >`SELECT COUNT(*) AS count FROM _prisma_migrations`;
  expect(migrations[0]?.count).toBeGreaterThan(0n);
});
