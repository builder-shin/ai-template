import type { components } from "./generated/api.ts";

export type OAuthProvider = components["schemas"]["OAuthProvider"];

export interface ReceivedMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** 대상이 보낸 메일을 읽는다. 실제 백엔드는 Mailpit으로, 목은 테스트 전용 엔드포인트로 구현한다. */
export interface Mailbox {
  /** 받는 사람에게 온 가장 최근 메일. 제한 시간 안에 오지 않으면 던진다. */
  latest(to: string, options?: { readonly timeoutMs?: number }): Promise<ReceivedMail>;
  clear(): Promise<void>;
}

/** 소셜 로그인을 끝까지 진행해 프론트 콜백으로 넘어갈 1회용 코드를 얻는다. */
export interface OAuthDriver {
  authorize(provider: OAuthProvider, redirectUri: string): Promise<{ readonly code: string }>;
}

export interface SideChannels {
  readonly mailbox: Mailbox;
  readonly oauth: OAuthDriver;
}

/** 인증·재설정 메일 본문의 링크에서 token 쿼리 값을 꺼낸다. */
export function extractToken(mail: ReceivedMail): string {
  const token = /[?&]token=([A-Za-z0-9._~-]+)/.exec(mail.text)?.[1];
  if (token === undefined) {
    throw new Error(`메일 "${mail.subject}"에서 token 쿼리가 있는 링크를 찾지 못했다`);
  }
  return token;
}
