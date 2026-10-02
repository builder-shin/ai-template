import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  chromium,
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
} from "@playwright/test";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fastapiTarget, parseFastapiTargetEnv } from "../e2e/targets/fastapi";
import { requireImplementedTarget } from "../e2e/targets";

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
  APP_URL: "http://localhost:3100",
  API_BASE_URL: "http://127.0.0.1:18100/api/v1",
  E2E_MAILPIT_URL: "http://127.0.0.1:28125",
  E2E_OAUTH_URL: "http://127.0.0.1:28180",
  E2E_RECENT_LOGIN_SECONDS: "10",
  ...overrides,
});

let request: APIRequestContext;
let browser: Browser;
beforeAll(async () => {
  request = await playwrightRequest.newContext();
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
  await request.dispose();
});
afterEach(async () => {
  vi.useRealTimers();
  for (const stop of cleanups.splice(0).reverse()) await stop();
});

describe("FastAPI 대상 설정", () => {
  it("명시한 URL과 창을 검증하고 끝 슬래시를 정리한다", () => {
    expect(parseFastapiTargetEnv(env({ E2E_MAILPIT_URL: "http://127.0.0.1:28125/" }))).toEqual({
      webOrigin: "http://localhost:3100",
      apiBaseUrl: "http://127.0.0.1:18100/api/v1",
      mailpitOrigin: "http://127.0.0.1:28125",
      oauthOrigin: "http://127.0.0.1:28180",
      recentLoginSeconds: 10,
    });
  });

  it.each([
    "APP_URL",
    "API_BASE_URL",
    "E2E_MAILPIT_URL",
    "E2E_OAUTH_URL",
    "E2E_RECENT_LOGIN_SECONDS",
  ])("%s가 빠지면 변수 이름을 알린다", (key) => {
    expect(() => parseFastapiTargetEnv(env({ [key]: undefined }))).toThrow(key);
  });

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
    ["APP_URL", "http://localhost:3100/path"],
    ["API_BASE_URL", "http://127.0.0.1:18100/api/v1?secret=private-value"], // betterleaks:allow 사유: URL 검증용 가짜 비밀
    ["E2E_MAILPIT_URL", "http://user:private-value@localhost:28125"], // betterleaks:allow 사유: URL 검증용 가짜 자격 증명
    ["E2E_MAILPIT_URL", "http://localhost:28125/path"],
    ["E2E_OAUTH_URL", "ftp://localhost"],
    ["E2E_OAUTH_URL", "http://localhost:28180/#private-value"],
  ])("%s의 잘못된 주소를 값 없이 알린다", (key, value) => {
    const parse = () => parseFastapiTargetEnv(env({ [key!]: value! }));
    expect(parse).toThrow(key);
    expect(parse).not.toThrow("private-value");
  });

  it("Task 6 전에 fastapi 실행을 계속 거절한다", () => {
    expect(() => requireImplementedTarget("fastapi")).toThrow("W4");
    expect(() => requireImplementedTarget("mock")).not.toThrow();
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
    const url = new URL(req.url!, "http://fixture");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/api/v1/search") {
      if (url.searchParams.get("query") !== `to:"${recipient}"`) {
        res.writeHead(400).end();
        return;
      }
      stored = messages(++poll);
      res.writeHead(status).end(JSON.stringify({ messages: stored, total: stored.length }));
    } else if (url.pathname.startsWith("/api/v1/message/")) {
      const found = stored.find(
        (message) => message.ID === decodeURIComponent(url.pathname.split("/").at(-1)!),
      );
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
    const correct = "http://localhost:3100/verify-email?token=new&source=mail";
    const fixture = await mailbox((poll) =>
      poll === 1
        ? []
        : [
            mail(
              "other-recipient",
              "http://localhost:3100/verify-email?token=other",
              "2020-01-03T00:00:00Z",
              "other@example.com",
            ),
            mail(
              "reset",
              "http://localhost:3100/reset-password?token=reset",
              "2020-01-04T00:00:00Z",
            ),
            mail("older", "http://localhost:3100/verify-email?token=old"),
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
    const old = mail("old", "http://localhost:3100/verify-email?token=old", "2020-01-02T00:00:00Z");
    const stale = mail("stale", "http://localhost:3100/verify-email?token=stale");
    const again = mail("again", "http://localhost:3100/verify-email?token=again", old.Created);
    const fixture = await mailbox((poll) => (poll < 3 ? [old, stale] : [again, old, stale]));
    expect(await fixture.target.mailLink(recipient, "verification")).toBe(
      "http://localhost:3100/verify-email?token=old",
    );
    expect(await fixture.target.mailLink(recipient, "verification")).toBe(
      "http://localhost:3100/verify-email?token=again",
    );
    expect(fixture.polls()).toBe(3);
  });

  it("목적별 새 메일 기준은 서로 독립이다", async () => {
    const fixture = await mailbox(() => [
      mail("verify", "http://localhost:3100/verify-email?token=verify", "2020-01-03T00:00:00Z"),
      mail("reset", "http://localhost:3100/reset-password?token=reset"),
    ]);
    await fixture.target.mailLink(recipient, "verification");
    expect(await fixture.target.mailLink(recipient, "reset")).toBe(
      "http://localhost:3100/reset-password?token=reset",
    );
  });

  it.each([
    "https://wrong.example/verify-email?token=private-value", // betterleaks:allow 사유: 메일 링크 검증용 가짜 토큰
    "http://user:private-value@localhost:3100/verify-email?token=private-value", // betterleaks:allow 사유: 메일 링크 검증용 가짜 자격 증명
  ])("다른 Origin이나 자격 증명이 든 인증 링크를 거절한다", async (link) => {
    const fixture = await mailbox(() => [mail("bad", link)]);
    await expect(fixture.target.mailLink(recipient, "verification")).rejects.toThrow("web Origin");
    await expect(fixture.target.mailLink(recipient, "verification")).rejects.not.toThrow(
      "private-value",
    );
  });

  it("목적 링크가 없거나 토큰이 비면 제한 시간 뒤 실패한다", async () => {
    const fixture = await mailbox(() => [
      mail("empty", "http://localhost:3100/verify-email?token="),
    ]);
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

async function oauthFixture() {
  const submissions: URLSearchParams[] = [];
  const callbacks: URL[] = [];
  const web = await serve((req, res) => {
    if (req.url!.startsWith("/oauth/callback")) {
      res.writeHead(302, { Location: "/me?from=social-e2e" }).end();
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end("<p>완료</p>");
    }
  });
  const api = await serve((req, res) => {
    const url = new URL(req.url!, "http://fixture");
    callbacks.push(url);
    const query = new URLSearchParams(
      url.searchParams.has("error") ? { error: "auth.oauth_denied" } : { code: "bff-code" },
    );
    res.writeHead(302, { Location: `${web}/oauth/callback?${query}` }).end();
  });
  const oauth = await serve(async (req, res) => {
    const url = new URL(req.url!, "http://fixture");
    if (req.method === "POST") {
      let body = "";
      for await (const part of req) body += String(part);
      submissions.push(new URLSearchParams(body));
      const back = new URL(url.searchParams.get("redirect_uri")!);
      back.searchParams.set("state", url.searchParams.get("state")!);
      back.searchParams.set("code", "provider-code");
      res.writeHead(302, { Location: back.href }).end();
    } else {
      res.setHeader("Content-Type", "text/html");
      // navikt 6.0.3의 필드·접힌 claims·submit 모양을 재현한다.
      const open = url.searchParams.has("open") ? " open" : "";
      res.end(`<form method="post"><input name="username" required>
        <details${open}><summary>Optional claims</summary><textarea name="claims"></textarea></details>
        <input type="submit" value="Sign-in"></form>`);
    }
  });
  const context = await browser.newContext();
  cleanups.push(() => context.close());
  await context.addCookies([
    { name: "oauth-attempt", value: "existing-pkce-attempt", url: web, httpOnly: true },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(1000);
  const target = fastapiTarget(
    request,
    env({ APP_URL: web, API_BASE_URL: `${api}/api/v1`, E2E_OAUTH_URL: oauth }),
  );
  const providerUrl = (provider: string) => {
    const url = new URL(`/${provider}/authorize`, oauth);
    url.searchParams.set("state", "existing-state+/=?");
    url.searchParams.set("redirect_uri", `${api}/api/v1/oauth/${provider}/callback`);
    return url;
  };
  return { target, page, context, submissions, callbacks, web, api, providerUrl };
}

describe("navikt 부수 채널", () => {
  it.each([
    ["google", { sub: "subject-42", name: "Social Name" }],
    ["kakao", { id: "subject-42", kakao_account: { profile: { nickname: "Social Name" } } }],
    ["naver", { response: { id: "subject-42", name: "Social Name" } }],
  ] as const)("%s 프로필 폼을 제출하고 실제 HTTP 콜백들을 따라간다", async (provider, claims) => {
    const f = await oauthFixture();
    const url = f.providerUrl(provider);
    // 이미 열린 details도 토글해서 닫지 않는다.
    if (provider === "naver") url.searchParams.set("open", "1");
    await f.page.goto(url.href);
    await f.target.completeSocialLogin(f.page, provider, {
      username: "subject-42",
      name: "Social Name",
    });
    expect(f.submissions).toHaveLength(1);
    expect(f.submissions[0]!.get("username")).toBe("subject-42");
    expect(JSON.parse(f.submissions[0]!.get("claims")!)).toEqual(claims);
    expect(f.callbacks[0]!.pathname).toBe(`/api/v1/oauth/${provider}/callback`);
    expect(f.callbacks[0]!.searchParams.get("state")).toBe("existing-state+/=?");
    expect(f.page.url()).toBe(`${f.web}/me?from=social-e2e`);
    expect(
      (await f.context.cookies()).find((cookie) => cookie.name === "oauth-attempt")?.value,
    ).toBe("existing-pkce-attempt");
  });

  it("거부는 현재 페이지의 실제 state와 backend redirect_uri를 쓴다", async () => {
    const f = await oauthFixture();
    await f.page.goto(f.providerUrl("google").href);
    await f.target.denySocialLogin(f.page, "google");
    expect(f.submissions).toHaveLength(0);
    expect(f.callbacks).toHaveLength(1);
    expect(f.callbacks[0]!.pathname).toBe("/api/v1/oauth/google/callback");
    expect(Object.fromEntries(f.callbacks[0]!.searchParams)).toEqual({
      state: "existing-state+/=?",
      error: "access_denied",
    });
    expect(f.page.url()).toBe(`${f.web}/me?from=social-e2e`);
    expect(
      (await f.context.cookies()).find((cookie) => cookie.name === "oauth-attempt")?.value,
    ).toBe("existing-pkce-attempt");
  });

  it.each(["missing-state", "duplicate-state", "wrong-callback", "wrong-provider", "wrong-origin"])(
    "%s인 제공자 시도는 거부하고 폼을 제출하지 않는다",
    async (problem) => {
      const f = await oauthFixture();
      const url = f.providerUrl(problem === "wrong-provider" ? "kakao" : "google");
      if (problem === "missing-state") url.searchParams.delete("state");
      if (problem === "duplicate-state") url.searchParams.append("state", "other-state");
      if (problem === "wrong-callback")
        url.searchParams.set("redirect_uri", `${f.api}/api/v1/oauth/naver/callback`);
      if (problem === "wrong-origin") url.host = new URL(f.web).host;
      await f.page.goto(url.href);
      await expect(f.target.denySocialLogin(f.page, "google")).rejects.toThrow();
      expect(f.callbacks).toHaveLength(0);
      expect(f.submissions).toHaveLength(0);
    },
  );
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
