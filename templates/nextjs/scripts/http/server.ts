import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { EXAMPLE_SESSION_SECRET } from "../../src/lib/env";
import { startProcessTree, stopProcessTree } from "../process-tree.mjs";

export async function startHttpServer(mockBaseUrl: string) {
  const listener = createServer();
  listener.listen(0, "localhost");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("테스트 포트를 얻지 못했다.");
  const port = address.port;
  if (port === 3000 || port === 4010) throw new Error("개발 포트를 테스트에 쓰지 않는다.");
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const base = `http://localhost:${port}`;
  const require = createRequire(import.meta.url);
  const child = startProcessTree(
    [
      require.resolve("next/dist/bin/next"),
      "dev",
      "--hostname",
      "localhost",
      "--port",
      String(port),
    ],
    {
      cwd: new URL("../../", import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEXT_TELEMETRY_DISABLED: "1",
        API_BASE_URL: `${mockBaseUrl}/api/v1`,
        APP_URL: base,
        SESSION_SECRET: EXAMPLE_SESSION_SECRET,
        TIME_ZONE: "America/New_York",
        NEXT_PUBLIC_REALTIME_URL: mockBaseUrl,
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
  async function stop() {
    await stopProcessTree(child);
  }
  try {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (startError) throw startError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(output);
      try {
        const response = await fetch(base, {
          headers: { "Accept-Language": "ko" },
          signal: AbortSignal.timeout(15000),
        });
        if (response.status === 200) return { base, stop };
      } catch {
        /* 서버가 준비될 때까지 기다린다. */
      }
      await setTimeout(100);
    }
    throw new Error(`Next 테스트 서버 시작 실패:\n${output}`);
  } catch (error) {
    await stop();
    throw error;
  }
}
