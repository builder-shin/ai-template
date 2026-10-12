import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { e2eEnvironment } from "./e2e-options.js";
import { start, stopAll, waitReady } from "./servers.js";

// CI runtime observation. This prototype records missing spans; it does not hide them or gate the Task.
const root = resolve(import.meta.dirname, "..");
const cache = resolve(root, ".cache/telemetry");
mkdirSync(cache, { recursive: true });
const file = resolve(cache, "spans.json");
const base = e2eEnvironment("http://localhost:3000", process.env).server;
const env = { ...base, PORT: "18001", OTEL_ENABLED: "true", OTEL_PROBE_FILE: file };
const api = start(
  [process.execPath, "--import", "./dist/core/telemetry/register.js", "dist/main.js"],
  env,
  root,
  "otel-api",
);
const controller = new AbortController();
let observations: Record<string, unknown>;
interface Span {
  name: string;
  scope: string;
  path?: string;
}
const spans = (): Span[] => JSON.parse(readFileSync(file, "utf8")) as Span[];
try {
  await waitReady("http://127.0.0.1:18001/health/ready", [api], controller.signal);
  const before = spans().length;
  for (const path of ["/health/live", "/health/ready"]) {
    const response = await fetch(`http://127.0.0.1:18001${path}`, {
      signal: AbortSignal.timeout(5000),
    });
    await response.arrayBuffer();
    if (response.status !== 200) throw new Error(`Probe ${path} failed.`);
  }
  const healthDelta = spans().length - before;
  const response = await fetch("http://127.0.0.1:18001/api/v1/posts", {
    headers: { Accept: "application/vnd.api+json" },
    signal: AbortSignal.timeout(5000),
  });
  await response.arrayBuffer();
  if (response.status !== 200) throw new Error("Probe posts request failed.");
  const actual = spans();
  const scopes = ["http", "express", "pg", "ioredis"].map((name) => ({
    name,
    count: actual.filter((s) => s.scope === `@opentelemetry/instrumentation-${name}`).length,
  }));
  observations = {
    observedAt: new Date().toISOString(),
    command: ["node", "--import", "./dist/core/telemetry/register.js", "dist/main.js"],
    requestStatus: response.status,
    scopes,
    healthDelta,
    complete: scopes.every((s) => s.count > 0) && healthDelta === 0,
    missingCauseCandidate:
      "ESM libraries may require the installed instrumentation loader hook. Static source is not runtime proof.",
    alternatives: [
      "Measure @opentelemetry/instrumentation/hook.mjs with the pinned ESM stack",
      "Explicit spans at HTTP/UoW/Redis boundaries if hooks cannot cover the stack",
    ],
  };
} catch (error) {
  observations = {
    observedAt: new Date().toISOString(),
    complete: false,
    error: error instanceof Error ? error.message : String(error),
    logTail: api.tail,
    scope: "Failed probe; no complete telemetry claim.",
  };
} finally {
  await stopAll([api]);
}
writeFileSync(resolve(cache, "observations.json"), JSON.stringify(observations, null, 2));
console.log(JSON.stringify({ telemetryObservation: observations }));
