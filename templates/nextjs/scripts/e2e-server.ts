import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { mockOrigin, webOrigin, targetName, requireImplementedTarget } from "../e2e/targets";

const root = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
const children = new Set<ChildProcess>();
let stopping = false;

async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  await Promise.all(
    [...children].map(async (child) => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, "exit", { signal: AbortSignal.timeout(10000) });
      // 이 실행에서 만든 트리만 종료한다. Playwright도 부모 프로세스 그룹을 정리한다.
      if (process.platform === "win32")
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      else child.kill("SIGTERM");
      await exited;
    }),
  );
}

function start(args: string[], env = process.env, server = true) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.add(child);
  child.on("error", (error) => {
    console.error(error.message);
    void stop(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
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
      MOCK_TEST_ENDPOINTS: "true",
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
