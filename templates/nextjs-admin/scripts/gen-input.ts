import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { readGenConfig } from "./gen-config.mjs";

export function readWebOpenapi(root: string, contractOpenapi: string): string {
  const config = readGenConfig(root);
  if (config.openapi === undefined) return contractOpenapi;
  const specPath = join(root, config.openapi);
  const stat = statSync(specPath, { throwIfNoEntry: false });
  if (!stat)
    throw new Error(`${config.openapi} 스펙 파일이 없다 — 백엔드에서 gen을 먼저 실행한다.`);
  if (!stat.isFile())
    throw new Error(`${config.openapi} 스펙이 일반 파일이 아니다 — OpenAPI 파일을 지정한다.`);
  return readFileSync(specPath, "utf8").replace(/^\uFEFF/, "");
}
