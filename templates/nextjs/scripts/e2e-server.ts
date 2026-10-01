import { type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { mockOrigin, webOrigin, targetName, requireImplementedTarget } from "../e2e/targets";
import { mockRecentLoginSeconds } from "../e2e/targets/mock";
import { startProcessTree, stopProcessTree } from "./process-tree.mjs";

const root = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
const children = new Set<ChildProcess>();
let stopping = false;

async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  const results = await Promise.allSettled([...children].map((child) => stopProcessTree(child)));
  for (const result of results)
    if (result.status === "rejected") {
      console.error(result.reason.message);
      process.exitCode = 1;
    }
}

function start(args: string[], env = process.env, server = true) {
  const child = startProcessTree(args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  children.add(child);
  child.on("error", (error) => {
    console.error(error.message);
    void stop(1);
  });
  child.on("exit", (code) => {
    if (server && !stopping) void stop(code || 1);
  });
  return child;
}

async function assertFree(origin: string) {
  const url = new URL(origin);
  const listener = createServer();
  listener.listen(Number(url.port), url.hostname);
  try {
    await once(listener, "listening");
  } catch {
    throw new Error(`E2E 포트가 사용 중이다: ${origin}. 기존 서버를 종료하고 다시 실행한다.`);
  }
  await new Promise<void>((resolve) => listener.close(() => resolve()));
}

async function ready(child: ChildProcess, url: string) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !stopping) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error("E2E 서버가 준비 전에 종료했다.");
    try {
      if (
        (
          await fetch(url, {
            signal: AbortSignal.timeout(1000),
            headers: { "Accept-Language": "ko" },
          })
        ).ok
      )
        return;
    } catch {
      /* 기동 중의 연결 실패만 기다린다. */
    }
    await setTimeout(100);
  }
  throw new Error(`E2E 서버 시작 실패: ${url}`);
}

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void stop(0);
  });

try {
  requireImplementedTarget(targetName());
  await assertFree(webOrigin);
  await assertFree(mockOrigin);
  const mock = start(
    ["--import", pathToFileURL(require.resolve("tsx")).href, "contract/mock/src/main.ts"],
    {
      ...process.env,
      PORT: new URL(mockOrigin).port,
      HOST: new URL(mockOrigin).hostname,
      API_URL: mockOrigin,
      FRONTEND_URL: webOrigin,
      OAUTH_REDIRECT_URIS: `${webOrigin}/oauth/callback`,
      STORAGE_ALLOWED_ORIGINS: webOrigin,
      MOCK_TEST_ENDPOINTS: "true",
      RECENT_LOGIN_SECONDS: String(mockRecentLoginSeconds),
      IDENTIFIER_HASH_SECRET: randomBytes(32).toString("hex"),
      RATE_LIMIT_GLOBAL: "10000",
      RATE_LIMIT_REGISTRATION_IP: "1000",
      RATE_LIMIT_LOGIN_IP: "1000",
      RATE_LIMIT_LOGIN_IDENTIFIER: "1000",
      RATE_LIMIT_MAIL_IP: "1000",
    },
  );
  await ready(mock, `${mockOrigin}/health/ready`);
  const next = require.resolve("next/dist/bin/next");
  const build = start([next, "build"], process.env, false);
  const [code] = await once(build, "exit");
  if (code !== 0 || stopping) throw new Error("E2E 운영 빌드에 실패했다.");
  const web = start([next, "start", "--hostname", "localhost", "--port", new URL(webOrigin).port]);
  await ready(web, webOrigin);
} catch (error) {
  console.error(error instanceof Error ? error.message : "E2E 서버 기동에 실패했다.");
  await stop(1);
}
