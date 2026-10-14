import type { PermissionCode } from "../../core/security/permissions.js";
export function canGrant(
  actorPermissions: ReadonlySet<PermissionCode>,
  grantedPermissions: ReadonlySet<PermissionCode>,
): boolean {
  return [...grantedPermissions].every((code) => actorPermissions.has(code));
}
