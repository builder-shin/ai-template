import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { readPublicEnv } from "../../src/lib/config/env.ts";
export function buildOptions(argv) {
  const { values, tokens } = parseArgs({
    args: argv[0] === "--" ? argv.slice(1) : argv,
    tokens: true,
    options: {
      platform: { type: "string" },
      configuration: { type: "string" },
      "run-id": { type: "string" },
    },
  });
  const seen = new Set();
  for (const token of tokens)
    if (token.kind === "option") {
      if (seen.has(token.name)) throw new Error(`Duplicate build option: --${token.name}.`);
      seen.add(token.name);
    }
  const result = {
    platform: values.platform,
    configuration: values.configuration ?? "debug",
    runId: values["run-id"] ?? `native-${randomUUID().slice(0, 12)}`,
  };
  if (
    !["android", "ios"].includes(result.platform) ||
    !["debug", "release"].includes(result.configuration)
  )
    throw new Error("Use --platform android|ios [--configuration debug|release].");
  if (
    !/^[a-z0-9][a-z0-9-]{0,39}$/.test(result.runId) ||
    ["fastapi", "joon", "nestjs"].includes(result.runId)
  )
    throw new Error("Invalid native build run ID.");
  return result;
}
export function buildEnvironment(platform, configuration, input = process.env) {
  const release = configuration === "release";
  if (!["debug", "release"].includes(configuration) || !["android", "ios"].includes(platform))
    throw new Error("Invalid native build configuration.");
  if (release && input.EXPO_PUBLIC_API_MODE && input.EXPO_PUBLIC_API_MODE !== "backend")
    throw new Error("Release requires backend API mode.");
  const config = readPublicEnv(
    { ...input, ...(release ? { EXPO_PUBLIC_API_MODE: "backend" } : {}) },
    platform,
    release,
  );
  return {
    EXPO_NO_DOTENV: "1",
    EXPO_PUBLIC_API_MODE: config.mode,
    EXPO_PUBLIC_API_BASE_URL: config.apiBaseUrl,
    EXPO_PUBLIC_REALTIME_URL: config.realtimeUrl,
    EXPO_PUBLIC_FRONTEND_URL: config.frontendUrl,
    EXPO_PUBLIC_APP_SCHEME: config.scheme,
    NATIVE_BUILD_CONFIGURATION: configuration,
  };
}
export function iosBuildTarget(configuration, deviceId) {
  if (!["debug", "release"].includes(configuration))
    throw new Error("Invalid iOS build configuration.");
  if (deviceId !== undefined) {
    if (configuration !== "debug")
      throw new Error("An explicit simulator is only valid for debug compilation.");
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(deviceId))
      throw new Error("Invalid iOS simulator identity.");
    return ["-sdk", "iphonesimulator", "-destination", `id=${deviceId}`, "ONLY_ACTIVE_ARCH=YES"];
  }
  return [
    "-sdk",
    configuration === "release" ? "iphoneos" : "iphonesimulator",
    "-destination",
    configuration === "release" ? "generic/platform=iOS" : "generic/platform=iOS Simulator",
  ];
}
