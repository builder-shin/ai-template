import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import {
  copyPath,
  managedFiles,
  overlayFiles,
  sharedAssetsProblems,
  sourcePath,
  targetManagedFiles,
  type SharedAssetsManifest,
} from "../verify-templates/manifest.ts";

/**
 * 공유 자산을 복사한다. 기본은 통째로 교체하고 덮어 놓기는 관리 파일만 덮거나 지운다.
 * 설치물(node_modules)은 복사하지 않는다. 덮어 놓기 기록은 저장소의 manifest에만 남긴다.
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
  // 복사 중 멈춰도 다음 실행이 관리 파일을 찾도록 새 경로를 먼저 기록한다.
  const updated = {
    ...manifest,
    assets: manifest.assets.map((asset) =>
      asset.mode === "overlay"
        ? {
            ...asset,
            managedFiles: managedFiles(repoRoot, asset),
            targets: asset.targets.map((target) => ({
              ...target,
              managedFiles: targetManagedFiles(repoRoot, asset, target),
            })),
          }
        : asset,
    ),
  };
  if (JSON.stringify(updated) !== JSON.stringify(manifest)) {
    const path = join(repoRoot, "scripts/shared-assets.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(updated, null, 2)}\n`);
  }
  for (const asset of manifest.assets) {
    const source = sourcePath(repoRoot, asset.source);
    for (const target of asset.targets) {
      // 위 검사를 통과했으면 늘 있다. 그래도 지우는 자리에서 가드를 한 번 더 건다.
      const destination = copyPath(
        repoRoot,
        target.template,
        target.path,
        asset.mode === "overlay",
      );
      if (source === undefined || destination === undefined) continue;
      if (asset.mode === "overlay") {
        const files = new Set(overlayFiles(repoRoot, asset));
        for (const file of targetManagedFiles(repoRoot, asset, target)) {
          const copy = join(destination, file);
          if (files.has(file)) {
            mkdirSync(dirname(copy), { recursive: true });
            cpSync(join(source, file), copy);
          } else if (existsSync(copy) && statSync(copy).isFile()) {
            // 삭제 기록이 폴더가 된 경우 앱 파일이 있을 수 있으므로 폴더는 지우지 않는다.
            rmSync(copy);
            copied.push(`${relative(repoRoot, copy).replaceAll("\\", "/")}: 사본 삭제`);
          }
        }
        copied.push(`${asset.source} → templates/${target.template}/${target.path}`);
        continue;
      }
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
