import { z } from "zod";
import { registerComponent } from "../jsonapi/schemas.js";
export const PERMISSION_CODES = [
  "admin:access",
  "users:read",
  "users:manage",
  "roles:read",
  "roles:manage",
  "audit-logs:read",
  "posts:create",
  "posts:manage",
] as const;
export type PermissionCode = (typeof PERMISSION_CODES)[number];
export function isPermissionCode(code: string): code is PermissionCode {
  return PERMISSION_CODES.some((known) => known === code);
}
export const permissionCodeSchema = registerComponent("PermissionCode", z.enum(PERMISSION_CODES));
