import { z } from "zod";
import { registerComponent, jsonInteger } from "./schemas.js";
const link = z.string().meta({ format: "uri-reference" });
export const paginationLinksSchema = registerComponent(
  "PaginationLinks",
  z.object({
    first: link,
    prev: link.nullable().meta({ format: "uri-reference" }),
    next: link.nullable().meta({ format: "uri-reference" }),
    last: link,
  }),
);
export const pageMetaSchema = registerComponent(
  "PageMeta",
  z.object({
    number: jsonInteger({ format: "int32" }),
    size: jsonInteger({ format: "int32" }),
    total: jsonInteger({ format: "int32" }),
    totalPages: jsonInteger({ format: "int32" }),
  }),
);
export const collectionMetaSchema = registerComponent(
  "CollectionMeta",
  z.object({ page: pageMetaSchema }),
);
