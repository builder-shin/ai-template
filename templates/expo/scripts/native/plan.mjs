import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { root } from "../process.mjs";
import { readPublicEnv } from "../../src/lib/config/env.ts";
import identity from "../../app-identity.json" with { type: "json" };
import { nativeFlows } from "./flow-names.mjs";

export function nativeOptions(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const { values, tokens } = parseArgs({
    args,
    tokens: true,
    options: {
      platform: { type: "string" },
      device: { type: "string" },
      "run-id": { type: "string" },
      target: { type: "string" },
      flow: { type: "string" },
      print: { type: "boolean" },
      keep: { type: "boolean" },
      down: { type: "boolean" },
    },
  });
  const seen = new Set();
  for (const token of tokens)
    if (token.kind === "option") {
      if (seen.has(token.name)) throw new Error(`Duplicate option: --${token.name}.`);
      seen.add(token.name);
    }
  const options = {
    platform: values.platform,
    deviceId: values.device,
    runId: values["run-id"] ?? randomUUID().slice(0, 12),
    target: values.target ?? "mock",
    ...(values.flow !== undefined ? { flow: values.flow } : {}),
    ...(values.print ? { print: true } : {}),
    ...(values.keep ? { keep: true } : {}),
    ...(values.down ? { down: true } : {}),
  };
  validateOptions(options);
  return options;
}
function validateOptions(options) {
  if (options.flow !== undefined && !nativeFlows.includes(options.flow))
    throw new Error("Invalid focused native flow.");
  if (!["android", "ios"].includes(options.platform))
    throw new Error("Use --platform android|ios.");
  if (!["mock", "fastapi", "nestjs"].includes(options.target))
    throw new Error("Invalid native target.");
  if (
    typeof options.deviceId !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(options.deviceId)
  )
    throw new Error("Provide an explicit owned --device ID.");
  if (
    !/^[a-z0-9][a-z0-9-]{0,39}$/.test(options.runId ?? "") ||
    ["fastapi", "joon", "nestjs"].includes(options.runId)
  )
    throw new Error("Invalid or protected native run ID.");
}
function port(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1024 || number > 65535)
    throw new Error("Invalid native port.");
  return number;
}
export function nativePlan(options, input = process.env) {
  validateOptions(options);
  const mock = options.target === "mock",
    metro = port(input.E2E_METRO_PORT ?? 8082),
    bridge = port(input.E2E_BRIDGE_PORT ?? 4113);
  if (
    !mock &&
    (!input.EXPO_PUBLIC_API_BASE_URL ||
      !input.EXPO_PUBLIC_REALTIME_URL ||
      !input.EXPO_PUBLIC_FRONTEND_URL)
  )
    throw new Error("Backend native API/realtime/frontend endpoints must be explicit.");
  const config = readPublicEnv(
    {
      ...input,
      EXPO_PUBLIC_API_MODE: mock ? "mock" : "backend",
      ...(mock
        ? {
            EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:4112/api/v1",
            EXPO_PUBLIC_REALTIME_URL: "http://127.0.0.1:4112",
            EXPO_PUBLIC_FRONTEND_URL: "http://127.0.0.1:3112",
          }
        : {}),
    },
    options.platform,
    false,
  );
  const env = {
    EXPO_NO_DOTENV: "1",
    EXPO_PUBLIC_API_MODE: config.mode,
    EXPO_PUBLIC_API_BASE_URL: config.apiBaseUrl,
    EXPO_PUBLIC_REALTIME_URL: config.realtimeUrl,
    EXPO_PUBLIC_FRONTEND_URL: config.frontendUrl,
    EXPO_PUBLIC_APP_SCHEME: config.scheme,
  };
  const api = new URL(config.apiBaseUrl),
    extras = input.E2E_REVERSE_PORTS ? input.E2E_REVERSE_PORTS.split(",").map(port) : [];
  const apiPorts =
    ["127.0.0.1", "localhost", "[::1]"].includes(api.hostname) && api.port ? [port(api.port)] : [];
  const listenPorts = [metro, ...(mock ? [4112] : []), bridge];
  if (new Set(listenPorts).size !== listenPorts.length)
    throw new Error("Native service ports collide.");
  const artifact = join(
    root,
    "artifacts/native",
    options.runId,
    options.platform,
    "debug",
    options.platform === "android" ? "app-debug.apk" : "app.app",
  );
  const argv = [
    process.execPath,
    "--import",
    "tsx",
    "scripts/native/build.mjs",
    "--platform",
    options.platform,
    "--configuration",
    "debug",
    "--run-id",
    options.runId,
  ];
  const install =
    options.platform === "android"
      ? ["adb", "-s", options.deviceId, "install", artifact]
      : ["xcrun", "simctl", "install", options.deviceId, artifact];
  return {
    ...options,
    flows: options.flow
      ? options.flow === "auth"
        ? ["auth"]
        : ["setup", options.flow]
      : [...nativeFlows],
    root,
    env,
    metroPort: metro,
    bridgePort: bridge,
    devClientUrl: `${config.scheme}://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${metro}`)}`,
    listenPorts,
    artifact,
    bundleId:
      options.platform === "android" ? identity.androidApplicationId : identity.iosBundleIdentifier,
    reversePorts:
      options.platform === "android" ? [...new Set([metro, ...apiPorts, bridge, ...extras])] : [],
    commands: [argv, install].map((command) => ({ argv: command, cwd: root, env: { ...env } })),
  };
}
