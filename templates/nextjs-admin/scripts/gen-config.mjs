import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, win32 } from "node:path";

/** @param {string} root @returns {{openapi?: string, contract?: string}} */
export function readGenConfig(root) {
  const path = join(root, "gen.config.json");
  if (!existsSync(path)) return {};
  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    throw new Error("gen.config.json을 읽을 수 없다 — 올바른 JSON 파일로 저장한다.");
  }
  return parseGenConfig(source);
}

/** @param {string} source @returns {{openapi?: string, contract?: string}} */
export function parseGenConfig(source) {
  let config;
  try {
    config = JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("gen.config.json을 읽을 수 없다 — 올바른 JSON 파일로 저장한다.");
  }
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    Object.keys(config).some((key) => !["openapi", "contract"].includes(key))
  )
    throw new Error("gen.config.json 설정이 잘못됐다 — openapi와 contract만 선택 키로 넣는다.");
  for (const [key, value] of Object.entries(config)) {
    if (typeof value !== "string" || !value.trim() || isAbsolute(value) || win32.isAbsolute(value))
      throw new Error(
        `gen.config.json ${key}가 잘못됐다 — ${key}에 앱 루트 기준 상대 경로 문자열을 넣는다.`,
      );
  }
  return config;
}

/** @param {string} appRoot */
export function resolveContractPaths(appRoot) {
  const root = resolve(appRoot, readGenConfig(appRoot).contract ?? "contract");
  const paths = {
    root,
    mock: join(root, "mock"),
    typespec: join(root, "typespec"),
    openapi: join(root, "openapi.yaml"),
  };
  for (const path of [paths.root, paths.mock, paths.typespec]) {
    if (!statSync(path, { throwIfNoEntry: false })?.isDirectory())
      throw new Error(
        `${path} 계약 폴더가 없다 — gen.config.json의 contract를 mock·typespec 폴더가 있는 계약 위치로 고친다.`,
      );
  }
  return paths;
}
