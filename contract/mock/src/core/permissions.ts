/**
 * 권한 레지스트리. 권한 코드는 계약의 PermissionCode이고, 설명과 그룹은 FastAPI 템플릿의 모듈 권한
 * 선언(modules/<모듈>/permissions.py)과 같다. GET /permissions가 이 목록을 내보내고, admin 역할은
 * 등록된 모든 권한을 가진다.
 *
 * 계약에 권한 코드가 더해지면 DECLARED에 빠진 코드가 있어 타입 검사가 실패한다. 설명과 그룹을
 * FastAPI 템플릿의 선언대로 더한다.
 */

import type { components } from "../generated/api.ts";

export type PermissionCode = components["schemas"]["PermissionCode"];

export interface Permission {
  readonly code: PermissionCode;
  /** 개발자용 영어 설명. 화면은 code로 번역한다. */
  readonly description: string;
  /** 화면에서 묶어 보여 줄 그룹. 예: posts */
  readonly group: string;
}

const DECLARED: Readonly<Record<PermissionCode, Omit<Permission, "code">>> = {
  "admin:access": { description: "Sign in to the admin app.", group: "admin" },
  "roles:read": { description: "Read roles and permissions.", group: "roles" },
  "roles:manage": { description: "Create, change and delete roles.", group: "roles" },
  "users:read": { description: "Read every user's full profile.", group: "users" },
  "users:manage": { description: "Change a user's status and roles.", group: "users" },
  "audit-logs:read": { description: "Read audit logs.", group: "audit-logs" },
  "posts:create": { description: "Write posts.", group: "posts" },
  "posts:manage": { description: "Manage every post, including drafts.", group: "posts" },
};

/** 등록된 권한 코드인가. 역할에 저장된 코드 가운데 등록되지 않은 것은 실제 권한에서 뺀다. */
export function isPermissionCode(code: string): code is PermissionCode {
  return Object.hasOwn(DECLARED, code);
}

/** 문자열 순서. 권한 코드와 역할 이름을 FastAPI의 sorted()와 같은 순서로 늘어놓는다. */
export function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** 등록된 권한. 코드 순이다(FastAPI의 PermissionRegistry). */
export const PERMISSIONS: readonly Permission[] = Object.entries(DECLARED)
  .flatMap(([code, rest]) => (isPermissionCode(code) ? [{ code, ...rest }] : []))
  .sort((left, right) => compareText(left.code, right.code));

/** 등록된 모든 권한 코드. */
export const PERMISSION_CODES: ReadonlySet<PermissionCode> = new Set(
  PERMISSIONS.map((permission) => permission.code),
);
