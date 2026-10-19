import "reflect-metadata";
import { afterEach, expect, it, vi } from "vitest";
import pg from "pg";
import { PrismaService } from "../../src/core/db/prisma.service.js";
import { UnitOfWork } from "../../src/core/db/unit-of-work.js";
import { PostsRepository, PostsService } from "../../src/modules/posts/index.js";
import { IncludeRegistry } from "../../src/core/jsonapi/include.js";
import { UsersRepository } from "../../src/modules/users/index.js";
import { FilesService } from "../../src/modules/files/index.js";
import { CacheAside } from "../../src/core/cache/cache.js";
import { RedisClients } from "../../src/core/redis/clients.js";
import { RealtimePublisher } from "../../src/core/realtime/publisher.js";
import { parseQuery } from "../../src/core/jsonapi/query.js";
import { listPosts } from "../../src/modules/posts/index.js";
import { adminFixture } from "./admin-fixture.js";
import { getState } from "./state.js";
import { queryObserver } from "./query-observer.js";
const databases: PrismaService[] = [];
const originalQuery = Object.getOwnPropertyDescriptor(pg.Client.prototype, "query")
  ?.value as pg.Client["query"];
const observeQuery = queryObserver(originalQuery);
afterEach(async () => {
  for (const db of databases.splice(0)) await db.$disconnect();
  vi.restoreAllMocks();
});
function observed() {
  const db = new PrismaService(getState().settings);
  databases.push(db);
  const { sql, query } = observeQuery();
  vi.spyOn(pg.Client.prototype, "query").mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- pg.query의 callback·Promise 오버로드와 수신자를 그대로 위임한다
    query,
  );
  return { db, sql };
}
async function fixture() {
  const f = await adminFixture();
  const data = await f.unit.run(async (tx) => {
    const file = await tx.file.create({
      data: {
        ownerId: f.user.id,
        key: "query-cover",
        filename: "표지.png",
        contentType: "image/png",
        size: 3,
        status: "ready",
      },
    });
    await tx.post.createMany({
      data: Array.from({ length: 400 }, (_, index) => ({
        authorId: f.user.id,
        title: String(index).padStart(3, "0"),
        body: "본문",
        status: "published" as const,
        publishedAt: new Date(),
        coverImageId: file.id,
      })),
    });
    return file;
  });
  const includes = new IncludeRegistry();
  includes.register("users", (tx, ids) => new UsersRepository().load(tx, ids));
  const principal = {
    userId: f.user.id,
    sessionId: f.session.id,
    permissions: new Set(["posts:manage"] as const),
  };
  function service(db: object) {
    return new PostsService(
      new UnitOfWork(db as PrismaService),
      new PostsRepository(),
      new CacheAside(f.app.get(RedisClients)),
      includes,
      f.app.get(FilesService),
      f.app.get(RealtimePublisher),
    );
  }
  return { ...f, file: data, principal, service };
}
it("1페이지와 20페이지는 author와 coverImage를 SELECT 네 번과 COMMIT으로 읽는다", async () => {
  const f = await fixture(),
    { db, sql } = observed();
  for (const page of [1, 20]) {
    sql.length = 0;
    const doc = await f
      .service(db)
      .list(
        f.principal,
        parseQuery(`include=author,coverImage&page[number]=${String(page)}`, listPosts.query),
      );
    const statements = JSON.stringify({ page, statements: sql });
    expect(doc.data, statements).toHaveLength(20);
    expect(doc.included, statements).toHaveLength(2);
    const counted = sql.filter((query) => /^(SELECT|COMMIT)\b/iu.test(query));
    expect(
      counted.filter((query) => /^SELECT\b/iu.test(query)),
      statements,
    ).toHaveLength(4);
    expect(counted, statements).toHaveLength(5);
    expect(
      sql.some((query) => /REPEATABLE READ/iu.test(query)),
      statements,
    ).toBe(true);
  }
});
it("다른 연결이 count와 rows 사이에 commit해도 한 목록의 총수와 행은 일관된다", async () => {
  const f = await fixture(),
    { db } = observed(),
    { db: other } = observed();
  let inserted = false,
    insertedId = "";
  const hooked = db.$extends({
    query: {
      post: {
        count: async ({ args, query }) => {
          const count = await query(args);
          if (!inserted) {
            inserted = true;
            insertedId = (
              await other.post.create({
                data: { authorId: f.user.id, title: "000", body: "본문", status: "published" },
              })
            ).id;
          }
          return count;
        },
      },
    },
  });
  const doc = await f
    .service(hooked)
    .list(f.principal, parseQuery("sort=title&page[size]=100", listPosts.query));
  expect(inserted).toBe(true);
  expect(doc.meta.page.total).toBe(400);
  expect(doc.data.map((post) => post.id)).not.toContain(insertedId);
  expect(await other.post.count()).toBe(401);
});
