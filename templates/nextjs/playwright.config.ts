import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { mockOrigin, webOrigin, targetName, requireImplementedTarget } from "./e2e/targets";

const target = targetName();
requireImplementedTarget(target);

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
      E2E_TARGET: target,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      API_BASE_URL: `${mockOrigin}/api/v1`,
      APP_URL: webOrigin,
      SESSION_SECRET: randomBytes(32).toString("base64url"),
      TIME_ZONE: "Asia/Seoul",
      NEXT_PUBLIC_REALTIME_URL: mockOrigin,
    },
  },
});
