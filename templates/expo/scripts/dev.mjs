import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { command, child } from "./process.mjs";
import { stopProcessTree } from "./process-tree.mjs";
import { readPublicEnv } from "../src/lib/config/env.ts";
import { contractRoot } from "./contract-root.mjs";
import { root } from "./process.mjs";
import { join, relative } from "node:path";
import defaults from "../mobile-defaults.json" with { type: "json" };

export function devEnvironment(mode, platform, input) {
  const config = readPublicEnv({ ...input, EXPO_PUBLIC_API_MODE: mode }, platform, false);
  const api = new URL(config.apiBaseUrl);
  if (mode === "mock" && api.port !== "4012")
    throw new Error("Mock mode uses port 4012; use backend mode for a prepared API.");
  return {
    EXPO_NO_DOTENV: "1",
    EXPO_PUBLIC_API_MODE: config.mode,
    EXPO_PUBLIC_API_BASE_URL: config.apiBaseUrl,
    EXPO_PUBLIC_REALTIME_URL: config.realtimeUrl,
    EXPO_PUBLIC_FRONTEND_URL: config.frontendUrl,
    EXPO_PUBLIC_APP_SCHEME: config.scheme,
    ...(mode === "mock"
      ? {
          PORT: "4012",
          API_URL: api.origin,
          FRONTEND_URL: config.frontendUrl,
          OAUTH_REDIRECT_URIS: `${config.scheme}://oauth/callback`,
        }
      : {}),
  };
}

export function devPlan(mode, port, contract = "contract") {
  if (!["mock", "backend"].includes(mode)) throw new Error("Invalid API mode.");
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid Metro port.");
  return [
    ...(mode === "mock"
      ? [
          {
            role: "mock",
            argv: command("tsx", [join(contract, "mock/src/main.ts").replaceAll("\\", "/")]),
          },
        ]
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
  const args = process.argv.slice(2);
  if (
    args.length &&
    (args.length !== 2 || args[0] !== "--platform" || !["android", "ios"].includes(args[1]))
  )
    throw new Error("Use pnpm dev [--platform android|ios].");
  const platform = args[1] ?? "android";
  const mode = process.env.EXPO_PUBLIC_API_MODE ?? defaults.mode;
  const port = Number(process.env.METRO_PORT ?? 8081);
  const plans = devPlan(mode, port, relative(root, contractRoot(root)));
  const runtime = devEnvironment(mode, platform, process.env);
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
        ...runtime,
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
