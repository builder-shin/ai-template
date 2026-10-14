import { z } from "zod";
import { permissionCodeSchema } from "../../core/security/permissions.js";
import { registerComponent, dateTimeString } from "../../core/jsonapi/schemas.js";
import {
  paginationLinksSchema,
  collectionMetaSchema,
} from "../../core/jsonapi/collection-schemas.js";
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
