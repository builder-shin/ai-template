import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { expect, it } from "vitest";
import { TOOLS } from "../../src/tools/manifest.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
it.each([
  "templates/fastapi/tools/binaries.py",
  "shared/nextjs/scripts/tools/betterleaks.ts",
  "templates/nestjs/scripts/tools/betterleaks.ts",
])("%s가 공통 Betterleaks 버전과 모든 플랫폼 체크섬을 고정한다", (path) => {
  const source = readFileSync(join(root, path), "utf8");
  expect(source).toContain('"1.8.1"');
  for (const asset of Object.values(TOOLS.betterleaks.assets))
    expect(source).toContain(asset.sha256);
});
