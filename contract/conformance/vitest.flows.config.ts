import { defineConfig } from "vitest/config";

/** 대상 스택이 떠 있어야 하는 흐름 테스트. pnpm conformance <대상>이 돌린다. */
export default defineConfig({
  test: {
    include: ["test/flows/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
