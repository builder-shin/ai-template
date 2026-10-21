import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { command, child } from "./process.mjs";
import { stopProcessTree } from "./process-tree.mjs";

export function devPlan(mode, port) {
  if (!["mock", "backend"].includes(mode)) throw new Error("Invalid API mode.");
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid Metro port.");
  return [
    ...(mode === "mock"
      ? [{ role: "mock", argv: command("tsx", ["contract/mock/src/main.ts"]) }]
      : []),
    { role: "metro", argv: command("expo", ["start", "--dev-client", "--port", String(port)]) },
  ];
}
export function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(new Error(`Port ${port} in use — stop its owner or choose another port.`)),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
async function main() {
  const mode = process.env.EXPO_PUBLIC_API_MODE ?? "mock";
  const port = Number(process.env.METRO_PORT ?? 8081);
  const plans = devPlan(mode, port);
  await assertPortFree(port);
  if (mode === "mock") await assertPortFree(4012);
  const children = [];
  let stopping;
  const stop = (code) =>
    (stopping ??= (async () => {
      await Promise.allSettled(children.map((owned) => stopProcessTree(owned)));
      process.exitCode = code;
    })());
  process.once("SIGINT", () => void stop(130));
  process.once("SIGTERM", () => void stop(143));
  for (const plan of plans) {
    const owned = child(plan.argv, {
      env: {
        ...process.env,
        EXPO_NO_DOTENV: "1",
        ...(plan.role === "mock"
          ? {
              PORT: "4012",
              FRONTEND_URL: "http://localhost:3000",
              OAUTH_REDIRECT_URIS: "http://localhost:3000/oauth/callback",
            }
          : {}),
      },
    });
    children.push(owned);
    owned.once("error", () => void stop(1));
    owned.once("exit", (code, signal) => {
      if (!stopping) void stop(signal ? 1 : (code ?? 1));
    });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
