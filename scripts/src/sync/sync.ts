import { cpSync, rmSync } from "node:fs";
import { basename } from "node:path";
import {
  copyPath,
  sharedAssetsProblems,
  sourcePath,
  type SharedAssetsManifest,
} from "../verify-templates/manifest.ts";

/**
 * 공유 자산 원본을 각 템플릿의 사본 위치로 통째로 복사한다. node_modules는 복사하지 않는다.
 * 지우기 전에 모든 항목을 검사한다. 사본 위치가 templates/<template>/ 안쪽이 아니거나 원본이 없는 항목이
 * 하나라도 있으면 아무것도 지우지 않고 멈춘다. manifest 검사를 거치지 않고 불려도 마찬가지다.
 */
export function syncSharedAssets(repoRoot: string, manifest: SharedAssetsManifest): string[] {
  const problems = sharedAssetsProblems(repoRoot, manifest);
  if (problems.length > 0) {
    throw new Error(
      `공유 자산을 동기화하지 않았다(아무것도 지우지 않았다).\n${problems.join("\n")}`,
    );
  }
  const copied: string[] = [];
  for (const asset of manifest.assets) {
    const source = sourcePath(repoRoot, asset.source);
    for (const target of asset.targets) {
      // 위 검사를 통과했으면 늘 있다. 그래도 지우는 자리에서 가드를 한 번 더 건다.
      const destination = copyPath(repoRoot, target.template, target.path);
      if (source === undefined || destination === undefined) continue;
      rmSync(destination, { recursive: true, force: true });
      cpSync(source, destination, {
        recursive: true,
        filter: (path) => basename(path) !== "node_modules",
      });
      copied.push(`${asset.source} → templates/${target.template}/${target.path}`);
    }
  }
  return copied;
}
