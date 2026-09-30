/**
 * 사용자 문서의 조립: 리소스, 관계, 포함 리소스. GET /me와 사용자 관리 API가 함께 쓴다(FastAPI의
 * users/router.py의 user_resource, included_for).
 */

import type { MockConfig } from "../../config.ts";
import { formatInstant } from "../../core/clock.ts";
import type { components } from "../../generated/api.ts";
import { ApiError } from "../../jsonapi/errors.ts";
import { loadIncluded } from "../../jsonapi/rendering.ts";
import type { MockState } from "../../state.ts";
import type { Store } from "../../store.ts";
import { fileResources } from "../files/documents.ts";
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
 * include 경로마다 포함 리소스(FastAPI의 included_for). 역할은 사용자들이 가진 역할이고, 아바타는
 * 사용자들의 아바타 파일이다(ready면 downloadUrl이 있다).
 */
export function includedFor(
  state: MockState,
  config: MockConfig,
  include: readonly string[],
  found: readonly UserRow[],
  held: readonly RoleRow[],
): UserIncluded[] {
  const avatarIds = found.flatMap((user) => user.avatarId ?? []);
  return loadIncluded<UserIncluded>(include, {
    roles: () => held.map(roleResource),
    avatar: () => fileResources(state, config, avatarIds),
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
