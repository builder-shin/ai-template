/**
 * 사용자 관리(/users)의 유스케이스: 목록과 상태·역할 바꾸기(FastAPI의 users/service/management.py).
 *
 * - 목록에는 탈퇴한 사용자도 status deleted로 들어 있다. filter[q]는 이름과 이메일의 부분 일치(대소문자를
 *   가리지 않는다), filter[role]은 그 역할을 가진 사용자다. 기본 정렬은 최근에 만든 순서다.
 * - 권한 상승 금지: 자기 자신, 나보다 권한이 큰 사용자의 상태와 역할은 바꾸지 못하고, 내 권한을 넘는
 *   역할은 주거나 빼지 못한다(403 permission.denied).
 * - 막는 순서: status가 deleted(422, 탈퇴는 본인만 DELETE /me로 한다) → 없는 사용자 404, 탈퇴한 사용자
 *   409 → 자기 자신, 나보다 권한이 큰 사용자 403 → 없는 역할 404(pointer가 그 식별자), 내 권한을 넘는
 *   역할 403 → 마지막 활성 admin의 비활성화나 admin 역할 회수 422. 관계의 역할 id는 FastAPI처럼
 *   Python의 uuid.UUID()로 읽는다.
 * - 역할이 바뀌면 감사 로그 user.roles_changed(더하고 뺀 역할 이름)를, 상태가 바뀌면 user.deactivated나
 *   user.reactivated를 남긴다. 비활성화하면 계정 닫기 처리(세션 폐기)를 부른다. 바뀐 항목을 me.updated로
 *   알리고 그 사용자의 연결을 다시 검사한다. 역할만 바꾸면 사용자 행은 그대로라 updatedAt도 그대로다.
 */

import type { Principal } from "../../core/access.ts";
import { type AuditRecord, recordAudit } from "../../core/audit.ts";
import type { Client } from "../../core/client.ts";
import { parsePythonUuid } from "../../core/ids.ts";
import { containsText, ordered, pageOf, type SortColumns } from "../../core/listing.ts";
import { compareText } from "../../core/permissions.ts";
import { ApiError } from "../../jsonapi/errors.ts";
import type { Page, SortField } from "../../jsonapi/query.ts";
import type { MockState } from "../../state.ts";
import type { Store } from "../../store.ts";
import { isAdminRole, type RoleRow } from "../roles/model.ts";
import {
  changeRoles,
  effectivePermissions,
  rolePermissions,
  rolesOfUser,
  within,
} from "../roles/service.ts";
import { closeAccount, protectLastAdmin } from "./accounts.ts";
import { requireUser } from "./documents.ts";
import { type MeChange, meUpdated } from "./events.ts";
import type { UserRow, UserStatus } from "./model.ts";

const ROLES_POINTER = "/data/relationships/roles/data";
const SORT_COLUMNS: SortColumns<UserRow> = {
  createdAt: (user) => user.createdAt,
  name: (user) => user.name,
  email: (user) => user.email,
};
const DEFAULT_SORT: readonly SortField[] = [{ name: "createdAt", descending: true }];

export interface UserFilter {
  /** 이름과 이메일의 부분 일치. 비었으면 거르지 않는다. */
  readonly q?: string;
  readonly status?: UserStatus;
  /** 이 역할(id)을 가진 사용자만 남긴다. */
  readonly role?: string;
}

function matches(store: Store, user: UserRow, filter: UserFilter): boolean {
  const { q, status, role } = filter;
  if (q && !containsText(user.name, q) && !containsText(user.email, q)) return false;
  if (status !== undefined && user.status !== status) return false;
  return role === undefined || (store.userRoles.get(user.id)?.has(role) ?? false);
}

/** 사용자 한 페이지와 전체 개수. */
export function listUsers(
  store: Store,
  filter: UserFilter,
  sort: readonly SortField[],
  page: Page,
): { rows: UserRow[]; total: number } {
  const found = [...store.users.values()].filter((user) => matches(store, user, filter));
  return pageOf(ordered(found, sort, SORT_COLUMNS, DEFAULT_SORT), page);
}

/** PATCH /users/{id}로 바꿀 값. 없는 값은 그대로 둔다. */
export interface UserChanges {
  readonly status?: UserStatus;
  /** 관계의 역할 id(요청 그대로). 이 목록이 사용자의 역할이 된다. */
  readonly roleIds?: readonly string[];
}

function denied(detail: string): ApiError {
  return new ApiError(403, "permission.denied", detail);
}

/**
 * 요청한 역할 목록과 지금 역할의 차이(줄 역할은 요청 순서, 뺄 역할은 이름순). 주거나 빼는 역할마다 권한이
 * 내 권한 안이어야 한다.
 */
function roleChanges(
  store: Store,
  actor: Principal,
  held: readonly RoleRow[],
  roleIds: readonly string[],
): { added: RoleRow[]; removed: RoleRow[] } {
  const wanted = new Map<string, RoleRow>();
  for (const [index, value] of roleIds.entries()) {
    const id = parsePythonUuid(value);
    const role = id === undefined ? undefined : store.roles.get(id);
    if (role === undefined) {
      const pointer = `${ROLES_POINTER}/${String(index)}`;
      throw new ApiError(404, "resource.not_found", `Role ${value} does not exist.`, { pointer });
    }
    wanted.set(role.id, role);
  }
  const current = new Set(held.map((role) => role.id));
  const added = [...wanted.values()].filter((role) => !current.has(role.id));
  const removed = held.filter((role) => !wanted.has(role.id));
  for (const role of [...added, ...removed]) {
    if (!within(rolePermissions(role), actor.permissions)) {
      throw denied(`The role ${role.name} has permissions you do not have.`);
    }
  }
  return { added, removed };
}

/** 검사를 모두 마친 뒤 바꾼다. 알림은 FastAPI의 commit처럼 모아 보낸다(batch). */
function applyChanges(
  state: MockState,
  actor: Principal,
  client: Client,
  user: UserRow,
  changes: { added: RoleRow[]; removed: RoleRow[]; status: UserStatus | undefined },
): void {
  const { added, removed, status } = changes;
  const audit = (record: Pick<AuditRecord, "action" | "metadata">) => {
    const target = { type: "users", id: user.id } as const;
    const full = { ...record, actorId: actor.userId, ipAddress: client.ip, target };
    recordAudit(state.store, full, state.clock.now());
  };
  const names = (roles: readonly RoleRow[]) => roles.map((role) => role.name).sort(compareText);
  state.realtime.batch(() => {
    const changed: MeChange[] = [];
    if (added.length > 0 || removed.length > 0) {
      changed.push("roles");
      changeRoles(state.store, user.id, added, removed);
      const metadata = { added: names(added), removed: names(removed) };
      audit({ action: "user.roles_changed", metadata });
    }
    if (status !== undefined && status !== user.status) {
      changed.push("status");
      user.status = status;
      user.updatedAt = state.clock.now();
      if (status === "deactivated") closeAccount(state, user.id, "deactivated");
      audit({ action: status === "deactivated" ? "user.deactivated" : "user.reactivated" });
    }
    meUpdated(state.realtime, [user.id], changed);
  });
}

/** 관리자가 사용자의 상태와 역할을 바꾼다. */
export function updateUser(
  state: MockState,
  actor: Principal,
  client: Client,
  userId: string,
  changes: UserChanges,
): UserRow {
  const { store } = state;
  const { status, roleIds } = changes;
  if (status === "deleted") {
    const detail =
      "An admin can only deactivate or reactivate a user. Users leave with DELETE /me.";
    const params = { expected: "'active' or 'deactivated'" };
    const options = { pointer: "/data/attributes/status", params };
    throw new ApiError(422, "validation.invalid_choice", detail, options);
  }
  const user = requireUser(store, userId);
  if (user.status === "deleted") {
    throw new ApiError(409, "resource.conflict", `User ${userId} has left and cannot be changed.`);
  }
  if (user.id === actor.userId) throw denied("You cannot change your own status or roles.");
  if (!within(effectivePermissions(store, user.id), actor.permissions)) {
    throw denied("You cannot change a user who has permissions you do not have.");
  }
  const held = rolesOfUser(store, user.id);
  const { added, removed } =
    roleIds === undefined ? { added: [], removed: [] } : roleChanges(store, actor, held, roleIds);
  const deactivating = status === "deactivated" && user.status === "active";
  if (deactivating || removed.some(isAdminRole)) protectLastAdmin(store, user);
  applyChanges(state, actor, client, user, { added, removed, status });
  return user;
}
