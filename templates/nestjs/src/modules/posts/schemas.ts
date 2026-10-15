import { z } from "zod";
import { registerComponent, codePointString, dateTimeString } from "../../core/jsonapi/schemas.js";
import {
  collectionMetaSchema,
  paginationLinksSchema,
} from "../../core/jsonapi/collection-schemas.js";
import { userPublicResourceSchema } from "../users/index.js";
import { fileResourceSchema } from "../files/index.js";
export const POST_STATUSES = ["draft", "published"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
export const postStatusSchema = registerComponent("PostStatus", z.enum(POST_STATUSES));
const title = codePointString({ min: 1, max: 200 });
const body = codePointString({ max: 100000 });
const coverImage = z.object({
  data: z.object({ type: z.enum(["files"]), id: z.string() }).nullable(),
});
const attributes = registerComponent(
  "PostAttributes",
  z.object({
    title,
    body,
    status: postStatusSchema,
    publishedAt: dateTimeString().nullable(),
    createdAt: dateTimeString(),
    updatedAt: dateTimeString(),
  }),
);
const relationships = registerComponent(
  "PostRelationships",
  z.object({
    author: z.object({ data: z.object({ type: z.enum(["users"]), id: z.string() }).nullable() }),
    coverImage,
  }),
);
export const postResourceSchema = registerComponent(
  "PostResource",
  z.object({
    type: z.enum(["posts"]),
    id: z.string(),
    attributes,
    relationships,
  }),
);
const included = z.array(z.union([userPublicResourceSchema, fileResourceSchema])).optional();
export const postDocumentSchema = registerComponent(
  "PostDocument",
  z.object({ data: postResourceSchema, included }),
);
export const postCollectionDocumentSchema = registerComponent(
  "PostCollectionDocument",
  z.object({
    data: z.array(postResourceSchema),
    included,
    links: paginationLinksSchema,
    meta: collectionMetaSchema,
  }),
);
const createAttributes = registerComponent(
  "PostCreateAttributes",
  z.object({ title, body, status: postStatusSchema.optional() }),
);
const updateAttributes = registerComponent(
  "PostUpdateAttributes",
  z.object({ title: title.optional(), body: body.optional(), status: postStatusSchema.optional() }),
);
const writeRelationships = registerComponent(
  "PostWriteRelationships",
  z.object({ coverImage: coverImage.optional() }),
);
export const postCreateDocumentSchema = registerComponent(
  "PostCreateDocument",
  z.object({
    data: z.object({
      type: z.enum(["posts"]),
      attributes: createAttributes,
      relationships: writeRelationships.optional(),
    }),
  }),
);
export const postUpdateDocumentSchema = registerComponent(
  "PostUpdateDocument",
  z.object({
    data: z.object({
      type: z.enum(["posts"]),
      id: z.string(),
      attributes: updateAttributes.optional(),
      relationships: writeRelationships.optional(),
    }),
  }),
);
for (const name of [
  "PostCreatedEventDocument",
  "PostUpdatedEventDocument",
  "PostPublishedEventDocument",
])
  registerComponent(name, z.object({ data: postResourceSchema }));
for (const name of ["PostDeletedEventDocument", "PostUnpublishedEventDocument"])
  registerComponent(
    name,
    z.object({ data: z.object({ type: z.enum(["posts"]), id: z.string() }) }),
  );
