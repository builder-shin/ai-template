/**
 * 가입과 이메일 인증(FastAPI의 auth/service/accounts.py).
 *
 * - 가입하면 인증 전 계정(member 역할)을 만들고 인증 메일을 보낸다. 인증 전에는 로그인할 수 없다.
 *   이미 쓰는 이메일이면 422 validation.already_taken(/data/attributes/email)이다.
 * - 인증 메일 재발송은 계정이 있는지 드러내지 않도록 늘 202다. 인증 전인 활성 계정에만 보낸다.
 * - 인증: 토큰이 틀렸거나 만료됐거나 계정이 활성이 아니면 422 auth.verification_token_invalid다. 처음
 *   인증했으면 환영 메일을 보낸다.
 * - 레이트 리밋(limits.ts): 가입은 IP별 시간당, 재발송은 IP별과 이메일별 시간당이다.
 */

import type { MockConfig } from "../../config.ts";
import type { Client } from "../../core/client.ts";
import type { Instant } from "../../core/clock.ts";
import { enforce } from "../../core/rate-limit.ts";
import type { components } from "../../generated/api.ts";
import { ApiError } from "../../jsonapi/errors.ts";
import type { MockState } from "../../state.ts";
import {
  createAccount,
  EmailTakenError,
  findAccount,
  localeFrom,
  markEmailVerified,
} from "../users/accounts.ts";
import type { UserRow } from "../users/model.ts";
import { authLimits, ipSubject, mailRequestLimits } from "./limits.ts";
import { sendVerification, sendWelcome } from "./mails.ts";
import { deleteAccountTokens, findAccountToken, invalidToken } from "./tokens.ts";

type RegistrationCreateAttributes = components["schemas"]["RegistrationCreateAttributes"];

function emailTaken(): ApiError {
  const detail = "The email address is already registered.";
  return new ApiError(422, "validation.already_taken", detail, {
    pointer: "/data/attributes/email",
  });
}

export function register(
  state: MockState,
  config: MockConfig,
  client: Client,
  attributes: RegistrationCreateAttributes,
  acceptLanguage: string | undefined,
): UserRow {
  enforce(state.limiter, authLimits(config).registrationIp, ipSubject(client));
  const account = {
    email: attributes.email,
    password: attributes.password,
    name: attributes.name,
    locale: attributes.locale ?? localeFrom(acceptLanguage),
    verified: false,
  };
  let user: UserRow;
  try {
    user = createAccount(state.store, account, state.clock.now());
  } catch (error) {
    if (error instanceof EmailTakenError) throw emailTaken();
    throw error;
  }
  sendVerification(state, config, user.id);
  return user;
}

/** 인증 전인 활성 계정에만 인증 메일을 다시 보낸다. 부른 쪽은 늘 202로 답한다. */
export function requestVerification(
  state: MockState,
  config: MockConfig,
  client: Client,
  email: string,
): void {
  mailRequestLimits(state, config, client, email);
  const user = findAccount(state.store, email);
  if (user?.status !== "active" || user.emailVerifiedAt !== null) return;
  sendVerification(state, config, user.id);
}

export interface Verification {
  /** 인증 리소스의 id(쓴 토큰의 id). */
  readonly id: string;
  readonly verifiedAt: Instant;
}

/** 토큰으로 이메일을 인증한다. 처음 인증했으면 환영 메일을 보낸다. */
export function verifyEmail(state: MockState, config: MockConfig, token: string): Verification {
  const now = state.clock.now();
  const row = findAccountToken(state.store, token, "email_verification", now);
  const user = state.store.users.get(row.userId);
  if (user?.status !== "active") throw invalidToken();
  deleteAccountTokens(state.store, user.id, "email_verification");
  const first = markEmailVerified(user, now);
  if (first) sendWelcome(state, config, user.id);
  return { id: row.id, verifiedAt: user.emailVerifiedAt ?? now };
}
