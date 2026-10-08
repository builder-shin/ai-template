import { binary } from "../process.mjs";
import { expect, it } from "vitest";

it("Chromium이 없으면 pnpm setup 안내 한 줄로 실패한다", () => {
  const result = binary(
    "tsx",
    ["--eval", "import { requireChromium } from './scripts/test/browser'; requireChromium();"],
    {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: ".cache/missing-test-browser" },
      timeout: 10000,
    },
  );
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).toContain("pnpm setup으로 Playwright Chromium을 설치하라.");
});
