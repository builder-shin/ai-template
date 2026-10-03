import { resolve } from "node:path";
import { exitCode, gitEnvironment, isGitRoot, isMain, run, runnerMain } from "./process.mjs";

export function setup(
  root,
  { run: execute = run, nodeVersion = process.versions.node, output = console.error } = {},
) {
  if (nodeVersion.split(".")[0] !== "24") {
    output("Node 24가 필요하다 — Node 24를 설치한다.");
    return 1;
  }
  for (const [tool, hint] of [
    ["pnpm", "pnpm 12.6.0"],
    ["uv", "uv"],
    ["docker", "Docker"],
  ]) {
    const result = execute(tool, ["--version"], { cwd: root });
    if (exitCode(result) !== 0) {
      output(`${hint} 실행 파일이 없다 — ${hint} 설치 후 PATH에 추가한다.`);
      return 1;
    }
  }
  for (const args of [
    ["install", "--frozen-lockfile"],
    ["exec", "lefthook", "install"],
    ["--filter", "api", "run", "setup"],
    ["--filter", "web", "run", "setup"],
  ]) {
    const hook = args.includes("lefthook");
    // --no-git로 만든 프로젝트가 상위 저장소의 hook을 덮어쓰지 않는다.
    if (hook && !isGitRoot(root, execute)) {
      output(
        "루트가 git 최상위가 아니므로 hook 설치를 건너뛴다 — 루트에서 git init 후 pnpm setup을 다시 실행한다.",
      );
      continue;
    }
    const result = execute("pnpm", args, {
      cwd: root,
      stdio: "inherit",
      ...(hook ? { env: gitEnvironment() } : {}),
    });
    if (exitCode(result) !== 0) return exitCode(result);
  }
  return 0;
}

if (isMain(import.meta.url))
  process.exitCode = runnerMain(() => setup(resolve(import.meta.dirname, "..")));
