import { z } from "zod";
import { registerComponent, dateTimeString, codePointString } from "../../core/jsonapi/schemas.js";
import { localeSchema } from "../../core/config/locale.js";
import { permissionCodeSchema } from "../../core/security/permissions.js";
import { roleResourceSchema } from "../roles/index.js";
import { fileResourceSchema } from "../files/index.js";
import {
  paginationLinksSchema,
  collectionMetaSchema,
} from "../../core/jsonapi/collection-schemas.js";
export const USER_STATUSES = ["active", "deactivated", "deleted"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const userStatusSchema = registerComponent("UserStatus", z.enum(USER_STATUSES));
const avatar = z.object({ data: z.object({ type: z.enum(["files"]), id: z.string() }).nullable() });
const attributes = registerComponent(
  "UserAttributes",
  z.object({
    email: z.string().nullable(),
    name: z.string().nullable(),
    locale: localeSchema,
    status: userStatusSchema,
    emailVerifiedAt: dateTimeString().nullable(),
    createdAt: dateTimeString(),
    updatedAt: dateTimeString(),
  }),
);
const relationships = registerComponent(
  "UserRelationships",
  z.object({
    roles: z.object({ data: z.array(z.object({ type: z.enum(["roles"]), id: z.string() })) }),
    avatar,
  }),
);
export const userResourceSchema = registerComponent(
  "UserResource",
  z.object({ type: z.enum(["users"]), id: z.string(), attributes, relationships }),
);
registerComponent(
  "UserDocument",
  z.object({
    data: userResourceSchema,
    included: z.array(z.union([roleResourceSchema, fileResourceSchema])).optional(),
  }),
);
registerComponent(
  "UserCollectionDocument",
  z.object({
    data: z.array(userResourceSchema),
    included: z.array(z.union([roleResourceSchema, fileResourceSchema])).optional(),
    links: paginationLinksSchema,
    meta: collectionMetaSchema,
  }),
);
const userUpdateAttributesSchema = registerComponent(
  "UserUpdateAttributes",
  z.object({ status: userStatusSchema.optional() }),
);
const userUpdateRelationshipsSchema = registerComponent(
  "UserUpdateRelationships",
  z.object({
    roles: z
      .object({ data: z.array(z.object({ type: z.enum(["roles"]), id: z.string() })) })
      .optional(),
  }),
);
export const userUpdateDocumentSchema = registerComponent(
  "UserUpdateDocument",
  z.object({
    data: z.object({
      type: z.enum(["users"]),
      id: z.string(),
      attributes: userUpdateAttributesSchema.optional(),
      relationships: userUpdateRelationshipsSchema.optional(),
    }),
  }),
);
const publicAttributes = registerComponent(
  "UserPublicAttributes",
  z.object({ name: z.string().nullable() }),
);
const publicRelationships = registerComponent("UserPublicRelationships", z.object({ avatar }));
export const userPublicResourceSchema = registerComponent(
  "UserPublicResource",
  z.object({
    type: z.enum(["users"]),
    id: z.string(),
    attributes: publicAttributes,
    relationships: publicRelationships,
  }),
);
registerComponent(
  "UserMeDocument",
  z.object({
    data: userResourceSchema,
    included: z.array(z.union([roleResourceSchema, fileResourceSchema])).optional(),
    meta: z.object({ permissions: z.array(permissionCodeSchema) }),
  }),
);
const updateAttributes = registerComponent(
  "UserMeUpdateAttributes",
  z.object({
    name: codePointString({ min: 1, max: 100 }).optional(),
    locale: localeSchema.optional(),
  }),
);
const updateRelationships = registerComponent(
  "UserMeUpdateRelationships",
  z.object({ avatar: avatar.optional() }),
);
export const userMeUpdateDocumentSchema = registerComponent(
  "UserMeUpdateDocument",
  z.object({
    data: z.object({
      type: z.enum(["users"]),
      id: z.string(),
      attributes: updateAttributes.optional(),
      relationships: updateRelationships.optional(),
    }),
  }),
);
registerComponent(
  "UserMeUpdatedEventDocument",
  z.object({ meta: z.object({ changed: z.array(z.enum(["roles", "status", "profile"])) }) }),
);
