import "@typespec/http";

using Http;

/** JSON:API 1.1 문서를 만드는 템플릿. 리소스 파일은 `model XDocument is JsonApi.Document<XResource>`처럼 이름을 붙여 쓴다. */
namespace JsonApi;

/** JSON:API 미디어 타입. 요청과 응답 모두 이 값만 쓴다. */
alias MediaType = "application/vnd.api+json";

/** 관계가 가리키는 리소스 식별자. */
model ResourceIdentifier<TType extends string> {
  type: TType;
  id: string;
}

/** 단수 관계. 대상이 없으면 data가 null이다. */
model ToOne<TType extends string> {
  data: ResourceIdentifier<TType> | null;
}

/** 복수 관계. */
model ToMany<TType extends string> {
  data: ResourceIdentifier<TType>[];
}

/** 관계가 없는 리소스 객체. */
model Resource<TType extends string, TAttributes extends {}> {
  type: TType;
  id: string;
  attributes: TAttributes;
}

/** 관계가 있는 리소스 객체. */
model ResourceWithRelationships<
  TType extends string,
  TAttributes extends {},
  TRelationships extends {}
> {
  ...Resource<TType, TAttributes>;
  relationships: TRelationships;
}

/** 단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다. */
model Document<TResource> {
  data: TResource;
}

/** 컬렉션 문서. 페이지 링크와 페이지 메타를 항상 담는다. */
model CollectionDocument<TResource> {
  data: TResource[];
  links: PaginationLinks;
  meta: CollectionMeta;
}

/** 생성 요청 문서. */
model CreateDocument<TType extends string, TAttributes> {
  data: {
    type: TType;
    attributes: TAttributes;
  };
}

/** 관계를 함께 보내는 생성 요청 문서. */
model CreateDocumentWithRelationships<
  TType extends string,
  TAttributes,
  TRelationships extends {}
> {
  data: {
    type: TType;
    attributes: TAttributes;
    relationships?: TRelationships;
  };
}

/** 수정 요청 문서. 속성 모델의 필드는 모두 선택이어야 한다. */
model UpdateDocument<TType extends string, TAttributes extends {}> {
  data: {
    type: TType;
    id: string;
    attributes?: TAttributes;
  };
}

/** 관계를 함께 보내는 수정 요청 문서. */
model UpdateDocumentWithRelationships<
  TType extends string,
  TAttributes extends {},
  TRelationships extends {}
> {
  data: {
    type: TType;
    id: string;
    attributes?: TAttributes;
    relationships?: TRelationships;
  };
}

/** 컬렉션의 페이지 링크. 앞뒤 페이지가 없으면 null이다. */
@friendlyName("PaginationLinks")
model PaginationLinks {
  first: url;
  last: url;
  prev: url | null;
  next: url | null;
}

/** 페이지 정보. totalPages는 ceil(total / size)이다. */
@friendlyName("PageMeta")
model PageMeta {
  number: int32;
  size: int32;
  total: int32;
  totalPages: int32;
}

@friendlyName("CollectionMeta")
model CollectionMeta {
  page: PageMeta;
}

/** 모든 컬렉션 GET에 펼쳐 넣는 페이지 쿼리. */
alias PageQuery = {
  /** 1부터 시작하는 페이지 번호. */
  @query("page[number]") @minValue(1) pageNumber?: int32 = 1;

  /** 페이지 크기. 최대 100. */
  @query("page[size]")
  @minValue(1)
  @maxValue(100)
  pageSize?: int32 = 20;
};

/** JSON:API 요청 본문. */
model Body<TDocument> {
  @header("Content-Type") contentType: MediaType;
  @body body: TDocument;
}

/** 200 OK. */
model Ok<TDocument> {
  @statusCode _: 200;
  @header("Content-Type") contentType: MediaType;
  @body body: TDocument;
}

/** 201 Created. */
model Created<TDocument> {
  @statusCode _: 201;
  @header("Content-Type") contentType: MediaType;
  @body body: TDocument;
}

/** 202 Accepted. 비동기로 처리하며 본문이 없다. */
model Accepted {
  @statusCode _: 202;
}

/** 204 No Content. */
model NoContent {
  @statusCode _: 204;
}
