import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";

using Http;
using OpenAPI;

namespace Platform;

/** 코드에 정의된 권한. 역할은 이 값들의 묶음이다. */
union PermissionCode {
  "admin:access",
  "users:read",
  "users:manage",
  "roles:read",
  "roles:manage",
  "audit-logs:read",
  "posts:create",
  "posts:manage",
}

model RoleAttributes {
  name: string;
  description: string | null;
  permissions: PermissionCode[];

  /** 시드된 시스템 역할(admin, member). 삭제할 수 없다. */
  isSystem: boolean;

  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

model RoleCreateAttributes {
  @minLength(1) @maxLength(50) name: string;
  @maxLength(200) description?: string | null;
  permissions: PermissionCode[];
}

model RoleUpdateAttributes {
  @minLength(1) @maxLength(50) name?: string;
  @maxLength(200) description?: string | null;
  permissions?: PermissionCode[];
}

model RoleResource is JsonApi.Resource<"roles", RoleAttributes>;
model RoleDocument is JsonApi.Document<RoleResource>;
model RoleCollectionDocument is JsonApi.CollectionDocument<RoleResource>;
model RoleCreateDocument is JsonApi.CreateDocument<"roles", RoleCreateAttributes>;
model RoleUpdateDocument is JsonApi.UpdateDocument<"roles", RoleUpdateAttributes>;

/** 권한 하나. id는 권한 코드(예: posts:manage)다. */
model PermissionAttributes {
  description: string;

  /** 화면에서 묶어 보여 줄 그룹. 예: posts */
  group: string;
}

model PermissionResource is JsonApi.Resource<"permissions", PermissionAttributes>;
model PermissionCollectionDocument is JsonApi.CollectionDocument<PermissionResource>;

@route("/api/v1/roles")
@tag("roles")
@useAuth(BearerAuth)
interface Roles {
  @get
  @extension("x-permission", "roles:read")
  @extension("x-jsonapi-sort", #["name", "createdAt"])
  list(
    ...JsonApi.PageQuery,
    @query sort?: string,
    @query("fields[roles]") fieldsRoles?: string,
    @query("filter[q]") filterQ?: string,
  ): JsonApi.Ok<RoleCollectionDocument> | AuthErrors | CommonErrors;

  @post
  @extension("x-permission", "roles:manage")
  create(...JsonApi.Body<RoleCreateDocument>):
    | JsonApi.Created<RoleDocument>
    | AuthErrors
    | BodyErrors
    | CommonErrors;

  @get
  @route("{id}")
  @extension("x-permission", "roles:read")
  get(@path @format("uuid") id: string, @query("fields[roles]") fieldsRoles?: string):
    | JsonApi.Ok<RoleDocument>
    | AuthErrors
    | NotFound
    | CommonErrors;

  @patch(#{ implicitOptionality: false })
  @route("{id}")
  @extension("x-permission", "roles:manage")
  update(@path @format("uuid") id: string, ...JsonApi.Body<RoleUpdateDocument>):
    | JsonApi.Ok<RoleDocument>
    | AuthErrors
    | NotFound
    | Conflict
    | BodyErrors
    | CommonErrors;

  /** 시스템 역할은 지울 수 없다(role.system_role_protected, 422). */
  @delete
  @route("{id}")
  @extension("x-permission", "roles:manage")
  delete(@path @format("uuid") id: string):
    | JsonApi.NoContent
    | AuthErrors
    | NotFound
    | UnprocessableEntity
    | CommonErrors;
}

@route("/api/v1/permissions")
@tag("permissions")
@useAuth(BearerAuth)
interface Permissions {
  @get
  @extension("x-permission", "roles:read")
  @extension("x-jsonapi-sort", #["id"])
  list(
    ...JsonApi.PageQuery,
    @query sort?: string,
    @query("fields[permissions]") fieldsPermissions?: string,
  ): JsonApi.Ok<PermissionCollectionDocument> | AuthErrors | CommonErrors;
}
