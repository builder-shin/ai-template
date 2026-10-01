import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { startProcessTree, stopProcessTree } from "../process-tree.mjs";

/** 재인증 통합 검사는 기본 목과 별도로 짧은 로그인 창을 가진 목을 띄운다. */
export async function startDeletionMock() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("재인증 테스트 포트를 얻지 못했다.");
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  if ([3000, 4010, 3100, 4110].includes(port))
    throw new Error("고정 포트를 통합 검사에 쓰지 않는다.");
  const base = `http://127.0.0.1:${port}`;
  const require = createRequire(import.meta.url);
  const child = startProcessTree(
    ["--import", pathToFileURL(require.resolve("tsx")).href, "contract/mock/src/main.ts"],
    {
      cwd: new URL("../../", import.meta.url),
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        API_URL: base,
        MOCK_TEST_ENDPOINTS: "true",
        RECENT_LOGIN_SECONDS: "2",
        SEED_ADMIN_EMAIL: "admin@example.com",
        SEED_ADMIN_PASSWORD: "admin-password", // betterleaks:allow 사유: 테스트 시드 비밀번호
        RATE_LIMIT_GLOBAL: "10000",
        RATE_LIMIT_LOGIN_IP: "1000",
        RATE_LIMIT_LOGIN_IDENTIFIER: "1000",
        RATE_LIMIT_REGISTRATION_IP: "1000",
      },
    },
  );
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
  const stop = () => stopProcessTree(child);
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (startError) throw startError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(output);
      try {
        if ((await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1000) })).ok)
          return { base, stop };
      } catch {
        /* 기동 중의 연결 실패만 기다린다. */
      }
      await setTimeout(50);
    }
    throw new Error(`재인증 목 시작 실패:\n${output}`);
  } catch (error) {
    await stop();
    throw error;
  }
}
