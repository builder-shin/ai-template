import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectFiles } from "../files/project-files.ts";

export const MAX_ROOT_AGENTS_LINES = 200;
export const IMPORT_LINE = "@AGENTS.md";

/** 테스트 픽스처는 일부러 규칙을 어기므로 보지 않는다. */
const FIXTURES_DIR = "fixtures";

export interface Problem {
  readonly path: string;
  readonly message: string;
}

export interface CheckOptions {
  /** 루트 바로 아래에서 건너뛸 폴더. 예: 템플릿 저장소는 templates/를 따로 검사한다. */
  readonly exclude?: readonly string[];
  /** 루트에 AGENTS.md와 CLAUDE.md가 반드시 있어야 하면 true. 예: 템플릿 루트. */
  readonly requireRoot?: boolean;
}

function meaningfulLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** 폴더(루트 기준 상대 경로, 루트는 "")마다 그 안의 AGENTS.md·CLAUDE.md 이름을 모은다. 루트는 늘 들어간다. */
function instructionFiles(root: string, options: CheckOptions): Map<string, Set<string>> {
  const excluded = new Set(options.exclude ?? []);
  const byDir = new Map<string, Set<string>>([["", new Set()]]);
  for (const path of projectFiles(root)) {
    const segments = path.split("/");
    const name = segments.pop() ?? "";
    if (name !== "AGENTS.md" && name !== "CLAUDE.md") continue;
    if (segments.includes(FIXTURES_DIR)) continue;
    if (segments.length > 0 && excluded.has(segments[0] ?? "")) continue;
    const dir = segments.join("/");
    const names = byDir.get(dir) ?? new Set<string>();
    names.add(name);
    byDir.set(dir, names);
  }
  return byDir;
}

/**
 * AGENTS.md마다 `@AGENTS.md`로 시작하는 CLAUDE.md가 옆에 있어야 한다.
 * 하위 폴더의 CLAUDE.md는 그 한 줄만 담고, 루트 CLAUDE.md만 Claude 전용 내용을 덧붙일 수 있다.
 * 루트 AGENTS.md는 200줄 이하다. 파일은 projectFiles로 고르므로 .gitignore에 있는 폴더는 보지 않는다.
 */
export function checkAgentsMd(root: string, options: CheckOptions = {}): Problem[] {
  const problems: Problem[] = [];
  for (const [dir, files] of instructionFiles(root, options)) {
    const at = (name: string) => (dir === "" ? name : `${dir}/${name}`);
    const isRoot = dir === "";
    const rootRequired = isRoot && options.requireRoot === true;

    if (rootRequired && !files.has("AGENTS.md")) {
      problems.push({
        path: at("AGENTS.md"),
        message:
          "루트 AGENTS.md가 없다. 명령, 구조 지도, 핵심 규칙, 완료 기준, 문서 링크를 담아 만든다.",
      });
    }
    if ((files.has("AGENTS.md") || rootRequired) && !files.has("CLAUDE.md")) {
      problems.push({
        path: at("CLAUDE.md"),
        message: `AGENTS.md 옆에 "${IMPORT_LINE}" 한 줄짜리 CLAUDE.md를 만든다.`,
      });
    }
    if (files.has("CLAUDE.md")) {
      const lines = meaningfulLines(readFileSync(join(root, dir, "CLAUDE.md"), "utf8"));
      if (!files.has("AGENTS.md")) {
        problems.push({
          path: at("CLAUDE.md"),
          message: "규칙은 AGENTS.md에 쓰고 CLAUDE.md는 `@AGENTS.md`만 담는다.",
        });
      } else if (lines[0] !== IMPORT_LINE) {
        problems.push({ path: at("CLAUDE.md"), message: `첫 줄은 "${IMPORT_LINE}"여야 한다.` });
      } else if (!isRoot && lines.length > 1) {
        problems.push({
          path: at("CLAUDE.md"),
          message: `하위 폴더의 CLAUDE.md는 "${IMPORT_LINE}" 한 줄만 담는다. 규칙은 AGENTS.md로 옮긴다.`,
        });
      }
    }
    if (isRoot && files.has("AGENTS.md")) {
      const count = readFileSync(join(root, "AGENTS.md"), "utf8").trimEnd().split(/\r?\n/).length;
      if (count > MAX_ROOT_AGENTS_LINES) {
        problems.push({
          path: at("AGENTS.md"),
          message: `${String(count)}줄이다. ${String(MAX_ROOT_AGENTS_LINES)}줄 이하로 줄이고 자세한 내용은 docs/로 옮긴다.`,
        });
      }
    }
  }
  return problems;
}
