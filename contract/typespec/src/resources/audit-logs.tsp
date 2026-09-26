import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";
import "./users.tsp";

using Http;
using OpenAPI;

namespace Platform;

/** 감사 로그에 남기는 행위. 두 백엔드는 이 목록 밖의 값을 쓰지 않는다. */
union AuditLogAction {
  "session.login_succeeded",
  "session.login_failed",
  "session.all_revoked",
  "user.password_changed",
  "user.password_reset",
  "user.roles_changed",
  "user.deactivated",
  "user.reactivated",
  "user.deleted",
  "role.created",
  "role.updated",
  "role.deleted",
  "post.deleted_by_admin",
}

/** 감사 로그 대상의 리소스 타입. */
union AuditLogTargetType {
  "users",
  "roles",
  "posts",
}

/** 보안·관리 행위 기록. 백엔드만 쓰고 API로는 읽기만 한다. */
model AuditLogAttributes {
  action: AuditLogAction;

  /** 대상이 없는 행위(예: 없는 계정으로 로그인 실패)면 null이다. */
  targetType: AuditLogTargetType | null;

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

// 행위자는 공개 표현으로 포함한다. users:read 없이 audit-logs:read만 있어도 이메일이 새지 않는다(§4.10).
model AuditLogDocument is JsonApi.Document<AuditLogResource> {
  included?: UserPublicResource[];
}

model AuditLogCollectionDocument is JsonApi.CollectionDocument<AuditLogResource> {
  included?: UserPublicResource[];
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
    @query("filter[action]") filterAction?: AuditLogAction,
    @query("filter[targetType]") filterTargetType?: AuditLogTargetType,
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
