import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// web에 설치한 생성기 의존성을 쓰며 사본 대신 공유 원본에 생성한다.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const { generateWeb } = await import(
  pathToFileURL(join(root, "templates/nextjs/scripts/generate.ts")).href
);
const files = await generateWeb(readFileSync(join(root, "contract/openapi.yaml"), "utf8"));
for (const [path, content] of Object.entries(files))
  writeFileSync(join(root, "shared/nextjs", path), content);
console.log("Next.js 공유 타입 생성 완료 — pnpm sync로 사본을 맞춘다.");
