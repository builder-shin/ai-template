import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const appFiles = [
  "app.config.json",
  "e2e/targets/app.ts",
  "messages/en.json",
  "messages/ko.json",
  "scripts/check/steps.ts",
  "scripts/test/e2e-app.ts",
  "src/lib/env.ts",
  "src/lib/session/routes.ts",
];

function sourceFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const file = join(path, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(?:ts|tsx|mjs)$/.test(entry.name) ? [file] : [];
  });
}

function resolveFile(path: string): string | undefined {
  return ["", ".ts", ".tsx", ".mjs", ".d.ts", "/index.ts"]
    .map((suffix) => path + suffix)
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function importedAppFiles(source: string, template: string): string[] {
  const sourceRoot = join(root, source);
  const templateRoot = join(root, template);
  const imports = new Set<string>();
  for (const file of sourceFiles(sourceRoot)) {
    for (const { fileName } of ts.preProcessFile(readFileSync(file, "utf8"), true, true)
      .importedFiles) {
      if (!fileName.startsWith("./") && !fileName.startsWith("../")) continue;
      const sourcePath = join(dirname(file), fileName);
      if (resolveFile(sourcePath)) continue;
      const templatePath = join(templateRoot, relative(sourceRoot, sourcePath));
      imports.add(
        relative(templateRoot, resolveFile(templatePath) ?? templatePath).replaceAll("\\", "/"),
      );
    }
  }
  return [...imports].sort();
}

it("공유 원본이 가져오는 앱 파일은 고정 목록뿐이다", () => {
  expect(
    importedAppFiles("shared/nextjs", "templates/nextjs"),
    "공유 원본이 고정 목록 밖의 앱 파일을 가져온다 — 두 앱에 같은 경로의 앱 파일을 두고 이 목록을 함께 고친다",
  ).toEqual(appFiles);
});
