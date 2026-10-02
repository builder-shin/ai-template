import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const excluded = new Set([
  "node_modules",
  ".git",
  ".next",
  ".cache",
  "coverage",
  "out",
  "test-results",
  "playwright-report",
]);

/** git 없는 복사본도 검사한다. 환경 파일과 링크는 절대 열지 않는다. */
export function readProjectFiles(
  root: string,
  excludedPaths: readonly string[] = [],
): Record<string, string> {
  const files: Record<string, string> = {};
  const ignored = new Set(excludedPaths);
  function visit(dir: string, prefix: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (ignored.has(relative)) continue;
      if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".env") && entry.name !== ".env.example") continue;
      if (/\.(tsbuildinfo|log)$/.test(entry.name)) continue;
      if (entry.isDirectory()) visit(join(dir, entry.name), `${relative}/`);
      else if (entry.isFile()) files[relative] = readFileSync(join(dir, entry.name), "utf8");
    }
  }
  visit(root, "");
  return files;
}

export function isGenerated(path: string) {
  return (
    path.includes("/generated/") ||
    path === "src/lib/api/schema.d.ts" ||
    path === "contract/openapi.yaml"
  );
}

/** types 캐시는 build/typegen 출력만 본다. 실행 중인 dev 출력은 입력이 아니다. */
export function readRouteTypes(root: string): Record<string, string> {
  const directory = join(root, ".next/types");
  return existsSync(directory) ? readProjectFiles(directory) : {};
}
