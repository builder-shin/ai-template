import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { createSampleApp } from "../../src/core/jsonapi/tests/sample.js";
import { childEnvironment } from "../../scripts/preflight-tmp.mjs";
const repo = resolve(import.meta.dirname, "../../../..");
let app: INestApplication | undefined;
let mock: ReturnType<typeof spawn> | undefined;
let oracleUrl: string;
let prototypeUrl: string;
let stdout = "",
  stderr = "";
let processStarted: string;
let port: number;
async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP port");
  await new Promise<void>((ok, fail) =>
    server.close((e) => {
      if (e) fail(e);
      else ok();
    }),
  );
  return address.port;
}
beforeAll(async () => {
  port = await unusedPort();
  oracleUrl = `http://127.0.0.1:${String(port)}`;
  processStarted = new Date().toISOString();
  const env = childEnvironment();
  mock = spawn(
    process.execPath,
    [
      "--import",
      resolve(repo, "node_modules/tsx/dist/loader.mjs"),
      resolve(repo, "contract/mock/src/main.ts"),
    ],
    {
      cwd: resolve(repo, "contract/mock"),
      env: {
        ...env,
        HOST: "127.0.0.1",
        PORT: String(port),
        API_URL: oracleUrl,
        MOCK_TEST_ENDPOINTS: "false",
        RATE_LIMIT_GLOBAL: "100000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  mock.stdout?.on("data", (v: Buffer) => {
    stdout += v.toString();
  });
  mock.stderr?.on("data", (v: Buffer) => {
    stderr += v.toString();
  });
  const deadline = Date.now() + 15000;
  for (let attempt = 0; attempt < 301; attempt++) {
    if (mock.exitCode !== null) throw new Error(`Mock exited ${String(mock.exitCode)}: ${stderr}`);
    try {
      const r = await fetch(`${oracleUrl}/health/live`);
      if (r.ok) break;
    } catch {
      // Connection refusal is expected while the owned child starts.
    }
    if (Date.now() > deadline) throw new Error("Mock readiness timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
  app = await createSampleApp();
  await app.listen(0, "127.0.0.1");
  prototypeUrl = await app.getUrl();
});
afterAll(async () => {
  if (app) await app.close();
  if (mock) {
    const closed = once(mock, "exit");
    mock.kill("SIGINT");
    const result = await Promise.race([
      closed,
      new Promise<null>((r) => {
        const timer = setTimeout(() => {
          r(null);
        }, 5000);
        timer.unref();
      }),
    ]);
    if (!result) {
      mock.kill("SIGKILL");
      await closed;
    }
    mkdirSync(".cache/differential", { recursive: true });
    writeFileSync(".cache/differential/mock.stdout.log", stdout);
    writeFileSync(".cache/differential/mock.stderr.log", stderr);
    writeFileSync(
      ".cache/differential/process.json",
      JSON.stringify(
        {
          command: mock.spawnargs,
          pid: mock.pid,
          port,
          prototypeUrl,
          utcStart: processStarted,
          utcEnd: new Date().toISOString(),
          nativeExit: mock.exitCode,
          signal: mock.signalCode,
          cleaned: true,
        },
        null,
        2,
      ),
    );
  }
});
export const EXCLUSIONS = [
  "Recent-login clock differences",
  "Opaque access-token format",
  "Immediate mock mailbox and development scrypt/storage/OAuth",
  "No scheduled cleanup or public-post cache",
  "Password surrogatepass vs scrypt replacement authentication",
  "Origin normalization edge cases",
  "NaN/Infinity/CESU-8/UTF-16/UTF-32 body encodings",
  "Snake-case aliases",
  "Configuration strictness",
  "Trailing-slash FastAPI redirect",
  "HEAD fallback",
  "Uncommon email-validator cases",
  "Lexically float integer JSON numbers",
  "Discriminator-name collision when password contains an object",
] as const;
const media = "application/vnd.api+json";
const register = (attributes: unknown, type = "registrations") =>
  JSON.stringify({ data: { type, attributes } });
const cases: [string, string, string, string | undefined, Record<string, string>?][] = [
  [
    "unsupported media",
    "POST",
    "/api/v1/registrations",
    "{}",
    { "Content-Type": "application/json" },
  ],
  ["unsupported accept", "GET", "/api/v1/posts", undefined, { Accept: `${media};ext=x` }],
  ["oversize", "POST", "/api/v1/registrations", "x".repeat(1048577)],
  ["broken JSON", "POST", "/api/v1/registrations", "{"],
  ["empty structure", "POST", "/api/v1/registrations", "{}"],
  [
    "wrong type",
    "POST",
    "/api/v1/registrations",
    register({ email: "a@example.com", password: "password", name: "A" }, "posts"), // betterleaks:allow - dummy invalid-request fixture
  ],
  [
    "client id",
    "POST",
    "/api/v1/registrations",
    JSON.stringify({ data: { type: "registrations", id: "mine", attributes: {} } }),
  ],
  [
    "grant missing",
    "POST",
    "/api/v1/sessions",
    JSON.stringify({ data: { type: "sessions", attributes: { password: "p" } } }),
  ],
  [
    "grant invalid",
    "POST",
    "/api/v1/sessions",
    JSON.stringify({ data: { type: "sessions", attributes: { grantType: "bad" } } }),
  ],
  [
    "grant field",
    "POST",
    "/api/v1/sessions",
    JSON.stringify({
      data: {
        type: "sessions",
        attributes: { grantType: "password", email: "bad", password: "p" },
      },
    }),
  ],
  [
    "integer string preauth",
    "POST",
    "/api/v1/files",
    JSON.stringify({
      data: { type: "files", attributes: { filename: "x", contentType: "image/png", size: "1" } },
    }),
  ],
  [
    "integer boolean preauth",
    "POST",
    "/api/v1/files",
    JSON.stringify({
      data: { type: "files", attributes: { filename: "x", contentType: "image/png", size: true } },
    }),
  ],
  ["include", "GET", "/api/v1/posts?include=unknown", undefined],
  ["sort", "GET", "/api/v1/posts?sort=unknown", undefined],
  ["filter", "GET", "/api/v1/posts?filter[created_from]=x", undefined],
  ["page", "GET", "/api/v1/posts?page[size]=0", undefined],
  ["duplicate query", "GET", "/api/v1/posts?page[size]=2&page[size]=3", undefined],
  ["empty comma", "GET", "/api/v1/posts?include=author,,coverImage", undefined],
  ["unterminated filter", "GET", "/api/v1/posts?filter[status=draft", undefined],
  [
    "surrogate name",
    "POST",
    "/api/v1/registrations",
    register({ email: "a@example.com", password: "password", name: "a\uD800b" }), // betterleaks:allow - dummy invalid-request fixture
  ],
];
function comparableResponse(body: unknown) {
  const r = body as { errors: { code: string; source?: unknown }[] };
  return r.errors.map((e) => ({ code: e.code, ...(e.source ? { source: e.source } : {}) }));
}
it.each(cases)(
  "matches local mock status/code/source: %s",
  async (_name, method, path, body, headers) => {
    const init = {
      method,
      headers: { "Content-Type": media, ...headers },
      ...(body === undefined ? {} : { body }),
    };
    const [oracle, prototype] = await Promise.all([
      fetch(oracleUrl + path, init),
      fetch(prototypeUrl + path, init),
    ]);
    expect(prototype.status).toBe(oracle.status);
    expect(prototype.headers.get("Content-Type")).toBe(media);
    expect(comparableResponse(await prototype.json())).toEqual(
      comparableResponse(await oracle.json()),
    );
  },
);
