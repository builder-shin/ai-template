import { z } from "zod";
import {
  contractSchema,
  resource,
  document,
  datetime,
  toOne,
  toMany,
  schemaRef,
} from "../../core/jsonapi/schemas.js";
import { codePointString } from "../../core/jsonapi/strings.js";
import { PermissionCodeSchema, RoleResource } from "../roles/index.js";
export const Locale = contractSchema("Locale", z.enum(["ko", "en"]));
export const UserStatus = contractSchema(
  "UserStatus",
  z.enum(["active", "deactivated", "deleted"]),
);
export const UserAttributes = contractSchema(
  "UserAttributes",
  z.object({
    email: codePointString().nullable(),
    name: codePointString().nullable(),
    locale: Locale,
    status: UserStatus,
    emailVerifiedAt: datetime().nullable(),
    createdAt: datetime(),
    updatedAt: datetime(),
  }),
);
export const UserRelationships = contractSchema(
  "UserRelationships",
  z.object({ roles: toMany("roles"), avatar: toOne("files") }),
);
export const UserResource = contractSchema(
  "UserResource",
  resource("users", UserAttributes, UserRelationships),
);
export const UserPublicAttributes = contractSchema(
  "UserPublicAttributes",
  z.object({ name: codePointString().nullable() }),
);
export const UserPublicRelationships = contractSchema(
  "UserPublicRelationships",
  z.object({ avatar: toOne("files") }),
);
export const UserPublicResource = contractSchema(
  "UserPublicResource",
  resource("users", UserPublicAttributes, UserPublicRelationships),
);
// Late schema reference keeps composition in the registry and avoids a users → files runtime service dependency.
export const UserMeDocument = contractSchema(
  "UserMeDocument",
  document(UserResource).extend({
    included: z.array(z.union([RoleResource, schemaRef("FileResource")])).optional(),
    meta: z.object({ permissions: z.array(PermissionCodeSchema) }),
  }),
);
