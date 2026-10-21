import { AsyncLocalStorage } from "node:async_hooks";
import { once } from "node:events";
import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createRequestApiClient } from "./request-client";
import { createSessionApiClient } from "./session-client";

const context = new AsyncLocalStorage<Headers>();
vi.mock("next/headers", () => ({
  headers: async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const headers = context.getStore();
    if (!headers) throw new Error("요청 문맥 없음");
    return headers;
  },
}));
vi.mock("../session/request", () => ({
  readSession: async () => ({ accessToken: "test-session-token" }),
}));
const received: Record<string, string | string[] | undefined>[] = [];
const server = createServer((request, response) => {
  received.push(request.headers);
  response.setHeader("Content-Type", "application/vnd.api+json");
  response.end(JSON.stringify({ data: [] }));
});
beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("테스트 포트를 얻지 못했다.");
  vi.stubEnv("API_BASE_URL", `http://127.0.0.1:${address.port}/api/v1`);
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "http://localhost:4010");
  vi.stubEnv("SESSION_SECRET", "x".repeat(32)); // betterleaks:allow 사유: 테스트용 공개 키
});
beforeEach(() => {
  received.length = 0;
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
});
afterEach(() => {
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  vi.unstubAllEnvs();
});

it("기본 비활성은 Next 요청 문맥 없이도 호출하고 위조 헤더를 전달하지 않는다", async () => {
  const client = await createRequestApiClient({ locale: "ko", log: () => {} });
  await client.GET("/posts", { headers: { "X-Forwarded-For": "203.0.113.1" } });
  expect(received[0]?.["x-forwarded-for"]).toBeUndefined();
});
it("활성인데 요청 문맥이 없으면 네트워크 호출 전에 실패한다", async () => {
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-ingress-client-ip");
  await expect(createRequestApiClient({ locale: "ko" })).rejects.toThrow("요청 문맥 없음");
  expect(received).toEqual([]);
});
it.each([null, "invalid", "192.0.2.1, 192.0.2.2"])(
  "(%s) 누락·무효 ingress 주소는 위조 체인을 전달하지 않는다",
  async (ip) => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-ingress-client-ip");
    const headers = new Headers({ "x-forwarded-for": "203.0.113.1" });
    if (ip) headers.set("x-ingress-client-ip", ip);
    await context.run(headers, async () => {
      await (await createRequestApiClient({ locale: "ko", log: () => {} })).GET("/posts");
    });
    expect(received[0]?.["x-forwarded-for"]).toBeUndefined();
  },
);
it("동시 익명·세션·인증 요청은 각 문맥의 IP와 토큰을 분리한다", async () => {
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-ingress-client-ip");
  const rows = [
    { ip: "192.0.2.1", token: undefined },
    { ip: "2001:db8::2", token: "Bearer test-session-token" },
    { ip: "192.0.2.3", token: "Bearer test-auth-token" },
  ];
  await Promise.all(
    rows.map(({ ip }, index) =>
      context.run(new Headers({ "x-ingress-client-ip": ip }), async () => {
        const options = { locale: "en" as const, log: () => {} };
        const client =
          index === 1
            ? await createSessionApiClient(options)
            : await createRequestApiClient({
                ...options,
                ...(index === 2 ? { accessToken: "test-auth-token" } : {}),
              });
        await client.GET("/posts", {
          headers: {
            "x-forwarded-for": "203.0.113.1",
            "x-real-ip": "203.0.113.2",
            Forwarded: "for=203.0.113.3",
          },
        });
      }),
    ),
  );
  expect(received).toHaveLength(3);
  for (const { ip, token } of rows) {
    const headers = received.find((entry) => entry["x-forwarded-for"] === ip);
    expect(headers).toBeDefined();
    expect(headers?.authorization).toBe(token);
    expect(headers?.forwarded).toBeUndefined();
    expect(headers?.["x-real-ip"]).toBeUndefined();
  }
});
