import { readSharedAssets } from "../verify-templates/manifest.ts";
import { syncSharedAssets } from "./sync.ts";

/** 사용법: pnpm sync. scripts/shared-assets.json에 적힌 원본을 템플릿으로 복사한다. */
const repoRoot = process.cwd();
const shared = readSharedAssets(repoRoot);
if (Array.isArray(shared)) {
  for (const problem of shared) console.error(`scripts/shared-assets.json: ${problem}`);
  process.exit(1);
}

const copied = syncSharedAssets(repoRoot, shared);
console.log(copied.length > 0 ? copied.join("\n") : "동기화할 공유 자산이 없다.");
