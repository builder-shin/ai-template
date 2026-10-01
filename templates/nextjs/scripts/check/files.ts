import { readdirSync, readFileSync } from "node:fs";
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
export function readProjectFiles(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  function visit(dir: string, prefix: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".env") && entry.name !== ".env.example") continue;
      if (/\.(tsbuildinfo|log)$/.test(entry.name)) continue;
      const relative = prefix + entry.name;
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
