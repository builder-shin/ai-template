import { z } from "zod";
import { contractSchema, resource, collection, datetime } from "../../core/jsonapi/schemas.js";
import { codePointString } from "../../core/jsonapi/strings.js";
export const PermissionCodeSchema = contractSchema(
  "PermissionCode",
  z.enum([
    "admin:access",
    "users:read",
    "users:manage",
    "roles:read",
    "roles:manage",
    "audit-logs:read",
    "posts:create",
    "posts:manage",
  ]),
);
export const PermissionAttributes = contractSchema(
  "PermissionAttributes",
  z.object({ description: codePointString(), group: codePointString() }),
);
export const PermissionResource = contractSchema(
  "PermissionResource",
  resource("permissions", PermissionAttributes),
);
export const PermissionCollectionDocument = contractSchema(
  "PermissionCollectionDocument",
  collection(PermissionResource),
);
export const RoleAttributes = contractSchema(
  "RoleAttributes",
  z.object({
    name: codePointString(),
    description: codePointString().nullable(),
    permissions: z.array(PermissionCodeSchema),
    isSystem: z.boolean(),
    createdAt: datetime(),
    updatedAt: datetime(),
  }),
);
export const RoleResource = contractSchema("RoleResource", resource("roles", RoleAttributes));
