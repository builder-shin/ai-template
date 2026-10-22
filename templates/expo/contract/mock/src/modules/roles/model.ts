/**
 * 역할과 사용자-역할 연결(FastAPI의 roles, user_roles 테이블).
 *
 * - 역할은 권한 코드의 묶음이다. 시스템 역할 admin과 member는 시드가 만든다(isSystem).
 * - admin의 권한은 저장하지 않고 "등록된 모든 권한"으로 계산한다(service.rolePermissions).
 */

import type { Instant } from "../../core/clock.ts";

export const ADMIN_ROLE = "admin";
/** 가입하면 받는 역할. */
export const MEMBER_ROLE = "member";

export interface RoleRow {
  readonly id: string;
  name: string;
  description: string | null;
  /** 저장한 권한 코드(정렬, 중복 없음). admin은 비어 있다. */
  permissions: string[];
  readonly isSystem: boolean;
  readonly createdAt: Instant;
  updatedAt: Instant;
}

/** 시스템 admin 역할인가. */
export function isAdminRole(role: RoleRow): boolean {
  return role.isSystem && role.name === ADMIN_ROLE;
}
