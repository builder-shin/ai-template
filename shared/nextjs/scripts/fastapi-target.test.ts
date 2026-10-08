import { appOrigin } from "../src/lib/app-config.mjs";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fastapiTarget, parseFastapiTargetEnv } from "../e2e/targets/fastapi";
import { createTarget } from "../e2e/targets";

type Handler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
const cleanups: (() => Promise<void>)[] = [];

async function serve(handler: Handler) {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch(() => {
      response.writeHead(500).end();
    });
  });
  // 0에 bind하여 사용 가능한 포트를 확보한다. 다른 프로세스는 종료하지 않는다.
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture 포트가 없다.");
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  return `http://127.0.0.1:${address.port}`;
}

const env = (overrides: Record<string, string | undefined> = {}) => ({
  APP_URL: appOrigin("e2e"),
  API_BASE_URL: "http://127.0.0.1:18100/api/v1",
  E2E_MAILPIT_URL: "http://127.0.0.1:28125",
  E2E_RECENT_LOGIN_SECONDS: "10",
  ...overrides,
});

let request: APIRequestContext;
beforeAll(async () => {
  request = await playwrightRequest.newContext();
});
afterAll(async () => {
  await request.dispose();
});
afterEach(async () => {
  vi.useRealTimers();
  for (const stop of cleanups.splice(0).reverse()) await stop();
});

describe("FastAPI 대상 설정", () => {
  it("공통 대상은 OAuth 설정 없이 메일·최근 로그인 설정을 읽는다", () => {
    const config = parseFastapiTargetEnv(env());
    expect(config.apiBaseUrl).toBe("http://127.0.0.1:18100/api/v1");
    expect(config).not.toHaveProperty("oauthOrigin");
  });
  it("명시한 URL과 창을 검증하고 끝 슬래시를 정리한다", () => {
    expect(parseFastapiTargetEnv(env({ E2E_MAILPIT_URL: "http://127.0.0.1:28125/" }))).toEqual({
      webOrigin: appOrigin("e2e"),
      apiBaseUrl: "http://127.0.0.1:18100/api/v1",
      mailpitOrigin: "http://127.0.0.1:28125",
      recentLoginSeconds: 10,
    });
  });

  it.each(["APP_URL", "API_BASE_URL", "E2E_MAILPIT_URL", "E2E_RECENT_LOGIN_SECONDS"])(
    "%s가 빠지면 변수 이름을 알린다",
    (key) => {
      expect(() => parseFastapiTargetEnv(env({ [key]: undefined }))).toThrow(key);
    },
  );

  it.each(["", "0", "-1", "1.5", "NaN", "Infinity", "1e2", "2147484"])(
    "잘못된 최근 로그인 창 %s를 거절한다",
    (value) => {
      expect(() => parseFastapiTargetEnv(env({ E2E_RECENT_LOGIN_SECONDS: value }))).toThrow(
        "E2E_RECENT_LOGIN_SECONDS",
      );
    },
  );

  it.each([
    ["APP_URL", "private-value"],
    ["API_BASE_URL", "http://[private-value"],
    ["E2E_MAILPIT_URL", "http://*.example.com"],
    ["APP_URL", "file:///tmp/web"],
    ["APP_URL", `${appOrigin("e2e")}/path`],
    ["API_BASE_URL", "http://127.0.0.1:18100/api/v1?secret=private-value"], // betterleaks:allow 사유: URL 검증용 가짜 비밀
    ["E2E_MAILPIT_URL", "http://user:private-value@localhost:28125"], // betterleaks:allow 사유: URL 검증용 가짜 자격 증명
    ["E2E_MAILPIT_URL", "http://localhost:28125/path"],
    ["APP_URL", `${appOrigin("e2e")}?`],
    ["APP_URL", `${appOrigin("e2e")}#`],
    ["API_BASE_URL", "http://127.0.0.1:18100/api/v1?"],
    ["API_BASE_URL", "http://127.0.0.1:18100/api/v1#"],
    ["E2E_MAILPIT_URL", "http://127.0.0.1:28125?"],
    ["E2E_MAILPIT_URL", "http://127.0.0.1:28125#"],
  ])("%s의 잘못된 주소를 값 없이 알린다", (key, value) => {
    if (key === undefined || value === undefined) throw new Error("URL 검사 입력을 확인한다.");
    const parse = () => parseFastapiTargetEnv(env({ [key]: value }));
    expect(parse).toThrow(key);
    expect(parse).not.toThrow("private-value");
  });

  it("fastapi 대상은 누락한 설정을 알리고 목으로 대체하지 않는다", () => {
    vi.stubEnv("E2E_MAILPIT_URL", undefined);
    try {
      expect(() => createTarget("fastapi", request)).toThrow("E2E_MAILPIT_URL");
      expect(() => createTarget("mock", request)).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

interface Mail {
  ID: string;
  Created: string;
  To: { Address: string; Name: string }[];
  Subject: string;
  Text: string;
}
const recipient = "worker+one@example.com";
function mail(id: string, text: string, created = "2020-01-01T00:00:00Z", to = recipient): Mail {
  return { ID: id, Created: created, To: [{ Address: to, Name: "" }], Subject: "메일", Text: text };
}

async function mailbox(messages: (poll: number) => Mail[], status = 200) {
  const calls: string[] = [];
  let poll = 0;
  let stored: Mail[] = [];
  const base = await serve((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    if (req.url === undefined) throw new Error("메일 fixture 요청 URL을 확인한다.");
    const url = new URL(req.url, "http://fixture");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/api/v1/search") {
      if (url.searchParams.get("query") !== `to:"${recipient}"`) {
        res.writeHead(400).end();
        return;
      }
      stored = messages(++poll);
      res.writeHead(status).end(JSON.stringify({ messages: stored, total: stored.length }));
    } else if (url.pathname.startsWith("/api/v1/message/")) {
      const id = url.pathname.split("/").at(-1);
      if (id === undefined) throw new Error("메일 fixture ID를 확인한다.");
      const found = stored.find((message) => message.ID === decodeURIComponent(id));
      res.end(JSON.stringify(found));
    } else {
      res.writeHead(405).end();
    }
  });
  const target = fastapiTarget(request, env({ E2E_MAILPIT_URL: base }), {
    mailPollMs: 1,
    mailTimeoutMs: 100,
  });
  return { target, calls, polls: () => poll };
}

describe("Mailpit 부수 채널", () => {
  it("배달을 폴링하고 수신자·목적·최신 시각에 맞는 실제 URL을 고른다", async () => {
    const correct = `${appOrigin("e2e")}/verify-email?token=new&source=mail`;
    const fixture = await mailbox((poll) =>
      poll === 1
        ? []
        : [
            mail(
              "other-recipient",
              `${appOrigin("e2e")}/verify-email?token=other`,
              "2020-01-03T00:00:00Z",
              "other@example.com",
            ),
            mail("reset", `${appOrigin("e2e")}/reset-password?token=reset`, "2020-01-04T00:00:00Z"),
            mail("older", `${appOrigin("e2e")}/verify-email?token=old`),
            mail(
              "newer",
              `도움말 http://[broken\nhttps://example.com/help\n${correct}`,
              "2020-01-02T00:00:00Z",
            ),
          ],
    );
    expect(await fixture.target.mailLink(recipient, "verification")).toBe(correct);
    expect(fixture.polls()).toBe(2);
    expect(fixture.calls.every((call) => call.startsWith("GET "))).toBe(true);
  });

  it("같은 수신자·목적의 재발송은 이미 돌려준 메일과 더 오래된 메일을 건너뛴다", async () => {
    const old = mail("old", `${appOrigin("e2e")}/verify-email?token=old`, "2020-01-02T00:00:00Z");
    const stale = mail("stale", `${appOrigin("e2e")}/verify-email?token=stale`);
    const again = mail("again", `${appOrigin("e2e")}/verify-email?token=again`, old.Created);
    const fixture = await mailbox((poll) => (poll < 3 ? [old, stale] : [again, old, stale]));
    expect(await fixture.target.mailLink(recipient, "verification")).toBe(
      `${appOrigin("e2e")}/verify-email?token=old`,
    );
    expect(await fixture.target.mailLink(recipient, "verification")).toBe(
      `${appOrigin("e2e")}/verify-email?token=again`,
    );
    expect(fixture.polls()).toBe(3);
  });

  it("목적별 새 메일 기준은 서로 독립이다", async () => {
    const fixture = await mailbox(() => [
      mail("verify", `${appOrigin("e2e")}/verify-email?token=verify`, "2020-01-03T00:00:00Z"),
      mail("reset", `${appOrigin("e2e")}/reset-password?token=reset`),
    ]);
    await fixture.target.mailLink(recipient, "verification");
    expect(await fixture.target.mailLink(recipient, "reset")).toBe(
      `${appOrigin("e2e")}/reset-password?token=reset`,
    );
  });

  it.each([
    "https://wrong.example/verify-email?token=private-value", // betterleaks:allow 사유: 메일 링크 검증용 가짜 토큰
    `http://user:private-value@localhost:${new URL(appOrigin("e2e")).port}/verify-email?token=private-value`, // betterleaks:allow 사유: 메일 링크 검증용 가짜 자격 증명
  ])("다른 Origin이나 자격 증명이 든 인증 링크를 거절한다", async (link) => {
    const fixture = await mailbox(() => [mail("bad", link)]);
    await expect(fixture.target.mailLink(recipient, "verification")).rejects.toThrow("앱 Origin");
    await expect(fixture.target.mailLink(recipient, "verification")).rejects.not.toThrow(
      "private-value",
    );
  });

  it("목적 링크가 없거나 토큰이 비면 제한 시간 뒤 실패한다", async () => {
    const fixture = await mailbox(() => [mail("empty", `${appOrigin("e2e")}/verify-email?token=`)]);
    await expect(fixture.target.mailLink(recipient, "verification")).rejects.toThrow("제한 시간");
    expect(fixture.polls()).toBeGreaterThan(1);
  });

  it("느린 HTTP 응답도 메일 대기 한도를 넘기지 않는다", async () => {
    const base = await serve(() => {});
    const target = fastapiTarget(request, env({ E2E_MAILPIT_URL: base }), { mailTimeoutMs: 30 });
    await expect(target.mailLink(recipient, "verification")).rejects.toThrow("제한 시간");
  });

  it("Mailpit HTTP 오류를 메일 없음으로 숨기지 않는다", async () => {
    const fixture = await mailbox(() => [], 503);
    await expect(fixture.target.mailLink(recipient, "verification")).rejects.toThrow("503");
    expect(fixture.polls()).toBe(1);
  });
});

it("최근 로그인 만료는 설정한 창에 100ms 여유를 더해 기다린다", async () => {
  vi.useFakeTimers();
  const target = fastapiTarget(request, env({ E2E_RECENT_LOGIN_SECONDS: "2" }));
  let done = false;
  let error: unknown;
  const waiting = target.expireRecentLogin().then(
    () => {
      done = true;
    },
    (cause: unknown) => {
      error = cause;
    },
  );
  await vi.advanceTimersByTimeAsync(2099);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await waiting;
  expect(error).toBeUndefined();
  expect(done).toBe(true);
});
