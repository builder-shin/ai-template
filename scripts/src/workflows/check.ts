import { globSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";

type Execute = (
  binary: string,
  args: string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => { status: number | null; stdout: string; stderr: string; error?: Error };

export function checkWorkflows(
  root: string,
  binary: string,
  files: string[],
  execute: Execute = spawnSync,
) {
  // 별도 설치가 필요한 shellcheck·pyflakes는 끈다.
  const result = execute(binary, ["-shellcheck=", "-pyflakes=", ...files], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error)
    return {
      code: 1,
      output: `워크플로 검사 실행 실패: ${result.error.message} — ${dirname(binary)} 폴더를 지우고 다시 실행한다.`,
    };
  if (result.status !== 0)
    return {
      code: 1,
      output:
        `${result.stdout}${result.stderr}`.trim() ||
        "워크플로 검사 실패 — pnpm tool actionlint로 파일을 검사한다.",
    };
  return { code: 0, output: `워크플로 검사 통과: ${String(files.length)}개` };
}

/** 저장소와 생성 프로젝트의 워크플로 원본만 고른다. 아직 없는 폴더는 건너뛴다. */
export function workflowFiles(root: string): string[] {
  return globSync(
    [
      ".github/workflows/*.{yml,yaml}",
      "templates/*/.github/workflows/*.{yml,yaml}",
      "create/assets/combo/.github/workflows/*.{yml,yaml}",
    ],
    { cwd: root },
  )
    .filter((file) => statSync(join(root, file)).isFile())
    .map((file) => file.replaceAll("\\", "/"))
    .sort();
}
