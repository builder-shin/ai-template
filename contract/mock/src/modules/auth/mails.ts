/**
 * auth가 보내는 메일(인증, 환영). 문구는 FastAPI 템플릿의 auth/templates/<로케일>/<메일>.subject.txt,
 * .txt와 같다(목의 보관함은 텍스트 본문만 둔다). 받는 사람의 로케일(ko, en)로 쓴다.
 *
 * - 보낼 조건(활성이고 이메일이 있음, 인증 메일은 아직 인증 전)을 보내기 직전에 본다. 맞지 않으면
 *   보내지 않는다(FastAPI의 메일 잡이 실행될 때 다시 보는 것과 같다).
 * - 인증 메일은 보낼 때 토큰을 새로 발급한다. 링크는 설정의 프론트 주소(FRONTEND_URL)에 경로와
 *   ?token=을 붙인다. 적합성 스위트와 E2E가 이 형식으로 토큰을 꺼낸다.
 * - FastAPI는 요청을 끝낸 뒤 잡으로 보낸다. 목은 요청 안에서 바로 보관함에 넣는다.
 */

import type { MockConfig } from "../../config.ts";
import type { OutgoingMail } from "../../mail/outbox.ts";
import type { MockState } from "../../state.ts";
import type { Locale, UserRow } from "../users/model.ts";
import { issueAccountToken } from "./tokens.ts";

/** 인증 메일 링크의 프론트 경로(docs/conventions/jsonapi.md의 메일 링크). */
export const VERIFY_PATH = "/verify-email";

interface MailTemplate {
  readonly subject: string;
  /** 본문. name은 받는 사람의 이름(없으면 빈 문자열)이다. */
  readonly text: (name: string, link: string) => string;
}

type MailName = "verify_email" | "welcome";

const TEMPLATES: Readonly<Record<MailName, Readonly<Record<Locale, MailTemplate>>>> = {
  verify_email: {
    ko: {
      subject: "이메일 주소를 확인해 주세요",
      text: (name, link) =>
        `안녕하세요${name ? `, ${name}님` : ""}.\n\n` +
        "아래 링크를 열어 이메일 주소를 확인해 주세요. 링크는 24시간 동안 쓸 수 있습니다.\n\n" +
        `${link}\n\n` +
        "직접 가입하지 않았다면 이 메일을 무시해도 됩니다.\n",
    },
    en: {
      subject: "Confirm your email address",
      text: (name, link) =>
        `Hello${name ? ` ${name}` : ""},\n\n` +
        "Open the link below to confirm your email address. The link works for 24 hours.\n\n" +
        `${link}\n\n` +
        "If you did not sign up, you can ignore this email.\n",
    },
  },
  welcome: {
    ko: {
      subject: "가입을 환영합니다",
      text: (name, link) =>
        `${name ? `${name}님, ` : ""}이메일 확인이 끝났습니다. 이제 로그인할 수 있습니다.\n\n${link}\n`,
    },
    en: {
      subject: "Welcome aboard",
      text: (name, link) =>
        `${name ? `${name}, y` : "Y"}our email address is confirmed. You can sign in now.\n\n${link}\n`,
    },
  },
};

/** 프론트 주소의 경로에 토큰을 붙인 링크. */
export function link(config: MockConfig, path: string, token: string): string {
  return `${config.frontendUrl.replace(/\/+$/, "")}${path}?token=${token}`;
}

/** 메일을 받을 수 있는 계정이다: 활성이고 이메일이 있다. */
function reachable(user: UserRow | undefined): user is UserRow & { email: string } {
  return user?.status === "active" && user.email !== null;
}

function mail(name: MailName, user: UserRow & { email: string }, url: string): OutgoingMail {
  const template = TEMPLATES[name][user.locale];
  return { to: user.email, subject: template.subject, text: template.text(user.name ?? "", url) };
}

/** 인증 메일. 아직 인증하지 않은 계정에만 보낸다. */
export function sendVerification(state: MockState, config: MockConfig, userId: string): void {
  const user = state.store.users.get(userId);
  if (!reachable(user) || user.emailVerifiedAt !== null) return;
  const token = issueAccountToken(state.store, user.id, "email_verification", state.clock.now());
  state.outbox.send(mail("verify_email", user, link(config, VERIFY_PATH, token)));
}

/** 환영 메일. 이메일 인증을 처음 마쳤을 때 보낸다. 링크는 프론트 주소 그대로다. */
export function sendWelcome(state: MockState, config: MockConfig, userId: string): void {
  const user = state.store.users.get(userId);
  if (!reachable(user)) return;
  state.outbox.send(mail("welcome", user, config.frontendUrl));
}
