/**
 * auth의 API: 가입(Registrations), 인증 메일 재발송(EmailVerificationRequests), 이메일 인증
 * (EmailVerifications), 세션(Sessions), 다른 기기·전체 로그아웃(SessionRevocations), 비밀번호
 * 재설정 요청(PasswordResetRequests), 재설정(PasswordResets), 변경(PasswordChanges), 소셜 로그인의
 * 리다이렉트(OAuth). 규칙은 서비스(accounts.ts, sessions.ts, passwords.ts, oauth.ts)에 있고, 여기서는
 * 요청을 넘기고 문서나 리다이렉트를 만든다.
 */

import type { MockConfig } from "../../config.ts";
import { clientOf } from "../../core/client.ts";
import { formatInstant } from "../../core/clock.ts";
import { uuid7 } from "../../core/ids.ts";
import type { components } from "../../generated/api.ts";
import { redirectResponse } from "../../jsonapi/redirect.ts";
import { pagination, render } from "../../jsonapi/rendering.ts";
import type { JsonApiRouter } from "../../jsonapi/router.ts";
import type { MockState } from "../../state.ts";
import { localeFrom } from "../users/accounts.ts";
import { register, requestVerification, verifyEmail } from "./accounts.ts";
import type { IssuedTokens } from "./credentials.ts";
import type { LoginSessionRow } from "./model.ts";
import { authorize, callback } from "./oauth.ts";
import { changePassword, requestReset, resetPassword } from "./passwords.ts";
import { listSessions, revokeSession, revokeSessions, signIn } from "./sessions.ts";

type Schemas = components["schemas"];

function userOf(login: LoginSessionRow): Schemas["SessionRelationships"] {
  return { user: { data: { type: "users", id: login.userId } } };
}

/** 세션 리소스. current는 요청을 보낸 세션이면 true다. */
function sessionResource(
  login: LoginSessionRow,
  currentId: string | undefined,
): Schemas["SessionResource"] {
  return {
    type: "sessions",
    id: login.id,
    attributes: {
      userAgent: login.userAgent,
      createdAt: formatInstant(login.createdAt),
      lastUsedAt: formatInstant(login.lastUsedAt),
      current: login.id === currentId,
    },
    relationships: userOf(login),
  };
}

/** 토큰을 담은 세션 리소스. POST /sessions의 201 응답에만 쓴다. */
function tokensResource(issued: IssuedTokens): Schemas["SessionWithTokensResource"] {
  const login = issued.session;
  return {
    type: "sessions",
    id: login.id,
    attributes: {
      userAgent: login.userAgent,
      createdAt: formatInstant(login.createdAt),
      lastUsedAt: formatInstant(login.lastUsedAt),
      current: true,
      accessToken: issued.accessToken,
      accessTokenExpiresAt: formatInstant(issued.accessTokenExpiresAt),
      refreshToken: issued.refreshToken,
      refreshTokenExpiresAt: formatInstant(issued.refreshTokenExpiresAt),
    },
    relationships: userOf(login),
  };
}

function accountRoutes(api: JsonApiRouter, config: MockConfig, state: MockState): void {
  api.route("Registrations_create", { auth: "none" }, ({ c, document }) => {
    const attributes = document.data.attributes;
    const user = register(state, config, clientOf(c), attributes, c.req.header("accept-language"));
    const body: Schemas["RegistrationDocument"] = {
      data: {
        type: "registrations",
        id: user.id,
        attributes: { email: user.email ?? "", createdAt: formatInstant(user.createdAt) },
        relationships: { user: { data: { type: "users", id: user.id } } },
      },
    };
    return render(body, { status: 201 });
  });

  api.route("EmailVerificationRequests_create", { auth: "none" }, ({ c, document }) => {
    requestVerification(state, config, clientOf(c), document.data.attributes.email);
    return c.body(null, 202);
  });

  api.route("EmailVerifications_create", { auth: "none" }, ({ document }) => {
    const verified = verifyEmail(state, config, document.data.attributes.token);
    const body: Schemas["EmailVerificationDocument"] = {
      data: {
        type: "email-verifications",
        id: verified.id,
        attributes: { verifiedAt: formatInstant(verified.verifiedAt) },
      },
    };
    return render(body, { status: 201 });
  });
}

function sessionRoutes(api: JsonApiRouter, config: MockConfig, state: MockState): void {
  api.route("Sessions_create", { auth: "none" }, ({ c, document }) => {
    const issued = signIn(state, config, clientOf(c), document.data.attributes);
    const body: Schemas["SessionWithTokensDocument"] = { data: tokensResource(issued) };
    return render(body, { status: 201 });
  });

  api.route("Sessions_list", { auth: "required" }, ({ c, principal, query }) => {
    const { rows, total } = listSessions(state, principal, query.sort, query.page);
    const body: Schemas["SessionCollectionDocument"] = {
      data: rows.map((login) => sessionResource(login, principal.sessionId)),
      ...pagination(c, query.page, total),
    };
    return render(body, { fields: query.fields });
  });

  // /current는 /{id}보다 먼저 단다. 경로는 단 순서로 맞춰 본다.
  api.route("Sessions_deleteCurrent", { auth: "required" }, ({ c, principal }) => {
    revokeSession(state, principal, principal.sessionId);
    return c.body(null, 204);
  });

  api.route("Sessions_delete", { auth: "required" }, ({ c, principal, path }) => {
    revokeSession(state, principal, path.id);
    return c.body(null, 204);
  });

  api.route("SessionRevocations_create", { auth: "required" }, ({ c, principal, document }) => {
    const scope = document.data.attributes.scope;
    const revoked = revokeSessions(state, principal, clientOf(c), scope);
    const body: Schemas["SessionRevocationDocument"] = {
      data: {
        type: "session-revocations",
        id: uuid7(),
        attributes: { scope, revokedCount: revoked, createdAt: formatInstant(state.clock.now()) },
      },
    };
    return render(body, { status: 201 });
  });
}

function passwordRoutes(api: JsonApiRouter, config: MockConfig, state: MockState): void {
  api.route("PasswordResetRequests_create", { auth: "none" }, ({ c, document }) => {
    requestReset(state, config, clientOf(c), document.data.attributes.email);
    return c.body(null, 202);
  });

  api.route("PasswordResets_create", { auth: "none" }, ({ c, document }) => {
    const reset = resetPassword(state, clientOf(c), document.data.attributes);
    const body: Schemas["PasswordResetDocument"] = {
      data: {
        type: "password-resets",
        id: reset.id,
        attributes: { createdAt: formatInstant(reset.createdAt) },
      },
    };
    return render(body, { status: 201 });
  });

  api.route("PasswordChanges_create", { auth: "required" }, ({ c, principal, document }) => {
    const attributes = document.data.attributes;
    const changedAt = changePassword(state, config, principal, clientOf(c), attributes);
    const body: Schemas["PasswordChangeDocument"] = {
      data: {
        type: "password-changes",
        id: uuid7(),
        attributes: { createdAt: formatInstant(changedAt) },
      },
    };
    return render(body, { status: 201 });
  });
}

/** 소셜 로그인: 제공자로 보내고(authorize), 제공자가 돌아오면 프론트 콜백으로 보낸다(callback). */
function oauthRoutes(api: JsonApiRouter, config: MockConfig, state: MockState): void {
  api.redirect("OAuth_authorize", { callback: false }, ({ path, query }) => {
    const { redirectUri, codeChallenge } = query;
    return redirectResponse(authorize(state, config, path.provider, redirectUri, codeChallenge));
  });

  api.redirect("OAuth_callback", { callback: true }, ({ c, path, query }) => {
    const locale = localeFrom(c.req.header("accept-language"));
    return redirectResponse(callback(state, config, path.provider, query, locale));
  });
}

export function authRoutes(api: JsonApiRouter, config: MockConfig, state: MockState): void {
  accountRoutes(api, config, state);
  sessionRoutes(api, config, state);
  passwordRoutes(api, config, state);
  oauthRoutes(api, config, state);
}
