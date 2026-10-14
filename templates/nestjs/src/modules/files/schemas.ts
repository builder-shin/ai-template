import { z } from "zod";
import {
  registerComponent,
  codePointString,
  jsonInteger,
  dateTimeString,
} from "../../core/jsonapi/schemas.js";
const status = registerComponent("FileStatus", z.enum(["pending", "ready"]));
const attributes = registerComponent(
  "FileAttributes",
  z.object({
    filename: z.string(),
    contentType: z.string(),
    size: jsonInteger({ format: "int64" }),
    status,
    createdAt: dateTimeString(),
  }),
);
const createAttributes = registerComponent(
  "FileCreateAttributes",
  z.object({
    filename: codePointString({ min: 1, max: 255 }),
    contentType: z.string(),
    size: jsonInteger({ format: "int64", min: 1 }),
  }),
);
const updateAttributes = registerComponent(
  "FileUpdateAttributes",
  z.object({ status: z.enum(["ready"]).optional() }),
);
const upload = registerComponent(
  "FileUpload",
  z.object({
    url: z.url(),
    method: z.enum(["PUT"]),
    headers: z.record(z.string(), z.string()),
    expiresAt: dateTimeString(),
  }),
);
const meta = registerComponent(
  "FileMeta",
  z.object({
    upload: upload.optional(),
    downloadUrl: z.url().optional(),
    downloadUrlExpiresAt: dateTimeString().optional(),
  }),
);
const relationships = registerComponent(
  "FileRelationships",
  z.object({
    owner: z.object({ data: z.object({ type: z.enum(["users"]), id: z.string() }).nullable() }),
  }),
);
const resource = registerComponent(
  "FileResource",
  z.object({
    type: z.enum(["files"]),
    id: z.string(),
    attributes,
    relationships,
    meta: meta.optional(),
  }),
);
registerComponent("FileDocument", z.object({ data: resource }));
export const fileCreateDocumentSchema = registerComponent(
  "FileCreateDocument",
  z.object({ data: z.object({ type: z.enum(["files"]), attributes: createAttributes }) }),
);
export const fileUpdateDocumentSchema = registerComponent(
  "FileUpdateDocument",
  z.object({
    data: z.object({
      type: z.enum(["files"]),
      id: z.string(),
      attributes: updateAttributes.optional(),
    }),
  }),
);
