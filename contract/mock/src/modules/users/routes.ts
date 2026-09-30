/**
 * users의 API: 내 정보(Me)와 사용자 관리(Users). FastAPI의 users/router.py와 같다. 규칙은 서비스
 * (profile.ts, management.ts)에 있고, 여기서는 요청을 넘기고 문서를 만든다.
 *
 * - GET /me와 PATCH /me는 내 계정과 meta.permissions(이번 요청에서 계산한 실제 권한)를 준다. 탈퇴
 *   (DELETE /me)는 204다.
 * - 사용자 관리는 users:read(목록, 단건)와 users:manage(PATCH) 권한이 있어야 한다. 전체 속성(이메일
 *   포함)을 준다.
 * - PATCH 본문의 data.id가 대상과 다르면 409다. PATCH의 응답에는 포함 리소스가 없다.
 */

import type { MockConfig } from "../../config.ts";
import type { Principal } from "../../core/access.ts";
import { clientOf } from "../../core/client.ts";
import { compareText } from "../../core/permissions.ts";
import type { components } from "../../generated/api.ts";
import { enumFilter, textFilter, uuidFilter } from "../../jsonapi/filters.ts";
import { pagination, render } from "../../jsonapi/rendering.ts";
import type { JsonApiRouter } from "../../jsonapi/router.ts";
import { requireMatchingId } from "../../jsonapi/validation.ts";
import type { MockState } from "../../state.ts";
import { rolesOfUser } from "../roles/service.ts";
import { includedFor, requireUser, userResource } from "./documents.ts";
import { listUsers, updateUser } from "./management.ts";
import type { UserRow } from "./model.ts";
import { deleteMe, updateMe } from "./profile.ts";

type Schemas = components["schemas"];

const USER_FILTERS = { q: textFilter, status: enumFilter("UserStatus"), role: uuidFilter };

/** 내 정보 문서. include 경로의 포함 리소스를 담는다. */
function meDocument(
  state: MockState,
  config: MockConfig,
  actor: Principal,
  include: readonly string[],
): Schemas["UserMeDocument"] {
  const user = requireUser(state.store, actor.userId);
  const held = rolesOfUser(state.store, user.id);
  const included = includedFor(state, config, include, [user], held);
  return {
    data: userResource(user, held),
    ...(included.length > 0 ? { included } : {}),
    meta: { permissions: [...actor.permissions].sort(compareText) },
  };
}

/** 사용자 한 명의 문서. include 경로의 포함 리소스를 담는다. */
function userDocument(
  state: MockState,
  config: MockConfig,
  user: UserRow,
  include: readonly string[],
): Schemas["UserDocument"] {
  const held = rolesOfUser(state.store, user.id);
  const included = includedFor(state, config, include, [user], held);
  return { data: userResource(user, held), ...(included.length > 0 ? { included } : {}) };
}

function meRoutes(api: JsonApiRouter, config: MockConfig, state: MockState): void {
  api.route("Me_get", { auth: "required" }, ({ principal, query }) => {
    const document = meDocument(state, config, principal, query.include);
    return render(document, { fields: query.fields });
  });

  api.route("Me_update", { auth: "required" }, ({ principal, document }) => {
    const { id, attributes, relationships } = document.data;
    requireMatchingId(id, principal.userId);
    const avatar = relationships?.avatar;
    updateMe(state, principal, {
      ...attributes,
      ...(avatar === undefined ? {} : { avatar: avatar.data?.id ?? null }),
    });
    return render(meDocument(state, config, principal, []));
  });

  api.route("Me_delete", { auth: "required" }, ({ c, principal }) => {
    deleteMe(state, principal, clientOf(c));
    return c.body(null, 204);
  });
}

function managementRoutes(api: JsonApiRouter, config: MockConfig, state: MockState): void {
  api.route("Users_list", { auth: "required", filters: USER_FILTERS }, ({ c, query }) => {
    const { rows, total } = listUsers(state.store, query.filter, query.sort, query.page);
    const held = new Map(rows.map((user) => [user.id, rolesOfUser(state.store, user.id)]));
    const everyRole = rows.flatMap((user) => held.get(user.id) ?? []);
    const included = includedFor(state, config, query.include, rows, everyRole);
    const body: Schemas["UserCollectionDocument"] = {
      data: rows.map((user) => userResource(user, held.get(user.id) ?? [])),
      ...pagination(c, query.page, total),
      ...(included.length > 0 ? { included } : {}),
    };
    return render(body, { fields: query.fields });
  });

  api.route("Users_get", { auth: "required" }, ({ path, query }) => {
    const user = requireUser(state.store, path.id);
    return render(userDocument(state, config, user, query.include), { fields: query.fields });
  });

  api.route("Users_update", { auth: "required" }, ({ c, principal, path, document }) => {
    const { id, attributes, relationships } = document.data;
    requireMatchingId(id, path.id);
    const roles = relationships?.roles;
    const user = updateUser(state, principal, clientOf(c), path.id, {
      ...attributes,
      ...(roles === undefined ? {} : { roleIds: roles.data.map((identifier) => identifier.id) }),
    });
    return render(userDocument(state, config, user, []));
  });
}

export function userRoutes(api: JsonApiRouter, config: MockConfig, state: MockState): void {
  meRoutes(api, config, state);
  managementRoutes(api, config, state);
}
