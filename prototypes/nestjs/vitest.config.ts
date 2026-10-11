import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "src/core/jsonapi/tests/**/*.test.ts"],
    exclude: ["test/differential/**"],
    testTimeout: 30000,
  },
});
