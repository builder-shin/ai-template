import "server-only";
import { defineResource, type Permission } from "../../lib/resources/definition";
import PermissionPicker from "./permission-picker";
import { permissionValues } from "./options";

export default defineResource({
  type: "roles",
  permission: "roles:read",
  fields: {
    description: { kind: "textarea" },
    permissions: {
      kind: "enum-many",
      values: [
        "admin:access",
        "users:read",
        "users:manage",
        "roles:read",
        "roles:manage",
        "audit-logs:read",
        "posts:create",
        "posts:manage",
      ] satisfies readonly Permission[],
      loadValues: permissionValues,
      input: PermissionPicker,
    },
    isSystem: { kind: "boolean" },
    createdAt: { kind: "date" },
    updatedAt: { kind: "date" },
  },
  list: {
    columns: ["name", "isSystem", "createdAt"],
    filters: { "filter[q]": "text" },
    sort: { fields: ["name", "createdAt"] },
  },
  detail: { fields: ["name", "description", "permissions", "isSystem", "createdAt", "updatedAt"] },
  create: {
    permission: "roles:manage",
    fields: { name: "text", description: "textarea", permissions: "enum-many" },
  },
  edit: {
    permission: "roles:manage",
    fields: { name: "text", description: "textarea", permissions: "enum-many" },
  },
  delete: { permission: "roles:manage", visible: (record) => !record.attributes.isSystem },
});
