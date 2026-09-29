import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";
import "./roles.tsp";
import "./files.tsp";

using Http;
using OpenAPI;

namespace Platform;

union Locale {
  "ko",
  "en",
}

/** deleted는 탈퇴해 개인정보를 지운 계정이다. */
union UserStatus {
  "active",
  "deactivated",
  "deleted",
}

/** 본인과 users:read 권한자에게 보이는 전체 속성. */
model UserAttributes {
  /** 탈퇴했거나, 검증된 이메일 없이 소셜 로그인으로 만든 계정이면 null이다. */
  email: string | null;

  /** 탈퇴했거나 이름을 모르면 null이다. 프론트는 번역한 대체 문구를 보여 준다. */
  name: string | null;

  locale: Locale;
  status: UserStatus;
  emailVerifiedAt: utcDateTime | null;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

model UserRelationships {
  roles: JsonApi.ToMany<"roles">;
  avatar: JsonApi.ToOne<"files">;
}

/** 다른 사람과 비로그인 사용자에게 보이는 공개 속성. 이메일을 절대 담지 않는다. */
model UserPublicAttributes {
  /** 탈퇴했거나 이름을 모르면 null이다. */
  name: string | null;
}

model UserPublicRelationships {
  avatar: JsonApi.ToOne<"files">;
}

model UserResource is JsonApi.ResourceWithRelationships<"users", UserAttributes, UserRelationships>;

model UserPublicResource is JsonApi.ResourceWithRelationships<
  "users",
  UserPublicAttributes,
  UserPublicRelationships
>;

model UserDocument is JsonApi.Document<UserResource> {
  included?: (RoleResource | FileResource)[];
}

model UserCollectionDocument is JsonApi.CollectionDocument<UserResource> {
  included?: (RoleResource | FileResource)[];
}

/** GET /me 응답. meta.permissions에 실제 적용되는 권한을 담는다. */
model UserMeDocument is JsonApi.Document<UserResource> {
  included?: (RoleResource | FileResource)[];
  meta: {
    permissions: PermissionCode[];
  };
}

model UserMeUpdateAttributes {
  @minLength(1) @maxLength(100) name?: string;
  locale?: Locale;
}

model UserMeUpdateRelationships {
  avatar?: JsonApi.ToOne<"files">;
}

model UserMeUpdateDocument is JsonApi.UpdateDocumentWithRelationships<
  "users",
  UserMeUpdateAttributes,
  UserMeUpdateRelationships
>;

model UserUpdateAttributes {
  status?: UserStatus;
}

model UserUpdateRelationships {
  roles?: JsonApi.ToMany<"roles">;
}

model UserUpdateDocument is JsonApi.UpdateDocumentWithRelationships<
  "users",
  UserUpdateAttributes,
  UserUpdateRelationships
>;

alias UserQuery = {
  @query include?: string;
  @query("fields[users]") fieldsUsers?: string;
  @query("fields[roles]") fieldsRoles?: string;
  @query("fields[files]") fieldsFiles?: string;
};

@route("/api/v1/me")
@tag("me")
@useAuth(BearerAuth)
interface Me {
  @get
  @extension("x-jsonapi-include", #["roles", "avatar"])
  get(...UserQuery): JsonApi.Ok<UserMeDocument> | AuthErrors | CommonErrors;

  @patch(#{ implicitOptionality: false })
  update(...JsonApi.Body<UserMeUpdateDocument>):
    | JsonApi.Ok<UserMeDocument>
    | AuthErrors
    | NotFound
    | Conflict
    | BodyErrors
    | CommonErrors;

  /** 회원 탈퇴. 개인정보를 익명화하고 모든 세션을 폐기한다. 로그인한 지 10분 안의 세션만 할 수 있다. 지났으면 401 auth.reauthentication_required이고, 다시 로그인해 받은 새 세션으로 부른다(refresh로는 풀리지 않는다). */
  @delete
  delete(): JsonApi.NoContent | AuthErrors | CommonErrors;
}

@route("/api/v1/users")
@tag("users")
@useAuth(BearerAuth)
interface Users {
  @get
  @extension("x-permission", "users:read")
  @extension("x-jsonapi-sort", #["createdAt", "name", "email"])
  @extension("x-jsonapi-include", #["roles", "avatar"])
  list(
    ...JsonApi.PageQuery,
    @query sort?: string,
    ...UserQuery,
    @query("filter[q]") filterQ?: string,
    @query("filter[status]") filterStatus?: UserStatus,

    /** 역할 id. */
    @query("filter[role]") @format("uuid") filterRole?: string,
  ): JsonApi.Ok<UserCollectionDocument> | AuthErrors | CommonErrors;

  @get
  @route("{id}")
  @extension("x-permission", "users:read")
  @extension("x-jsonapi-include", #["roles", "avatar"])
  get(@path @format("uuid") id: string, ...UserQuery):
    | JsonApi.Ok<UserDocument>
    | AuthErrors
    | NotFound
    | CommonErrors;

  /** 상태(비활성화)와 역할을 바꾼다. */
  @patch(#{ implicitOptionality: false })
  @route("{id}")
  @extension("x-permission", "users:manage")
  update(@path @format("uuid") id: string, ...JsonApi.Body<UserUpdateDocument>):
    | JsonApi.Ok<UserDocument>
    | AuthErrors
    | NotFound
    | Conflict
    | BodyErrors
    | CommonErrors;
}
