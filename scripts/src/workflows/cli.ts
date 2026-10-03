import { ensureTool } from "../tools/install.ts";
import { TOOL_CACHE_DIR } from "../tools/cache.ts";
import { TOOLS } from "../tools/manifest.ts";
import { checkWorkflows, workflowFiles } from "./check.ts";

const root = process.cwd();
try {
  const files = workflowFiles(root);
  if (files.length > 0) {
    const binary = await ensureTool(TOOLS.actionlint, TOOL_CACHE_DIR);
    const result = checkWorkflows(root, binary, files);
    if (result.code) console.error(result.output);
    else console.log(result.output);
    process.exitCode = result.code;
  } else {
    console.log("워크플로 검사 통과: 0개");
  }
} catch (error) {
  console.error(
    `워크플로 검사 실행 실패: ${error instanceof Error ? error.message : String(error)} — 도구 설치와 워크플로 파일을 확인한다.`,
  );
  process.exitCode = 1;
}
