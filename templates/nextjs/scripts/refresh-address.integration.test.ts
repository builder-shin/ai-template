import { once } from "node:events";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import proxy from "../src/proxy";
import { refreshSession } from "../src/lib/session/refresh";
import { sealSession, sessionCookieName } from "../src/lib/session/cookie";

const received: { token: string; ip: string | undefined }[] = [];
const attributes = {
  accessToken: "new-access-token",
  refreshToken: "new-refresh-token",
  accessTokenExpiresAt: new Date(Date.now() + 300000).toISOString(),
  refreshTokenExpiresAt: new Date(Date.now() + 600000).toISOString(),
};
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += String(chunk);
  const input = JSON.parse(body) as { data: { attributes: { refreshToken: string } } };
  received.push({
    token: input.data.attributes.refreshToken,
    ip: request.headers["x-forwarded-for"] as string | undefined,
  });
  response.setHeader("Content-Type", "application/vnd.api+json");
  response.end(JSON.stringify({ data: { type: "sessions", id: randomUUID(), attributes } }));
});
let base: string;
beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("테스트 포트를 얻지 못했다.");
  base = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  received.length = 0;
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

it("주소를 전달해도 토큰별 진행 중·완료 후 Promise identity를 유지하고 다른 토큰은 분리한다", async () => {
  const firstToken = randomUUID();
  const otherToken = randomUUID();
  const first = refreshSession(firstToken, "ko", "192.0.2.1");
  expect(refreshSession(firstToken, "en", "192.0.2.2")).toBe(first);
  const other = refreshSession(otherToken, "en", "2001:db8::2");
  await Promise.all([first, other]);
  expect(refreshSession(firstToken, "ko", "192.0.2.3")).toBe(first);
  expect(received).toHaveLength(2);
  expect(received).toContainEqual({ token: firstToken, ip: "192.0.2.1" });
  expect(received).toContainEqual({ token: otherToken, ip: "2001:db8::2" });
});
it.each(["192.0.2.10", "2001:db8::10", "invalid", "192.0.2.10, 192.0.2.11", ""])(
  "proxy는 요청 문맥 API 없이 (%s) ingress 주소를 선택해 갱신한다",
  async (ip) => {
    const token = randomUUID();
    const cookie = await sealSession({
      ...attributes,
      refreshToken: token,
      accessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    const request = new NextRequest("http://localhost:3000/", {
      headers: {
        cookie: `${sessionCookieName()}=${cookie}`,
        "x-ingress-client-ip": ip,
        "x-forwarded-for": "203.0.113.1",
      },
    });
    const result = await proxy(request);
    expect(result.headers.get("location")).toBeNull();
    expect(result.cookies.get(sessionCookieName())).toBeDefined();
    expect(received).toEqual([
      { token, ip: ip.startsWith("192.0.2.10,") || ip === "invalid" || !ip ? undefined : ip },
    ]);
  },
);
