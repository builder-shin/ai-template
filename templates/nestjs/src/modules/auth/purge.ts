import type { Tx } from "../../core/db/unit-of-work.js";
export async function purgeExpired(
  tx: Tx,
  now: Date,
): Promise<{ sessions: number; tokens: number }> {
  const tokens = await tx.verificationToken.deleteMany({ where: { expiresAt: { lte: now } } });
  const refresh = await tx.refreshToken.deleteMany({ where: { expiresAt: { lte: now } } });
  const sessions = await tx.session.deleteMany({
    where: { OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }] },
  });
  return { sessions: sessions.count, tokens: tokens.count + refresh.count };
}
