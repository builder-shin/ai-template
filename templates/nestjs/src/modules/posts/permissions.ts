import type { PermissionCode } from "../../core/security/permissions.js";
export const POST_PERMISSIONS = {
  create: "posts:create",
  manage: "posts:manage",
} as const satisfies Record<string, PermissionCode>;
