import {
  defineOperation,
  COMMON_ERRORS,
  BODY_ERRORS,
  AUTH_ERRORS,
  NOT_FOUND,
  CONFLICT,
} from "../../core/jsonapi/operation.js";
import { FileCreateDocument, FileUpdateDocument, FileDocument } from "./schemas.js";
export const Files_create = defineOperation({
  interface: "Files",
  name: "create",
  method: "POST",
  path: "/api/v1/files",
  tag: "files",
  auth: "required",
  errors: [COMMON_ERRORS, BODY_ERRORS, AUTH_ERRORS, CONFLICT],
  body: FileCreateDocument,
  responses: [{ status: 201, schema: FileDocument }],
});
export const Files_get = defineOperation({
  interface: "Files",
  name: "get",
  method: "GET",
  path: "/api/v1/files/{id}",
  tag: "files",
  auth: "optional",
  errors: [COMMON_ERRORS, AUTH_ERRORS, NOT_FOUND],
  query: { fields: ["files"] },
  responses: [{ status: 200, schema: FileDocument }],
});
export const Files_update = defineOperation({
  interface: "Files",
  name: "update",
  method: "PATCH",
  path: "/api/v1/files/{id}",
  tag: "files",
  auth: "required",
  errors: [COMMON_ERRORS, BODY_ERRORS, AUTH_ERRORS, NOT_FOUND, CONFLICT],
  body: FileUpdateDocument,
  responses: [{ status: 200, schema: FileDocument }],
});
export const Files_delete = defineOperation({
  interface: "Files",
  name: "delete",
  method: "DELETE",
  path: "/api/v1/files/{id}",
  tag: "files",
  auth: "required",
  errors: [COMMON_ERRORS, AUTH_ERRORS, NOT_FOUND],
  responses: [{ status: 204 }],
});
export const FILES_OPERATIONS = [Files_create, Files_get, Files_update, Files_delete];
