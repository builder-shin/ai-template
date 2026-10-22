import { defineConfig } from "vitest/config";

/** 단위 테스트. 목 서버의 앱을 app.request로 직접 부른다(포트를 열지 않는다). */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
