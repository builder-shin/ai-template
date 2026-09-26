import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";

using Http;
using OpenAPI;

namespace Platform;

model SessionPasswordGrant {
  grantType: "password";
  @format("email") email: string;
  password: string;
}

model SessionRefreshTokenGrant {
  grantType: "refreshToken";
  refreshToken: string;
}

model SessionOAuthCodeGrant {
  grantType: "oauthCode";

  /** OAuth 콜백이 프론트로 넘긴 1회용 코드. */
  code: string;
}

/** 로그인, 토큰 갱신, 소셜 로그인 완료를 grantType으로 구분한다. */
@discriminated(#{ envelope: "none", discriminatorPropertyName: "grantType" })
union SessionGrant {
  password: SessionPasswordGrant,
  refreshToken: SessionRefreshTokenGrant,
  oauthCode: SessionOAuthCodeGrant,
}

model SessionAttributes {
  userAgent: string | null;
  createdAt: utcDateTime;
  lastUsedAt: utcDateTime;

  /** 요청을 보낸 세션이면 true. */
  current: boolean;
}

/** POST /sessions의 201 응답에만 담기는 토큰. */
model SessionTokens {
  accessToken: string;
  accessTokenExpiresAt: utcDateTime;
  refreshToken: string;
  refreshTokenExpiresAt: utcDateTime;
}

model SessionWithTokensAttributes {
  ...SessionAttributes;
  ...SessionTokens;
}

model SessionRelationships {
  user: JsonApi.ToOne<"users">;
}

model SessionResource is JsonApi.ResourceWithRelationships<
  "sessions",
  SessionAttributes,
  SessionRelationships
>;

model SessionWithTokensResource is JsonApi.ResourceWithRelationships<
  "sessions",
  SessionWithTokensAttributes,
  SessionRelationships
>;

model SessionWithTokensDocument is JsonApi.Document<SessionWithTokensResource>;
model SessionCollectionDocument is JsonApi.CollectionDocument<SessionResource>;
model SessionCreateDocument is JsonApi.CreateDocument<"sessions", SessionGrant>;

union SessionRevocationScope {
  "others",
  "all",
}

model SessionRevocationAttributes {
  scope: SessionRevocationScope;
  revokedCount: int32;
  createdAt: utcDateTime;
}

model SessionRevocationCreateAttributes {
  scope: SessionRevocationScope;
}

model SessionRevocationResource is JsonApi.Resource<
  "session-revocations",
  SessionRevocationAttributes
>;

model SessionRevocationDocument is JsonApi.Document<SessionRevocationResource>;
model SessionRevocationCreateDocument is JsonApi.CreateDocument<
  "session-revocations",
  SessionRevocationCreateAttributes
>;

model RealtimeTicketAttributes {
  /** Socket.IO 연결의 auth.ticket에 넣는다. 30초 안에 한 번만 쓸 수 있다. */
  token: string;

  expiresAt: utcDateTime;
}

model RealtimeTicketCreateAttributes {}

model RealtimeTicketResource is JsonApi.Resource<"realtime-tickets", RealtimeTicketAttributes>;
model RealtimeTicketDocument is JsonApi.Document<RealtimeTicketResource>;
model RealtimeTicketCreateDocument is JsonApi.CreateDocument<
  "realtime-tickets",
  RealtimeTicketCreateAttributes
>;

@route("/api/v1/sessions")
@tag("sessions")
interface Sessions {
  /** 토큰은 이 응답에만 담긴다. 이미 쓴 refresh token이면 세션 계열 전체를 폐기하고 auth.refresh_token_reused(401). */
  @post
  create(...JsonApi.Body<SessionCreateDocument>):
    | JsonApi.Created<SessionWithTokensDocument>
    | AuthErrors
    | BodyErrors
    | CommonErrors;

  /** 내 활성 세션 목록. */
  @get
  @useAuth(BearerAuth)
  @extension("x-jsonapi-sort", #["createdAt", "lastUsedAt"])
  list(
    ...JsonApi.PageQuery,
    @query sort?: string,
    @query("fields[sessions]") fieldsSessions?: string,
  ): JsonApi.Ok<SessionCollectionDocument> | AuthErrors | CommonErrors;

  /** 현재 세션 로그아웃. */
  @delete
  @route("current")
  @useAuth(BearerAuth)
  deleteCurrent(): JsonApi.NoContent | AuthErrors | CommonErrors;

  /** 내 세션 하나를 폐기한다. */
  @delete
  @route("{id}")
  @useAuth(BearerAuth)
  delete(@path @format("uuid") id: string):
    | JsonApi.NoContent
    | AuthErrors
    | NotFound
    | CommonErrors;
}

@route("/api/v1/session-revocations")
@tag("sessions")
@useAuth(BearerAuth)
interface SessionRevocations {
  /** scope가 others면 현재 세션을 뺀 나머지를, all이면 전부 폐기한다. */
  @post
  create(...JsonApi.Body<SessionRevocationCreateDocument>):
    | JsonApi.Created<SessionRevocationDocument>
    | AuthErrors
    | BodyErrors
    | CommonErrors;
}

@route("/api/v1/realtime-tickets")
@tag("realtime")
@useAuth(BearerAuth)
interface RealtimeTickets {
  /** BFF가 발급받아 브라우저에 넘긴다. 브라우저는 access token을 모른다. */
  @post
  create(...JsonApi.Body<RealtimeTicketCreateDocument>):
    | JsonApi.Created<RealtimeTicketDocument>
    | AuthErrors
    | BodyErrors
    | CommonErrors;
}
