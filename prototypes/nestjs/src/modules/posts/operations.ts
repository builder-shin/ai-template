import { z } from "zod";
import {
  defineOperation,
  COMMON_ERRORS,
  BODY_ERRORS,
  AUTH_ERRORS,
  NOT_FOUND,
  CONFLICT,
} from "../../core/jsonapi/operation.js";
import {
  PostStatus,
  PostCreateDocument,
  PostUpdateDocument,
  PostDocument,
  PostCollectionDocument,
} from "./schemas.js";
import { SCHEMA_METADATA } from "../../core/jsonapi/strings.js";
const author = z
  .string()
  .refine((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))
  .register(SCHEMA_METADATA, { format: "uuid" });
const resourceQuery = { include: ["author", "coverImage"], fields: ["posts", "users", "files"] };
export const Posts_list = defineOperation({
  interface: "Posts",
  name: "list",
  method: "GET",
  path: "/api/v1/posts",
  tag: "posts",
  auth: "optional",
  errors: [COMMON_ERRORS, AUTH_ERRORS],
  query: {
    ...resourceQuery,
    sort: ["createdAt", "publishedAt", "title"],
    filters: { status: PostStatus, author, q: z.string() },
  },
  responses: [{ status: 200, schema: PostCollectionDocument }],
});
export const Posts_get = defineOperation({
  interface: "Posts",
  name: "get",
  method: "GET",
  path: "/api/v1/posts/{id}",
  tag: "posts",
  auth: "optional",
  errors: [COMMON_ERRORS, AUTH_ERRORS, NOT_FOUND],
  query: resourceQuery,
  responses: [{ status: 200, schema: PostDocument }],
});
export const Posts_create = defineOperation({
  interface: "Posts",
  name: "create",
  method: "POST",
  path: "/api/v1/posts",
  tag: "posts",
  auth: "required",
  permission: "posts:create",
  errors: [COMMON_ERRORS, BODY_ERRORS, AUTH_ERRORS, NOT_FOUND, CONFLICT],
  body: PostCreateDocument,
  responses: [{ status: 201, schema: PostDocument }],
});
export const Posts_update = defineOperation({
  interface: "Posts",
  name: "update",
  method: "PATCH",
  path: "/api/v1/posts/{id}",
  tag: "posts",
  auth: "required",
  errors: [COMMON_ERRORS, BODY_ERRORS, AUTH_ERRORS, NOT_FOUND, CONFLICT],
  body: PostUpdateDocument,
  responses: [{ status: 200, schema: PostDocument }],
});
export const Posts_delete = defineOperation({
  interface: "Posts",
  name: "delete",
  method: "DELETE",
  path: "/api/v1/posts/{id}",
  tag: "posts",
  auth: "required",
  errors: [COMMON_ERRORS, AUTH_ERRORS, NOT_FOUND],
  responses: [{ status: 204 }],
});
export const POSTS_OPERATIONS = [Posts_list, Posts_get, Posts_create, Posts_update, Posts_delete];
