import "server-only";
import { defineResource } from "../../lib/resources/definition";

export default defineResource({
  type: "users",
  permission: "users:read",
  fields: {
    locale: { kind: "enum", values: ["ko", "en"] },
    status: {
      kind: "enum",
      values: ["active", "deactivated", "deleted"],
      inputValues: ["active", "deactivated"],
    },
    roles: { kind: "relation-many", relation: { type: "roles", label: "name", search: true } },
  },
  list: {
    columns: ["name", "email", "status", "roles", "createdAt"],
    filters: {
      "filter[q]": "text",
      "filter[status]": "enum",
      "filter[role]": {
        kind: "relation",
        relation: { type: "roles", label: "name", search: true },
      },
    },
    sort: { fields: ["createdAt", "name", "email"], default: "-createdAt" },
    include: ["roles"],
  },
  detail: {
    fields: [
      "name",
      "email",
      "locale",
      "status",
      "emailVerifiedAt",
      "roles",
      "createdAt",
      "updatedAt",
    ],
  },
  edit: {
    permission: "users:manage",
    visible: (record) => record.attributes.status !== "deleted",
    fields: { status: "enum", roles: "relation-many" },
  },
});
