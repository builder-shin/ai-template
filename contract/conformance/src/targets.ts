import type { Mailbox } from "./side-channels.ts";
import { createMailpitMailbox } from "./side-channels/mailpit.ts";
import { createMockMailbox } from "./side-channels/mock-mailbox.ts";

export const TARGET_NAMES = ["fastapi", "nestjs", "mock"] as const;

export type TargetName = (typeof TARGET_NAMES)[number];

export interface TargetConfig {
  readonly name: TargetName;
  readonly baseUrl: string;
}

function isTargetName(value: string): value is TargetName {
  return (TARGET_NAMES as readonly string[]).includes(value);
}

/** 환경 변수에서 적합성 테스트 대상을 읽는다. CONFORMANCE_TARGET과 CONFORMANCE_BASE_URL이 필요하다. */
export function resolveTarget(env: Readonly<Record<string, string | undefined>>): TargetConfig {
  const name = env.CONFORMANCE_TARGET ?? "";
  if (!isTargetName(name)) {
    throw new Error(
      `CONFORMANCE_TARGET은 ${TARGET_NAMES.join(", ")} 중 하나여야 한다(현재: ${name || "없음"}).`,
    );
  }
  const baseUrl = env.CONFORMANCE_BASE_URL;
  if (baseUrl === undefined || !URL.canParse(baseUrl)) {
    throw new Error("CONFORMANCE_BASE_URL에 대상 주소를 넣는다. 예: http://localhost:8000");
  }
  return { name, baseUrl: baseUrl.replace(/\/+$/, "") };
}

/** 시드된 관리자. 관리자 흐름이 이 계정으로 로그인한다. */
export interface AdminCredentials {
  readonly email: string;
  readonly password: string;
}

/** 환경 변수에서 시드된 관리자의 자격 증명을 읽는다(CONFORMANCE_ADMIN_EMAIL, CONFORMANCE_ADMIN_PASSWORD). */
export function resolveAdmin(env: Readonly<Record<string, string | undefined>>): AdminCredentials {
  const email = env.CONFORMANCE_ADMIN_EMAIL;
  const password = env.CONFORMANCE_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "CONFORMANCE_ADMIN_EMAIL과 CONFORMANCE_ADMIN_PASSWORD에 시드된 관리자의 자격 증명을 넣는다.",
    );
  }
  return { email, password };
}

/**
 * 대상이 보낸 메일을 읽는 메일함. 목(CONFORMANCE_TARGET=mock)은 목의 테스트 통로
 * (CONFORMANCE_BASE_URL의 /_test/mail)이고, 실제 백엔드는 Mailpit(CONFORMANCE_MAILPIT_URL)이다.
 */
export function resolveMailbox(env: Readonly<Record<string, string | undefined>>): Mailbox {
  if (env.CONFORMANCE_TARGET === "mock") return createMockMailbox(resolveTarget(env).baseUrl);
  const url = env.CONFORMANCE_MAILPIT_URL;
  if (url === undefined || !URL.canParse(url)) {
    throw new Error("CONFORMANCE_MAILPIT_URL에 Mailpit 주소를 넣는다. 예: http://localhost:28025");
  }
  return createMailpitMailbox(url);
}
