/**
 * 역할의 권한 계산과 사용자-역할 연결. FastAPI 템플릿의 roles/service.py와 roles/repository.py 가운데
 * 계정, 인증, 시드가 쓰는 부분이다. 역할 API(/roles, /permissions)는 roles 모듈의 라우트가 더한다.
 *
 * - 역할의 실제 권한: admin은 등록된 모든 권한이고, 그 밖은 저장한 코드 가운데 등록된 것이다.
 * - 사용자의 실제 권한은 가진 역할의 실제 권한을 합친 것이다. 캐시하지 않고 요청마다 계산한다.
 */

import { formatInstant, type Instant } from "../../core/clock.ts";
import { uuid7 } from "../../core/ids.ts";
import {
  compareText,
  isPermissionCode,
  PERMISSION_CODES,
  type PermissionCode,
} from "../../core/permissions.ts";
import type { components } from "../../generated/api.ts";
import type { Store } from "../../store.ts";
import { ADMIN_ROLE, isAdminRole, MEMBER_ROLE, type RoleRow } from "./model.ts";

type RoleResource = components["schemas"]["RoleResource"];

/** 시드가 만드는 시스템 역할: 이름, 설명, 저장하는 권한. admin의 권한은 저장하지 않고 계산한다. */
export const SYSTEM_ROLES: readonly {
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly PermissionCode[];
}[] = [
  {
    name: ADMIN_ROLE,
    description: "Has every permission, including ones added later.",
    permissions: [],
  },
  {
    name: MEMBER_ROLE,
    description: "Given to everyone who signs up.",
    permissions: ["posts:create"],
  },
];

/** 역할의 실제 권한. admin은 등록된 모든 권한이고, 등록되지 않은 코드는 뺀다. */
export function rolePermissions(role: RoleRow): ReadonlySet<PermissionCode> {
  if (isAdminRole(role)) return PERMISSION_CODES;
  return new Set(role.permissions.filter(isPermissionCode));
}

/** 사용자가 가진 역할(이름순). */
export function rolesOfUser(store: Store, userId: string): RoleRow[] {
  const ids = store.userRoles.get(userId) ?? new Set<string>();
  return [...ids]
    .flatMap((id) => store.roles.get(id) ?? [])
    .sort((left, right) => compareText(left.name, right.name));
}

/** 사용자의 역할에서 계산한 실제 권한. */
export function effectivePermissions(store: Store, userId: string): ReadonlySet<PermissionCode> {
  const permissions = new Set<PermissionCode>();
  for (const role of rolesOfUser(store, userId)) {
    for (const code of rolePermissions(role)) permissions.add(code);
  }
  return permissions;
}

export function findRoleByName(store: Store, name: string): RoleRow | undefined {
  return [...store.roles.values()].find((role) => role.name === name);
}

/** 이름으로 찾은 역할. 없는 이름이 있으면 던진다(시드를 돌리지 않은 상태다). */
export function rolesNamed(store: Store, names: readonly string[]): RoleRow[] {
  const wanted = [...new Set(names)];
  const found = wanted.flatMap((name) => findRoleByName(store, name) ?? []);
  const missing = wanted.filter((name) => !found.some((role) => role.name === name));
  if (missing.length > 0) {
    throw new Error(`역할 ${missing.sort(compareText).join(", ")}이 없다. 시드가 만든다.`);
  }
  return found;
}

/** 사용자에게 역할을 준다. */
export function assignRoles(store: Store, userId: string, roles: readonly RoleRow[]): void {
  const held = store.userRoles.get(userId) ?? new Set<string>();
  for (const role of roles) held.add(role.id);
  store.userRoles.set(userId, held);
}

/** 시스템 역할(admin, member)이 없으면 만든다. 새로 만든 역할 이름을 돌려준다. */
export function ensureSystemRoles(store: Store, now: Instant): string[] {
  const created: string[] = [];
  for (const { name, description, permissions } of SYSTEM_ROLES) {
    if (findRoleByName(store, name) !== undefined) continue;
    const role: RoleRow = {
      id: uuid7(),
      name,
      description,
      permissions: [...permissions],
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    };
    store.roles.set(role.id, role);
    created.push(name);
  }
  return created;
}

/** 역할 리소스. permissions는 실제 권한을 코드 순으로 담는다. */
export function roleResource(role: RoleRow): RoleResource {
  return {
    type: "roles",
    id: role.id,
    attributes: {
      name: role.name,
      description: role.description,
      permissions: [...rolePermissions(role)].sort(compareText),
      isSystem: role.isSystem,
      createdAt: formatInstant(role.createdAt),
      updatedAt: formatInstant(role.updatedAt),
    },
  };
}
