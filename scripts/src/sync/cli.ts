import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format, resolveConfig } from "prettier";
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
if (shared.assets.some((asset) => asset.mode === "overlay")) {
  const path = join(repoRoot, "scripts/shared-assets.json");
  const before = readFileSync(path, "utf8");
  const after = await format(before, { ...(await resolveConfig(path)), filepath: path });
  if (after !== before) writeFileSync(path, after);
}
console.log(copied.length > 0 ? copied.join("\n") : "동기화할 공유 자산이 없다.");
