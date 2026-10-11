import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { api, db } from "../helpers.js";
import { domainSuite, actor, createPost, uploaded, app } from "../domain-helpers.js";
import { PostsRepository } from "../../../src/modules/posts/repository.js";
import { PostCollectionDocument } from "../../../src/modules/posts/index.js";
import type { Tx } from "../../../src/core/db/unit-of-work.js";
domainSuite("posts-query");
it("counts actual SQL for page1 and page20 with identical author/cover include paths and no N+1", async () => {
  const owner = await actor(),
    file = await uploaded(owner.authorization);
  for (let i = 0; i < 20; i++)
    expect(
      (
        await createPost(
          owner.authorization,
          { title: `Post ${String(i)}`, body: "Body", status: "published" },
          file.id,
        )
      ).status,
    ).toBe(201);
  const samples: { pageSize: number; statementCount: number; selects: number; sql: string[] }[] =
    [];
  for (const size of [1, 20]) {
    const sql: string[] = [],
      off = db.observeQueries((event) => {
        sql.push(event.query);
      });
    try {
      const response = await api().get(
        `/api/v1/posts?include=author,coverImage&page[size]=${String(size)}`,
      );
      expect(response.status).toBe(200);
      expect(PostCollectionDocument.parse(response.body).data).toHaveLength(size);
    } finally {
      off();
    }
    const selects = sql.filter((s) => /^SELECT\b/i.test(s.trim())).length;
    expect(selects).toBe(4);
    expect(sql.filter((s) => /FROM\s+"public"\."users"/i.test(s))).toHaveLength(1);
    expect(sql.filter((s) => /FROM\s+"public"\."files"/i.test(s))).toHaveLength(1);
    samples.push({ pageSize: size, statementCount: sql.length, selects, sql });
  }
  expect(samples[0]?.statementCount).toBe(samples[1]?.statementCount);
  mkdirSync(".cache/integration", { recursive: true });
  writeFileSync(
    ".cache/integration/query-count.json",
    JSON.stringify({ actualDatabaseStatements: true, samples }, null, 2),
  );
  console.log(JSON.stringify({ queryCounts: samples }));
});
it("proves PostsService.list actually selects RepeatableRead while another connection commits between count/findMany", async () => {
  const owner = await actor();
  expect(
    (await createPost(owner.authorization, { title: "Before", body: "Body", status: "published" }))
      .status,
  ).toBe(201);
  const repository = app.get(PostsRepository),
    page = repository.page.bind(repository);
  let observation: object = {};
  const boundary = vi.spyOn(repository, "page").mockImplementation(async (tx, query, statuses) => {
    const [isolation] = await tx.$queryRaw<
      { transaction_isolation: string }[]
    >`SHOW transaction_isolation`;
    const [first] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    expect(isolation?.transaction_isolation).toBe("repeatable read");
    // Entered through actual HTTP PostsService.list; the test supplies no isolation options.
    // Only the count boundary is wrapped; count/findMany stay bound to the real service transaction.
    const instrumented = {
      post: {
        count: async (args: Parameters<Tx["post"]["count"]>[0]) => {
          const total = await tx.post.count(args);
          const second = await db.$transaction(async (other) => {
            const [pid] = await other.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
            await other.post.create({
              data: {
                authorId: owner.user.id,
                title: "Concurrent",
                body: "Body",
                status: "published",
                publishedAt: new Date(),
              },
            });
            return pid;
          });
          expect(first?.pid).not.toBe(second?.pid);
          expect(await db.post.count()).toBe(2);
          observation = {
            isolation: isolation?.transaction_isolation,
            readerPid: first?.pid,
            writerPid: second?.pid,
            externallyCommittedRows: 2,
          };
          return total;
        },
        findMany: tx.post.findMany.bind(tx.post),
      },
    } as unknown as Tx;
    return page(instrumented, query, statuses);
  });
  try {
    const response = await api().get("/api/v1/posts");
    expect(response.status).toBe(200);
    const document = PostCollectionDocument.parse(response.body);
    expect(document.meta.page.total).toBe(1);
    expect(document.data).toHaveLength(1);
    expect(document.data[0]?.attributes.title).toBe("Before");
    expect(boundary).toHaveBeenCalledOnce();
    console.log(
      JSON.stringify({
        stableServiceSnapshot: {
          ...observation,
          total: document.meta.page.total,
          pageRows: document.data.length,
        },
      }),
    );
  } finally {
    boundary.mockRestore();
  }
  expect(await db.post.count()).toBe(2);
});
