/**
 * users의 API: 내 정보(Me). FastAPI의 users/router.py와 같다. 규칙은 서비스(profile.ts)에 있고, 여기서는
 * 요청을 넘기고 문서를 만든다.
 *
 * - GET /me와 PATCH /me는 내 계정과 meta.permissions(이번 요청에서 계산한 실제 권한)를 준다. PATCH의
 *   응답에는 포함 리소스가 없다.
 * - PATCH 본문의 data.id가 내 id와 다르면 409다. 탈퇴(DELETE /me)는 204다.
 */

import type { MockConfig } from "../../config.ts";
import type { Principal } from "../../core/access.ts";
import { clientOf } from "../../core/client.ts";
import { compareText } from "../../core/permissions.ts";
import type { components } from "../../generated/api.ts";
import { render } from "../../jsonapi/rendering.ts";
import type { JsonApiRouter } from "../../jsonapi/router.ts";
import { requireMatchingId } from "../../jsonapi/validation.ts";
import type { MockState } from "../../state.ts";
import { rolesOfUser } from "../roles/service.ts";
import { includedFor, requireUser, userResource } from "./documents.ts";
import { deleteMe, updateMe } from "./profile.ts";

type UserMeDocument = components["schemas"]["UserMeDocument"];

/** 내 정보 문서. include 경로의 포함 리소스를 담는다. */
function meDocument(
  state: MockState,
  config: MockConfig,
  actor: Principal,
  include: readonly string[],
): UserMeDocument {
  const user = requireUser(state.store, actor.userId);
  const held = rolesOfUser(state.store, user.id);
  const included = includedFor(state, config, include, [user], held);
  return {
    data: userResource(user, held),
    ...(included.length > 0 ? { included } : {}),
    meta: { permissions: [...actor.permissions].sort(compareText) },
  };
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

export function userRoutes(api: JsonApiRouter, config: MockConfig, state: MockState): void {
  meRoutes(api, config, state);
}
