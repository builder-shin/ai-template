import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export function gitEnvironment(environment = process.env) {
  const env = { ...environment };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
    "GIT_PREFIX",
  ])
    Reflect.deleteProperty(env, key);
  return env;
}

export function pnpmEntry(environment = process.env) {
  if (environment.npm_execpath) return environment.npm_execpath;
  for (const folder of (environment.PATH ?? environment.Path ?? "").split(delimiter)) {
    for (const file of [
      "pnpm.exe",
      "node_modules/pnpm/bin/pnpm.cjs",
      "node_modules/corepack/dist/pnpm.js",
      "pnpm",
    ]) {
      const path = join(folder, file);
      if (existsSync(path) && (process.platform !== "win32" || file !== "pnpm")) return path;
    }
  }
  throw new Error("pnpm을 찾을 수 없다 — pnpm 12.6.0을 설치하고 PATH에 추가한다.");
}

export function run(command, args, options = {}) {
  if (command === "pnpm") {
    const entry = pnpmEntry(options.env ?? process.env);
    const javascript = /\.[cm]?js$/.test(entry);
    return spawnSync(javascript ? process.execPath : entry, javascript ? [entry, ...args] : args, {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      ...options,
    });
  }
  return spawnSync(command, args, { encoding: "utf8", windowsHide: true, ...options });
}

export function exitCode(result) {
  return result.status ?? 1;
}

export function isGitRoot(root, execute = run) {
  // git의 상대 위치로 판정하면 링크와 드라이브 문자 표기에 영향을 받지 않는다.
  const result = execute("git", ["rev-parse", "--is-inside-work-tree", "--show-cdup"], {
    cwd: root,
    env: gitEnvironment(),
  });
  return exitCode(result) === 0 && result.stdout.trim() === "true";
}

export function isMain(url) {
  return process.argv[1] !== undefined && url === pathToFileURL(process.argv[1]).href;
}

export function runnerMain(task) {
  if (!process.env.npm_execpath) {
    console.error("pnpm 실행 경로가 없다 — pnpm으로 루트 명령을 실행한다.");
    return 1;
  }
  try {
    return task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      message.includes(" — ") ? message : `${message} — pnpm setup으로 도구를 준비한다.`,
    );
    return 1;
  }
}
