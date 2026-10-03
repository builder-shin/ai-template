import { readFileSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";
import { expect, it } from "vitest";

it.each(["docs", ".claude", ".agents"])("이미지는 앱 루트의 %s만 제외한다", (folder) => {
  const patterns = readFileSync(
    resolve(import.meta.dirname, "../assets/combo/apps/web/Dockerfile.dockerignore"),
    "utf8",
  )
    .trim()
    .split(/\r?\n/);
  const excluded = (path: string) => patterns.some((pattern) => matchesGlob(path, pattern));
  expect(excluded(`apps/web/${folder}`)).toBe(true);
  expect(excluded(`apps/api/${folder}`)).toBe(true);
  expect(excluded(`apps/web/src/app/${folder}`)).toBe(false);
});
