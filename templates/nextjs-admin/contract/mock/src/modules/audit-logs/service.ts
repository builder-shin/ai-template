/**
 * 감사 로그 읽기(FastAPI의 audit_logs/service.py와 repository.py). 기록은 각 모듈이 core/audit.ts의
 * recordAudit으로 한다.
 *
 * - 목록은 최근 순서가 기본이다. 행위자, 행위, 대상 종류, 기간(createdFrom 이상, createdTo 미만)으로
 *   거른다.
 * - 행위자는 공개 사용자(이름과 아바타)로 포함한다. users:read 없이 audit-logs:read만 있어도 이메일이
 *   새지 않는다. 행위자가 없는 기록(없는 계정으로 로그인 실패)은 건너뛴다.
 * - FastAPI는 metadata를 PostgreSQL JSONB로 저장해 객체의 키가 (UTF-8 길이, 바이트) 순서로 나온다. 목도
 *   그 순서로 내보낸다.
 */

import type { AuditLogAction, AuditLogRow, AuditLogTargetType } from "../../core/audit.ts";
import { formatInstant, type Instant } from "../../core/clock.ts";
import { ordered, pageOf, type SortColumns } from "../../core/listing.ts";
import type { components } from "../../generated/api.ts";
import { ApiError } from "../../jsonapi/errors.ts";
import type { Page, SortField } from "../../jsonapi/query.ts";
import { isRecord } from "../../json.ts";
import type { Store } from "../../store.ts";
import { publicUsers, type UserPublicResource } from "../users/public.ts";

type Schemas = components["schemas"];
/** 계약의 AuditLogResource에서 metadata의 값만 넓힌다(생성 타입은 값을 never로 적는다). */
export type AuditLogResource = Omit<Schemas["AuditLogResource"], "attributes"> & {
  attributes: Omit<Schemas["AuditLogAttributes"], "metadata"> & {
    metadata: Record<string, unknown>;
  };
};
export type AuditLogDocument = Omit<Schemas["AuditLogDocument"], "data"> & {
  data: AuditLogResource;
};
export type AuditLogCollectionDocument = Omit<Schemas["AuditLogCollectionDocument"], "data"> & {
  data: AuditLogResource[];
};

export interface AuditLogFilter {
  readonly actor?: string;
  readonly action?: AuditLogAction;
  readonly targetType?: AuditLogTargetType;
  readonly createdFrom?: Instant;
  readonly createdTo?: Instant;
}

const SORT_COLUMNS: SortColumns<AuditLogRow> = { createdAt: (row) => row.createdAt };
const DEFAULT_SORT: readonly SortField[] = [{ name: "createdAt", descending: true }];

function matches(row: AuditLogRow, filter: AuditLogFilter): boolean {
  const { actor, action, targetType, createdFrom, createdTo } = filter;
  return (
    (actor === undefined || row.actorId === actor) &&
    (action === undefined || row.action === action) &&
    (targetType === undefined || row.targetType === targetType) &&
    (createdFrom === undefined || row.createdAt >= createdFrom) &&
    (createdTo === undefined || row.createdAt < createdTo)
  );
}

/** 감사 로그 한 페이지와 전체 개수. */
export function listAuditLogs(
  store: Store,
  filter: AuditLogFilter,
  sort: readonly SortField[],
  page: Page,
): { rows: AuditLogRow[]; total: number } {
  const found = store.auditLogs.filter((row) => matches(row, filter));
  return pageOf(ordered(found, sort, SORT_COLUMNS, DEFAULT_SORT), page);
}

export function getAuditLog(store: Store, logId: string): AuditLogRow {
  const row = store.auditLogs.find((candidate) => candidate.id === logId);
  if (row === undefined) {
    throw new ApiError(404, "resource.not_found", `Audit log ${logId} does not exist.`);
  }
  return row;
}

/** JSONB 객체 키의 순서: UTF-8 길이가 짧은 것이 먼저이고, 길이가 같으면 바이트 순서다. */
function jsonbKeyOrder(left: string, right: string): number {
  const [a, b] = [Buffer.from(left, "utf8"), Buffer.from(right, "utf8")];
  return a.length - b.length || Buffer.compare(a, b);
}

/** PostgreSQL JSONB에서 읽은 것처럼 객체의 키를 JSONB 순서로 늘어놓는다(안쪽 객체까지). */
function jsonbObject(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const keys = Object.keys(value).sort(jsonbKeyOrder);
  return Object.fromEntries(keys.map((key) => [key, jsonbValue(value[key])]));
}

function jsonbValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonbValue);
  return isRecord(value) ? jsonbObject(value) : value;
}

export function auditLogResource(row: AuditLogRow): AuditLogResource {
  return {
    type: "audit-logs",
    id: row.id,
    attributes: {
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: jsonbObject(row.metadata),
      ipAddress: row.ipAddress,
      createdAt: formatInstant(row.createdAt),
    },
    relationships: {
      actor: { data: row.actorId === null ? null : { type: "users", id: row.actorId } },
    },
  };
}

/** 기록들의 행위자(공개 표현, id 순). */
export function actorsOf(store: Store, rows: readonly AuditLogRow[]): UserPublicResource[] {
  const actorIds = rows.flatMap((row) => row.actorId ?? []);
  return publicUsers(store, actorIds);
}
