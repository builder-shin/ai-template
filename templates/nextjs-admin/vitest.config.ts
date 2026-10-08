import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./scripts/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "scripts/**/*.test.ts",
      "scripts/**/*.test.tsx",
    ],
    testTimeout: 15000,
    globalSetup: ["./scripts/test/mock.global-setup.ts"],
    server: { deps: { inline: ["next-intl"] } },
  },
});
