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
    ],
  },
});
