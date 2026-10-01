import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Next 빌드의 서버 경계는 유지하고 Node 테스트에서만 표식을 비운다.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./scripts/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    // 독립 설치·중첩 web 검증은 기존 HTTP 검사 뒤에 실행해 서로 지연시키지 않는다.
    projects: [
      {
        extends: true,
        test: {
          name: "web",
          exclude: [...configDefaults.exclude, "scripts/gen-feature.test.ts"],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: false,
        test: {
          name: "gen-feature",
          include: ["scripts/gen-feature.test.ts"],
          globalSetup: [],
          sequence: { groupOrder: 1 },
        },
      },
    ],
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "scripts/**/*.test.ts",
      "scripts/**/*.test.tsx",
    ],
    testTimeout: 15000,
    globalSetup: ["./scripts/test/mock.global-setup.ts"],
    // next-intl의 확장자 없는 next/server import는 Vite가 해석한다.
    server: { deps: { inline: ["next-intl"] } },
  },
});
