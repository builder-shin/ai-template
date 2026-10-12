import type { Tx } from "../db/unit-of-work.js";
export function recordAudit(
  tx: Tx,
  action: string,
  data: {
    actorId?: string;
    targetId?: string;
    targetType?: string;
    ipAddress?: string;
    metadata?: Record<string, string>;
  } = {},
) {
  return tx.auditLog.create({
    data: { action, targetType: data.targetId ? "users" : null, ...data },
  });
}
