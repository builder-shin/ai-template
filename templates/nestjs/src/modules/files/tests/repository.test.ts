import { expect, it } from "vitest";
import { FilesRepository } from "../index.js";
import type { Tx } from "../../../core/db/unit-of-work.js";
it("파일 삭제의 소유자 잠금은 사용자 갱신과 같은 users 행을 FOR UPDATE로 잠근다", async () => {
  const statements: { strings: readonly string[]; values: unknown[] }[] = [];
  const tx = {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push({ strings: [...strings], values });
      return Promise.resolve([]);
    },
  } as unknown as Tx;
  await new FilesRepository().lockOwner(tx, "01900000-0000-7000-8000-000000000001");
  expect(statements).toEqual([
    {
      strings: ["SELECT id FROM users WHERE id = ", "::uuid FOR UPDATE"],
      values: ["01900000-0000-7000-8000-000000000001"],
    },
  ]);
});
it("사용자 파일 한도는 트랜잭션 advisory 잠금에 묶인다", async () => {
  const statements: { strings: readonly string[]; values: unknown[] }[] = [];
  const tx = {
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push({ strings: [...strings], values });
      return Promise.resolve(1);
    },
  } as unknown as Tx;
  await new FilesRepository().lockQuota(tx, "user-one");
  expect(statements).toEqual([
    {
      strings: ["SELECT pg_advisory_xact_lock(hashtextextended(", ", 0))"],
      values: ["files:quota:user-one"],
    },
  ]);
});
it("DB 합계는 자기 pending과 ready만 센다", async () => {
  let where: unknown;
  const tx = {
    file: {
      aggregate: (input: { where: unknown }) => {
        where = input.where;
        return Promise.resolve({ _sum: { size: 63n } });
      },
    },
  } as unknown as Tx;
  expect(await new FilesRepository().totalSize(tx, "u1")).toBe(63n);
  expect(where).toEqual({ ownerId: "u1", status: { in: ["pending", "ready"] } });
});
it("비어 있는 DB 합계는 0바이트다", async () => {
  const tx = {
    file: { aggregate: () => Promise.resolve({ _sum: { size: null } }) },
  } as unknown as Tx;
  expect(await new FilesRepository().totalSize(tx, "u1")).toBe(0n);
});
it.each([undefined, "01900000-0000-7000-8000-000000000001"])(
  "정리 조회는 오래된 pending과 풀린 파일을 id 순서의 제한된 다음 묶음으로 고른다: %s",
  async (after) => {
    const cutoff = new Date("2026-10-13T01:00:00Z");
    let input: unknown;
    const tx = {
      file: {
        findMany: (args: unknown) => {
          input = args;
          return Promise.resolve([]);
        },
      },
    } as unknown as Tx;
    expect(await new FilesRepository().purgeCandidates(tx, cutoff, 100, after)).toEqual([]);
    expect(input).toEqual({
      where: {
        OR: [{ status: "pending", createdAt: { lt: cutoff } }, { detachedAt: { not: null } }],
        ...(after === undefined ? {} : { id: { gt: after } }),
      },
      orderBy: { id: "asc" },
      take: 100,
    });
  },
);
it("pending 삭제는 현재 상태와 분리 여부와 만료를 같은 조건에서 확인한다", async () => {
  const cutoff = new Date("2026-10-13T01:00:00Z"),
    calls: unknown[] = [];
  let count = 1;
  const tx = {
    file: {
      deleteMany: (input: unknown) => {
        calls.push(input);
        return Promise.resolve({ count });
      },
    },
  } as unknown as Tx;
  const repository = new FilesRepository();
  expect(await repository.deletePending(tx, "f1", cutoff)).toBe(true);
  count = 0;
  expect(await repository.deletePending(tx, "f1", cutoff)).toBe(false);
  expect(calls).toEqual(
    Array.from({ length: 2 }, () => ({
      where: { id: "f1", status: "pending", detachedAt: null, createdAt: { lt: cutoff } },
    })),
  );
});
it("분리 claim은 대소문자가 섞인 UUID도 PostgreSQL 순서로 한 번씩 잠근다", async () => {
  const locked: string[] = [];
  const a = "01900000-0000-7000-8000-00000000000a";
  const b = "01900000-0000-7000-8000-00000000000b";
  const tx = {
    $queryRaw: (_sql: TemplateStringsArray, id: string) => {
      locked.push(id);
      return Promise.resolve([]);
    },
    file: { findUnique: () => Promise.resolve(null) },
  } as unknown as Tx;
  await new FilesRepository().claimDetached(tx, [b.toUpperCase(), a, a.toUpperCase()]);
  expect(locked).toEqual([a, b]);
});
