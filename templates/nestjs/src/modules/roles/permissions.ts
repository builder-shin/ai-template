import { PERMISSION_CODES, type PermissionCode } from "../../core/security/permissions.js";
export const SYSTEM_ROLES = [
  {
    name: "admin",
    permissions: PERMISSION_CODES,
    description: "Has every permission, including ones added later.",
  },
  { name: "member", permissions: ["posts:create"], description: "Given to everyone who signs up." },
] as const;
const descriptions: Record<PermissionCode, string> = {
  "admin:access": "Sign in to the admin app.",
  "users:read": "Read every user's full profile.",
  "users:manage": "Change a user's status and roles.",
  "roles:read": "Read roles and permissions.",
  "roles:manage": "Create, change and delete roles.",
  "audit-logs:read": "Read audit logs.",
  "posts:create": "Write posts.",
  "posts:manage": "Manage every post, including drafts.",
};
export function permissionAttributes(code: PermissionCode): { description: string; group: string } {
  return { description: descriptions[code], group: code.split(":")[0] ?? code };
}
