import { createServer, request } from "node:http";
import { fixtureOrigin } from "./proxy.mjs";

/** A distinct owned storage listener; signed path/query/Host and bytes pass unchanged. */
export async function startStorageProxy({ upstream, port }) {
  const target = fixtureOrigin(upstream),
    sockets = new Set(),
    pending = new Set();
  let stopped = false,
    suspended = false;
  const server = createServer((req, res) => {
    const url = new URL(req.url, target);
    if (url.origin !== target.origin || !req.url.startsWith("/") || req.url.startsWith("//")) {
      res.writeHead(400).end();
      return;
    }
    const forward = request(url, { method: req.method, headers: req.headers }, (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
      response.once("error", () => res.destroy());
    });
    pending.add(forward);
    forward.once("close", () => pending.delete(forward));
    forward.once("error", () => res.destroy());
    req.once("error", () => forward.destroy());
    req.pipe(forward);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  async function listen(value) {
    await new Promise((resolve, reject) => {
      const failed = (error) => {
        server.off("listening", ready);
        reject(error);
      };
      const ready = () => {
        server.off("error", failed);
        resolve();
      };
      server.once("error", failed);
      server.once("listening", ready);
      server.listen(value, "127.0.0.1");
    });
  }
  async function close() {
    for (const item of pending) item.destroy();
    for (const item of sockets) item.destroy();
    if (server.listening)
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  }
  await listen(port);
  const bound = server.address().port;
  return {
    origin: `http://127.0.0.1:${bound}`,
    async suspend() {
      if (stopped) throw new Error("Owned storage is stopped.");
      suspended = true;
      await close();
    },
    async resume() {
      if (stopped) throw new Error("Owned storage is stopped.");
      if (suspended) {
        await listen(bound);
        suspended = false;
      }
    },
    async stop() {
      stopped = true;
      await close();
    },
  };
}
