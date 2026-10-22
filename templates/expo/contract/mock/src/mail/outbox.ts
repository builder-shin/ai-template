/**
 * 보낸 메일 보관함. 목이 보내는 메일(이메일 인증, 비밀번호 재설정)을 메모리에 쌓는다.
 * 단독 개발에서 Mailpit 역할이고, 테스트 통로(/_test/mail)가 읽고 비운다.
 */

import { randomUUID } from "node:crypto";

/** 보낼 메일. 본문은 텍스트 하나다(링크의 토큰을 테스트가 꺼낸다). */
export interface OutgoingMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** 보관한 메일. 적합성 키트의 ReceivedMail과 같은 모양이다. */
export interface StoredMail extends OutgoingMail {
  /** 보관함이 붙인 id. */
  readonly id: string;
  /** 보관함이 받은 시각(ISO 8601, 밀리초). */
  readonly receivedAt: string;
}

export interface Outbox {
  /** 메일을 보관함에 넣는다. */
  send(mail: OutgoingMail): StoredMail;
  /** 보관한 메일을 최신순으로. to를 주면 그 주소(대소문자 무시)로 간 메일만. */
  list(to?: string): StoredMail[];
  /** 보관함을 비운다. */
  clear(): void;
}

export function createOutbox(): Outbox {
  const messages: StoredMail[] = [];
  return {
    send(mail) {
      const stored: StoredMail = {
        id: randomUUID(),
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        receivedAt: new Date().toISOString(),
      };
      messages.push(stored);
      return stored;
    },
    list(to) {
      const wanted = to?.toLowerCase();
      const newestFirst = messages.toReversed();
      if (wanted === undefined) return newestFirst;
      return newestFirst.filter((mail) => mail.to.toLowerCase() === wanted);
    },
    clear() {
      messages.length = 0;
    },
  };
}
