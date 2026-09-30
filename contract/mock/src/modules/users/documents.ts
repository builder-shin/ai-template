/**
 * 사용자 문서의 조립: 리소스, 관계, 포함 리소스. GET /me와 사용자 관리 API가 함께 쓴다(FastAPI의
 * users/router.py의 user_resource, included_for).
 */

import { formatInstant } from "../../core/clock.ts";
import type { components } from "../../generated/api.ts";
import { ApiError } from "../../jsonapi/errors.ts";
import { loadIncluded } from "../../jsonapi/rendering.ts";
import type { Store } from "../../store.ts";
import type { RoleRow } from "../roles/model.ts";
import { roleResource } from "../roles/service.ts";
import type { UserRow } from "./model.ts";

type UserResource = components["schemas"]["UserResource"];
/** 사용자 문서의 포함 리소스. */
export type UserIncluded =
  components["schemas"]["RoleResource"] | components["schemas"]["FileResource"];

/** 전체 속성의 사용자 리소스. 본인과 users:read 권한자에게만 준다. */
export function userResource(user: UserRow, held: readonly RoleRow[]): UserResource {
  return {
    type: "users",
    id: user.id,
    attributes: {
      email: user.email,
      name: user.name,
      locale: user.locale,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt === null ? null : formatInstant(user.emailVerifiedAt),
      createdAt: formatInstant(user.createdAt),
      updatedAt: formatInstant(user.updatedAt),
    },
    relationships: {
      roles: { data: held.map((role) => ({ type: "roles", id: role.id })) },
      avatar: { data: user.avatarId === null ? null : { type: "files", id: user.avatarId } },
    },
  };
}

/**
 * include 경로마다 포함 리소스(FastAPI의 included_for). 역할은 사용자들이 가진 역할이다. 아바타(avatar)는
 * files 모듈이 파일 리소스를 만들 때 여기에 더한다. 그 전에는 아바타를 정할 방법(PATCH /me, 파일
 * 업로드)이 없어 늘 비어 있다.
 */
export function includedFor(include: readonly string[], held: readonly RoleRow[]): UserIncluded[] {
  return loadIncluded<UserIncluded>(include, {
    roles: () => held.map(roleResource),
    avatar: () => [],
  });
}

/** id의 사용자. 없으면 404 resource.not_found다. */
export function requireUser(store: Store, userId: string): UserRow {
  const user = store.users.get(userId);
  if (user === undefined) {
    throw new ApiError(404, "resource.not_found", `User ${userId} does not exist.`);
  }
  return user;
}
