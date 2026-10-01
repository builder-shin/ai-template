import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { webOrigin, targetName, targetEnvironment } from "./e2e/targets";

// Playwright가 worker에 FORCE_COLOR를 전달하므로 서버도 같은 정책을 쓴다.
delete process.env.NO_COLOR;
process.env.FORCE_COLOR = "1";

const target = targetName();
const targetEnv = targetEnvironment(target);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: webOrigin,
    locale: "ko-KR",
    headless: true,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node --import tsx scripts/e2e-server.ts",
    url: webOrigin,
    reuseExistingServer: false,
    timeout: 180000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10000 },
    env: {
      FORCE_COLOR: "1",
      ...targetEnv,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      SESSION_SECRET: randomBytes(32).toString("base64url"),
      TIME_ZONE: "Asia/Seoul",
    },
  },
});
