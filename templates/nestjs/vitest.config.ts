import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [swc.vite()],
        test: {
          name: "unit",
          include: ["src/**/tests/**/*.test.ts", "scripts/**/tests/**/*.test.ts"],
        },
      },
      {
        plugins: [swc.vite()],
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 15000,
          hookTimeout: 15000,
        },
      },
    ],
  },
});
