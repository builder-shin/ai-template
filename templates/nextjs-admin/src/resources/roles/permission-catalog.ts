import type { Permission } from "../../lib/resources/definition";

export type CompletePermissionCatalog<Values extends readonly Permission[]> = [
  Exclude<Permission, Values[number]>,
] extends [never]
  ? Values
  : never;

const values = [
  "admin:access",
  "users:read",
  "users:manage",
  "roles:read",
  "roles:manage",
  "audit-logs:read",
  "posts:create",
  "posts:manage",
] satisfies readonly Permission[];

export const permissionCatalog: CompletePermissionCatalog<typeof values> = values;
