import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/** git 저장소가 아닐 때 직접 걸으며 건너뛰는 폴더. */
const SKIPPED_DIRS = new Set(["node_modules", ".git", ".cache", ".venv", "__pycache__"]);

/** git이 알려 주는 파일 목록. git 저장소가 아니거나 git이 없으면 undefined. */
function gitFiles(root: string): string[] | undefined {
  try {
    const output = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output.split("\0").filter((path) => path !== "" && existsSync(join(root, path)));
  } catch {
    return undefined;
  }
}

function walkFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) visit(path);
      } else if (entry.isFile()) {
        files.push(relative(root, path).replaceAll("\\", "/"));
      }
    }
  };
  visit(root);
  return files;
}

/**
 * root 아래의 프로젝트 파일을 슬래시 구분 상대 경로로 정렬해 돌려준다.
 * git 저장소 안이면 .gitignore를 따르고(추적하지 않은 파일도 넣는다), 아니면 직접 걷는다.
 */
export function projectFiles(root: string): string[] {
  return (gitFiles(root) ?? walkFiles(root)).sort();
}
