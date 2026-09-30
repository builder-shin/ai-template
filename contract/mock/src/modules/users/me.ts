/**
 * 내 정보 API(/me). 지금은 읽기(GET)만 있다. 이름·로케일·아바타 바꾸기(PATCH)와 탈퇴(DELETE)는
 * users 모듈의 사용자 관리와 함께 더한다.
 */

import type { MockConfig } from "../../config.ts";
import { compareText } from "../../core/permissions.ts";
import type { components } from "../../generated/api.ts";
import { render } from "../../jsonapi/rendering.ts";
import type { JsonApiRouter } from "../../jsonapi/router.ts";
import type { MockState } from "../../state.ts";
import { rolesOfUser } from "../roles/service.ts";
import { includedFor, requireUser, userResource } from "./documents.ts";

type UserMeDocument = components["schemas"]["UserMeDocument"];

export function meRoutes(api: JsonApiRouter, config: MockConfig, state: MockState): void {
  api.route("Me_get", { auth: "required" }, ({ principal, query }) => {
    const user = requireUser(state.store, principal.userId);
    const held = rolesOfUser(state.store, user.id);
    const included = includedFor(state, config, query.include, [user], held);
    const document: UserMeDocument = {
      data: userResource(user, held),
      ...(included.length > 0 ? { included } : {}),
      meta: { permissions: [...principal.permissions].sort(compareText) },
    };
    return render(document, { fields: query.fields });
  });
}
