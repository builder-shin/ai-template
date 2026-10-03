import { realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Template } from "./arguments.ts";
import { CreateError } from "./errors.ts";
import { runGit } from "./git.ts";

export function findRepository(cliLocation: string = import.meta.url): string {
  const expected = realpathSync.native(resolve(dirname(fileURLToPath(cliLocation)), "../.."));
  const actual = realpathSync.native(runGit(expected, ["rev-parse", "--show-toplevel"]).trim());
  if (relative(actual, expected) !== "") {
    throw new CreateError(
      "CLI의 저장소 배치가 올바르지 않다",
      "ai-template 저장소의 create/src에서 실행한다.",
    );
  }
  return actual;
}

export interface TemplateFile {
  readonly path: string;
  readonly executable: boolean;
}

export function trackedContents(
  repository: string,
  paths: string[],
): { path: string; content: string }[] {
  if (runGit(repository, ["status", "--porcelain", "--untracked-files=no", "--", ...paths]).trim())
    throw new CreateError(
      "조합 입력에 커밋하지 않은 변경이 있다",
      "조합 자산과 루트 설정 변경을 커밋하거나 되돌리고 실행한다.",
    );
  return runGit(repository, ["ls-tree", "-r", "--name-only", "-z", "HEAD", "--", ...paths])
    .split("\0")
    .filter(Boolean)
    .map((path) => ({ path, content: runGit(repository, ["show", `HEAD:${path}`]) }));
}

export function templateFiles(repository: string, template: Template): TemplateFile[] {
  const prefix = `templates/${template}/`;
  if (
    runGit(repository, [
      "status",
      "--porcelain",
      "--untracked-files=no",
      "--",
      `templates/${template}`,
    ]).trim()
  ) {
    throw new CreateError(
      `${template} 템플릿에 커밋하지 않은 변경이 있다`,
      "템플릿 변경을 커밋하거나 되돌린 뒤 실행한다.",
    );
  }
  const files = runGit(repository, ["ls-files", "-z", "--", `templates/${template}`])
    .split("\0")
    .filter(Boolean)
    .filter((file) => file !== `${prefix}template.json`);
  const modes = new Map(
    runGit(repository, ["ls-files", "--stage", "-z", "--", `templates/${template}`])
      .split("\0")
      .filter(Boolean)
      .map((entry) => {
        const tab = entry.indexOf("\t");
        return [entry.slice(tab + 1), entry.slice(0, 6)];
      }),
  );
  if (files.length === 0) {
    throw new CreateError(
      `${template} 템플릿의 추적 파일이 없다`,
      "템플릿이 포함된 저장소에서 실행한다.",
    );
  }
  return files.map((file) => {
    const mode = modes.get(file);
    if (mode !== "100644" && mode !== "100755") {
      throw new CreateError(`${file}은 일반 파일이 아니다`, "템플릿에는 일반 파일만 커밋한다.");
    }
    return { path: file.slice(prefix.length), executable: mode === "100755" };
  });
}
