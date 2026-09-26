import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";
import { isRecord } from "./manifest.ts";

/**
 * pyproject.toml의 [tool.poe.tasks]에 선언한 태스크 이름(uv runner의 명령 어휘).
 * 파일이나 표가 없으면 빈 집합, TOML을 읽지 못하면 문제 문장을 돌려준다.
 */
export function poeTasks(dir: string): Set<string> | string {
  const path = join(dir, "pyproject.toml");
  if (!existsSync(path)) return new Set();
  let pyproject: unknown;
  try {
    pyproject = parse(readFileSync(path, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return `pyproject.toml을 TOML로 읽지 못했다(${reason ?? ""}). 문법을 고친다.`;
  }
  const tool = isRecord(pyproject) ? pyproject.tool : undefined;
  const poe = isRecord(tool) ? tool.poe : undefined;
  const tasks = isRecord(poe) ? poe.tasks : undefined;
  return new Set(isRecord(tasks) ? Object.keys(tasks) : []);
}
