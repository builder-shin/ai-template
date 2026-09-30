/**
 * auth의 엄격한 레이트 리밋. 이름과 윈도는 FastAPI 템플릿과 같고, 한도는 설정(RATE_LIMIT_*)에서 온다.
 *
 * - 로그인: IP별(login-ip)과 이메일 해시별(login-identifier) 분당
 * - 가입: IP별(registration-ip) 시간당
 * - 메일을 보내는 요청(인증 메일 재발송, 재설정 요청): IP별(mail-ip)과 이메일 해시별(mail-email)
 *   시간당. 두 요청이 같은 한도를 나눠 쓴다.
 * - 비밀번호 변경: 사용자별(password-change-user) 시간당. 세션을 훔친 사람이 현재 비밀번호를 맞히는
 *   시도를 막는다.
 * 요청 문서 검증을 통과한 요청만 센다(서비스가 검증 뒤에 부른다).
 */

import type { MockConfig } from "../../config.ts";
import type { Client } from "../../core/client.ts";
import { enforce, type Limit, PER_HOUR, PER_MINUTE } from "../../core/rate-limit.ts";
import { identifierHash } from "../../core/security.ts";
import type { MockState } from "../../state.ts";
import { normalizeEmail } from "../users/model.ts";

export function authLimits(config: MockConfig) {
  const limits = config.rateLimits;
  return {
    loginIp: { name: "login-ip", limit: limits.loginIp, window: PER_MINUTE },
    loginIdentifier: {
      name: "login-identifier",
      limit: limits.loginIdentifier,
      window: PER_MINUTE,
    },
    registrationIp: { name: "registration-ip", limit: limits.registrationIp, window: PER_HOUR },
    mailIp: { name: "mail-ip", limit: limits.mailIp, window: PER_HOUR },
    mailEmail: { name: "mail-email", limit: limits.mailEmail, window: PER_HOUR },
    passwordChangeUser: {
      name: "password-change-user",
      limit: limits.passwordChangeUser,
      window: PER_HOUR,
    },
  } satisfies Record<string, Limit>;
}

/** 레이트 리밋의 IP 대상. 주소를 모르면 한 대상("unknown")으로 센다. */
export function ipSubject(client: Client): string {
  return client.ip ?? "unknown";
}

/** 이메일의 레이트 리밋 대상과 감사 로그 식별자: 정규화한 이메일의 HMAC. */
export function emailSubject(config: MockConfig, email: string): string {
  return identifierHash(normalizeEmail(email), config.identifierHashSecret);
}

/** 메일을 보내는 요청의 한도를 센다. 넘었으면 429다. */
export function mailRequestLimits(
  state: MockState,
  config: MockConfig,
  client: Client,
  email: string,
): void {
  const limits = authLimits(config);
  enforce(state.limiter, limits.mailIp, ipSubject(client));
  enforce(state.limiter, limits.mailEmail, emailSubject(config, email));
}
