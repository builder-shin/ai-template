import { Injectable } from "@nestjs/common";
import type { Tx } from "../../core/db/unit-of-work.js";
import type { Prisma, AuditLog } from "../../generated/prisma/client.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import { resourceObject } from "../../core/jsonapi/document.js";
import { auditLogActionSchema } from "../../core/audit/actions.js";
@Injectable()
export class AuditLogsRepository {
  find(tx: Tx, id: string) {
    return tx.auditLog.findUnique({ where: { id } });
  }
  async list(tx: Tx, query: ParsedQuery) {
    const { actor, action, targetType, createdFrom, createdTo } = query.filter;
    const where: Prisma.AuditLogWhereInput = {
      ...(typeof actor === "string" ? { actorUserId: actor } : {}),
      ...(typeof action === "string" ? { action } : {}),
      ...(typeof targetType === "string" ? { targetType } : {}),
      ...(createdFrom === undefined && createdTo === undefined
        ? {}
        : {
            createdAt: {
              ...(typeof createdFrom === "string" ? { gte: new Date(createdFrom) } : {}),
              ...(typeof createdTo === "string" ? { lt: new Date(createdTo) } : {}),
            },
          }),
    };
    const total = await tx.auditLog.count({ where });
    const rows = await tx.auditLog.findMany({
      where,
      orderBy: [
        ...query.sort.map((s) => ({
          [s.field]: s.descending ? ("desc" as const) : ("asc" as const),
        })),
        { id: "asc" },
      ],
      skip: (query.page.number - 1) * query.page.size,
      take: query.page.size,
    });
    return { rows, total };
  }
  resource(row: AuditLog) {
    // 저장한 내부 대상을 바꾸지 않고 고정 공개 계약으로 표현할 수 있는 참조만 보낸다.
    const targetType =
      row.targetType === "users" || row.targetType === "roles" || row.targetType === "posts"
        ? row.targetType
        : null;
    return resourceObject(
      "audit-logs",
      row.id,
      {
        action: auditLogActionSchema.parse(row.action),
        targetType,
        targetId: targetType === null ? null : row.targetId,
        metadata: row.meta,
        ipAddress: null,
        createdAt: row.createdAt.toISOString(),
      },
      { actor: { data: row.actorUserId === null ? null : { type: "users", id: row.actorUserId } } },
    );
  }
}
