import { expect, it, vi } from "vitest";
import { advisoryXactLock } from "../locks.js";
it("잠금은 transaction의 executeRaw에 tagged SQL과 분리한 값을 보낸다", async () => {
  const statements: string[] = [];
  const values: unknown[][] = [];
  const query = vi.fn();
  const tx = {
    $executeRaw: async (parts: TemplateStringsArray, ...parameters: unknown[]) => {
      statements.push(parts.join("$1"));
      values.push(parameters);
      return Promise.resolve(1);
    },
    $queryRaw: query,
  };
  await advisoryXactLock(tx as never, "files:quota:u1");
  expect(statements).toEqual(["SELECT pg_advisory_xact_lock(hashtextextended($1, 0))"]);
  expect(values).toEqual([["files:quota:u1"]]);
  expect(query).not.toHaveBeenCalled();
});
it("악성 문자열도 SQL 구문에 합치지 않는다", async () => {
  let sql = "";
  let bound: unknown[] = [];
  const key = "role:admin'); DROP TABLE users; --";
  await advisoryXactLock(
    {
      $executeRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
        sql = parts.join("$1");
        bound = values;
        return Promise.resolve(1);
      },
    } as never,
    key,
  );
  expect(sql).not.toContain("DROP TABLE");
  expect(bound).toEqual([key]);
});
