import { z } from "zod";
import {
  contractSchema,
  resource,
  document,
  collection,
  createDocument,
  updateDocument,
  datetime,
  toOne,
} from "../../core/jsonapi/schemas.js";
import { codePointString } from "../../core/jsonapi/strings.js";
import { UserPublicResource } from "../users/index.js";
import { FileResource } from "../files/index.js";
export const PostStatus = contractSchema("PostStatus", z.enum(["draft", "published"]));
export const PostAttributes = contractSchema(
  "PostAttributes",
  z.object({
    title: codePointString({ min: 1, max: 200 }),
    body: codePointString({ max: 100000 }),
    status: PostStatus,
    publishedAt: datetime().nullable(),
    createdAt: datetime(),
    updatedAt: datetime(),
  }),
);
export const PostRelationships = contractSchema(
  "PostRelationships",
  z.object({ author: toOne("users"), coverImage: toOne("files") }),
);
export const PostResource = contractSchema(
  "PostResource",
  resource("posts", PostAttributes, PostRelationships),
);
const included = z.array(z.union([UserPublicResource, FileResource])).optional();
export const PostDocument = contractSchema(
  "PostDocument",
  document(PostResource).extend({ included }),
);
export const PostCollectionDocument = contractSchema(
  "PostCollectionDocument",
  collection(PostResource).extend({ included }),
);
export const PostCreateAttributes = contractSchema(
  "PostCreateAttributes",
  z.object({
    title: codePointString({ min: 1, max: 200 }),
    body: codePointString({ max: 100000 }),
    status: PostStatus.optional(),
  }),
);
export const PostUpdateAttributes = contractSchema(
  "PostUpdateAttributes",
  PostCreateAttributes.partial(),
);
export const PostWriteRelationships = contractSchema(
  "PostWriteRelationships",
  z.object({ coverImage: toOne("files").optional() }),
);
export const PostCreateDocument = contractSchema(
  "PostCreateDocument",
  createDocument("posts", PostCreateAttributes, PostWriteRelationships),
);
export const PostUpdateDocument = contractSchema(
  "PostUpdateDocument",
  updateDocument("posts", PostUpdateAttributes, PostWriteRelationships),
);
