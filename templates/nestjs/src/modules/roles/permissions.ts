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
  "admin:access": "관리 화면에 접근한다",
  "users:read": "사용자를 조회한다",
  "users:manage": "사용자를 관리한다",
  "roles:read": "역할과 권한을 조회한다",
  "roles:manage": "역할을 관리한다",
  "audit-logs:read": "감사 로그를 조회한다",
  "posts:create": "글을 작성한다",
  "posts:manage": "모든 글을 관리한다",
};
export function permissionAttributes(code: PermissionCode): { description: string; group: string } {
  return { description: descriptions[code], group: code.split(":")[0] ?? code };
}
