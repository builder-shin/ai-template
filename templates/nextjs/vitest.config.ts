import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Next 빌드의 서버 경계는 유지하고 Node 테스트에서만 표식을 비운다.
    alias: {
      "server-only": fileURLToPath(new URL("./scripts/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    testTimeout: 15000,
    globalSetup: ["./scripts/test/mock.global-setup.ts"],
    // next-intl의 확장자 없는 next/server import는 Vite가 해석한다.
    server: { deps: { inline: ["next-intl"] } },
  },
});
