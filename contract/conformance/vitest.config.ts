import { configDefaults, defineConfig } from "vitest/config";

/** 단위 테스트. 대상 스택이 필요한 흐름 테스트(test/flows)는 vitest.flows.config.ts로 돈다. */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "test/flows/**"],
  },
});
