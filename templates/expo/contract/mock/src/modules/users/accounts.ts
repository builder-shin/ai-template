/**
 * 계정 함수: 다른 모듈(auth, 시드)과 users의 다른 흐름이 쓴다(FastAPI의 users/service/accounts.py).
 *
 * - 이메일은 앞뒤 공백을 지우고 소문자로 저장하고 찾는다(normalizeEmail).
 * - 값이 있는 이메일은 유일하다. 이미 쓰는 이메일로 만들면 EmailTakenError다(FastAPI에서 유일 제약
 *   uq_users_email을 어겨 나는 IntegrityError). 부른 쪽이 에러 문서로 바꾼다.
 * - 계정을 닫을 때(비활성화, 탈퇴) 다른 모듈의 처리를 부른다. auth가 세션 폐기와 토큰 삭제를
 *   등록한다(modules/registry.ts). users가 auth를 import하면 순환이 되므로 등록으로 뒤집는다.
 * - 마지막 활성 admin의 admin 역할 회수, 비활성화, 탈퇴는 422 role.last_admin_protected다.
 */

import type { Instant } from "../../core/clock.ts";
import { uuid7 } from "../../core/ids.ts";
import { hashPassword } from "../../core/security.ts";
import { ApiError } from "../../jsonapi/errors.ts";
import type { MockState } from "../../state.ts";
import type { Store } from "../../store.ts";
import { isAdminRole, MEMBER_ROLE } from "../roles/model.ts";
import { assignRoles, rolesNamed, rolesOfUser } from "../roles/service.ts";
import { LOCALES, type Locale, normalizeEmail, type UserRow } from "./model.ts";

/** 이미 쓰는 이메일이다. */
export class EmailTakenError extends Error {
  constructor(email: string) {
    super(`이메일 ${email}은 이미 쓰는 이메일이다.`);
    this.name = "EmailTakenError";
  }
}

export interface NewAccount {
  readonly email: string | null;
  readonly password: string | null;
  readonly name: string | null;
  readonly locale: Locale;
  /** 이메일 인증을 마친 상태로 만드는가(시드 관리자, 검증된 소셜 계정). */
  readonly verified: boolean;
  /** 줄 역할 이름. 기본은 가입한 사람의 역할(member)이다. */
  readonly roleNames?: readonly string[];
}

/** 이메일(정규화 전이라도)로 계정을 찾는다. */
export function findAccount(store: Store, email: string): UserRow | undefined {
  const wanted = normalizeEmail(email);
  return [...store.users.values()].find((user) => user.email === wanted);
}

export function getAccount(store: Store, userId: string): UserRow | undefined {
  return store.users.get(userId);
}

/** 계정을 만들고 역할을 준다. 이메일은 정규화하고 비밀번호는 해시한다. */
export function createAccount(store: Store, account: NewAccount, now: Instant): UserRow {
  const email = account.email === null ? null : normalizeEmail(account.email);
  if (email !== null && findAccount(store, email) !== undefined) throw new EmailTakenError(email);
  const roles = rolesNamed(store, account.roleNames ?? [MEMBER_ROLE]);
  const user: UserRow = {
    id: uuid7(),
    email,
    name: account.name,
    locale: account.locale,
    status: "active",
    passwordHash: account.password === null ? null : hashPassword(account.password),
    emailVerifiedAt: account.verified ? now : null,
    avatarId: null,
    createdAt: now,
    updatedAt: now,
  };
  store.users.set(user.id, user);
  assignRoles(store, user.id, roles);
  return user;
}

/** Accept-Language의 q 값. Python의 float()가 읽지 못하는 값은 0이다. */
function weight(parameters: string): number {
  const separator = parameters.indexOf("=");
  const name = separator === -1 ? parameters : parameters.slice(0, separator);
  if (name.trim() !== "q") return 1;
  const value = parameters.slice(separator + 1).trim();
  return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(value) ? Number(value) : 0;
}

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Accept-Language에서 지원하는 첫 로케일(q가 큰 순서, 같으면 앞의 것). 없으면 ko다.
 * 예: "en-US,en;q=0.9,ko;q=0.8" → en
 */
export function localeFrom(acceptLanguage: string | undefined): Locale {
  const ranked = (acceptLanguage ?? "").split(",").map((part, index) => {
    const trimmed = part.trim();
    const separator = trimmed.indexOf(";");
    const tag = separator === -1 ? trimmed : trimmed.slice(0, separator);
    const parameters = separator === -1 ? "" : trimmed.slice(separator + 1).trim();
    const language = (tag.split("-")[0] ?? "").trim().toLowerCase();
    return { weight: weight(parameters), index, language };
  });
  ranked.sort((left, right) => right.weight - left.weight || left.index - right.index);
  return ranked.map((item) => item.language).find(isLocale) ?? "ko";
}

/** 이메일 인증을 마친 것으로 둔다. 이번에 처음 인증했으면 true다. */
export function markEmailVerified(user: UserRow, now: Instant): boolean {
  if (user.emailVerifiedAt !== null) return false;
  user.emailVerifiedAt = now;
  user.updatedAt = now;
  return true;
}

/** 비밀번호를 바꾼다(해시해서 저장한다). */
export function setPassword(user: UserRow, password: string, now: Instant): void {
  user.passwordHash = hashPassword(password);
  user.updatedAt = now;
}

/** 계정을 닫는 사유. */
export type Closure = "deactivated" | "deleted";
/** 계정을 닫을 때 부를 처리(FastAPI의 AccountCloser). */
export type AccountCloser = (state: MockState, userId: string, closure: Closure) => void;

/** 계정을 닫을 때 부를 처리를 등록한다. 같은 처리를 두 번 등록해도 한 번만 부른다. */
export function onAccountClosed(closers: AccountCloser[], closer: AccountCloser): void {
  if (!closers.includes(closer)) closers.push(closer);
}

/** 등록된 처리(state.accountClosers)를 모두 부른다. */
export function closeAccount(state: MockState, userId: string, closure: Closure): void {
  for (const closer of state.accountClosers) closer(state, userId, closure);
}

/** 시스템 admin 역할을 가졌는가. */
export function isAdmin(store: Store, userId: string): boolean {
  return rolesOfUser(store, userId).some(isAdminRole);
}

/**
 * user가 마지막 활성 admin이면 422 role.last_admin_protected다. FastAPI는 세기 전에 admin 역할 행을 잠가
 * 동시 요청을 줄 세운다. 목은 검사와 변경 사이에 다른 요청이 끼어들지 못한다.
 */
export function protectLastAdmin(store: Store, user: UserRow): void {
  if (user.status !== "active" || !isAdmin(store, user.id)) return;
  const others = [...store.users.values()].filter(
    (other) => other.id !== user.id && other.status === "active" && isAdmin(store, other.id),
  );
  if (others.length === 0) {
    const detail = "The last active admin must keep the admin role and stay active.";
    throw new ApiError(422, "role.last_admin_protected", detail);
  }
}
