import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const IGNORED = new Set(["node_modules", ".cache"]);

/** 폴더 안의 파일을 상대 경로(슬래시 구분)로 모두 나열한다. node_modules는 뺀다. */
export function listFiles(dir: string, ignored: ReadonlySet<string> = IGNORED): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(relative(dir, path).replaceAll("\\", "/"));
    }
  };
  visit(dir);
  return files.sort();
}

/** 사본이 원본 파일과 바이트까지 같은 파일인지 본다. 사본이 없거나 폴더면 다르다. */
export function sameFile(source: string, copy: string): boolean {
  if (!existsSync(copy) || !statSync(copy).isFile()) return false;
  return readFileSync(source).equals(readFileSync(copy));
}

/** 두 폴더의 파일 목록과 내용이 같은지 비교해 다른 파일을 돌려준다. */
export function diffDirs(source: string, copy: string): string[] {
  const sourceFiles = listFiles(source);
  const copyFiles = listFiles(copy);
  const all = [...new Set([...sourceFiles, ...copyFiles])].sort();
  return all.filter((file) => {
    if (!sourceFiles.includes(file) || !copyFiles.includes(file)) return true;
    return !readFileSync(join(source, file)).equals(readFileSync(join(copy, file)));
  });
}
