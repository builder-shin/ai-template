import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const MAX_ROOT_AGENTS_LINES = 200;
export const IMPORT_LINE = "@AGENTS.md";

/** 테스트 픽스처처럼 일부러 규칙을 어긴 폴더와 도구 폴더는 보지 않는다. */
const SKIPPED_DIRS = new Set(["node_modules", ".git", ".cache", "fixtures"]);

export interface Problem {
  readonly path: string;
  readonly message: string;
}

export interface CheckOptions {
  /** 루트 바로 아래에서 건너뛸 폴더. 예: 템플릿 저장소는 templates/를 따로 검사한다. */
  readonly exclude?: readonly string[];
}

function meaningfulLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * AGENTS.md마다 `@AGENTS.md`로 시작하는 CLAUDE.md가 옆에 있어야 한다.
 * 하위 폴더의 CLAUDE.md는 그 한 줄만 담고, 루트 CLAUDE.md만 Claude 전용 내용을 덧붙일 수 있다.
 * 루트 AGENTS.md는 200줄 이하다.
 */
export function checkAgentsMd(root: string, options: CheckOptions = {}): Problem[] {
  const problems: Problem[] = [];
  const excluded = new Set(options.exclude ?? []);

  const visit = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    const at = (name: string) => relative(root, join(dir, name)).replaceAll("\\", "/");
    const isRoot = dir === root;

    if (files.has("AGENTS.md") && !files.has("CLAUDE.md")) {
      problems.push({
        path: at("CLAUDE.md"),
        message: `AGENTS.md 옆에 "${IMPORT_LINE}" 한 줄짜리 CLAUDE.md를 만든다.`,
      });
    }
    if (files.has("CLAUDE.md")) {
      const lines = meaningfulLines(readFileSync(join(dir, "CLAUDE.md"), "utf8"));
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
      const count = readFileSync(join(dir, "AGENTS.md"), "utf8").trimEnd().split(/\r?\n/).length;
      if (count > MAX_ROOT_AGENTS_LINES) {
        problems.push({
          path: at("AGENTS.md"),
          message: `${String(count)}줄이다. ${String(MAX_ROOT_AGENTS_LINES)}줄 이하로 줄이고 자세한 내용은 docs/로 옮긴다.`,
        });
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || SKIPPED_DIRS.has(entry.name)) continue;
      if (isRoot && excluded.has(entry.name)) continue;
      visit(join(dir, entry.name));
    }
  };

  visit(root);
  return problems;
}
