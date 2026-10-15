import type { Server } from "node:http";
export function installShutdown(server: Server, close: () => Promise<void>): void {
  let closing: Promise<void> | undefined;
  const remove = () => {
    process.off("SIGTERM", shutdown);
    process.off("SIGINT", shutdown);
  };
  const shutdown = () => {
    closing ??= (async () => {
      server.close();
      server.closeAllConnections();
      await close();
    })();
    void closing
      .catch(() => {
        process.exitCode = 1;
      })
      .finally(remove);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  server.once("close", () => {
    if (!closing) remove();
  });
}
