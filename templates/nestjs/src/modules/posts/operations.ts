import { z } from "zod";
import { defineOperation } from "../../core/jsonapi/operation.js";
import { uuidString, jsonInteger } from "../../core/jsonapi/schemas.js";
import { postCreateDocumentSchema, postUpdateDocumentSchema, postStatusSchema } from "./schemas.js";
import { POST_PERMISSIONS } from "./permissions.js";
const failure = { schema: "ErrorDocument", description: "요청에 실패했다" };
const failures = {
  400: failure,
  401: failure,
  403: failure,
  406: failure,
  429: {
    ...failure,
    headers: { "Retry-After": { required: true, schema: jsonInteger({ format: "int32" }) } },
  },
  500: failure,
  503: failure,
};
const errors = [
  "auth.unauthenticated",
  "auth.token_invalid",
  "auth.token_expired",
  "permission.denied",
  "jsonapi.invalid_query",
  "jsonapi.not_acceptable",
  "rate_limit.exceeded",
  "internal.unexpected",
  "service.unavailable",
] as const;
const writeErrors = [
  "jsonapi.invalid_document",
  "jsonapi.unsupported_media_type",
  "jsonapi.content_too_large",
  "validation.required",
  "validation.invalid_format",
  "validation.too_short",
  "validation.too_long",
  "validation.invalid_choice",
  "resource.not_found",
  "resource.conflict",
  "file.upload_incomplete",
  "post.invalid_transition",
] as const;
const fields = {
  posts: [
    "title",
    "body",
    "status",
    "publishedAt",
    "createdAt",
    "updatedAt",
    "author",
    "coverImage",
  ],
  users: ["name", "avatar"],
  files: ["filename", "contentType", "size", "status", "createdAt", "owner"],
};
export const postReadQuery = { include: ["author", "coverImage"], fields };
export const listPosts = defineOperation({
  operationId: "Posts_list",
  method: "GET",
  path: "/api/v1/posts",
  tags: ["posts"],
  summary: "볼 수 있는 글을 검색하고 목록으로 조회한다",
  auth: "optional",
  query: {
    ...postReadQuery,
    filters: { status: postStatusSchema, author: uuidString(), q: z.string() },
    sort: ["createdAt", "publishedAt", "title"],
    defaultSort: "-createdAt",
    page: { defaultSize: 20, maxSize: 100 },
  },
  responses: {
    200: { schema: "PostCollectionDocument", description: "글 목록을 조회했다" },
    ...failures,
  },
  errors: [...errors, "jsonapi.unsupported_include", "jsonapi.unsupported_sort"],
});
const params = z.object({ id: uuidString() });
export const getPost = defineOperation({
  operationId: "Posts_get",
  method: "GET",
  path: "/api/v1/posts/{id}",
  tags: ["posts"],
  summary: "볼 수 있는 글을 조회한다",
  auth: "optional",
  params,
  query: postReadQuery,
  responses: {
    200: { schema: "PostDocument", description: "글을 조회했다" },
    ...failures,
    404: failure,
  },
  errors: [...errors, "resource.not_found", "jsonapi.unsupported_include"],
});
export const createPost = defineOperation({
  operationId: "Posts_create",
  method: "POST",
  path: "/api/v1/posts",
  tags: ["posts"],
  summary: "본인의 글을 만든다",
  auth: "required",
  permission: POST_PERMISSIONS.create,
  body: postCreateDocumentSchema,
  responses: {
    201: { schema: "PostDocument", description: "글을 만들었다" },
    ...failures,
    404: failure,
    409: failure,
    413: failure,
    415: failure,
    422: failure,
  },
  errors: [...errors, ...writeErrors],
});
export const updatePost = defineOperation({
  operationId: "Posts_update",
  method: "PATCH",
  path: "/api/v1/posts/{id}",
  tags: ["posts"],
  summary: "글을 고치거나 발행 상태를 바꾼다",
  auth: "required",
  params,
  body: postUpdateDocumentSchema,
  responses: {
    200: { schema: "PostDocument", description: "글을 고쳤다" },
    ...failures,
    404: failure,
    409: failure,
    413: failure,
    415: failure,
    422: failure,
  },
  errors: [...errors, ...writeErrors],
});
export const deletePost = defineOperation({
  operationId: "Posts_delete",
  method: "DELETE",
  path: "/api/v1/posts/{id}",
  tags: ["posts"],
  summary: "글을 지우고 관리자 삭제 감사를 남긴다",
  auth: "required",
  params,
  responses: { 204: { description: "글을 지웠다" }, ...failures, 404: failure },
  errors: [...errors, "resource.not_found"],
});
