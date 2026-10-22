/** @jest-environment ./scripts/test/node-http-environment.cjs */
import { createApiClient } from "./client";
import { readPublicEnv } from "../config/env";
import { nodeApiFetch } from "../testing/api-fetch";
import { createServer } from "node:http";
import { once } from "node:events";
const host = globalThis as typeof globalThis & {
  __nodeHttp: Pick<
    typeof globalThis,
    "fetch" | "Request" | "Response" | "Headers" | "AbortController" | "AbortSignal"
  >;
  __reactNativeRequest: typeof Request;
  __startMock(): Promise<{ base: string; stop(): Promise<void> }>;
};
for (const [name, value] of Object.entries(host.__nodeHttp))
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
test("React Native's actual Request sends only contract query parameters to the real API", async () => {
  const mock = await host.__startMock();
  const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation((input, policy) => {
    const request = input as Request;
    return host.__nodeHttp.fetch(request.url, {
      ...policy,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
    });
  });
  Object.defineProperty(globalThis, "Request", {
    value: host.__reactNativeRequest,
    writable: true,
    configurable: true,
  });
  try {
    const client = createApiClient(
      readPublicEnv({ EXPO_PUBLIC_API_BASE_URL: mock.base + "/api/v1" }, "ios", false),
      undefined,
      undefined,
      nodeApiFetch,
    );
    const result = await client.GET("/posts", {
      params: { query: { include: "author", "page[number]": 1, "page[size]": 20 } },
    });
    expect(result.response.status).toBe(200);
    expect(result.data?.data.length).toBeGreaterThanOrEqual(2);
    const request = fetcher.mock.calls[0]![0] as Request;
    expect(new URL(request.url).searchParams.has("_")).toBe(false);
    expect(request.headers.get("Cache-Control")).toBe("no-store");
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ redirect: "error", credentials: "omit" });
  } finally {
    Object.defineProperty(globalThis, "Request", {
      value: host.__nodeHttp.Request,
      writable: true,
      configurable: true,
    });
    fetcher.mockRestore();
    await mock.stop();
  }
});
test("React Native Request cannot forward a session grant through a 307 redirect", async () => {
  let received = 0;
  const target = createServer((_req, res) => {
    received++;
    res.writeHead(200).end("{}");
  });
  target.listen(0, "127.0.0.1");
  await once(target, "listening");
  const destination = target.address();
  if (!destination || typeof destination === "string") throw new Error("No redirect target.");
  const origin = createServer((_req, res) =>
    res.writeHead(307, { Location: `http://127.0.0.1:${destination.port}/capture` }).end(),
  );
  origin.listen(0, "127.0.0.1");
  await once(origin, "listening");
  const address = origin.address();
  if (!address || typeof address === "string") throw new Error("No API address.");
  Object.defineProperty(globalThis, "Request", {
    value: host.__reactNativeRequest,
    writable: true,
    configurable: true,
  });
  try {
    const client = createApiClient(
      readPublicEnv(
        { EXPO_PUBLIC_API_BASE_URL: `http://127.0.0.1:${address.port}/api/v1` },
        "ios",
        false,
      ),
      undefined,
      undefined,
      async (request, policy) =>
        host.__nodeHttp.fetch(request.url, {
          ...policy,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: await request.text(),
        }),
    );
    await expect(
      client.POST("/sessions", {
        body: {
          data: {
            type: "sessions",
            attributes: {
              grantType: "password",
              email: "native@example.com",
              password: "redirect-fixture", // betterleaks:allow fake transport fixture
            },
          },
        },
      }),
    ).rejects.toThrow(); // betterleaks:allow fake transport fixture
    expect(received).toBe(0);
  } finally {
    Object.defineProperty(globalThis, "Request", {
      value: host.__nodeHttp.Request,
      writable: true,
      configurable: true,
    });
    origin.closeAllConnections();
    target.closeAllConnections();
    await Promise.all([
      new Promise<void>((resolve) => origin.close(() => resolve())),
      new Promise<void>((resolve) => target.close(() => resolve())),
    ]);
  }
});
