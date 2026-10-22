/**
 * 계정 도우미: 가입, 이메일 인증, 로그인을 API로 한다. 권한을 가진 사용자와 역할은 저장소에 바로 만든다
 * (FastAPI 테스트의 app/tests/accounts.py).
 */

import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { expect } from "vitest";
import type { AppEnv } from "../src/context.ts";
import { uuid7 } from "../src/core/ids.ts";
import { compareText, type PermissionCode } from "../src/core/permissions.ts";
import type { components } from "../src/generated/api.ts";
import { JSONAPI_MEDIA_TYPE } from "../src/jsonapi/media.ts";
import type { RoleRow } from "../src/modules/roles/model.ts";
import { assignRoles } from "../src/modules/roles/service.ts";
import { createAccount } from "../src/modules/users/accounts.ts";
import type { UserRow } from "../src/modules/users/model.ts";
import type { MockState } from "../src/state.ts";

type App = Hono<AppEnv>;
type SessionWithTokensResource = components["schemas"]["SessionWithTokensResource"];

export const PASSWORD = "conformance-password"; // betterleaks:allow 테스트용 가짜 비밀번호

/** 테스트마다 겹치지 않는 이메일. */
export function newEmail(label = "user"): string {
  return `${label}-${randomUUID()}@example.com`;
}

export interface SendOptions {
  /** 요청 본문(JSON:API 문서). */
  readonly document?: unknown;
  /** access token. 있으면 Authorization: Bearer로 보낸다. */
  readonly token?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/** JSON:API 요청을 보낸다. */
export function send(
  app: App,
  method: string,
  path: string,
  options: SendOptions = {},
): Promise<Response> {
  const { document, token, headers = {} } = options;
  const init: RequestInit = {
    method,
    headers: {
      Accept: JSONAPI_MEDIA_TYPE,
      ...(document === undefined ? {} : { "Content-Type": JSONAPI_MEDIA_TYPE }),
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      ...headers,
    },
  };
  if (document !== undefined) init.body = JSON.stringify(document);
  return Promise.resolve(app.request(path, init));
}

export function registration(email: string, attributes: Record<string, unknown> = {}) {
  return {
    data: {
      type: "registrations",
      attributes: { email, password: PASSWORD, name: "가입자", ...attributes },
    },
  };
}

export function passwordGrant(email: string, password = PASSWORD) {
  return { data: { type: "sessions", attributes: { grantType: "password", email, password } } };
}

export function refreshGrant(refreshToken: string) {
  return { data: { type: "sessions", attributes: { grantType: "refreshToken", refreshToken } } };
}

/** 가입만 한다(인증 전). */
export async function register(
  app: App,
  email = newEmail(),
): Promise<{ email: string; userId: string }> {
  const response = await send(app, "POST", "/api/v1/registrations", {
    document: registration(email),
  });
  expect(response.status, await response.clone().text()).toBe(201);
  const body = (await response.json()) as { data: { id: string } };
  return { email, userId: body.data.id };
}

/** 받는 사람에게 온 가장 최근 메일 가운데 이 경로의 토큰 링크(`<경로>?token=`)가 있는 메일의 토큰. */
export function mailToken(state: MockState, email: string, path: string): string {
  const mail = state.outbox.list(email).find((item) => item.text.includes(`${path}?token=`));
  const token = /[?&]token=([A-Za-z0-9_-]+)/.exec(mail?.text ?? "")?.[1];
  if (token === undefined) throw new Error(`${email}에게 온 ${path} 메일이 없다.`);
  return token;
}

/** 받는 사람에게 온 가장 최근 인증 메일의 토큰. */
export function verificationToken(state: MockState, email: string): string {
  return mailToken(state, email, "/verify-email");
}

export function verification(token: string) {
  return { data: { type: "email-verifications", attributes: { token } } };
}

/** 가장 최근 인증 메일의 토큰으로 이메일 인증을 마친다. */
export async function verify(app: App, state: MockState, email: string): Promise<void> {
  const document = verification(verificationToken(state, email));
  const response = await send(app, "POST", "/api/v1/email-verifications", { document });
  expect(response.status, await response.clone().text()).toBe(201);
}

export interface SignedIn {
  readonly email: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly resource: SessionWithTokensResource;
}

/** 비밀번호로 로그인한다. headers로 User-Agent 등을 더한다. */
export async function signIn(
  app: App,
  email: string,
  password = PASSWORD,
  headers: Readonly<Record<string, string>> = {},
): Promise<SignedIn> {
  const document = passwordGrant(email, password);
  const response = await send(app, "POST", "/api/v1/sessions", { document, headers });
  expect(response.status, await response.clone().text()).toBe(201);
  const { data } = (await response.json()) as { data: SessionWithTokensResource };
  return {
    email,
    userId: data.relationships.user.data?.id ?? "",
    sessionId: data.id,
    accessToken: data.attributes.accessToken,
    refreshToken: data.attributes.refreshToken,
    resource: data,
  };
}

/** 가입하고 이메일 인증을 마친 뒤 로그인한 새 사용자. */
export async function newUser(app: App, state: MockState, email = newEmail()): Promise<SignedIn> {
  await register(app, email);
  await verify(app, state, email);
  return signIn(app, email);
}

/** 이 권한만 가진 역할을 저장소에 바로 만든다. 이름은 겹치지 않는다. */
export function newRole(state: MockState, permissions: readonly PermissionCode[] = []): RoleRow {
  const now = state.clock.now();
  const role: RoleRow = {
    id: uuid7(),
    name: `role-${randomUUID().slice(0, 8)}`,
    description: null,
    permissions: [...new Set(permissions)].sort(compareText),
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  };
  state.store.roles.set(role.id, role);
  return role;
}

/** 이 권한만 가진 역할을 새로 만들어 준, 로그인한 새 사용자. member 역할도 그대로 가진다. */
export async function userWith(
  app: App,
  state: MockState,
  permissions: readonly PermissionCode[],
): Promise<SignedIn & { readonly roleId: string }> {
  const user = await newUser(app, state);
  const role = newRole(state, permissions);
  assignRoles(state.store, user.userId, [role]);
  return { ...user, roleId: role.id };
}

export interface AccountOptions {
  readonly email?: string;
  readonly name?: string;
  readonly roleNames?: readonly string[];
}

/** 이메일 인증을 마친 계정을 저장소에 바로 만든다(FastAPI 테스트의 accounts.create). 기본 역할은 member다. */
export function newAccount(state: MockState, options: AccountOptions = {}): UserRow {
  const account = {
    email: options.email ?? newEmail(),
    password: PASSWORD,
    name: options.name ?? "가입자",
    locale: "ko" as const,
    verified: true,
    ...(options.roleNames === undefined ? {} : { roleNames: options.roleNames }),
  };
  return createAccount(state.store, account, state.clock.now());
}
