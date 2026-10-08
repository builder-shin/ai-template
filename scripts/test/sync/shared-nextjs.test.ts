import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, expect, it } from "vitest";
import { readSharedAssets } from "../../src/verify-templates/manifest.ts";

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

const fixtures: string[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

function fixture(files: Record<string, string>): { source: string; template: string } {
  const repo = mkdtempSync(join(tmpdir(), "aitpl-shared-imports-"));
  fixtures.push(repo);
  for (const [path, content] of Object.entries(files)) {
    const file = join(repo, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return {
    source: resolve(repo, "shared/nextjs"),
    template: resolve(repo, "templates/nextjs"),
  };
}

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
  const sourceRoot = resolve(source);
  const templateRoot = resolve(template);
  const imports = new Set<string>();
  for (const file of sourceFiles(sourceRoot)) {
    for (const { fileName } of ts.preProcessFile(readFileSync(file, "utf8"), true, true)
      .importedFiles) {
      let templatePath: string;
      if (fileName.startsWith("@/")) templatePath = join(templateRoot, "src", fileName.slice(2));
      else if (fileName.startsWith("./") || fileName.startsWith("../"))
        templatePath = join(templateRoot, relative(sourceRoot, dirname(file)), fileName);
      else continue;
      const resolved = resolveFile(templatePath);
      const path = relative(templateRoot, resolved ?? templatePath).replaceAll("\\", "/");
      const sourcePath = join(sourceRoot, path);
      if (resolved && existsSync(sourcePath) && statSync(sourcePath).isFile()) continue;
      imports.add(path);
    }
  }
  return [...imports].sort();
}

it("공유 원본이 가져오는 앱 파일은 고정 목록뿐이다", () => {
  const manifest = readSharedAssets(root);
  if (Array.isArray(manifest)) throw new Error(manifest.join("\n"));
  const asset = manifest.assets.find(({ source }) => source === "shared/nextjs");
  if (!asset) throw new Error("공유 원본 항목이 없다 — shared/nextjs 동기화 항목을 복원한다.");
  for (const target of asset.targets) {
    expect(
      importedAppFiles(
        resolve(root, asset.source),
        resolve(root, "templates", target.template, target.path),
      ),
      "공유 원본이 고정 목록 밖의 앱 파일을 가져온다 — 두 앱에 같은 경로의 앱 파일을 두고 이 목록을 함께 고친다",
    ).toEqual(appFiles);
  }
});

it("별칭의 앱 파일과 공유 경로를 가리는 앱 파일을 찾는다", () => {
  const { source, template } = fixture({
    "shared/nextjs/src/lib/imports.ts":
      'import "@/lib/web-only"; import "./shadow"; import "@/lib/common";',
    "shared/nextjs/src/lib/shadow/index.ts": "export {};",
    "shared/nextjs/src/lib/common/index.ts": "export {};",
    "templates/nextjs/src/lib/web-only.ts": "export {};",
    "templates/nextjs/src/lib/shadow.ts": "export {};",
    "templates/nextjs/src/lib/shadow/index.ts": "export {};",
    "templates/nextjs/src/lib/common/index.ts": "export {};",
  });
  expect(importedAppFiles(source, template)).toEqual(["src/lib/shadow.ts", "src/lib/web-only.ts"]);
});

it("대상에서 풀리지 않는 별칭·상대 경로는 경로로 알린다", () => {
  const { source, template } = fixture({
    "shared/nextjs/src/lib/imports.ts":
      'import "@/lib/missing"; import "./absent"; import "./only-source";',
    "shared/nextjs/src/lib/only-source.ts": "export {};",
    "templates/nextjs/src/lib/missing/child.ts": "export {};",
  });
  expect(importedAppFiles(source, template)).toEqual([
    "src/lib/absent",
    "src/lib/missing",
    "src/lib/only-source",
  ]);
});

it("저장소 밖 fixture의 절대 경로를 루트와 다시 합치지 않는다", () => {
  const { source, template } = fixture({
    "shared/nextjs/src/lib/imports.ts": 'import "@/lib/app-only"; import "./common";',
    "shared/nextjs/src/lib/common.ts": "export {};",
    "templates/nextjs/src/lib/app-only.ts": "export {};",
    "templates/nextjs/src/lib/common.ts": "export {};",
  });
  expect(importedAppFiles(resolve(root, source), resolve(root, template))).toEqual([
    "src/lib/app-only.ts",
  ]);
});
