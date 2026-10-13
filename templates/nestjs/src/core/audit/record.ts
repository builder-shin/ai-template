import type { Tx } from "../db/unit-of-work.js";
import { auditLogActionSchema, type AuditLogAction } from "./actions.js";
export interface AuditEntry {
  action: AuditLogAction;
  actorUserId?: string;
  target?: { type: string; id: string };
  identifierHash?: string;
  meta?: Record<string, unknown>;
}
export async function recordAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  const action = auditLogActionSchema.parse(entry.action);
  await tx.auditLog.create({
    data: {
      action,
      ...(entry.actorUserId === undefined ? {} : { actorUserId: entry.actorUserId }),
      ...(entry.target === undefined
        ? {}
        : { targetType: entry.target.type, targetId: entry.target.id }),
      ...(entry.identifierHash === undefined ? {} : { identifierHash: entry.identifierHash }),
      meta: (entry.meta ?? {}) as Parameters<Tx["auditLog"]["create"]>[0]["data"]["meta"],
    },
  });
}
