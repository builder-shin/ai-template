import { appOrigin } from "../src/lib/app-config.mjs";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { resolveContractPaths } from "./gen-config.mjs";
import { describe, expect, it } from "vitest";
import { isStandalone, mockHost } from "./dev-mode.mjs";

describe("개발 모드", () => {
  it.each([
    undefined,
    `${appOrigin("mock")}/api/v1`,
    `${appOrigin("mock", "127.0.0.1")}/api/v1`,
    `${appOrigin("mock", "[::1]")}/api/v1/`,
  ])("목 주소에서만 함께 실행한다: %s", (url) => expect(isStandalone(url)).toBe(true));
  it.each([
    "http://localhost:8000/api/v1",
    "https://api.example.com/api/v1",
    `${appOrigin("mock")}/other`,
    "invalid",
  ])("백엔드나 잘못된 주소는 목을 시작하지 않는다: %s", (url) =>
    expect(isStandalone(url)).toBe(false),
  );
});

it.each([
  [undefined, "localhost"],
  [`${appOrigin("mock")}/api/v1`, "localhost"],
  [`${appOrigin("mock", "127.0.0.1")}/api/v1`, "127.0.0.1"],
  [`${appOrigin("mock", "[::1]")}/api/v1/`, "::1"],
])("단독 주소의 readiness와 API가 같은 목에 닿는다: %s", async (api, host) => {
  expect(mockHost(api)).toBe(host);
  const listener = createServer();
  listener.listen(0, host);
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("테스트 포트가 없다.");
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const origin = `http://${host === "::1" ? "[::1]" : host}:${address.port}`;
  const require = createRequire(import.meta.url);
  const child = spawn(
    process.execPath,
    [
      "--import",
      pathToFileURL(require.resolve("tsx")).href,
      join(
        resolveContractPaths(fileURLToPath(new URL("../", import.meta.url))).mock,
        "src/main.ts",
      ),
    ],
    {
      cwd: new URL("../", import.meta.url),
      env: {
        ...process.env,
        PORT: String(address.port),
        HOST: mockHost(api),
        API_URL: origin,
        FRONTEND_URL: origin,
      },
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: "ignore",
    },
  );
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`${origin}/health/ready`, { signal: AbortSignal.timeout(300) }))
              .status;
          } catch {
            return 0;
          }
        },
        { timeout: 10000 },
      )
      .toBe(200);
    expect((await fetch(`${origin}/api/v1/posts`)).status).toBe(200);
  } finally {
    if (child.pid) {
      if (process.platform === "win32")
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      else process.kill(-child.pid, "SIGTERM");
      await setTimeout(50);
    }
  }
});
