import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    mockBaseUrl: string;
  }
}

async function stop(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit", { signal: AbortSignal.timeout(10000) });
  // 직접 시작한 목 프로세스 트리만 내린다.
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } else process.kill(-child.pid, "SIGTERM");
  await exited;
}

export default async function setup(project: TestProject) {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("목 테스트 포트를 얻지 못했다.");
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  if (port === 3000 || port === 4010) throw new Error("개발 포트를 테스트에 쓰지 않는다.");
  const base = `http://127.0.0.1:${port}`;
  const require = createRequire(import.meta.url);
  const child = spawn(
    process.execPath,
    ["--import", pathToFileURL(require.resolve("tsx")).href, "contract/mock/src/main.ts"],
    {
      cwd: new URL("../../", import.meta.url),
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        API_URL: base,
        FRONTEND_URL: base,
        MOCK_TEST_ENDPOINTS: "true",
        SEED_ADMIN_EMAIL: "admin@example.com",
        SEED_ADMIN_PASSWORD: "admin-password", // betterleaks:allow 테스트 시드
        IDENTIFIER_HASH_SECRET: "test-only-identifier-hash-secret-32", // betterleaks:allow 테스트 키
        RATE_LIMIT_GLOBAL: "10000",
        RATE_LIMIT_LOGIN_IP: "1000",
        RATE_LIMIT_LOGIN_IDENTIFIER: "1000",
        RATE_LIMIT_REGISTRATION_IP: "1000",
        RATE_LIMIT_MAIL_IP: "1000",
        RATE_LIMIT_MAIL_EMAIL: "3",
      },
      windowsHide: true,
      detached: process.platform !== "win32",
    },
  );
  let output = "";
  child.stdout?.on("data", (data) => {
    output += data;
  });
  child.stderr?.on("data", (data) => {
    output += data;
  });
  let startError: Error | undefined;
  child.on("error", (error) => {
    startError = error;
  });
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (startError) throw startError;
      if (child.exitCode !== null) throw new Error(`목 테스트 서버 종료:\n${output}`);
      try {
        const ready = await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1000) });
        if (ready.ok) {
          project.provide("mockBaseUrl", base);
          return () => stop(child);
        }
      } catch {
        /* 시작할 때만 연결 실패를 기다린다. */
      }
      await setTimeout(50);
    }
    throw new Error(`목 테스트 서버 시작 실패:\n${output}`);
  } catch (error) {
    await stop(child);
    throw error;
  }
}
