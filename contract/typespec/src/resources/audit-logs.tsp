import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";
import "./users.tsp";

using Http;
using OpenAPI;

namespace Platform;

/** 보안·관리 행위 기록. 백엔드만 쓰고 API로는 읽기만 한다. */
model AuditLogAttributes {
  /** 예: user.deactivated, role.updated, session.login_failed */
  action: string;

  targetType: string | null;
  targetId: string | null;
  metadata: Record<unknown>;
  ipAddress: string | null;
  createdAt: utcDateTime;
}

model AuditLogRelationships {
  actor: JsonApi.ToOne<"users">;
}

model AuditLogResource is JsonApi.ResourceWithRelationships<
  "audit-logs",
  AuditLogAttributes,
  AuditLogRelationships
>;

model AuditLogDocument is JsonApi.Document<AuditLogResource> {
  included?: UserResource[];
}

model AuditLogCollectionDocument is JsonApi.CollectionDocument<AuditLogResource> {
  included?: UserResource[];
}

alias AuditLogQuery = {
  @query include?: string;
  @query("fields[audit-logs]") fieldsAuditLogs?: string;
  @query("fields[users]") fieldsUsers?: string;
};

@route("/api/v1/audit-logs")
@tag("audit-logs")
@useAuth(BearerAuth)
interface AuditLogs {
  @get
  @extension("x-permission", "audit-logs:read")
  @extension("x-jsonapi-sort", #["createdAt"])
  @extension("x-jsonapi-include", #["actor"])
  list(
    ...JsonApi.PageQuery,
    @query sort?: string,
    ...AuditLogQuery,
    @query("filter[actor]") filterActor?: string,
    @query("filter[action]") filterAction?: string,
    @query("filter[targetType]") filterTargetType?: string,
    @query("filter[createdFrom]") filterCreatedFrom?: utcDateTime,
    @query("filter[createdTo]") filterCreatedTo?: utcDateTime,
  ): JsonApi.Ok<AuditLogCollectionDocument> | AuthErrors | CommonErrors;

  @get
  @route("{id}")
  @extension("x-permission", "audit-logs:read")
  @extension("x-jsonapi-include", #["actor"])
  get(@path @format("uuid") id: string, ...AuditLogQuery):
    | JsonApi.Ok<AuditLogDocument>
    | AuthErrors
    | NotFound
    | CommonErrors;
}
