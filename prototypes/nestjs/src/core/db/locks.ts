import type { Tx } from "./unit-of-work.js";
/** The repository supplies a tagged, bound SELECT on this transaction connection. */
export function lockForUpdate<T>(tx: Tx) {
  return (sql: TemplateStringsArray, ...values: unknown[]): Promise<T> =>
    tx.$queryRaw<T>(sql, ...values);
}
export async function advisoryXactLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
