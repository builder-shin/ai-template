import type { Tx } from "./unit-of-work.js";
export async function advisoryXactLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
