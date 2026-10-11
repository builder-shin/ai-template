import "server-only";
import { defineResource } from "../../lib/resources/definition";
import { AuditMetadata } from "./metadata";
import { AuditTarget } from "./target";

export default defineResource({
  type: "audit-logs",
  permission: "audit-logs:read",
  fields: {
    action: {
      kind: "enum",
      values: [
        "session.login_succeeded",
        "session.login_failed",
        "session.all_revoked",
        "user.password_changed",
        "user.password_reset",
        "user.roles_changed",
        "user.deactivated",
        "user.reactivated",
        "user.deleted",
        "role.created",
        "role.updated",
        "role.deleted",
        "post.deleted_by_admin",
      ],
    },
    targetType: {
      kind: "enum",
      values: ["users", "roles", "posts"],
    },
    targetId: {
      kind: "text",
      display: AuditTarget,
    },
    metadata: {
      kind: "text",
      display: AuditMetadata,
    },
    ipAddress: {
      kind: "text",
    },
    createdAt: {
      kind: "date",
    },
    actor: {
      kind: "relation",
      relation: {
        type: "users",
        label: "name",
        search: true,
      },
    },
  },
  list: {
    columns: ["createdAt", "actor", "action", "targetType", "targetId"],
    filters: {
      "filter[actor]": "relation",
      "filter[action]": "enum",
      "filter[targetType]": "enum",
      "filter[createdFrom]": "date",
      "filter[createdTo]": "date",
    },
    sort: {
      fields: ["createdAt"],
      default: "-createdAt",
    },
    include: ["actor"],
  },
  detail: {
    fields: ["action", "actor", "targetType", "targetId", "metadata", "ipAddress", "createdAt"],
  },
});
