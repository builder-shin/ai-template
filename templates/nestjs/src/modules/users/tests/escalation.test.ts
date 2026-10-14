import { expect, it } from "vitest";
import { canGrant } from "../index.js";
import { PERMISSION_CODES, type PermissionCode } from "../../../core/security/permissions.js";
it.each<{ actor: PermissionCode[]; granted: PermissionCode[]; allowed: boolean }>([
  { actor: ["users:manage", "posts:create"], granted: ["posts:create"], allowed: true },
  { actor: ["users:manage"], granted: ["roles:manage"], allowed: false },
  { actor: [], granted: [], allowed: true },
  { actor: [...PERMISSION_CODES], granted: [...PERMISSION_CODES], allowed: true },
])("권한 $actor 에서 $granted 부여 가능 여부는 $allowed", ({ actor, granted, allowed }) => {
  expect(canGrant(new Set(actor), new Set(granted))).toBe(allowed);
});
