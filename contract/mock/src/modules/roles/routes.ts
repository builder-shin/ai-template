/**
 * roles의 API: 역할(Roles)과 권한(Permissions). FastAPI의 roles/router.py와 같다. 규칙은 서비스
 * (management.ts)에 있고, 여기서는 요청을 넘기고 문서를 만든다.
 *
 * - 읽기는 roles:read, 만들기·고치기·지우기는 roles:manage 권한이 있어야 한다.
 * - PATCH 본문의 data.id가 경로와 다르면 409이고, 그다음 역할이 없으면 404다. attributes가 없으면 고치지
 *   않고(권한 검사도 하지 않는다) 역할을 그대로 준다.
 * - 권한 목록은 등록된 권한(core/permissions.ts)을 코드 순으로 준다. 정렬할 수 있는 것은 id뿐이다.
 */

import { clientOf } from "../../core/client.ts";
import { pageOf } from "../../core/listing.ts";
import { type Permission, PERMISSIONS } from "../../core/permissions.ts";
import type { components } from "../../generated/api.ts";
import { textFilter } from "../../jsonapi/filters.ts";
import { pagination, render } from "../../jsonapi/rendering.ts";
import type { JsonApiRouter } from "../../jsonapi/router.ts";
import { requireMatchingId } from "../../jsonapi/validation.ts";
import type { MockState } from "../../state.ts";
import { createRole, deleteRole, getRole, listRoles, updateRole } from "./management.ts";
import { roleResource } from "./service.ts";

type Schemas = components["schemas"];

const ROLE_FILTERS = { q: textFilter };

function permissionResource(permission: Permission): Schemas["PermissionResource"] {
  const { code, description, group } = permission;
  return { type: "permissions", id: code, attributes: { description, group } };
}

function roleManagementRoutes(api: JsonApiRouter, state: MockState): void {
  api.route("Roles_list", { auth: "required", filters: ROLE_FILTERS }, ({ c, query }) => {
    const { rows, total } = listRoles(state.store, query.filter.q, query.sort, query.page);
    const body: Schemas["RoleCollectionDocument"] = {
      data: rows.map(roleResource),
      ...pagination(c, query.page, total),
    };
    return render(body, { fields: query.fields });
  });

  api.route("Roles_create", { auth: "required" }, ({ c, principal, document }) => {
    const role = createRole(state, principal, clientOf(c), document.data.attributes);
    const body: Schemas["RoleDocument"] = { data: roleResource(role) };
    return render(body, { status: 201 });
  });

  api.route("Roles_get", { auth: "required" }, ({ path, query }) => {
    const body: Schemas["RoleDocument"] = { data: roleResource(getRole(state.store, path.id)) };
    return render(body, { fields: query.fields });
  });

  api.route("Roles_update", { auth: "required" }, ({ c, principal, path, document }) => {
    const { id, attributes } = document.data;
    requireMatchingId(id, path.id);
    const found = getRole(state.store, path.id);
    const role =
      attributes === undefined
        ? found
        : updateRole(state, principal, clientOf(c), found, attributes);
    const body: Schemas["RoleDocument"] = { data: roleResource(role) };
    return render(body);
  });

  api.route("Roles_delete", { auth: "required" }, ({ c, principal, path }) => {
    deleteRole(state, principal, clientOf(c), getRole(state.store, path.id));
    return c.body(null, 204);
  });
}

function permissionRoutes(api: JsonApiRouter): void {
  api.route("Permissions_list", { auth: "required" }, ({ c, query }) => {
    const descending = query.sort[0]?.descending === true;
    const permissions = descending ? PERMISSIONS.toReversed() : PERMISSIONS;
    const { rows, total } = pageOf(permissions, query.page);
    const body: Schemas["PermissionCollectionDocument"] = {
      data: rows.map(permissionResource),
      ...pagination(c, query.page, total),
    };
    return render(body, { fields: query.fields });
  });
}

export function roleRoutes(api: JsonApiRouter, state: MockState): void {
  roleManagementRoutes(api, state);
  permissionRoutes(api);
}
