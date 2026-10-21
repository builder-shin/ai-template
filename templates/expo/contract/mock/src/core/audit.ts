/**
 * 감사 로그 기록. FastAPI 템플릿의 core/audit.py와 같은 행위를 같은 모양으로 남긴다.
 *
 * - 행위(action)와 대상 종류(targetType)는 계약의 enum(AuditLogAction, AuditLogTargetType)이다.
 * - metadata에 이메일 같은 개인정보를 넣지 않는다. 식별자가 필요하면 security.identifierHash로 해시만
 *   남긴다(예: 로그인 실패의 identifierHash).
 * - 기록은 메모리(Store.auditLogs)에 쌓이고, audit-logs 모듈의 읽기 API(GET /audit-logs)가 읽는다.
 */

import type { components } from "../generated/api.ts";
import type { Store } from "../store.ts";
import type { Instant } from "./clock.ts";
import { uuid7 } from "./ids.ts";

export type AuditLogAction = components["schemas"]["AuditLogAction"];
export type AuditLogTargetType = components["schemas"]["AuditLogTargetType"];

/** 감사 로그 한 줄. 행위자와 대상은 가리키는 행이 바뀌거나 사라져도 그대로 둔다. */
export interface AuditLogRow {
  readonly id: string;
  readonly action: AuditLogAction;
  readonly actorId: string | null;
  readonly targetType: AuditLogTargetType | null;
  readonly targetId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly ipAddress: string | null;
  readonly createdAt: Instant;
}

export interface AuditRecord {
  readonly action: AuditLogAction;
  readonly actorId: string | null;
  readonly ipAddress: string | null;
  readonly target?: { readonly type: AuditLogTargetType; readonly id: string } | undefined;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** 감사 로그를 남긴다. */
export function recordAudit(store: Store, record: AuditRecord, now: Instant): AuditLogRow {
  const row: AuditLogRow = {
    id: uuid7(),
    action: record.action,
    actorId: record.actorId,
    targetType: record.target?.type ?? null,
    targetId: record.target?.id ?? null,
    metadata: { ...record.metadata },
    ipAddress: record.ipAddress,
    createdAt: now,
  };
  store.auditLogs.push(row);
  return row;
}
