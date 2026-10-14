import { expect, it } from "vitest";
import { FilesRepository } from "../index.js";
import type { Tx } from "../../../core/db/unit-of-work.js";
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
it("정리 조회는 24시간보다 오래된 pending과 풀린 파일만 고른다", async () => {
  const cutoff = new Date("2026-10-13T01:00:00Z");
  let where: unknown;
  const tx = {
    file: {
      findMany: (input: { where: unknown }) => {
        where = input.where;
        return Promise.resolve([]);
      },
    },
  } as unknown as Tx;
  expect(await new FilesRepository().purgeCandidates(tx, cutoff)).toEqual([]);
  expect(where).toEqual({
    OR: [{ status: "pending", createdAt: { lt: cutoff } }, { detachedAt: { not: null } }],
  });
});
