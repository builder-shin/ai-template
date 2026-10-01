import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";

const require = createRequire(import.meta.url);
let child: ChildProcess;
let base: string;
let output = "";

beforeAll(async () => {
  const listener = createServer();
  listener.listen(0, "localhost");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("테스트 포트를 얻지 못했다.");
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  base = `http://localhost:${port}`;
  child = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "dev",
      "--hostname",
      "localhost",
      "--port",
      String(port),
    ],
    {
      cwd: new URL("../", import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEXT_TELEMETRY_DISABLED: "1",
        API_BASE_URL: "http://localhost:4010/api/v1",
        APP_URL: base,
        SESSION_SECRET: EXAMPLE_SESSION_SECRET,
        TIME_ZONE: "America/New_York",
        NEXT_PUBLIC_REALTIME_URL: "http://localhost:4010",
      },
      windowsHide: true,
      detached: process.platform !== "win32",
    },
  );
  child.stdout?.on("data", (data) => {
    output += data;
  });
  child.stderr?.on("data", (data) => {
    output += data;
  });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      const response = await fetch(base, {
        headers: { "Accept-Language": "ko" },
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 200) return;
    } catch {
      /* 서버가 준비될 때까지 기다린다. */
    }
    await setTimeout(100);
  }
  throw new Error(`Next 테스트 서버 시작 실패:\n${output}`);
}, 75000);

afterAll(async () => {
  if (!child?.pid || child.exitCode !== null) return;
  const exited = once(child, "exit");
  // 직접 시작한 서버 트리만 종료한다.
  if (process.platform === "win32")
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else process.kill(-child.pid, "SIGTERM");
  await exited;
});

describe("실제 Next 서버의 로케일 렌더링", () => {
  it.each([
    ["/", "ko", "Web 템플릿"],
    ["/en", "en", "Web template"],
  ])("%s는 %s HTML과 번역을 렌더링한다", async (path, locale, title) => {
    const response = await fetch(`${base}${path}`, { headers: { "Accept-Language": "ko" } });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<html lang="${locale}">`);
    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain("America/New_York");
  });

  it("첫 방문은 Accept-Language로 영어 URL을 고르고 영어 화면을 렌더링한다", async () => {
    const first = await fetch(base, {
      headers: { "Accept-Language": "en-US,en;q=0.9,ko;q=0.5" },
      redirect: "manual",
    });
    expect(first.status).toBe(307);
    const destination = new URL(first.headers.get("location")!, base);
    expect(destination.href).toBe(`${base}/en`);
    const page = await fetch(destination, {
      headers: { "Accept-Language": "ko" },
    });
    expect(page.headers.get("set-cookie")).toContain("NEXT_LOCALE=en");
    expect(await page.text()).toContain("<h1>Web template</h1>");
  });

  it("다음 방문에는 헤더보다 NEXT_LOCALE 쿠키를 따른다", async () => {
    const response = await fetch(base, {
      headers: { "Accept-Language": "en", Cookie: "NEXT_LOCALE=ko" },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<h1>Web 템플릿</h1>");
  });
});
