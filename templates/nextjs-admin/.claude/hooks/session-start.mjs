import { existsSync } from "node:fs";
import { join } from "node:path";
import { binary } from "../../scripts/process.mjs";
import { context, projectRoot, readInput, saveState, snapshot } from "./common.mjs";

const input = readInput();
const root = projectRoot(input);
const installed = existsSync(join(root, "node_modules", "next", "package.json"));
const generated = installed
  ? binary("tsx", ["scripts/gen.ts", "--check"], { cwd: root })
  : undefined;
saveState(root, input, snapshot(root));
context(
  "SessionStart",
  [
    `의존성: ${installed ? "설치됨" : "없음 — pnpm setup을 실행한다."}`,
    `.env: ${existsSync(join(root, ".env")) ? "있음" : "없음 — pnpm setup을 실행한다."}`,
    `생성물: ${generated?.status === 0 ? "최신" : "확인 필요 — pnpm check:generated를 실행한다."}`,
  ].join("\n"),
);
