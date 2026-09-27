import { type Mailbox, matchesMail, type ReceivedMail, receivedAfter } from "../side-channels.ts";

interface MailpitSummary {
  readonly ID: string;
  /** 받은 시각(RFC 3339, 밀리초). */
  readonly Created: string;
}

interface MailpitMessage {
  readonly ID: string;
  readonly Subject: string;
  readonly Text: string;
}

export interface MailpitOptions {
  readonly fetch?: typeof fetch;
  /** 폴링 간격(밀리초). 기본 200. */
  readonly pollMs?: number;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Mailpit API로 메일을 읽는다. 받는 사람으로 검색하므로(`GET /api/v1/search?query=to:"주소"`) 다른
 * 테스트가 보낸 메일이 많아도 밀려나지 않는다. 검색 결과는 최신순이다.
 */
export function createMailpitMailbox(baseUrl: string, options: MailpitOptions = {}): Mailbox {
  const get = options.fetch ?? fetch;
  const pollMs = options.pollMs ?? 200;
  const root = baseUrl.replace(/\/+$/, "");

  async function readJson<T>(path: string): Promise<T> {
    const response = await get(`${root}${path}`);
    if (!response.ok) throw new Error(`Mailpit ${path} 응답이 ${String(response.status)}이다.`);
    return (await response.json()) as T;
  }

  return {
    async latest(to, latestOptions = {}): Promise<ReceivedMail> {
      const deadline = Date.now() + (latestOptions.timeoutMs ?? 10_000);
      const search = `/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`;
      for (;;) {
        const { messages } = await readJson<{ messages: MailpitSummary[] }>(search);
        for (const summary of messages) {
          const received = { id: summary.ID, receivedAt: summary.Created };
          // 최신순이므로 after보다 이른 메일이 나오면 뒤는 볼 필요가 없다.
          if (!receivedAfter(received, latestOptions.after)) break;
          const message = await readJson<MailpitMessage>(`/api/v1/message/${summary.ID}`);
          const mail = { ...received, to, subject: message.Subject, text: message.Text };
          if (matchesMail(mail, latestOptions)) return mail;
        }
        if (Date.now() >= deadline) {
          throw new Error(`${to}에게 온 메일 가운데 조건에 맞는 것이 제한 시간 안에 없다.`);
        }
        await sleep(pollMs);
      }
    },
    async clear(): Promise<void> {
      await get(`${root}/api/v1/messages`, { method: "DELETE" });
    },
  };
}
