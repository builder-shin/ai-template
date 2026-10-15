import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { childEnvironment, isMain, readInput, writeOutput } from "./common.mjs";

function inspectInfrastructure(root) {
  return spawnSync("docker", ["compose", "ps", "--format", "json"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 3000,
    env: childEnvironment(),
  });
}
export function sessionStart(input, inspect = inspectInfrastructure) {
  const root = input.cwd;
  let infrastructure = "확인할 수 없음";
  try {
    const result = inspect(root);
    if (result.status === 0 && !result.error) {
      const text = result.stdout.trim();
      const rows = text.startsWith("[")
        ? JSON.parse(text)
        : text
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line));
      infrastructure = rows.length
        ? rows.map((row) => `${row.Service}: ${row.State}`).join(", ")
        : "꺼짐";
    }
  } catch {
    /* 인프라의 비공개 진단 대신 관측 불가만 요약한다. */
  }
  const state = [
    `설치: ${existsSync(join(root, "node_modules")) ? "있음" : "없음"}`,
    `.env: ${existsSync(join(root, ".env")) ? "있음" : "없음"}`,
    `인프라: ${infrastructure}`,
    "명령: pnpm setup · dev · gen · check --fast · check · test · test:e2e · db:migrate · db:reset · db:revision · gen:module",
    "마이그레이션 적용과 생성물 최신 여부는 pnpm setup과 pnpm gen --check로 확인한다.",
    "종료 전 pnpm check --fast를 통과시킨다. 규칙과 변경 절차는 AGENTS.md와 docs/recipes를 따른다.",
  ].join("\n");
  return { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: state } };
}
if (isMain(import.meta.url)) writeOutput(sessionStart(readInput()));
