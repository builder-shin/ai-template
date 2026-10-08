import { appOrigin } from "../src/lib/app-config.mjs";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  chromium,
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
} from "@playwright/test";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fastapiSocial } from "../e2e/targets/social";
import { appEnvironment } from "../e2e/targets/app";
const fastapiTarget = (_request: APIRequestContext, input: Record<string, string | undefined>) =>
  fastapiSocial(input);

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

async function oauthFixture() {
  const submissions: URLSearchParams[] = [];
  const callbacks: URL[] = [];
  const web = await serve((req, res) => {
    if (req.url === undefined) throw new Error("소셜 fixture 요청 URL을 확인한다.");
    if (req.url.startsWith("/oauth/callback")) {
      res.writeHead(302, { Location: "/me?from=social-e2e" }).end();
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end("<p>완료</p>");
    }
  });
  const api = await serve((req, res) => {
    if (req.url === undefined) throw new Error("소셜 fixture 요청 URL을 확인한다.");
    const url = new URL(req.url, "http://fixture");
    callbacks.push(url);
    const query = new URLSearchParams(
      url.searchParams.has("error") ? { error: "auth.oauth_denied" } : { code: "bff-code" },
    );
    res.writeHead(302, { Location: `${web}/oauth/callback?${query}` }).end();
  });
  const oauth = await serve(async (req, res) => {
    if (req.url === undefined) throw new Error("소셜 fixture 요청 URL을 확인한다.");
    const url = new URL(req.url, "http://fixture");
    if (req.method === "POST") {
      let body = "";
      for await (const part of req) body += String(part);
      submissions.push(new URLSearchParams(body));
      const redirect = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");
      if (redirect === null || state === null)
        throw new Error("소셜 fixture 콜백·state를 확인한다.");
      const back = new URL(redirect);
      back.searchParams.set("state", state);
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
    const submission = f.submissions[0];
    const callback = f.callbacks[0];
    if (!submission || !callback) throw new Error("소셜 폼 제출·콜백 결과를 확인한다.");
    const submittedClaims = submission.get("claims");
    if (submittedClaims === null) throw new Error("소셜 폼의 claims를 확인한다.");
    expect(submission.get("username")).toBe("subject-42");
    expect(JSON.parse(submittedClaims)).toEqual(claims);
    expect(callback.pathname).toBe(`/api/v1/oauth/${provider}/callback`);
    expect(callback.searchParams.get("state")).toBe("existing-state+/=?");
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
    const callback = f.callbacks[0];
    if (!callback) throw new Error("소셜 거부 콜백 결과를 확인한다.");
    expect(callback.pathname).toBe("/api/v1/oauth/google/callback");
    expect(Object.fromEntries(callback.searchParams)).toEqual({
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

it.each([
  undefined,
  "ftp://localhost",
  "http://localhost:28180/#private-value",
  "http://127.0.0.1:28180?",
  "http://127.0.0.1:28180#",
])("잘못된 OAuth Origin %s를 값 없이 알린다", (value) => {
  expect(() => appEnvironment("fastapi", { E2E_OAUTH_URL: value })).toThrow("E2E_OAUTH_URL");
  expect(() => appEnvironment("fastapi", { E2E_OAUTH_URL: value })).not.toThrow("private-value");
});
it("OAuth Origin의 끝 슬래시를 정리하고 목에는 요구하지 않는다", () => {
  expect(appEnvironment("fastapi", { E2E_OAUTH_URL: "http://127.0.0.1:28180/" })).toEqual({
    E2E_OAUTH_URL: "http://127.0.0.1:28180",
  });
  expect(appEnvironment("mock", {})).toEqual({});
});
