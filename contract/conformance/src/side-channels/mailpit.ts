import type { Mailbox, ReceivedMail } from "../side-channels.ts";

interface MailpitAddress {
  readonly Address: string;
}

interface MailpitSummary {
  readonly ID: string;
  readonly To: readonly MailpitAddress[];
  readonly Subject: string;
}

interface MailpitMessage extends MailpitSummary {
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

/** Mailpit API로 메일을 읽는다. 목록은 최신순이다. 테스트는 병렬로 돌므로 받는 사람으로 거른다. */
export function createMailpitMailbox(baseUrl: string, options: MailpitOptions = {}): Mailbox {
  const get = options.fetch ?? fetch;
  const pollMs = options.pollMs ?? 200;
  const root = baseUrl.replace(/\/+$/, "");

  async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await get(`${root}${path}`, init);
    if (!response.ok) throw new Error(`Mailpit ${path} 응답이 ${String(response.status)}이다.`);
    return (await response.json()) as T;
  }

  return {
    async latest(to, latestOptions = {}): Promise<ReceivedMail> {
      const deadline = Date.now() + (latestOptions.timeoutMs ?? 10_000);
      const address = to.toLowerCase();
      for (;;) {
        const { messages } = await readJson<{ messages: MailpitSummary[] }>("/api/v1/messages");
        const found = messages.find((message) =>
          message.To.some((recipient) => recipient.Address.toLowerCase() === address),
        );
        if (found !== undefined) {
          const message = await readJson<MailpitMessage>(`/api/v1/message/${found.ID}`);
          return { to, subject: message.Subject, text: message.Text };
        }
        if (Date.now() >= deadline) throw new Error(`${to}에게 온 메일이 제한 시간 안에 없다.`);
        await sleep(pollMs);
      }
    },
    async clear(): Promise<void> {
      await get(`${root}/api/v1/messages`, { method: "DELETE" });
    },
  };
}
