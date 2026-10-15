import "reflect-metadata";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, it } from "vitest";
import { PrismaService } from "../../src/core/db/prisma.service.js";
import { FilesRepository } from "../../src/modules/files/index.js";
import { PostsRepository } from "../../src/modules/posts/index.js";
import { getState } from "./state.js";
const databases: PrismaService[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) await db.$disconnect();
});
function other() {
  const db = new PrismaService(getState().settings);
  databases.push(db);
  return db;
}
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}
async function waiting(pid: number) {
  const until = performance.now() + 5000;
  while (performance.now() < until) {
    const rows = await getState().prisma.$queryRaw<
      { blocked: boolean }[]
    >`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid = ${pid} AND NOT granted) AS blocked`;
    if (rows[0]?.blocked) return;
    await delay(10);
  }
  throw new Error("파일 행 잠금 대기를 관찰하지 못했다");
}
async function seed() {
  const db = getState().prisma;
  const user = await db.user.create({ data: { email: "file-race@example.test" } });
  const file = await db.file.create({
    data: {
      ownerId: user.id,
      key: "race-cover",
      filename: "표지.png",
      contentType: "image/png",
      size: 3,
      status: "ready",
      detachedAt: new Date(),
    },
  });
  return {
    db,
    user,
    file,
    viewer: { userId: user.id, sessionId: "fixture", permissions: new Set<"posts:create">() },
  };
}
it("재연결이 먼저 파일을 잠그면 정리 claim은 commit 뒤 연결을 확인하고 보존한다", async () => {
  const f = await seed(),
    cleanup = other(),
    files = new FilesRepository(),
    posts = new PostsRepository();
  const locked = gate(),
    release = gate(),
    attempted = gate();
  let pid = 0;
  const bind = f.db.$transaction(
    async (tx) => {
      await posts.lockCovers(tx, [f.file.id]);
      locked.open();
      await release.promise;
      await posts.attachCover(tx, f.viewer, f.file.id);
      await tx.post.create({
        data: { authorId: f.user.id, title: "재연결", body: "본문", coverImageId: f.file.id },
      });
    },
    { timeout: 10000 },
  );
  await locked.promise;
  const claim = cleanup.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const row = rows[0];
      if (!row) throw new Error("DB 연결 PID가 없다");
      pid = row.pid;
      attempted.open();
      return files.claimDetached(tx, [f.file.id]);
    },
    { timeout: 10000 },
  );
  try {
    await attempted.promise;
    await waiting(pid);
    release.open();
    await bind;
    expect(await claim).toEqual([]);
    expect((await f.db.file.findUniqueOrThrow({ where: { id: f.file.id } })).detachedAt).toBeNull();
    expect(await f.db.post.count({ where: { coverImageId: f.file.id } })).toBe(1);
  } finally {
    release.open();
    await Promise.allSettled([bind, claim]);
  }
});
it("정리 claim이 먼저 파일을 지우면 대기한 재연결은 404로 끝난다", async () => {
  const f = await seed(),
    binder = other(),
    files = new FilesRepository(),
    posts = new PostsRepository();
  const claimed = gate(),
    release = gate(),
    attempted = gate();
  let pid = 0;
  const claim = f.db.$transaction(
    async (tx) => {
      const rows = await files.claimDetached(tx, [f.file.id]);
      expect(rows.map((row) => row.key)).toEqual(["race-cover"]);
      claimed.open();
      await release.promise;
    },
    { timeout: 10000 },
  );
  await claimed.promise;
  const bind = binder.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const row = rows[0];
      if (!row) throw new Error("DB 연결 PID가 없다");
      pid = row.pid;
      attempted.open();
      await posts.lockCovers(tx, [f.file.id]);
      await posts.attachCover(tx, f.viewer, f.file.id);
    },
    { timeout: 10000 },
  );
  // 기대한 거절을 즉시 관찰해 PostgreSQL 응답이 빠를 때도 미처리 거절을 남기지 않는다.
  const rejected = expect(bind).rejects.toMatchObject({
    init: { status: 404, code: "resource.not_found" },
  });
  try {
    await attempted.promise;
    await waiting(pid);
    release.open();
    await claim;
    await rejected;
    expect(await f.db.file.findUnique({ where: { id: f.file.id } })).toBeNull();
    expect(await f.db.post.count()).toBe(0);
  } finally {
    release.open();
    await Promise.allSettled([claim, bind, rejected]);
  }
});
