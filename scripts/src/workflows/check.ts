import { globSync, statSync } from "node:fs";
import { join } from "node:path";

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
