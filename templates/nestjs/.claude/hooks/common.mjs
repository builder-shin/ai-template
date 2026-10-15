import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { environment } from "../../scripts/child-environment.mjs";

export function isMain(url) {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url));
  } catch {
    return false;
  }
}
export function readInput() {
  return JSON.parse(readFileSync(0, "utf8"));
}
export function writeOutput(output) {
  if (Object.keys(output).length) process.stdout.write(`${JSON.stringify(output)}\n`);
}
export function childEnvironment() {
  const selectors = new Set([
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
    "GIT_PREFIX",
  ]);
  return Object.fromEntries(Object.entries(environment()).filter(([key]) => !selectors.has(key)));
}
export function relativeFile(root, file) {
  const path = relative(resolve(root), resolve(root, file.replaceAll("\\", "/"))).replaceAll(
    "\\",
    "/",
  );
  return path === ".." || path.startsWith("../") ? undefined : path;
}
export function protectedFile(file) {
  return (
    /(?:^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith("/.env.example") && file !== ".env.example"
  );
}
// 설치된 로컬 엔트리를 Node exec form으로 호출한다. 셸이나 전역 도구를 해석하지 않는다.
export function runLocal(root, args) {
  const [command, ...rest] = args;
  const entries = {
    check: ["--import", "tsx", "scripts/check/cli.ts"],
    prettier: ["node_modules/prettier/bin/prettier.cjs"],
    eslint: ["node_modules/eslint/bin/eslint.js"],
  };
  if (!Object.hasOwn(entries, command)) throw new Error("지원하지 않는 하네스 명령이다");
  return spawnSync(process.execPath, [...entries[command], ...rest], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...childEnvironment(),
      npm_config_verify_deps_before_run: "error",
      PNPM_VERIFY_DEPS_BEFORE_RUN: "error",
      PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: "error",
    },
  });
}
export function failure(result) {
  return (
    result.error?.message ??
    (`${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || "검사를 실행하지 못했다")
  );
}
export const projectRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
