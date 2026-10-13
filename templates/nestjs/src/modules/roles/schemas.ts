import { z } from "zod";
import { registerComponent } from "../../core/jsonapi/schemas.js";
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
