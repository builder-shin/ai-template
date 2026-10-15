import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/e2e/flows.ts", "tests/e2e/serve-signals.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 90000,
    hookTimeout: 15000,
  },
});
