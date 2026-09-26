import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";
import "./users.tsp";
import "./files.tsp";

using Http;
using OpenAPI;

namespace Platform;

/** 골든 모듈. 새 리소스는 이 파일의 구조를 그대로 따른다. */
union PostStatus {
  "draft",
  "published",
}

model PostAttributes {
  @minLength(1) @maxLength(200) title: string;

  /** 마크다운 본문. */
  body: string;

  status: PostStatus;

  /** 발행하면 채워지고, 발행을 취소하면 null이 된다. */
  publishedAt: utcDateTime | null;

  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

model PostRelationships {
  author: JsonApi.ToOne<"users">;
  coverImage: JsonApi.ToOne<"files">;
}

model PostCreateAttributes {
  @minLength(1) @maxLength(200) title: string;
  body: string;

  /** 생략하면 draft. */
  status?: PostStatus;
}

model PostUpdateAttributes {
  @minLength(1) @maxLength(200) title?: string;
  body?: string;

  /** draft ↔ published 전이. 허용되지 않는 전이는 post.invalid_transition(422). */
  status?: PostStatus;
}

model PostWriteRelationships {
  coverImage?: JsonApi.ToOne<"files">;
}

model PostResource is JsonApi.ResourceWithRelationships<"posts", PostAttributes, PostRelationships>;

model PostDocument is JsonApi.Document<PostResource> {
  included?: (UserPublicResource | FileResource)[];
}

model PostCollectionDocument is JsonApi.CollectionDocument<PostResource> {
  included?: (UserPublicResource | FileResource)[];
}

model PostCreateDocument is JsonApi.CreateDocumentWithRelationships<
  "posts",
  PostCreateAttributes,
  PostWriteRelationships
>;

model PostUpdateDocument is JsonApi.UpdateDocumentWithRelationships<
  "posts",
  PostUpdateAttributes,
  PostWriteRelationships
>;

alias PostQuery = {
  @query include?: string;
  @query("fields[posts]") fieldsPosts?: string;
  @query("fields[users]") fieldsUsers?: string;
  @query("fields[files]") fieldsFiles?: string;
};

@route("/api/v1/posts")
@tag("posts")
interface Posts {
  /** 기본은 발행된 글만 돌려준다. 초안은 작성자 본인(filter[author]=본인 id)이거나 posts:manage 권한이 있을 때만 보인다. */
  @get
  @useAuth(BearerAuth | NoAuth)
  @extension("x-jsonapi-sort", #["createdAt", "publishedAt", "title"])
  @extension("x-jsonapi-include", #["author", "coverImage"])
  list(
    ...JsonApi.PageQuery,
    @query sort?: string,
    ...PostQuery,
    @query("filter[status]") filterStatus?: PostStatus,
    @query("filter[author]") filterAuthor?: string,
    @query("filter[q]") filterQ?: string,
  ): JsonApi.Ok<PostCollectionDocument> | AuthErrors | CommonErrors;

  @post
  @useAuth(BearerAuth)
  @extension("x-permission", "posts:create")
  create(...JsonApi.Body<PostCreateDocument>):
    | JsonApi.Created<PostDocument>
    | AuthErrors
    | BodyErrors
    | CommonErrors;

  @get
  @route("{id}")
  @useAuth(BearerAuth | NoAuth)
  @extension("x-jsonapi-include", #["author", "coverImage"])
  get(@path @format("uuid") id: string, ...PostQuery):
    | JsonApi.Ok<PostDocument>
    | AuthErrors
    | NotFound
    | CommonErrors;

  /** 작성자 또는 posts:manage 권한자만 고친다. status를 바꿔 발행하거나 발행을 취소한다. */
  @patch(#{ implicitOptionality: false })
  @route("{id}")
  @useAuth(BearerAuth)
  update(@path @format("uuid") id: string, ...JsonApi.Body<PostUpdateDocument>):
    | JsonApi.Ok<PostDocument>
    | AuthErrors
    | NotFound
    | Conflict
    | BodyErrors
    | CommonErrors;

  /** 작성자 또는 posts:manage 권한자만 지운다. 관리자가 남의 글을 지우면 감사 로그를 남긴다. */
  @delete
  @route("{id}")
  @useAuth(BearerAuth)
  delete(@path @format("uuid") id: string):
    | JsonApi.NoContent
    | AuthErrors
    | NotFound
    | CommonErrors;
}
