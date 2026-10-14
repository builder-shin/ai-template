import { expect, it } from "vitest";
import type { Tx } from "../../../core/db/unit-of-work.js";
import { AuthRepository } from "../index.js";
it("토큰 소비는 사용자별 잠금을 잡고 유효한 인증 토큰만 DELETE RETURNING으로 지운다", async () => {
  const statements: { sql: string; values: unknown[] }[] = [];
  const now = new Date("2026-10-14T01:00:00Z");
  const tx = {
    verificationToken: {
      findUnique: (query: unknown) => {
        expect(query).toEqual({ where: { tokenHash: "hash-fixture" } });
        return Promise.resolve({ userId: "user-fixture", purpose: "verification" });
      },
    },
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push({ sql: strings.join("?"), values });
      return Promise.resolve(1);
    },
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push({ sql: strings.join("?"), values });
      return Promise.resolve([{ id: "token-id", userId: "user-fixture" }]);
    },
  } as unknown as Tx;
  expect(await new AuthRepository().consumeVerification(tx, "hash-fixture", now)).toEqual({
    id: "token-id",
    userId: "user-fixture",
  });
  expect(statements[0]).toEqual({
    sql: "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
    values: ["auth:verification:user-fixture"],
  });
  expect(statements[1]?.sql.replace(/\s+/g, " ").trim()).toBe(
    'DELETE FROM verification_tokens WHERE token_hash = ? AND purpose = ?::"TokenPurpose" AND expires_at > ? RETURNING id, user_id AS "userId"',
  );
  expect(statements[1]?.values).toEqual(["hash-fixture", "verification", now]);
});
it("만료되거나 동시에 소비한 토큰의 빈 DELETE 결과는 성공으로 바꾸지 않는다", async () => {
  const tx = {
    verificationToken: {
      findUnique: () => Promise.resolve({ userId: "user", purpose: "verification" }),
    },
    $executeRaw: () => Promise.resolve(1),
    $queryRaw: () => Promise.resolve([]),
  } as unknown as Tx;
  expect(await new AuthRepository().consumeVerification(tx, "hash", new Date())).toBeUndefined();
});
it("인증 토큰을 교체해도 같은 사용자의 재설정 토큰은 지우지 않는다", async () => {
  const queries: unknown[] = [];
  const expiresAt = new Date("2026-10-15T01:00:00Z");
  const tx = {
    verificationToken: {
      deleteMany: (query: unknown) => {
        queries.push(query);
        return Promise.resolve({ count: 1 });
      },
      create: (query: unknown) => {
        queries.push(query);
        return Promise.resolve({});
      },
    },
  } as unknown as Tx;
  await new AuthRepository().rotateVerification(tx, "user", "new-hash", expiresAt);
  expect(queries).toEqual([
    { where: { userId: "user", purpose: "verification" } },
    { data: { userId: "user", purpose: "verification", tokenHash: "new-hash", expiresAt } },
  ]);
});
