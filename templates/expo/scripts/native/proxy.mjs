import { createServer, request } from "node:http";
import { connect } from "node:net";
import { once } from "node:events";
import { observeQueryError as observeError } from "./query-diagnostics.mjs";

/** Owned test proxy. The API still performs grants, writes, storage and revocations. */
export function fixtureOrigin(value) {
  let target;
  try {
    target = new URL(value);
  } catch {
    throw new Error("Native fixture requires an explicit loopback origin.");
  }
  if (
    target.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  )
    throw new Error("Native fixture requires an explicit loopback origin.");
  return target;
}
export async function startNativeProxy({ upstream, port, intercept, observe, observeQueryError }) {
  const target = fixtureOrigin(upstream);
  let armed = false,
    count = 0,
    storageFallbacks = 0,
    held,
    reached;
  const sockets = new Set(),
    pending = new Set();
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "PUT") storageFallbacks++;
      if (await intercept?.(req, res)) return;
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks),
        path = new URL(req.url, "http://localhost").pathname;
      if (
        armed &&
        req.headers.authorization &&
        req.method === "GET" &&
        path.startsWith("/api/v1/")
      ) {
        armed = false;
        res.writeHead(401, { "content-type": "application/vnd.api+json" });
        res.end(
          JSON.stringify({
            errors: [{ status: "401", code: "auth.access_token_expired", title: "Expired" }],
          }),
        );
        return;
      }
      const refresh =
        req.method === "POST" &&
        path === "/api/v1/sessions" &&
        JSON.parse(body.toString() || "{}").data?.attributes?.grantType === "refreshToken";
      const response = await new Promise((resolve, reject) => {
        const forward = request(
          new URL(req.url, target),
          {
            method: req.method,
            headers: { ...req.headers, host: target.host },
          },
          resolve,
        );
        pending.add(forward);
        forward.once("error", reject);
        forward.once("close", () => pending.delete(forward));
        forward.end(body);
      });
      // Never pass query strings, credentials, headers or response bodies to diagnostics.
      if (path.startsWith("/api/v1/"))
        observe?.({ method: req.method, path, status: response.statusCode });
      if (
        observeQueryError &&
        req.method === "GET" &&
        path === "/api/v1/posts" &&
        response.statusCode === 400
      )
        observeError(response, observeQueryError);
      if (refresh) {
        count++;
        if (held) {
          reached?.();
          await held.promise;
        }
      }
      if (res.destroyed) {
        response.destroy();
        return;
      }
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
      response.once("error", () => res.destroy());
    } catch {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  // Preserve Socket.IO's WebSocket handshake and frames without reading ticket payloads.
  server.on("upgrade", (req, socket, head) => {
    const upstreamSocket = connect(Number(target.port || 80), target.hostname);
    sockets.add(upstreamSocket);
    upstreamSocket.once("close", () => sockets.delete(upstreamSocket));
    upstreamSocket.once("error", () => socket.destroy());
    socket.once("error", () => upstreamSocket.destroy());
    upstreamSocket.once("connect", () => {
      const headers = { ...req.headers, host: target.host };
      upstreamSocket.write(
        `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
          Object.entries(headers)
            .map(([key, value]) => `${key}: ${value}\r\n`)
            .join("") +
          "\r\n",
      );
      if (head.length) upstreamSocket.write(head);
      socket.pipe(upstreamSocket).pipe(socket);
    });
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    storageFallbackCount: () => storageFallbacks,
    armRefresh() {
      if (held) throw new Error("A refresh fixture is already active.");
      count = 0;
      armed = true;
      let release;
      const promise = new Promise((resolve) => {
        release = resolve;
      });
      const arrived = new Promise((resolve) => {
        reached = resolve;
      });
      held = { promise, release, arrived };
    },
    async waitForRefresh() {
      if (!held) throw new Error("Arm refresh before waiting.");
      let timer;
      try {
        await Promise.race([
          held.arrived,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Native refresh did not reach the proxy.")),
              15000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    refreshCount: () => count,
    releaseRefresh() {
      armed = false;
      held?.release();
      held = undefined;
      reached = undefined;
    },
    async stop() {
      armed = false;
      held?.release();
      held = undefined;
      for (const req of pending) req.destroy();
      for (const socket of sockets) socket.destroy();
      if (server.listening)
        await new Promise((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve())),
        );
    },
  };
}
