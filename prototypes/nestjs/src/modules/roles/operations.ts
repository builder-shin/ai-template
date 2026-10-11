import { defineOperation, COMMON_ERRORS, AUTH_ERRORS } from "../../core/jsonapi/operation.js";
import { PermissionCollectionDocument } from "./schemas.js";
export const Permissions_list = defineOperation({
  interface: "Permissions",
  name: "list",
  method: "GET",
  path: "/api/v1/permissions",
  tag: "permissions",
  auth: "required",
  permission: "roles:read",
  errors: [COMMON_ERRORS, AUTH_ERRORS],
  query: { sort: ["id"], fields: ["permissions"] },
  responses: [{ status: 200, schema: PermissionCollectionDocument }],
});
export const ROLES_OPERATIONS = [Permissions_list];
