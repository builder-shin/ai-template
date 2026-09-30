/**
 * 계정 함수: 다른 모듈(auth, 시드)과 users의 다른 흐름이 쓴다(FastAPI의 users/service/accounts.py).
 *
 * - 이메일은 앞뒤 공백을 지우고 소문자로 저장하고 찾는다(normalizeEmail).
 * - 값이 있는 이메일은 유일하다. 이미 쓰는 이메일로 만들면 EmailTakenError다(FastAPI에서 유일 제약
 *   uq_users_email을 어겨 나는 IntegrityError). 부른 쪽이 에러 문서로 바꾼다.
 */

import type { Instant } from "../../core/clock.ts";
import { uuid7 } from "../../core/ids.ts";
import { hashPassword } from "../../core/security.ts";
import type { Store } from "../../store.ts";
import { MEMBER_ROLE } from "../roles/model.ts";
import { assignRoles, rolesNamed } from "../roles/service.ts";
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
