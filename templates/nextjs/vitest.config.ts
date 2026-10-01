import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    testTimeout: 15000,
    // next-intl의 확장자 없는 next/server import는 Vite가 해석한다.
    server: { deps: { inline: ["next-intl"] } },
  },
});
