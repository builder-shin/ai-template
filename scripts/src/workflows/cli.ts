import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ensureTool } from "../tools/install.ts";
import { TOOLS } from "../tools/manifest.ts";
import { workflowFiles } from "./check.ts";

const root = process.cwd();
try {
  const files = workflowFiles(root);
  if (files.length > 0) {
    const binary = await ensureTool(
      TOOLS.actionlint,
      join(root, "node_modules/.cache/ai-template-tools"),
    );
    // 별도 설치가 필요한 shellcheck·pyflakes는 끈다. 모든 OS에서 같은 actionlint 검사를 한다.
    const result = spawnSync(binary, ["-shellcheck=", "-pyflakes=", ...files], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) {
      const output = `${result.stdout}${result.stderr}`.trim();
      console.error(output || "워크플로 검사 실패 — pnpm tool actionlint로 파일을 검사한다.");
      process.exit(1);
    }
  }
  console.log(`워크플로 검사 통과: ${String(files.length)}개`);
} catch (error) {
  console.error(
    `워크플로 검사 실행 실패: ${error instanceof Error ? error.message : String(error)} — 도구 설치와 워크플로 파일을 확인한다.`,
  );
  process.exitCode = 1;
}
