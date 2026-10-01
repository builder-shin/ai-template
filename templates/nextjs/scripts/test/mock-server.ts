import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { startProcessTree, stopProcessTree } from "../process-tree.mjs";

type Options = {
  env: NodeJS.ProcessEnv | ((base: string) => NodeJS.ProcessEnv);
  entry?: string;
  timeoutMs?: number;
};

/** 각 검사는 환경만 정하고 포트·준비 확인·프로세스 정리는 함께 쓴다. */
export async function startMock({
  env,
  entry = "contract/mock/src/main.ts",
  timeoutMs = 15000,
}: Options) {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  if (!address || typeof address === "string") throw new Error("목 테스트 포트를 얻지 못했다.");
  const port = address.port;
  if ([3000, 4010, 3100, 4110].includes(port))
    throw new Error("고정 포트를 통합 검사에 쓰지 않는다.");
  const base = `http://127.0.0.1:${port}`;
  const require = createRequire(import.meta.url);
  const child = startProcessTree(["--import", pathToFileURL(require.resolve("tsx")).href, entry], {
    cwd: new URL("../../", import.meta.url),
    env: {
      ...process.env,
      MOCK_TEST_ENDPOINTS: "true",
      SEED_ADMIN_EMAIL: "admin@example.com",
      SEED_ADMIN_PASSWORD: "admin-password", // betterleaks:allow 사유: 테스트 시드 비밀번호
      IDENTIFIER_HASH_SECRET: "test-only-identifier-hash-secret-32", // betterleaks:allow 사유: 테스트 키
      ...(typeof env === "function" ? env(base) : env),
      PORT: String(port),
      HOST: "127.0.0.1",
      API_URL: base,
    },
  });
  let output = "";
  let startError: Error | undefined;
  child.stdout?.on("data", (data) => {
    output += data;
  });
  child.stderr?.on("data", (data) => {
    output += data;
  });
  child.on("error", (error) => {
    startError = error;
  });
  let stopping: Promise<void> | undefined;
  const stop = () => (stopping ??= stopProcessTree(child));
  function checkExit() {
    if (startError) throw new Error(`목 테스트 서버 실행 실패: ${startError.message}\n${output}`);
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`목 테스트 서버 종료: ${child.exitCode ?? child.signalCode}\n${output}`);
  }
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      checkExit();
      let ready = false;
      try {
        ready = (
          await fetch(`${base}/health/ready`, {
            signal: AbortSignal.timeout(Math.max(1, Math.min(1000, deadline - Date.now()))),
          })
        ).ok;
      } catch {
        /* 기동 중의 연결 실패만 기다린다. */
      }
      checkExit();
      if (ready) return { base, stop };
      await setTimeout(50);
    }
    checkExit();
    throw new Error(`목 테스트 서버 시작 실패:\n${output}`);
  } catch (error) {
    await stop();
    throw error;
  }
}

/** 재인증 통합 검사는 기본 목과 별도로 2초 로그인 창을 쓴다. */
export function startDeletionMock() {
  return startMock({
    env: {
      RECENT_LOGIN_SECONDS: "2",
      RATE_LIMIT_GLOBAL: "10000",
      RATE_LIMIT_LOGIN_IP: "1000",
      RATE_LIMIT_LOGIN_IDENTIFIER: "1000",
      RATE_LIMIT_REGISTRATION_IP: "1000",
    },
  });
}
