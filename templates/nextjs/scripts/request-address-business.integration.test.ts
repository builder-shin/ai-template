import { once } from "node:events";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  loginAction,
  requestPasswordResetAction,
  resendVerificationAction,
  resetPasswordAction,
  signupAction,
  verifyEmailAction,
} from "../src/features/auth/actions";
import { getPost, getPosts } from "../src/features/posts/queries";
import { GET as oauthCallback } from "../src/app/oauth/callback/route";
import { oauthCookie } from "../src/lib/session/oauth";
import { sessionCookieName, unsealSession } from "../src/lib/session/cookie";
import type { components } from "../src/lib/api/schema";

const context = vi.hoisted(() => ({
  headers: new Headers(),
  jar: new Map<string, { value: string; maxAge?: number }>(),
}));
// Next 요청 경계만 대체하고 Action·조회·OAuth·API·쿠키 암호화는 실제 구현을 쓴다.
vi.mock("next/headers", () => ({
  headers: async () => context.headers,
  cookies: async () => ({
    get: (name: string) => context.jar.get(name),
    set: (cookie: { name: string; value: string; maxAge?: number }) =>
      context.jar.set(cookie.name, cookie),
  }),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "ko" }));

type Schemas = components["schemas"];
const userId = "6c0d4ea0-1a5f-4cbe-904a-46e5b0014aa1";
const postId = "bb26e20b-9c91-4df7-8adc-178e0e1e2c91";
const timestamp = "2026-10-21T00:00:00Z";
const sessionDocument: Schemas["SessionWithTokensDocument"] = {
  data: {
    type: "sessions",
    id: "business-session",
    attributes: {
      userAgent: null,
      createdAt: timestamp,
      lastUsedAt: timestamp,
      current: true,
      accessToken: "business-access-token", // betterleaks:allow 사유: HTTP 테스트 토큰
      refreshToken: "business-refresh-token", // betterleaks:allow 사유: HTTP 테스트 토큰
      accessTokenExpiresAt: new Date(Date.now() + 300_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    },
    relationships: { user: { data: { type: "users", id: userId } } },
  },
};
const meDocument: Schemas["UserMeDocument"] = {
  data: {
    type: "users",
    id: userId,
    attributes: {
      email: "business@example.com",
      name: "Business",
      locale: "en",
      status: "active",
      emailVerifiedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    relationships: { avatar: { data: null }, roles: { data: [] } },
  },
  meta: { permissions: [] },
};
const post: Schemas["PostResource"] = {
  type: "posts",
  id: postId,
  attributes: {
    title: "Address post",
    body: "Published body",
    status: "published",
    publishedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  relationships: { author: { data: null }, coverImage: { data: null } },
};
const collection: Schemas["PostCollectionDocument"] = {
  data: [post],
  links: { first: "/api/v1/posts", last: "/api/v1/posts", next: null, prev: null },
  meta: { page: { number: 1, size: 10, total: 1, totalPages: 1 } },
};
const received: { path: string; method: string; headers: IncomingHttpHeaders; body: string }[] = [];
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += String(chunk);
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  received.push({ path, method: request.method ?? "", headers: request.headers, body });
  response.setHeader("Content-Type", "application/vnd.api+json");
  if (path === "/api/v1/sessions") response.end(JSON.stringify(sessionDocument));
  else if (path === "/api/v1/me") response.end(JSON.stringify(meDocument));
  else if (path === "/api/v1/posts") response.end(JSON.stringify(collection));
  else if (path === `/api/v1/posts/${postId}`) response.end(JSON.stringify({ data: post }));
  else {
    response.statusCode = 429;
    response.setHeader("Retry-After", "5");
    response.end(
      JSON.stringify({
        errors: [
          {
            status: "429",
            code: "rate_limit.exceeded",
            title: "Rate limited",
            meta: { params: { retryAfter: 5 } },
          },
        ],
      }),
    );
  }
});
let base: string;
beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("테스트 포트가 없다.");
  base = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  received.length = 0;
  context.jar.clear();
  context.headers = ingress("192.0.2.41");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${base}/api/v1`);
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", base);
  vi.stubEnv("SESSION_SECRET", "x".repeat(32)); // betterleaks:allow 사유: 테스트 공개 키
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-ingress-client-ip");
});
afterEach(() => vi.unstubAllEnvs());
afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);

function ingress(ip: string) {
  return new Headers({
    "x-ingress-client-ip": ip,
    "x-forwarded-for": "203.0.113.99, 203.0.113.100",
    "x-real-ip": "203.0.113.98",
    Forwarded: "for=203.0.113.97",
  });
}
function form() {
  const data = new FormData();
  data.set("email", "business@example.com");
  data.set("name", "Business");
  data.set("password", "business-test-password"); // betterleaks:allow 사유: 테스트 비밀번호
  data.set("token", "business-mail-token");
  return data;
}
function expectAddress(ip: string) {
  expect(received.length).toBeGreaterThan(0);
  for (const { headers } of received) {
    expect(headers["x-forwarded-for"]).toBe(ip);
    expect(headers["x-real-ip"]).toBeUndefined();
    expect(headers.forwarded).toBeUndefined();
    expect(headers["x-ingress-client-ip"]).toBeUndefined();
  }
}

it.each(["192.0.2.41", "2001:db8::41"])(
  "로그인 발급과 본인 조회는 선택한 ingress 주소만 전달한다 (%s)",
  async (ip) => {
    context.headers = ingress(ip);
    await expect(loginAction("/me", { ok: true }, form())).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/en/me;307;",
    });
    expect(received.map(({ method, path }) => [method, path])).toEqual([
      ["POST", "/api/v1/sessions"],
      ["GET", "/api/v1/me"],
    ]);
    expect(received[0]?.headers.authorization).toBeUndefined();
    expect(received[1]?.headers.authorization).toBe("Bearer business-access-token");
    expect((await unsealSession(context.jar.get(sessionCookieName())?.value))?.sessionId).toBe(
      "business-session",
    );
    expectAddress(ip);
  },
);

it.each([
  { label: "가입", action: signupAction, path: "/registrations" },
  { label: "메일 재발송", action: resendVerificationAction, path: "/email-verification-requests" },
  { label: "메일 검증", action: verifyEmailAction, path: "/email-verifications" },
  { label: "재설정 요청", action: requestPasswordResetAction, path: "/password-reset-requests" },
  { label: "비밀번호 재설정", action: resetPasswordAction, path: "/password-resets" },
])(
  "익명 인증 Action도 실패 응답까지 ingress 주소를 유지한다 ($label)",
  async ({ action, path }) => {
    expect(await action({ ok: true }, form())).toMatchObject({ ok: false, retryAfter: 5 });
    expect(received.map(({ method, path }) => [method, path])).toEqual([
      ["POST", `/api/v1${path}`],
    ]);
    expect(received[0]?.headers.authorization).toBeUndefined();
    expectAddress("192.0.2.41");
  },
);

it("공개 글 목록과 상세는 인증 토큰 없이 요청 주소를 전달한다", async () => {
  expect((await getPosts("ko")).posts[0]?.title).toBe("Address post");
  expect((await getPost("en", postId))?.body).toBe("Published body");
  expect(received.map(({ method, path }) => [method, path])).toEqual([
    ["GET", "/api/v1/posts"],
    ["GET", `/api/v1/posts/${postId}`],
  ]);
  for (const request of received) expect(request.headers.authorization).toBeUndefined();
  expectAddress("192.0.2.41");
});

it("OAuth 콜백은 코드 교환과 본인 조회에 같은 ingress 주소를 전달한다", async () => {
  context.headers = ingress("2001:db8::42");
  const cookie = await oauthCookie({
    provider: "google",
    verifier: "v".repeat(43),
    returnTo: "/me",
    locale: "ko",
  });
  const request = new NextRequest(
    "http://localhost:3000/oauth/callback?code=business-oauth-code&provider=google",
    {
      headers: { ...Object.fromEntries(context.headers), Cookie: `${cookie.name}=${cookie.value}` },
    },
  );
  const result = await oauthCallback(request);
  expect(result.status).toBe(303);
  expect(result.headers.get("location")).toBe("http://localhost:3000/en/me");
  expect(received.map(({ method, path }) => [method, path])).toEqual([
    ["POST", "/api/v1/sessions"],
    ["GET", "/api/v1/me"],
  ]);
  expect(JSON.parse(received[0]?.body ?? "")).toMatchObject({
    data: {
      attributes: {
        grantType: "oauthCode",
        code: "business-oauth-code",
        codeVerifier: "v".repeat(43),
      },
    },
  });
  expect(received[1]?.headers.authorization).toBe("Bearer business-access-token");
  expect((await unsealSession(result.cookies.get(sessionCookieName())?.value))?.sessionId).toBe(
    "business-session",
  );
  expectAddress("2001:db8::42");
});
