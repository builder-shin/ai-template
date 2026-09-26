import { readSharedAssets } from "../verify-templates/manifest.ts";
import { syncSharedAssets } from "./sync.ts";

/** 사용법: pnpm sync. scripts/shared-assets.json에 적힌 원본을 템플릿으로 복사한다. */
const copied = syncSharedAssets(process.cwd(), readSharedAssets(process.cwd()));
console.log(copied.length > 0 ? copied.join("\n") : "동기화할 공유 자산이 없다.");
