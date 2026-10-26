/** @jest-environment ./scripts/test/node-http-environment.cjs */
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { createApiClient } from "../api/client";
import { readPublicEnv } from "../config/env";
import { SessionManager } from "./manager";
import { createSessionTransport } from "./transport";
import { memoryStore, passwordGrant, tokens } from "./test-fixtures";
import { nodeApiFetch } from "../testing/api-fetch";

const nativeHttp = (
  globalThis as typeof globalThis & {
    __nodeHttp: Pick<
      typeof globalThis,
      "fetch" | "Request" | "Response" | "Headers" | "AbortController" | "AbortSignal"
    >;
  }
).__nodeHttp;
for (const [name, value] of Object.entries(nativeHttp))
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });

describe("real HTTP authentication retry boundary", () => {
  let server: Server;
  afterEach(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  async function harness(
    mode: "success" | "always401" | "forbidden" | "network" | "escape" = "success",
  ) {
    let refreshes = 0;
    let gets = 0;
    const requests: {
      path: string;
      authorization?: string | undefined;
      accept?: string | undefined;
      grantType?: string;
    }[] = [];
    server = createServer(async (req, res) => {
      const capture = {
        path: req.url!,
        authorization: req.headers.authorization,
        accept: req.headers.accept,
      };
      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array));
        const payload = JSON.parse(Buffer.concat(chunks).toString()) as {
          data: { attributes: { grantType: string; refreshToken?: string } };
        };
        requests.push({ ...capture, grantType: payload.data.attributes.grantType });
        const refresh = payload.data.attributes.grantType === "refreshToken";
        if (refresh) {
          refreshes++;
          expect(payload.data.attributes.refreshToken).toBe("refresh-a");
        }
        res.writeHead(201, { "Content-Type": "application/vnd.api+json" });
        res.end(JSON.stringify(tokens(refresh ? "rotated" : "a")));
        return;
      }
      requests.push(capture);
      gets++;
      if (mode === "escape") {
        if (req.url === "/api/v1/posts") {
          res.writeHead(302, { Location: "/outside-api" });
          res.end();
        } else {
          res.writeHead(200, { "Content-Type": "application/vnd.api+json" });
          res.end(JSON.stringify({ data: [] }));
        }
        return;
      }
      if (mode === "network") {
        req.socket.destroy();
        return;
      }
      const status =
        mode === "forbidden"
          ? 403
          : mode === "always401" || req.headers.authorization === "Bearer access-a"
            ? 401
            : 200;
      res.writeHead(status, { "Content-Type": "application/vnd.api+json" });
      res.end(
        JSON.stringify(status === 200 ? { data: [] } : { errors: [{ code: "auth.unauthorized" }] }),
      );
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Server unavailable.");
    const config = readPublicEnv(
      { EXPO_PUBLIC_API_BASE_URL: `http://127.0.0.1:${address.port}/api/v1` },
      "ios",
      false,
    );
    const manager = new SessionManager({
      store: memoryStore(),
      transport: createSessionTransport(config, () => "en", nodeApiFetch),
    });
    await manager.signIn(passwordGrant);
    return {
      manager,
      client: createApiClient(config, manager, undefined, nodeApiFetch),
      requests,
      counts: () => ({ refreshes, gets }),
    };
  }

  test("20 concurrent 401s share one rotation with confined JSON:API requests", async () => {
    const h = await harness();
    const old = h.manager.credentials()!;
    const results = await Promise.all(Array.from({ length: 20 }, () => h.client.GET("/posts")));
    expect(results.every((r) => r.response.status === 200)).toBe(true);
    expect(h.counts().refreshes).toBe(1);
    expect((await h.manager.refresh(old))?.accessToken).toBe("access-rotated");
    expect(h.counts().refreshes).toBe(1);
    expect(
      h.requests.every(
        (r) => r.path.startsWith("/api/v1/") && r.accept === "application/vnd.api+json",
      ),
    ).toBe(true);
    expect(h.requests.filter((r) => r.grantType).every((r) => r.authorization === undefined)).toBe(
      true,
    );
  });

  test.each(["forbidden", "network"] as const)(
    "%s does not rotate refresh credentials",
    async (mode) => {
      const h = await harness(mode);
      await expect(h.client.GET("/posts")).rejects.toThrow();
      expect(h.counts().refreshes).toBe(0);
      expect(h.manager.credentials()?.accessToken).toBe("access-a");
    },
  );

  test("second unauthorized response fails after exactly one retry", async () => {
    const h = await harness("always401");
    await expect(h.client.GET("/posts")).rejects.toMatchObject({ status: 401 });
    expect(h.counts()).toEqual({ refreshes: 1, gets: 2 });
  });

  test("API redirects cannot escape the configured base or carry ambient cookies", async () => {
    const h = await harness("escape");
    await expect(
      h.client.GET("/posts", { redirect: "follow", credentials: "include" }),
    ).rejects.toThrow();
    expect(h.requests.some((r) => r.path === "/outside-api")).toBe(false);
  });
});
