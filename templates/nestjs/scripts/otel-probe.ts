import type * as TelemetryModule from "../src/core/telemetry/sdk.js";
import type * as ApiModule from "../src/core/http/create-app.js";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setImmediate } from "node:timers/promises";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { loadSettings } from "../src/core/config/settings.js";
import { assessTelemetry } from "./otel/assess.js";
import { isMain } from "./runtime.js";
const mediaType = "application/vnd.api+json";
export async function runProbe() {
  const settings = loadSettings();
  const exporter = new InMemorySpanExporter();
  const { startTelemetry } = (await import(
    pathToFileURL(resolve("dist/core/telemetry/sdk.js")).href
  )) as typeof TelemetryModule;
  const sdk = startTelemetry({ ...settings, OTEL_ENABLED: true }, exporter);
  let app: Awaited<ReturnType<typeof ApiModule.createApp>> | undefined;
  try {
    // SDK 시작 뒤에 빌드한 API와 pg를 읽는다. OTel ESM loader hook은 사용하지 않는다.
    const { createApp } = (await import(
      pathToFileURL(resolve("dist/core/http/create-app.js")).href
    )) as typeof ApiModule;
    app = await createApp({ settings: { ...settings, LOG_LEVEL: "error" } }, true);
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    const login = await fetch(origin + "/api/v1/sessions", {
      method: "POST",
      headers: { Accept: mediaType, "Content-Type": mediaType },
      body: JSON.stringify({
        data: {
          type: "sessions",
          attributes: {
            grantType: "password",
            email: settings.SEED_ADMIN_EMAIL,
            password: settings.SEED_ADMIN_PASSWORD,
          },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (login.status !== 201) throw new Error("계측 프로브 로그인이 실패했다");
    const session = (await login.json()) as { data?: { attributes?: { accessToken?: unknown } } };
    const token = session.data?.attributes?.accessToken;
    if (typeof token !== "string" || !token) throw new Error("계측 프로브 토큰이 없다");
    await setImmediate();
    exporter.reset();
    const id = randomBytes(16).toString("hex");
    const authenticated = await fetch(origin + "/api/v1/me", {
      headers: {
        Accept: mediaType,
        Authorization: `Bearer ${token}`,
        traceparent: `00-${id}-${randomBytes(8).toString("hex")}-01`,
      },
      signal: AbortSignal.timeout(15000),
    });
    await authenticated.arrayBuffer();
    await setImmediate();
    const requestSpans = [...exporter.getFinishedSpans()];
    exporter.reset();
    let succeeded =
      authenticated.status === 200 &&
      authenticated.headers.get("content-type")?.startsWith(mediaType) === true;
    for (const path of ["/health/live", "/health/ready"]) {
      const response = await fetch(origin + path, { signal: AbortSignal.timeout(15000) });
      await response.arrayBuffer();
      succeeded = succeeded && response.status === 200;
    }
    await setImmediate();
    return assessTelemetry(requestSpans, id, exporter.getFinishedSpans().length, succeeded);
  } finally {
    try {
      await app?.close();
    } finally {
      await sdk?.shutdown();
    }
  }
}
export async function probeMain(probe: typeof runProbe = runProbe): Promise<void> {
  let result: ReturnType<typeof assessTelemetry> | { complete: false; error: string };
  try {
    result = await probe();
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    process.stderr.write(`OTEL 확인 실패: probe ${errorName}\n`);
    result = { complete: false, error: errorName };
  }
  process.stdout.write(JSON.stringify(result) + "\n");
  if (!result.complete) process.exitCode = 1;
}
if (isMain(import.meta.url)) await probeMain();
