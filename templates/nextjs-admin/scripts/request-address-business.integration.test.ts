import { once } from "node:events";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { loginAction } from "../src/lib/admin/actions";
import { sessionCookieName, unsealSession } from "../src/lib/session/cookie";
import type { components } from "../src/lib/api/schema";

const context = vi.hoisted(() => ({
  headers: new Headers(),
  jar: new Map<string, { value: string; maxAge?: number }>(),
}));
// Next 요청 경계만 대체한다. 발급·본인 조회·실패 정리 HTTP와 세션 암호화는 실제 구현이다.
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
const userId = "b63233bd-3289-48f6-9c0b-78f36932bd97";
const timestamp = "2026-10-21T00:00:00Z";
const sessionDocument: Schemas["SessionWithTokensDocument"] = {
  data: {
    type: "sessions",
    id: "admin-business-session",
    attributes: {
      userAgent: null,
      createdAt: timestamp,
      lastUsedAt: timestamp,
      current: true,
      accessToken: "admin-business-access-token", // betterleaks:allow 사유: HTTP 테스트 토큰
      refreshToken: "admin-business-refresh-token", // betterleaks:allow 사유: HTTP 테스트 토큰
      accessTokenExpiresAt: new Date(Date.now() + 300_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    },
    relationships: { user: { data: { type: "users", id: userId } } },
  },
};
const user: Schemas["UserResource"] = {
  type: "users",
  id: userId,
  attributes: {
    email: "admin-business@example.com",
    name: "Admin business",
    locale: "en",
    status: "active",
    emailVerifiedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  relationships: { avatar: { data: null }, roles: { data: [] } },
};
const received: { path: string; method: string; headers: IncomingHttpHeaders }[] = [];
let hasAccess = true;
let failMe = false;
const server = createServer((request, response) => {
  request.resume();
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  received.push({ path, method: request.method ?? "", headers: request.headers });
  response.setHeader("Content-Type", "application/vnd.api+json");
  if (path === "/api/v1/sessions") response.end(JSON.stringify(sessionDocument));
  else if (path === "/api/v1/me" && failMe) {
    response.statusCode = 503;
    response.end(
      JSON.stringify({
        errors: [
          {
            status: "503",
            code: "service.unavailable",
            title: "Unavailable",
            meta: { params: {} },
          },
        ],
      }),
    );
  } else if (path === "/api/v1/me") {
    const document: Schemas["UserMeDocument"] = {
      data: user,
      meta: { permissions: hasAccess ? ["admin:access"] : [] },
    };
    response.end(JSON.stringify(document));
  } else if (path === "/api/v1/sessions/current") {
    response.statusCode = 204;
    response.end();
  } else {
    response.statusCode = 404;
    response.end();
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
  hasAccess = true;
  failMe = false;
  context.headers = ingress("192.0.2.51");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${base}/api/v1`);
  vi.stubEnv("APP_URL", "http://localhost:3001");
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
  data.set("email", "admin-business@example.com");
  data.set("password", "business-test-password"); // betterleaks:allow 사유: 테스트 비밀번호
  return data;
}
function expectAddress(ip: string) {
  expect(received.length).toBeGreaterThan(0);
  for (const [index, { headers }] of received.entries()) {
    expect(headers["x-forwarded-for"]).toBe(ip);
    expect(headers["x-real-ip"]).toBeUndefined();
    expect(headers.forwarded).toBeUndefined();
    expect(headers["x-ingress-client-ip"]).toBeUndefined();
    expect(headers.authorization).toBe(
      index === 0 ? undefined : "Bearer admin-business-access-token",
    );
  }
}

it.each(["192.0.2.51", "2001:db8::51"])(
  "관리 로그인 발급과 본인 조회는 같은 ingress 주소만 전달한다 (%s)",
  async (ip) => {
    context.headers = ingress(ip);
    await expect(loginAction("/posts", { ok: true }, form())).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/en/posts;307;",
    });
    expect(received.map(({ method, path }) => [method, path])).toEqual([
      ["POST", "/api/v1/sessions"],
      ["GET", "/api/v1/me"],
    ]);
    expect((await unsealSession(context.jar.get(sessionCookieName())?.value))?.sessionId).toBe(
      "admin-business-session",
    );
    expectAddress(ip);
  },
);

it("관리 권한 없는 로그인은 같은 ingress 주소로 발급 세션을 폐기한다", async () => {
  hasAccess = false;
  expect(await loginAction("/posts", { ok: true }, form())).toMatchObject({
    ok: false,
    noAccess: true,
  });
  expect(received.map(({ method, path }) => [method, path])).toEqual([
    ["POST", "/api/v1/sessions"],
    ["GET", "/api/v1/me"],
    ["DELETE", "/api/v1/sessions/current"],
  ]);
  expect(context.jar.size).toBe(0);
  expectAddress("192.0.2.51");
});

it("발급 뒤 본인 조회 실패도 같은 ingress 주소로 정리한 다음 원래 오류를 전달한다", async () => {
  failMe = true;
  await expect(loginAction("/posts", { ok: true }, form())).rejects.toMatchObject({
    status: 503,
    code: "service.unavailable",
  });
  expect(received.map(({ method, path }) => [method, path])).toEqual([
    ["POST", "/api/v1/sessions"],
    ["GET", "/api/v1/me"],
    ["DELETE", "/api/v1/sessions/current"],
  ]);
  expect(context.jar.size).toBe(0);
  expectAddress("192.0.2.51");
});
