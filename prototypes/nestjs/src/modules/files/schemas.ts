import { z } from "zod";
import {
  contractSchema,
  resource,
  document,
  createDocument,
  updateDocument,
  datetime,
  uri,
  toOne,
} from "../../core/jsonapi/schemas.js";
import { codePointString, jsonInteger } from "../../core/jsonapi/strings.js";
export const FileStatus = contractSchema("FileStatus", z.enum(["pending", "ready"]));
export const FileAttributes = contractSchema(
  "FileAttributes",
  z.object({
    filename: codePointString(),
    contentType: codePointString(),
    size: jsonInteger("int64"),
    status: FileStatus,
    createdAt: datetime(),
  }),
);
export const FileRelationships = contractSchema(
  "FileRelationships",
  z.object({ owner: toOne("users") }),
);
export const FileUpload = contractSchema(
  "FileUpload",
  z.object({
    url: uri(),
    method: z.enum(["PUT"]),
    headers: z.record(z.string(), codePointString()),
    expiresAt: datetime(),
  }),
);
export const FileMeta = contractSchema(
  "FileMeta",
  z.object({
    upload: FileUpload.optional(),
    downloadUrl: uri().optional(),
    downloadUrlExpiresAt: datetime().optional(),
  }),
);
export const FileResource = contractSchema(
  "FileResource",
  resource("files", FileAttributes, FileRelationships).extend({ meta: FileMeta.optional() }),
);
export const FileDocument = contractSchema("FileDocument", document(FileResource));
export const FileCreateAttributes = contractSchema(
  "FileCreateAttributes",
  z.object({
    filename: codePointString({ min: 1, max: 255 }),
    contentType: codePointString(),
    size: jsonInteger("int64", { min: 1 }),
  }),
);
export const FileUpdateAttributes = contractSchema(
  "FileUpdateAttributes",
  z.object({ status: z.enum(["ready"]).optional() }),
);
export const FileCreateDocument = contractSchema(
  "FileCreateDocument",
  createDocument("files", FileCreateAttributes),
);
export const FileUpdateDocument = contractSchema(
  "FileUpdateDocument",
  updateDocument("files", FileUpdateAttributes),
);
