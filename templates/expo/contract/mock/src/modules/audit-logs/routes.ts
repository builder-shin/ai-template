/**
 * 감사 로그 API(AuditLogs). 읽기만 한다(FastAPI의 audit_logs/router.py). audit-logs:read 권한이 있어야
 * 한다. include=actor는 행위자를 공개 사용자(이름과 아바타)로 담는다.
 */

import type { AuditLogRow } from "../../core/audit.ts";
import { awareDatetimeFilter, enumFilter, uuidFilter } from "../../jsonapi/filters.ts";
import { loadIncluded, pagination, render } from "../../jsonapi/rendering.ts";
import type { JsonApiRouter } from "../../jsonapi/router.ts";
import type { MockState } from "../../state.ts";
import type { UserPublicResource } from "../users/public.ts";
import {
  type AuditLogCollectionDocument,
  type AuditLogDocument,
  actorsOf,
  auditLogResource,
  getAuditLog,
  listAuditLogs,
} from "./service.ts";

const AUDIT_LOG_FILTERS = {
  actor: uuidFilter,
  action: enumFilter("AuditLogAction"),
  targetType: enumFilter("AuditLogTargetType"),
  createdFrom: awareDatetimeFilter,
  createdTo: awareDatetimeFilter,
};

function includedFor(
  state: MockState,
  include: readonly string[],
  rows: readonly AuditLogRow[],
): UserPublicResource[] {
  return loadIncluded(include, { actor: () => actorsOf(state.store, rows) });
}

export function auditLogRoutes(api: JsonApiRouter, state: MockState): void {
  api.route("AuditLogs_list", { auth: "required", filters: AUDIT_LOG_FILTERS }, ({ c, query }) => {
    const { rows, total } = listAuditLogs(state.store, query.filter, query.sort, query.page);
    const included = includedFor(state, query.include, rows);
    const body: AuditLogCollectionDocument = {
      data: rows.map(auditLogResource),
      ...pagination(c, query.page, total),
      ...(included.length > 0 ? { included } : {}),
    };
    return render(body, { fields: query.fields });
  });

  api.route("AuditLogs_get", { auth: "required" }, ({ path, query }) => {
    const row = getAuditLog(state.store, path.id);
    const included = includedFor(state, query.include, [row]);
    const body: AuditLogDocument = {
      data: auditLogResource(row),
      ...(included.length > 0 ? { included } : {}),
    };
    return render(body, { fields: query.fields });
  });
}
