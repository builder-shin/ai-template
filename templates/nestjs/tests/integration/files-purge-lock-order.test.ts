import "reflect-metadata";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";
import { FilesService } from "../../src/modules/files/index.js";
import { PostsRepository } from "../../src/modules/posts/index.js";
import { fileFixture } from "./file-fixture.js";
import { getState } from "./state.js";

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}
async function waitingOn(holderPid: number) {
  const until = performance.now() + 5000;
  while (performance.now() < until) {
    const rows = await getState().prisma.$queryRaw<{ blocked: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_locks
        WHERE NOT granted AND ${holderPid} = ANY(pg_blocking_pids(pid))
      ) AS blocked`;
    if (rows[0]?.blocked) return;
    await delay(10);
  }
  throw new Error("이 시험의 표지 잠금 보유자를 기다리는 파일 정리를 관찰하지 못했다");
}
it("시간별 정리는 파일 행을 id 오름차순으로 잠가 표지 교체와 교착하지 않는다", async () => {
  // fileFixture는 createApp에 true를 명시하여 실제 CI 인프라를 사용한다.
  const f = await fileFixture(),
    db = getState().prisma;
  const a = "01900000-0000-7000-8000-00000000000a";
  const b = "01900000-0000-7000-8000-00000000000b";
  await db.file.createMany({
    data: [b, a].map((id) => ({
      id,
      ownerId: f.identity.userId,
      key: "purge-order-" + id,
      filename: "표지.png",
      contentType: "image/png",
      size: 3,
      status: "ready" as const,
      detachedAt: new Date(),
    })),
  });
  const locked = gate(),
    probe = gate(),
    probed = gate(),
    release = gate();
  let holderPid = 0;
  const holder = db.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const row = rows[0];
      if (!row) throw new Error("표지 잠금 연결 PID가 없다");
      holderPid = row.pid;
      await new PostsRepository().lockCovers(tx, [a]);
      locked.open();
      await probe.promise;
      await tx.$queryRaw`SELECT id FROM files WHERE id = ${b}::uuid FOR UPDATE NOWAIT`;
      probed.open();
      await release.promise;
    },
    { timeout: 10000 },
  );
  const purge = Promise.race([locked.promise, holder]).then(() =>
    f.app.get(FilesService).purgePending(),
  );
  const finished = Promise.allSettled([holder, purge]);
  try {
    await Promise.race([locked.promise, holder]);
    await Promise.race([
      waitingOn(holderPid),
      holder,
      purge.then(() => {
        throw new Error("파일 정리가 잠금 대기 없이 끝났다");
      }),
    ]);
    probe.open();
    await Promise.race([probed.promise, holder]);
    release.open();
    await holder;
    await purge;
    expect(await db.file.findMany({ where: { id: { in: [a, b] } } })).toEqual([]);
  } finally {
    probe.open();
    release.open();
    await finished;
  }
});
