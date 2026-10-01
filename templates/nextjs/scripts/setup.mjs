import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { mergeEnv } from "./envfile.mjs";
import { pnpm } from "./process.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const installed = pnpm(["install", "--frozen-lockfile"], { stdio: "inherit" });
if (installed.status !== 0) process.exit(installed.status ?? 1);
const current = existsSync(".env") ? readFileSync(".env", "utf8") : undefined;
const merged = mergeEnv(current, readFileSync(".env.example", "utf8"));
if (merged !== current) writeFileSync(".env", merged, { mode: 0o600 });
// 템플릿 저장소의 상위 git hook을 덮어쓰지 않는다.
const git = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
if (git.status === 0 && resolve(git.stdout.trim()) === resolve(root)) {
  const hook = pnpm(["exec", "lefthook", "install"], { stdio: "inherit" });
  if (hook.status !== 0) process.exit(hook.status ?? 1);
}
const browser = pnpm(["exec", "playwright", "install", "chromium"], { stdio: "inherit" });
if (browser.status !== 0) {
  console.error("Chromium 설치 실패: 환경과 hook은 준비했다. pnpm setup으로 다시 설치한다.");
  process.exit(browser.status ?? 1);
}
console.log("setup 완료: 의존성, Chromium, 환경 파일을 준비했다.");
