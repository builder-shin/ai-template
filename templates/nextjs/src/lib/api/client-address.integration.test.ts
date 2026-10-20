import { createServer } from "node:http";
import { once } from "node:events";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createApiClient } from "./client";

const received: Record<string, string | string[] | undefined>[] = [];
const server = createServer((request, response) => {
  received.push(request.headers);
  response.setHeader("Content-Type", "application/vnd.api+json");
  response.end(JSON.stringify({ data: [] }));
});
let baseUrl: string;
beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("테스트 포트를 얻지 못했다.");
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
});
beforeEach(() => {
  received.length = 0;
});
afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);

const forged = {
  "X-Forwarded-For": "203.0.113.90, 203.0.113.91",
  Forwarded: "for=203.0.113.92",
  "X-Real-IP": "203.0.113.93",
};
it("주소가 없는 저수준 클라이언트는 호출별 위조 전달 헤더를 모두 제거한다", async () => {
  await createApiClient({ baseUrl, locale: "ko", log: () => {} }).GET("/posts", {
    headers: forged,
  });
  expect(received[0]?.["x-forwarded-for"]).toBeUndefined();
  expect(received[0]?.forwarded).toBeUndefined();
  expect(received[0]?.["x-real-ip"]).toBeUndefined();
});
it.each(["192.0.2.1", "2001:db8::2"])(
  "(%s) 검증한 주소는 매 호출의 위조 헤더보다 우선한다",
  async (clientIp) => {
    const options = { baseUrl, locale: "en" as const, clientIp, log: () => {} };
    const client = createApiClient(options);
    await client.GET("/posts", { headers: forged });
    await client.GET("/posts", { headers: { "X-Forwarded-For": "203.0.113.2" } });
    expect(received.map((headers) => headers["x-forwarded-for"])).toEqual([clientIp, clientIp]);
    expect(received.every((headers) => !headers.forwarded && !headers["x-real-ip"])).toBe(true);
  },
);
it.each(["invalid", "192.0.2.1,192.0.2.2", "192.0.2.1:80", "[2001:db8::1]", "fe80::1%eth0"])(
  "(%s) 잘못된 주소 옵션은 네트워크 요청 전에 거절한다",
  (clientIp) => {
    const options = { baseUrl, locale: "ko" as const, clientIp };
    expect(() => createApiClient(options)).toThrow(/clientIp/);
    expect(received).toEqual([]);
  },
);
it("생성 뒤 옵션 객체가 바뀌어도 검증한 주소를 보존한다", async () => {
  const options = { baseUrl, locale: "ko" as const, clientIp: "192.0.2.1", log: () => {} };
  const client = createApiClient(options);
  options.clientIp = "192.0.2.2, 192.0.2.3";
  await client.GET("/posts");
  expect(received[0]?.["x-forwarded-for"]).toBe("192.0.2.1");
});
