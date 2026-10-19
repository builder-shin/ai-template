import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { expect, it } from "vitest";
import { TOOLS } from "../../src/tools/manifest.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
function verifyPlatformPins(source: string, path: string): void {
  const keys = [...source.matchAll(/"(?:win32|windows|linux|darwin)-(?:x64|arm64)":/g)];
  for (const [platform, asset] of Object.entries(TOOLS.betterleaks.assets)) {
    const key = path.endsWith(".py") ? platform.replace("win32", "windows") : platform;
    const start = source.indexOf(`"${key}":`);
    expect(start, key).toBeGreaterThanOrEqual(0);
    const end = keys.find((match) => match.index > start)?.index;
    expect(source.slice(start, end), key).toContain(asset.sha256);
  }
}
it.each([
  "templates/fastapi/tools/binaries.py",
  "shared/nextjs/scripts/tools/betterleaks.ts",
  "templates/nestjs/scripts/tools/betterleaks.ts",
])("%s가 공통 Betterleaks 버전과 모든 플랫폼 체크섬을 고정한다", (path) => {
  const source = readFileSync(join(root, path), "utf8");
  expect(source).toContain('"1.8.1"');
  verifyPlatformPins(source, path);
});

it.each([
  "templates/fastapi/tools/binaries.py",
  "shared/nextjs/scripts/tools/betterleaks.ts",
  "templates/nestjs/scripts/tools/betterleaks.ts",
])("%s의 사본에서 플랫폼 체크섬 둘을 바꾸면 거절한다", (path) => {
  const source = readFileSync(join(root, path), "utf8");
  const first = TOOLS.betterleaks.assets["win32-x64"].sha256;
  const second = TOOLS.betterleaks.assets["linux-x64"].sha256;
  const swapped = source
    .replace(first, "swapped-checksum")
    .replace(second, first)
    .replace("swapped-checksum", second);
  expect(() => {
    verifyPlatformPins(swapped, path);
  }).toThrow();
});
