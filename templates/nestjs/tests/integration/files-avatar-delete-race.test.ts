import "reflect-metadata";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";
import type { Principal } from "../../src/core/security/principal.js";
import { FilesService } from "../../src/modules/files/index.js";
import { PostsRepository } from "../../src/modules/posts/index.js";
import { UsersRepository } from "../../src/modules/users/index.js";
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
  throw new Error("이 시험의 잠금 보유자를 기다리는 파일 삭제를 관찰하지 못했다");
}
it("아바타 연결과 겹친 파일 삭제는 소유자 잠금을 기다린 뒤 참조를 비운다", async () => {
  const f = await fileFixture(),
    db = getState().prisma,
    users = new UsersRepository();
  const file = await db.file.create({
    data: {
      ownerId: f.identity.userId,
      key: "avatar-delete-race-" + f.identity.userId,
      filename: "아바타.png",
      contentType: "image/png",
      size: 3,
      status: "ready",
    },
  });
  const locked = gate(),
    release = gate();
  let holderPid = 0;
  let attach = false;
  const holder = db.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const row = rows[0];
      if (!row) throw new Error("아바타 연결 잠금의 DB 연결 PID가 없다");
      holderPid = row.pid;
      // Me.update와 같은 사용자 → 파일 잠금 순서로 연결을 시작한다.
      await users.lock(tx, f.identity.userId);
      await users.assertAvatar(tx, f.identity.userId, file.id);
      await users.attachAvatar(tx, file.id);
      locked.open();
      await release.promise;
      if (attach) await users.updateProfile(tx, f.identity.userId, { avatarFileId: file.id });
    },
    { timeout: 10000 },
  );
  let deletion: Promise<void> | undefined;
  try {
    await Promise.race([
      locked.promise,
      holder.then(() => {
        throw new Error("아바타 연결 잠금을 얻지 못했다");
      }),
    ]);
    expect(holderPid).toBeGreaterThan(0);
    deletion = f.app.get(FilesService).delete({ ...f.identity, permissions: new Set() }, file.id);
    await Promise.race([
      waitingOn(holderPid),
      holder.then(() => {
        throw new Error("아바타 연결이 잠금 대기 관찰 전에 끝났다");
      }),
      deletion.then(() => {
        throw new Error("파일 삭제가 잠금 대기 없이 끝났다");
      }),
    ]);
    attach = true;
    release.open();
    await holder;
    await deletion;
    expect(await db.file.findUnique({ where: { id: file.id } })).toBeNull();
    const user = await db.user.findUniqueOrThrow({ where: { id: f.identity.userId } });
    expect(user.avatarFileId).toBeNull();
  } finally {
    release.open();
    await Promise.allSettled([holder, ...(deletion ? [deletion] : [])]);
  }
});
it("표지 연결과 겹친 파일 삭제는 외래 키 잠금과 교착하지 않는다", async () => {
  const f = await fileFixture(),
    db = getState().prisma,
    posts = new PostsRepository(),
    principal: Principal = { ...f.identity, permissions: new Set() };
  const file = await db.file.create({
    data: {
      ownerId: f.identity.userId,
      key: "cover-delete-race-" + f.identity.userId,
      filename: "표지.png",
      contentType: "image/png",
      size: 3,
      status: "ready",
    },
  });
  const locked = gate(),
    release = gate();
  let holderPid = 0;
  let create = false;
  const holder = db.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const row = rows[0];
      if (!row) throw new Error("표지 연결 잠금의 DB 연결 PID가 없다");
      holderPid = row.pid;
      // PostsService.create와 같은 표지 잠금·연결 후 작성자 외래 키를 검사한다.
      await posts.lockCovers(tx, [file.id]);
      await posts.attachCover(tx, principal, file.id);
      locked.open();
      await release.promise;
      if (create)
        return posts.create(tx, {
          authorId: f.identity.userId,
          title: "삭제와 겹친 표지",
          body: "작성자와 파일 소유자가 같은 글",
          status: "draft",
          publishedAt: null,
          coverImageId: file.id,
        });
      return undefined;
    },
    { timeout: 10000 },
  );
  let deletion: Promise<void> | undefined;
  try {
    await Promise.race([
      locked.promise,
      holder.then(() => {
        throw new Error("표지 연결 잠금을 얻지 못했다");
      }),
    ]);
    expect(holderPid).toBeGreaterThan(0);
    deletion = f.app.get(FilesService).delete(principal, file.id);
    await Promise.race([
      waitingOn(holderPid),
      holder.then(() => {
        throw new Error("표지 연결이 잠금 대기 관찰 전에 끝났다");
      }),
      deletion.then(() => {
        throw new Error("파일 삭제가 잠금 대기 없이 끝났다");
      }),
    ]);
    create = true;
    release.open();
    const created = await holder;
    await deletion;
    if (!created) throw new Error("표지를 연결한 글이 생성되지 않았다");
    expect(await db.file.findUnique({ where: { id: file.id } })).toBeNull();
    const post = await db.post.findUniqueOrThrow({ where: { id: created.id } });
    expect(post.coverImageId).toBeNull();
    expect(post.authorId).toBe(f.identity.userId);
  } finally {
    release.open();
    await Promise.allSettled([holder, ...(deletion ? [deletion] : [])]);
  }
});
