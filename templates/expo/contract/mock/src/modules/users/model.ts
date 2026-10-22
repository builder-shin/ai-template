/** 사용자 계정(FastAPI의 users 테이블). 이메일은 앞뒤 공백을 지우고 소문자로 저장한다(normalizeEmail). */

import type { Instant } from "../../core/clock.ts";
import type { components } from "../../generated/api.ts";

/** deleted는 탈퇴해 개인정보를 지운 계정이다. */
export type UserStatus = components["schemas"]["UserStatus"];
/** 메일을 쓸 언어. */
export type Locale = components["schemas"]["Locale"];

export const LOCALES: readonly Locale[] = ["ko", "en"];

export interface UserRow {
  readonly id: string;
  /** 탈퇴했거나, 검증된 이메일 없이 소셜 로그인으로 만든 계정은 null이다. 값이 있는 이메일만 유일하다. */
  email: string | null;
  name: string | null;
  locale: Locale;
  status: UserStatus;
  /** 소셜 전용 계정은 null이다. */
  passwordHash: string | null;
  emailVerifiedAt: Instant | null;
  /** 아바타 파일 id. 파일을 지우면 null이 된다. */
  avatarId: string | null;
  readonly createdAt: Instant;
  updatedAt: Instant;
}

/** 앞뒤 공백을 지우고 소문자로 바꾼다. 저장과 조회에 같은 규칙을 쓴다. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
