import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";

using Http;
using OpenAPI;

namespace Platform;

/** pending: 업로드 URL만 발급됨. ready: 백엔드가 객체를 확인함. */
union FileStatus {
  "pending",
  "ready",
}

model FileAttributes {
  filename: string;
  contentType: string;
  size: int64;
  status: FileStatus;
  createdAt: utcDateTime;
}

model FileRelationships {
  owner: JsonApi.ToOne<"users">;
}

/** 브라우저가 스토리지에 직접 올릴 때 쓰는 presigned 요청 정보. */
model FileUpload {
  url: url;
  method: "PUT";

  /** 업로드 요청에 그대로 붙여야 하는 헤더. */
  headers: Record<string>;

  expiresAt: utcDateTime;
}

model FileMeta {
  /** POST /files 응답에만 있다. */
  upload?: FileUpload;

  /** ready인 파일에만 있다. 수명이 짧다. */
  downloadUrl?: url;

  downloadUrlExpiresAt?: utcDateTime;
}

model FileCreateAttributes {
  @minLength(1) @maxLength(255) filename: string;
  contentType: string;
  @minValue(1) size: int64;
}

model FileUpdateAttributes {
  /** 업로드를 마쳤다고 알린다. 백엔드가 객체를 확인한 뒤 ready로 바꾼다. */
  status?: "ready";
}

model FileResource is JsonApi.ResourceWithRelationships<
  "files",
  FileAttributes,
  FileRelationships
> {
  meta?: FileMeta;
}

model FileDocument is JsonApi.Document<FileResource>;
model FileCreateDocument is JsonApi.CreateDocument<"files", FileCreateAttributes>;
model FileUpdateDocument is JsonApi.UpdateDocument<"files", FileUpdateAttributes>;

@route("/api/v1/files")
@tag("files")
@useAuth(BearerAuth)
interface Files {
  /** 크기와 MIME을 검사한 뒤 pending 파일을 만들고 meta.upload에 presigned URL을 담는다. */
  @post
  create(...JsonApi.Body<FileCreateDocument>):
    | JsonApi.Created<FileDocument>
    | AuthErrors
    | BodyErrors
    | CommonErrors;

  /** 소유자, 또는 이 파일을 참조하는 리소스를 읽을 수 있는 사람만 조회한다(예: 발행된 글의 커버 이미지는 누구나). */
  @get
  @route("{id}")
  @useAuth(BearerAuth | NoAuth)
  get(@path @format("uuid") id: string, @query("fields[files]") fieldsFiles?: string):
    | JsonApi.Ok<FileDocument>
    | AuthErrors
    | NotFound
    | CommonErrors;

  /** status를 ready로 바꿔 업로드 완료를 알린다. 객체가 없으면 file.upload_incomplete(422). */
  @patch(#{ implicitOptionality: false })
  @route("{id}")
  update(@path @format("uuid") id: string, ...JsonApi.Body<FileUpdateDocument>):
    | JsonApi.Ok<FileDocument>
    | AuthErrors
    | NotFound
    | Conflict
    | BodyErrors
    | CommonErrors;

  @delete
  @route("{id}")
  delete(@path @format("uuid") id: string):
    | JsonApi.NoContent
    | AuthErrors
    | NotFound
    | CommonErrors;
}
