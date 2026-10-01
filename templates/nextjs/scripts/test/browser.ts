import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

export function requireChromium() {
  if (!existsSync(chromium.executablePath())) {
    throw new Error("pnpm setup으로 Playwright Chromium을 설치하라.");
  }
}
