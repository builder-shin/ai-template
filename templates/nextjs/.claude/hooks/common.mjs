import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { readProjectFiles } from "../../scripts/check/files.ts";
import { readGenConfig, resolveContractPaths } from "../../scripts/gen-config.mjs";

export const readInput = () => JSON.parse(readFileSync(0, "utf8"));
export const projectRoot = (input) => resolve(process.env.CLAUDE_PROJECT_DIR ?? input.cwd);
export const emit = (value) => console.log(JSON.stringify(value));
export const context = (hookEventName, additionalContext) =>
  emit({ hookSpecificOutput: { hookEventName, additionalContext } });
export const output = (result) =>
  `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`.slice(-12000);

export function safePath(root, path) {
  if (typeof path !== "string") return undefined;
  const absolute = resolve(root, path);
  const local = relative(root, absolute).replaceAll("\\", "/");
  if (!local || local.startsWith("../") || /^[A-Za-z]:/.test(local)) return undefined;
  if (
    local
      .split("/")
      .some((part) => part === ".git" || (part.startsWith(".env") && part !== ".env.example"))
  )
    return undefined;
  if (/\/generated\/|^contract\/openapi.yaml$|^src\/lib\/api\/schema.d.ts$/.test(local))
    return undefined;
  return existsSync(absolute) ? absolute : undefined;
}

export function snapshot(root) {
  const files = readProjectFiles(root);
  let contract;
  try {
    const config = readGenConfig(root);
    if (
      config.contract &&
      relative(root, resolve(root, config.contract)).replaceAll("\\", "/").startsWith("../")
    )
      contract = resolveContractPaths(root).root;
  } catch {
    // 설정 오류는 앱 파일 변경으로 감지하고 빠른 check에서 안내한다.
  }
  if (contract) {
    // 조합의 앱 밖 계약도 Stop 변경 감지에 포함한다. 단독 앱의 경로는 그대로다.
    for (const [path, text] of Object.entries(readProjectFiles(contract)))
      files[relative(root, join(contract, path)).replaceAll("\\", "/")] = text;
  }
  return Object.fromEntries(
    Object.entries(files).map(([path, text]) => [
      path,
      createHash("sha256").update(text).digest("hex"),
    ]),
  );
}
export function statePath(root, input) {
  const key = createHash("sha256")
    .update(String(input.session_id ?? "default"))
    .digest("hex");
  return join(root, ".cache", "hooks", `${key}.json`);
}
export function saveState(root, input, state) {
  mkdirSync(join(root, ".cache", "hooks"), { recursive: true });
  writeFileSync(statePath(root, input), JSON.stringify(state));
}
export function loadState(root, input) {
  try {
    return JSON.parse(readFileSync(statePath(root, input), "utf8"));
  } catch {
    return {};
  }
}
