import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";
import { writeFileSync } from "node:fs";

export default defineConfig({
  plugins: [
    ...(process.env.DI_TRANSFORM === "swc" ? [swc.vite({ module: { type: "es6" } })] : []),
    {
      name: "probe-transform-audit",
      configResolved(config) {
        const output = process.env.DI_OUTPUT;
        if (output)
          writeFileSync(
            `${output}.plugins.json`,
            JSON.stringify(config.plugins.map((plugin) => plugin.name)),
          );
      },
    },
  ],
  test: { environment: "node", include: ["test/fixtures/di/probe.vitest.ts"] },
});
