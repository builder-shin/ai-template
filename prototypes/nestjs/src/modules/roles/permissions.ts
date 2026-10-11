import { Injectable } from "@nestjs/common";

export const PERMISSION_CODES = [
  "admin:access",
  "audit-logs:read",
  "posts:create",
  "posts:manage",
  "roles:manage",
  "roles:read",
  "users:manage",
  "users:read",
] as const;
export type PermissionCode = (typeof PERMISSION_CODES)[number];
export interface Permission {
  code: PermissionCode;
  description: string;
  group: string;
}

const descriptions: Record<PermissionCode, string> = {
  "admin:access": "Access the administration interface.",
  "audit-logs:read": "Read audit logs.",
  "posts:create": "Create posts.",
  "posts:manage": "Manage any post.",
  "roles:manage": "Create, change and delete roles.",
  "roles:read": "Read roles and permissions.",
  "users:manage": "Change user status and roles.",
  "users:read": "Read users.",
};

@Injectable()
export class PermissionRegistry {
  list(): readonly Permission[] {
    return PERMISSION_CODES.map((code) => ({
      code,
      description: descriptions[code],
      group: code.split(":")[0] ?? "",
    }));
  }
  has(code: string): code is PermissionCode {
    return PERMISSION_CODES.some((permission) => permission === code);
  }
}
