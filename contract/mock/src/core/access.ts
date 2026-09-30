/**
 * 인증과 권한 검사. FastAPI 템플릿의 core/access.py와 같은 규칙이다. JSON:API 라우터(router.ts)가
 * operation마다 계약의 security와 x-permission으로 부른다.
 *
 * - 토큰이 없으면 로그인 필수(required)는 401 auth.unauthenticated, 선택(optional)은 익명이다.
 * - 토큰이 있으면 선택이어도 검증한다. 틀리면 인증기(auth 모듈)가 401을 던진다.
 * - 권한(x-permission)이 있고 Principal에 없으면 403 permission.denied다.
 * - 401에는 WWW-Authenticate: Bearer를 붙인다(RFC 6750).
 */

import type { Context } from "hono";
import type { AppEnv } from "../context.ts";
import { ApiError } from "../jsonapi/errors.ts";
import type { Auth } from "../jsonapi/operations.ts";
import type { Instant } from "./clock.ts";
import type { PermissionCode } from "./permissions.ts";

const CHALLENGE = { "WWW-Authenticate": "Bearer" };

/** 인증된 요청의 주체. permissions는 이번 요청에서 역할로 계산한 실제 권한이다. */
export interface Principal {
  readonly userId: string;
  readonly sessionId: string;
  readonly permissions: ReadonlySet<PermissionCode>;
  /** 이 세션으로 로그인한 시각. refresh로는 바뀌지 않는다. */
  readonly loggedInAt: Instant;
}

/** Bearer 토큰 → Principal. 토큰이 틀리면 401 ApiError를 던진다(auth 모듈이 만든다). */
export type Authenticator = (token: string) => Principal;

/** Authorization: Bearer <토큰>의 토큰. 헤더가 없거나 Bearer가 아니면 undefined다. */
export function bearerToken(header: string | undefined): string | undefined {
  const value = header ?? "";
  const space = value.indexOf(" ");
  const scheme = space === -1 ? value : value.slice(0, space);
  if (scheme.toLowerCase() !== "bearer") return undefined;
  return space === -1 ? "" : value.slice(space + 1).trim();
}

function authenticated(authenticator: Authenticator, token: string): Principal {
  try {
    return authenticator(token);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    throw new ApiError(401, error.code, error.detail, {
      ...error.options,
      headers: { ...error.headers, ...CHALLENGE },
    });
  }
}

/** auth와 permission을 검사하고 Principal을 돌려준다. 익명이면 undefined다. */
export function authorize(
  c: Context<AppEnv>,
  auth: Auth,
  permission: PermissionCode | undefined,
  authenticator: Authenticator,
): Principal | undefined {
  if (auth === "none") return undefined;
  const token = bearerToken(c.req.header("authorization"));
  if (token === undefined) {
    if (auth === "optional") return undefined;
    const detail = "An access token is required (Authorization: Bearer <token>).";
    throw new ApiError(401, "auth.unauthenticated", detail, { headers: CHALLENGE });
  }
  const principal = authenticated(authenticator, token);
  if (permission !== undefined && !principal.permissions.has(permission)) {
    throw new ApiError(403, "permission.denied", `Permission ${permission} is required.`);
  }
  return principal;
}
