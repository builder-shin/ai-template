import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inputFiles } from "./files.js";

export function inputHashes(root: string, inputs: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    inputFiles(root, inputs).map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(join(root, file)))
        .digest("hex"),
    ]),
  );
}
export function changedTests(
  cachePath: string,
  current: Record<string, string>,
): readonly string[] {
  let previous: Record<string, string>;
  try {
    const data = JSON.parse(readFileSync(cachePath, "utf8")) as {
      inputHashes?: Record<string, string>;
    };
    if (!data.inputHashes) return [];
    previous = data.inputHashes;
  } catch {
    return [];
  }
  const changed = [...new Set([...Object.keys(previous), ...Object.keys(current)])].filter(
    (file) => previous[file] !== current[file],
  );
  if (!changed.length) return [];
  const modules = new Set<string>();
  for (const file of changed) {
    const name = /^src\/modules\/([^/]+)\//.exec(file)?.[1];
    if (!name) return [];
    modules.add(name);
  }
  const selected: string[] = [];
  for (const name of [...modules].sort()) {
    const tests = Object.keys(current).filter(
      (file) => file.startsWith(`src/modules/${name}/`) && /\/tests\/.*\.test\.ts$/.test(file),
    );
    // 삭제되거나 시험이 없는 모듈도 전체 단위 시험으로 검증한다.
    if (!tests.length) return [];
    selected.push(...tests);
  }
  return selected.sort();
}
