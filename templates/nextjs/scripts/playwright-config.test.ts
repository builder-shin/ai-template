import { spawnSync } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

it("서버와 worker가 색상 정책 하나만 상속한다", async () => {
  vi.stubEnv("NO_COLOR", "1");
  vi.stubEnv("FORCE_COLOR", "1");
  vi.resetModules();
  const { default: config } = await import("../playwright.config");
  const server = config.webServer;
  if (!server || Array.isArray(server)) throw new Error("E2E 서버 설정이 없다.");
  for (const env of [process.env, { ...process.env, ...server.env }]) {
    const result = spawnSync(
      process.execPath,
      ["-p", "JSON.stringify({force:process.env.FORCE_COLOR,no:process.env.NO_COLOR})"],
      { env, encoding: "utf8", windowsHide: true },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ force: "1" });
    expect(result.stderr).not.toContain("NO_COLOR");
  }
});
