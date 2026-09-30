/**
 * 역할 API(/roles)의 유스케이스(FastAPI의 roles/service.py).
 *
 * - 권한 상승 금지: 내 실제 권한을 넘는 역할은 만들거나, 고치거나(고치기 전과 후 모두), 지우지 못한다
 *   (403 permission.denied).
 * - 시스템 역할(admin, member)은 지우거나 이름을 바꾸지 못하고, admin의 권한은 고치지 못한다(422
 *   role.system_role_protected). 가입이 member를 이름으로 찾기 때문에 이름도 막는다.
 * - 이름은 유일하다. 이미 쓰는 이름이면 422 validation.already_taken(/data/attributes/name)이다.
 * - 권한은 겹치지 않게 코드 순으로 저장한다. 권한이 바뀌거나 역할을 지우면 그 역할을 가진 사용자로
 *   등록된 처리를 부른다(users가 me.updated를 보낸다). roles가 users를 import하면 순환이다.
 * - 만들기·고치기·지우기는 감사 로그(role.created, role.updated, role.deleted)를 남긴다. 고칠 것이
 *   없으면 아무것도 바꾸거나 남기지 않는다.
 * - 목은 검사를 모두 마친 뒤에 바꾼다. FastAPI는 바꾼 뒤 flush할 때 이름 중복을 알아채고 롤백한다. 막는
 *   순서는 같다: 고치기 전 권한 403 → 시스템 역할 422 → 고친 뒤 권한 403 → 이름 중복 422.
 */

import type { Principal } from "../../core/access.ts";
import { type AuditLogAction, type AuditRecord, recordAudit } from "../../core/audit.ts";
import type { Client } from "../../core/client.ts";
import { uuid7 } from "../../core/ids.ts";
import { containsText, ordered, pageOf, type SortColumns } from "../../core/listing.ts";
import { compareText } from "../../core/permissions.ts";
import type { components } from "../../generated/api.ts";
import { ApiError } from "../../jsonapi/errors.ts";
import type { Page, SortField } from "../../jsonapi/query.ts";
import type { MockState } from "../../state.ts";
import type { Store } from "../../store.ts";
import { isAdminRole, type RoleRow } from "./model.ts";
import { findRoleByName, rolePermissions, within } from "./service.ts";

type RoleCreateAttributes = components["schemas"]["RoleCreateAttributes"];
type RoleUpdateAttributes = components["schemas"]["RoleUpdateAttributes"];

/** 역할의 권한이 바뀌거나 역할이 지워질 때 그 역할을 가진 사용자(id 순)로 부를 처리. */
export type MembersChanged = (state: MockState, userIds: readonly string[]) => void;

const SORT_COLUMNS: SortColumns<RoleRow> = {
  name: (role) => role.name,
  createdAt: (role) => role.createdAt,
};
const DEFAULT_SORT: readonly SortField[] = [{ name: "name", descending: false }];

/** 처리를 등록한다. 같은 처리를 두 번 등록해도 한 번만 부른다. */
export function onMembersChanged(hooks: MembersChanged[], hook: MembersChanged): void {
  if (!hooks.includes(hook)) hooks.push(hook);
}

/** 역할 한 페이지와 전체 개수. q가 있으면 이름의 부분 일치(대소문자를 가리지 않는다)로 거른다. */
export function listRoles(
  store: Store,
  q: string | undefined,
  sort: readonly SortField[],
  page: Page,
): { rows: RoleRow[]; total: number } {
  const found = [...store.roles.values()].filter((role) => !q || containsText(role.name, q));
  return pageOf(ordered(found, sort, SORT_COLUMNS, DEFAULT_SORT), page);
}

/** id의 역할. 없으면 404다. */
export function getRole(store: Store, roleId: string): RoleRow {
  const role = store.roles.get(roleId);
  if (role === undefined) {
    throw new ApiError(404, "resource.not_found", `Role ${roleId} does not exist.`);
  }
  return role;
}

function requireWithin(permissions: Iterable<string>, actor: Principal): void {
  if (!within(permissions, actor.permissions)) {
    const detail = "A role cannot carry permissions you do not have.";
    throw new ApiError(403, "permission.denied", detail);
  }
}

function systemRoleProtected(detail: string): ApiError {
  return new ApiError(422, "role.system_role_protected", detail);
}

function requireFreeName(store: Store, name: string): void {
  if (findRoleByName(store, name) === undefined) return;
  const detail = `A role named ${name} already exists.`;
  throw new ApiError(422, "validation.already_taken", detail, { pointer: "/data/attributes/name" });
}

/** 겹치지 않게 코드 순으로. */
function codes(permissions: Iterable<string>): string[] {
  return [...new Set(permissions)].sort(compareText);
}

function sameCodes(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((code, index) => code === right[index]);
}

function audit(
  state: MockState,
  action: AuditLogAction,
  context: { actor: Principal; client: Client; role: RoleRow },
  metadata: Readonly<Record<string, unknown>>,
): void {
  const { actor, client, role } = context;
  const record: AuditRecord = {
    action,
    actorId: actor.userId,
    ipAddress: client.ip,
    target: { type: "roles", id: role.id },
    metadata,
  };
  recordAudit(state.store, record, state.clock.now());
}

/** 역할을 가진 사용자에게 알린다. */
function notifyMembers(state: MockState, role: RoleRow): void {
  const members = [...state.store.userRoles]
    .filter(([, held]) => held.has(role.id))
    .map(([userId]) => userId)
    .sort(compareText);
  for (const hook of state.membersChanged) hook(state, members);
}

export function createRole(
  state: MockState,
  actor: Principal,
  client: Client,
  attributes: RoleCreateAttributes,
): RoleRow {
  const permissions = codes(attributes.permissions);
  requireWithin(permissions, actor);
  requireFreeName(state.store, attributes.name);
  const now = state.clock.now();
  const role: RoleRow = {
    id: uuid7(),
    name: attributes.name,
    description: attributes.description ?? null,
    permissions,
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  };
  state.store.roles.set(role.id, role);
  audit(state, "role.created", { actor, client, role }, { name: role.name, permissions });
  return role;
}

/** 역할을 고친다. 고치기 전과 후의 권한이 모두 내 권한 안이어야 한다. */
export function updateRole(
  state: MockState,
  actor: Principal,
  client: Client,
  role: RoleRow,
  attributes: RoleUpdateAttributes,
): RoleRow {
  requireWithin(rolePermissions(role), actor);
  const changed: string[] = [];
  const next = { name: role.name, description: role.description, permissions: role.permissions };
  if (attributes.name !== undefined && attributes.name !== role.name) {
    if (role.isSystem) throw systemRoleProtected("System roles cannot be renamed.");
    next.name = attributes.name;
    changed.push("name");
  }
  if (attributes.description !== undefined && attributes.description !== role.description) {
    next.description = attributes.description;
    changed.push("description");
  }
  if (attributes.permissions !== undefined) {
    const permissions = codes(attributes.permissions);
    if (!sameCodes(permissions, codes(rolePermissions(role)))) {
      if (isAdminRole(role))
        throw systemRoleProtected("The admin role always has every permission.");
      requireWithin(permissions, actor);
      next.permissions = permissions;
      changed.push("permissions");
    }
  }
  if (changed.length === 0) return role;
  if (changed.includes("name")) requireFreeName(state.store, next.name);
  role.name = next.name;
  role.description = next.description;
  role.permissions = next.permissions;
  role.updatedAt = state.clock.now();
  if (changed.includes("permissions")) notifyMembers(state, role);
  audit(state, "role.updated", { actor, client, role }, { changed });
  return role;
}

/** 역할을 지운다. 그 역할을 가진 사용자에게서도 빠진다(FastAPI의 외래 키 ON DELETE CASCADE). */
export function deleteRole(
  state: MockState,
  actor: Principal,
  client: Client,
  role: RoleRow,
): void {
  if (role.isSystem) throw systemRoleProtected("System roles cannot be deleted.");
  requireWithin(rolePermissions(role), actor);
  notifyMembers(state, role);
  state.store.roles.delete(role.id);
  for (const held of state.store.userRoles.values()) held.delete(role.id);
  audit(state, "role.deleted", { actor, client, role }, { name: role.name });
}
