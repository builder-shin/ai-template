import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);

/** pnpm의 JS 또는 native 진입점을 인자 배열로 실행한다. */
export function pnpm(args, options = {}) {
  const entry = process.env.npm_execpath;
  if (!entry) throw new Error("pnpm으로 실행한다.");
  const javascript = /\.[cm]?js$/.test(entry);
  return spawnSync(javascript ? process.execPath : entry, javascript ? [entry, ...args] : args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
}

export function binary(name, args, options = {}) {
  const entries = {
    prettier: "prettier",
    eslint: "eslint",
    tsc: "typescript",
    vitest: "vitest",
    tsx: "tsx",
    next: "next",
  };
  if (!Object.hasOwn(entries, name)) throw new Error(`알 수 없는 명령: ${name}`);
  const manifest = require.resolve(`${entries[name]}/package.json`);
  const pkg = require(manifest);
  const entry = typeof pkg.bin === "string" ? pkg.bin : pkg.bin[name];
  return spawnSync(process.execPath, [resolve(dirname(manifest), entry), ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}
