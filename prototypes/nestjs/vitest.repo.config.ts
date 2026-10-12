import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["test/differential/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
