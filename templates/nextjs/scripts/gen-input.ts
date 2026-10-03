import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, win32 } from "node:path";

export function readWebOpenapi(root: string, contractOpenapi: string): string {
  const configPath = join(root, "gen.config.json");
  if (!existsSync(configPath)) return contractOpenapi;
  let config: unknown;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("gen.config.json을 읽을 수 없다 — 올바른 JSON 파일로 저장한다.");
  }
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    Object.keys(config).length !== 1 ||
    !("openapi" in config) ||
    typeof config.openapi !== "string" ||
    !config.openapi.trim() ||
    isAbsolute(config.openapi) ||
    win32.isAbsolute(config.openapi)
  )
    throw new Error(
      "gen.config.json 설정이 잘못됐다 — openapi 하나에 web 루트 기준 상대 경로 문자열을 넣는다.",
    );
  const specPath = join(root, config.openapi);
  const stat = statSync(specPath, { throwIfNoEntry: false });
  if (!stat)
    throw new Error(`${config.openapi} 스펙 파일이 없다 — 백엔드에서 gen을 먼저 실행한다.`);
  if (!stat.isFile())
    throw new Error(`${config.openapi} 스펙이 일반 파일이 아니다 — OpenAPI 파일을 지정한다.`);
  return readFileSync(specPath, "utf8").replace(/^\uFEFF/, "");
}

