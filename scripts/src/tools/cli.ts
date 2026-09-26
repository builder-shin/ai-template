import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { ensureTool } from "./install.ts";
import { TOOLS, isToolName } from "./manifest.ts";

/** 사용법: pnpm tool <도구> [인자...]. 처음 한 번만 내려받고 node_modules/.cache에 둔다. */
export const TOOL_CACHE_DIR = join(process.cwd(), "node_modules", ".cache", "ai-template-tools");

const [name, ...args] = process.argv.slice(2);
if (name === undefined || !isToolName(name)) {
  console.error(`사용법: pnpm tool <${Object.keys(TOOLS).join("|")}> [인자...]`);
  process.exit(2);
}

const binary = await ensureTool(TOOLS[name], TOOL_CACHE_DIR);
const result = spawnSync(binary, args, { stdio: "inherit" });
if (result.error !== undefined) {
  // 첫 설치가 중간에 끊겨 잘린 바이너리가 캐시에 남으면 여기로 온다. 폴더를 지우면 다음 실행이 새로 받는다.
  console.error(
    `${name}를 실행하지 못했다(${result.error.message}).\n` +
      `받아 둔 바이너리가 깨졌을 수 있다. 이 폴더를 지우고 다시 실행하면 새로 받는다: ${dirname(binary)}`,
  );
  process.exit(1);
}
if (result.signal !== null) {
  console.error(`${name}가 신호(${result.signal})를 받고 종료됐다.`);
  process.exit(1);
}
process.exit(result.status ?? 1);
