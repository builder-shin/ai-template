import { setTimeout as sleep } from "node:timers/promises";
import { type Mailbox, matchesMail, type ReceivedMail, receivedAfter } from "../side-channels.ts";

export interface MockMailboxOptions {
  readonly fetch?: typeof fetch;
  /** 폴링 간격(밀리초). 기본 100. */
  readonly pollMs?: number;
}

/**
 * 목 서버의 테스트 통로(/_test/mail)로 메일을 읽는다. 목은 보낸 메일을 메모리에 두고, 받는 사람으로
 * 거른 목록을 최신순으로 준다(`GET /_test/mail?to=주소`). 비우기는 `DELETE /_test/mail`이다.
 * 목이 MOCK_TEST_ENDPOINTS를 꺼 두었으면 통로가 없어(404) 던진다.
 */
export function createMockMailbox(baseUrl: string, options: MockMailboxOptions = {}): Mailbox {
  const request = options.fetch ?? fetch;
  const pollMs = options.pollMs ?? 100;
  const root = baseUrl.replace(/\/+$/, "");

  function failed(response: Response): Error {
    return new Error(
      `목 /_test/mail 응답이 ${String(response.status)}이다. 목의 MOCK_TEST_ENDPOINTS가 켜져 있는지 본다.`,
    );
  }

  async function mailTo(to: string): Promise<ReceivedMail[]> {
    const response = await request(`${root}/_test/mail?to=${encodeURIComponent(to)}`);
    if (!response.ok) throw failed(response);
    const { messages } = (await response.json()) as { messages: ReceivedMail[] };
    return messages;
  }

  return {
    async latest(to, latestOptions = {}): Promise<ReceivedMail> {
      const deadline = Date.now() + (latestOptions.timeoutMs ?? 10_000);
      for (;;) {
        for (const mail of await mailTo(to)) {
          // 최신순이므로 after보다 이른 메일이 나오면 뒤는 볼 필요가 없다.
          if (!receivedAfter(mail, latestOptions.after)) break;
          if (matchesMail(mail, latestOptions)) return mail;
        }
        if (Date.now() >= deadline) {
          throw new Error(`${to}에게 온 메일 가운데 조건에 맞는 것이 제한 시간 안에 없다.`);
        }
        await sleep(pollMs);
      }
    },
    async clear(): Promise<void> {
      const response = await request(`${root}/_test/mail`, { method: "DELETE" });
      if (!response.ok) throw failed(response);
    },
  };
}
