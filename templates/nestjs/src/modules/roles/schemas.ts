import { z } from "zod";
import { registerComponent, jsonInteger } from "../../core/jsonapi/schemas.js";
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
const link = z.string().meta({ format: "uri-reference" });
const paginationLinksSchema = registerComponent(
  "PaginationLinks",
  z.object({
    first: link,
    prev: link.nullable().meta({ format: "uri-reference" }),
    next: link.nullable().meta({ format: "uri-reference" }),
    last: link,
  }),
);
const pageMetaSchema = registerComponent(
  "PageMeta",
  z.object({
    number: jsonInteger({ format: "int32" }),
    size: jsonInteger({ format: "int32" }),
    total: jsonInteger({ format: "int32" }),
    totalPages: jsonInteger({ format: "int32" }),
  }),
);
const collectionMetaSchema = registerComponent(
  "CollectionMeta",
  z.object({ page: pageMetaSchema }),
);
export const permissionCollectionDocumentSchema = registerComponent(
  "PermissionCollectionDocument",
  z.object({
    data: z.array(permissionResourceSchema),
    links: paginationLinksSchema,
    meta: collectionMetaSchema,
  }),
);
