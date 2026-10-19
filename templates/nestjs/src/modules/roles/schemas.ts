import { z } from "zod";
import { permissionCodeSchema } from "../../core/security/permissions.js";
import { registerComponent, dateTimeString, codePointString } from "../../core/jsonapi/schemas.js";
import {
  paginationLinksSchema,
  collectionMetaSchema,
} from "../../core/jsonapi/collection-schemas.js";
const DESCRIPTION_MAX = 200;
export const permissionAttributesSchema = registerComponent(
  "PermissionAttributes",
  z.object({ description: z.string(), group: z.string() }),
);
export const permissionResourceSchema = registerComponent(
  "PermissionResource",
  z.object({
    type: z.enum(["permissions"]),
    id: z.string(),
    attributes: permissionAttributesSchema,
  }),
);
export const permissionCollectionDocumentSchema = registerComponent(
  "PermissionCollectionDocument",
  z.object({
    data: z.array(permissionResourceSchema),
    links: paginationLinksSchema,
    meta: collectionMetaSchema,
  }),
);

export const roleAttributesSchema = registerComponent(
  "RoleAttributes",
  z.object({
    name: z.string(),
    description: z.string().nullable(),
    permissions: z.array(permissionCodeSchema),
    isSystem: z.boolean(),
    createdAt: dateTimeString(),
    updatedAt: dateTimeString(),
  }),
);
export const roleResourceSchema = registerComponent(
  "RoleResource",
  z.object({ type: z.enum(["roles"]), id: z.string(), attributes: roleAttributesSchema }),
);
registerComponent("RoleDocument", z.object({ data: roleResourceSchema }));
registerComponent(
  "RoleCollectionDocument",
  z.object({
    data: z.array(roleResourceSchema),
    links: paginationLinksSchema,
    meta: collectionMetaSchema,
  }),
);
// TypeSpec의 nullable 속성처럼 길이 제한을 union 바깥에 선언한다.
const descriptionSchema = codePointString({ max: DESCRIPTION_MAX })
  .nullable()
  .meta({
    anyOf: [{ type: "string", description: "역할 설명이다" }, { type: "null" }],
    maxLength: DESCRIPTION_MAX,
  });
export const roleCreateAttributesSchema = registerComponent(
  "RoleCreateAttributes",
  z.object({
    name: codePointString({ min: 1, max: 50 }),
    description: descriptionSchema.optional(),
    permissions: z.array(permissionCodeSchema),
  }),
);
export const roleUpdateAttributesSchema = registerComponent(
  "RoleUpdateAttributes",
  z.object({
    name: codePointString({ min: 1, max: 50 }).optional(),
    description: descriptionSchema.optional(),
    permissions: z.array(permissionCodeSchema).optional(),
  }),
);
export const roleCreateDocumentSchema = registerComponent(
  "RoleCreateDocument",
  z.object({ data: z.object({ type: z.enum(["roles"]), attributes: roleCreateAttributesSchema }) }),
);
export const roleUpdateDocumentSchema = registerComponent(
  "RoleUpdateDocument",
  z.object({
    data: z.object({
      type: z.enum(["roles"]),
      id: z.string(),
      attributes: roleUpdateAttributesSchema.optional(),
    }),
  }),
);
