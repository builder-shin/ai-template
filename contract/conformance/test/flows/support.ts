/**
 * 흐름 테스트의 공통 준비: 대상, 메일함, 시드된 관리자, 계정 도우미.
 * 흐름 파일은 병렬로 돌고 DB를 초기화하지 않으므로, 계정은 테스트마다 새 이메일로 만든다.
 */

import { randomUUID } from "node:crypto";
import { type ApiClient, createApiClient } from "../../src/client.ts";
import type { components } from "../../src/generated/api.ts";
import { extractToken, MAIL_LINKS } from "../../src/side-channels.ts";
import { createMockOAuthDriver } from "../../src/side-channels/oauth.ts";
import { resolveAdmin, resolveMailbox, resolveTarget } from "../../src/targets.ts";

export type ErrorDocument = components["schemas"]["ErrorDocument"];
export type PermissionCode = components["schemas"]["PermissionCode"];
export type FileResource = components["schemas"]["FileResource"];

export const target = resolveTarget(process.env);
export const mailbox = resolveMailbox(process.env);
export const admin = resolveAdmin(process.env);
/** 소셜 로그인을 브라우저 대신 진행한다. 대상 스택의 모의 OAuth 서버를 쓴다. */
export const oauth = createMockOAuthDriver({ baseUrl: target.baseUrl });
/** 소셜 로그인이 끝나고 돌아갈 프론트 콜백. 대상의 OAUTH_REDIRECT_URIS에 있어야 한다. */
export const FRONT_CALLBACK = "http://localhost:3000/oauth/callback";

/** 흐름이 가입할 때 쓰는 비밀번호. */
export const PASSWORD = "conformance-password"; // betterleaks:allow 적합성 흐름의 가짜 비밀번호
/** 재설정과 변경으로 바꿀 비밀번호. */
export const NEW_PASSWORD = "conformance-new-password"; // betterleaks:allow 적합성 흐름의 가짜 비밀번호

/**
 * 짝 없는 서로게이트 하나(U+D800). 타입 클라이언트(JSON.stringify)는 \ud800 이스케이프로 보낸다. 제약
 * 없는 문자열(비밀번호, id)에 넣으면 백엔드는 500이 아니라 같은 요청의 보통 에러로 답해야 하고, 제약
 * 있는 문자열(역할 설명)에 넣으면 422 validation.invalid_format으로 답해야 한다.
 */
export const LONE_SURROGATE = "\ud800";

/** 모든 응답을 계약으로 검증하는 클라이언트. accessToken을 주면 로그인한 요청이다. */
export function api(accessToken?: string): ApiClient {
  return createApiClient({
    baseUrl: target.baseUrl,
    ...(accessToken === undefined ? {} : { accessToken }),
  });
}

/** 테스트마다 고유한 이메일. */
export function uniqueEmail(label = "user"): string {
  return `${label}-${randomUUID()}@example.com`;
}

/** 에러 문서의 (코드, source.pointer) 목록. */
export function problems(error: ErrorDocument | undefined): [string, string | undefined][] {
  return (error?.errors ?? []).map((item) => [item.code, item.source?.pointer]);
}

/** 에러 문서의 코드 목록. */
export function codes(error: ErrorDocument | undefined): string[] {
  return (error?.errors ?? []).map((item) => item.code);
}

export interface Account {
  readonly email: string;
  readonly password: string;
  readonly userId: string;
}

export interface Session extends Account {
  readonly sessionId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  /** 이 세션으로 로그인한 클라이언트. */
  readonly api: ApiClient;
}

/** 가입만 한다(인증 전). 인증 메일은 mailbox.latest로 받는다. */
export async function register(email = uniqueEmail(), name = "적합성"): Promise<Account> {
  const { data, response } = await api().POST("/api/v1/registrations", {
    body: { data: { type: "registrations", attributes: { email, password: PASSWORD, name } } },
  });
  const userId = data?.data.relationships.user.data?.id;
  if (userId === undefined) throw new Error(`가입하지 못했다: ${String(response.status)}`);
  return { email, password: PASSWORD, userId };
}

/** 가장 최근 인증 메일의 토큰. */
export async function verificationToken(email: string): Promise<string> {
  const mail = await mailbox.latest(email, { linkPath: MAIL_LINKS.emailVerification });
  return extractToken(mail);
}

/** 인증 메일의 토큰으로 이메일 인증을 마친다. */
export async function verify(account: Account): Promise<void> {
  const token = await verificationToken(account.email);
  const { response } = await api().POST("/api/v1/email-verifications", {
    body: { data: { type: "email-verifications", attributes: { token } } },
  });
  if (response.status !== 201) {
    throw new Error(`이메일을 인증하지 못했다: ${String(response.status)}`);
  }
}

/** 비밀번호로 로그인한다. */
export async function signIn(credentials: {
  readonly email: string;
  readonly password: string;
}): Promise<Session> {
  const { email, password } = credentials;
  const { data, response } = await api().POST("/api/v1/sessions", {
    body: { data: { type: "sessions", attributes: { grantType: "password", email, password } } },
  });
  if (data === undefined) throw new Error(`로그인하지 못했다: ${String(response.status)}`);
  const { id, attributes, relationships } = data.data;
  return {
    email,
    password,
    userId: relationships.user.data?.id ?? "",
    sessionId: id,
    accessToken: attributes.accessToken,
    refreshToken: attributes.refreshToken,
    api: api(attributes.accessToken),
  };
}

/** 가입과 이메일 인증을 마치고 로그인한 새 사용자. */
export async function newUser(): Promise<Session> {
  const account = await register();
  await verify(account);
  return signIn(account);
}

let adminSession: Promise<Session> | undefined;

/**
 * 시드된 관리자로 로그인한 세션. 흐름 파일마다 한 번만 로그인한다.
 * 흐름은 시드된 관리자의 상태와 역할을 바꾸지 않는다. 막혀야 할 변경이 뚫리면 다음 실행이 망가진다.
 */
export function signInAdmin(): Promise<Session> {
  adminSession ??= signIn(admin);
  return adminSession;
}

/** 겹치지 않는 이름(역할 이름 등). */
export function uniqueName(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

/** 관리자가 이 권한만 가진 역할을 만들어 새 사용자에게 준다. 사용자는 member 역할도 그대로 가진다. */
export async function userWith(
  permissions: PermissionCode[],
): Promise<Session & { roleId: string }> {
  const [manager, user] = await Promise.all([signInAdmin(), newUser()]);
  const created = await manager.api.POST("/api/v1/roles", {
    body: { data: { type: "roles", attributes: { name: uniqueName("role"), permissions } } },
  });
  const roleId = created.data?.data.id;
  if (roleId === undefined)
    throw new Error(`역할을 만들지 못했다: ${String(created.response.status)}`);
  const current = await manager.api.GET("/api/v1/users/{id}", {
    params: { path: { id: user.userId } },
  });
  const held = current.data?.data.relationships.roles.data ?? [];
  const updated = await manager.api.PATCH("/api/v1/users/{id}", {
    params: { path: { id: user.userId } },
    body: {
      data: {
        type: "users",
        id: user.userId,
        relationships: { roles: { data: [...held, { type: "roles", id: roleId }] } },
      },
    },
  });
  if (updated.response.status !== 200) {
    throw new Error(`역할을 주지 못했다: ${String(updated.response.status)}`);
  }
  return { ...user, roleId };
}

/** 1x1 PNG. 업로드 흐름이 올리는 이미지다. */
export const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
    "base64",
  ),
);

export interface UploadOptions {
  readonly content?: Uint8Array;
  readonly contentType?: string;
  readonly filename?: string;
  /** 업로드를 마쳤다고 알릴지(기본 true). false면 올리기만 하고 pending으로 둔다. */
  readonly complete?: boolean;
}

/** 파일을 만들고 meta.upload의 presigned 요청으로 스토리지에 올린다. 브라우저가 하는 일과 같다. */
export async function uploadFile(
  session: Session,
  options: UploadOptions = {},
): Promise<FileResource> {
  const content = options.content ?? PNG;
  const attributes = {
    filename: options.filename ?? "image.png",
    contentType: options.contentType ?? "image/png",
    size: content.byteLength,
  };
  const created = await session.api.POST("/api/v1/files", {
    body: { data: { type: "files", attributes } },
  });
  const file = created.data?.data;
  const upload = file?.meta?.upload;
  if (file === undefined || upload === undefined) {
    throw new Error(`파일을 만들지 못했다: ${String(created.response.status)}`);
  }
  const put = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: content,
  });
  if (!put.ok) throw new Error(`스토리지에 올리지 못했다: ${String(put.status)}`);
  if (options.complete === false) return file;
  const completed = await session.api.PATCH("/api/v1/files/{id}", {
    params: { path: { id: file.id } },
    body: { data: { type: "files", id: file.id, attributes: { status: "ready" } } },
  });
  if (completed.data === undefined) {
    throw new Error(`업로드 완료를 알리지 못했다: ${String(completed.response.status)}`);
  }
  return completed.data.data;
}
