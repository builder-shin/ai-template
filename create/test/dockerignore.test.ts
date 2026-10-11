import { readFileSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";
import { expect, it } from "vitest";

it.each(["web", "admin"])("이미지는 앱 루트의 문서·하네스만 제외한다: %s", (app) => {
  for (const folder of ["docs", ".claude", ".agents"]) {
    const patterns = readFileSync(
      resolve(import.meta.dirname, `../assets/combo/apps/${app}/Dockerfile.dockerignore`),
      "utf8",
    )
      .trim()
      .split(/\r?\n/);
    const excluded = (path: string) => patterns.some((pattern) => matchesGlob(path, pattern));
    expect(excluded(`apps/web/${folder}`)).toBe(true);
    expect(excluded(`apps/api/${folder}`)).toBe(true);
    expect(excluded(`apps/web/src/app/${folder}`)).toBe(false);
    expect(excluded(`contract/mock/src/${folder}`)).toBe(false);
    expect(excluded(`contract/mock/${folder}`)).toBe(true);
    expect(excluded(`contract/typespec/${folder}`)).toBe(true);
  }
});
