import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ESLint } from "eslint";
import { format, getFileInfo, resolveConfig } from "prettier";
import { overlayFiles } from "../verify-templates/manifest.ts";

// 사본의 경로로 린트 설정을 고르되 읽고 쓰는 내용은 공유 원본뿐이다.
const root = process.cwd();
const source = join(root, "shared/nextjs");
const template = join(root, "templates/nextjs");
const files = overlayFiles(root, { source: "shared/nextjs", targets: [] }).filter(
  (file) =>
    !/(^|\/)generated\//.test(file) &&
    file !== "src/lib/api/schema.d.ts" &&
    !/(^|\/)\.env(?:\.|$)/.test(file),
);
const selected = process.argv.slice(2).filter((arg) => arg !== "--");
const requested = selected.map((path) =>
  relative(source, resolve(root, path)).replaceAll("\\", "/"),
);
if (requested.some((file) => !files.includes(file))) {
  console.error("fix:shared: 추적한 공유 원본이 아닌 경로다 — shared/nextjs의 일반 소스만 고른다.");
  process.exit(1);
}
const eslint = new ESLint({
  cwd: template,
  fix: true,
  overrideConfigFile: join(template, "eslint.config.mjs"),
});
let count = 0;
for (const file of selected.length ? [...new Set(requested)] : files) {
  const path = join(source, file);
  const contextPath = join(template, file);
  const before = readFileSync(path, "utf8");
  let after = before;
  if (/\.[cm]?[jt]sx?$/.test(file)) {
    const results = await eslint.lintText(after, { filePath: contextPath, warnIgnored: false });
    after = results[0]?.output ?? after;
    if (results.some((result) => result.errorCount > 0)) {
      const formatter = await eslint.loadFormatter("stylish");
      console.error(formatter.format(results).replaceAll(template, source));
      process.exitCode = 1;
    }
  }
  const info = await getFileInfo(path);
  if (info.inferredParser)
    after = await format(after, { ...(await resolveConfig(contextPath)), filepath: path });
  if (after !== before) {
    writeFileSync(path, after);
    count++;
  }
}
if (!process.exitCode)
  console.log(`공유 원본 자동 수정 완료: ${count}개 변경 — pnpm sync로 사본을 맞춘다.`);
