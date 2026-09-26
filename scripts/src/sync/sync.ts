import { cpSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import type { SharedAssetsManifest } from "../verify-templates/manifest.ts";

/** 공유 자산 원본을 각 템플릿의 사본 위치로 통째로 복사한다. node_modules는 복사하지 않는다. */
export function syncSharedAssets(repoRoot: string, manifest: SharedAssetsManifest): string[] {
  const copied: string[] = [];
  for (const asset of manifest.assets) {
    for (const target of asset.targets) {
      const destination = join(repoRoot, "templates", target.template, target.path);
      rmSync(destination, { recursive: true, force: true });
      cpSync(join(repoRoot, asset.source), destination, {
        recursive: true,
        filter: (path) => basename(path) !== "node_modules",
      });
      copied.push(`${asset.source} → templates/${target.template}/${target.path}`);
    }
  }
  return copied;
}
