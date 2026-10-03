import { resolve } from "node:path";
import { exitCode, isMain, run } from "./process.mjs";

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
      output(`${hint}를 찾을 수 없다 — ${hint}를 설치하고 PATH에 추가한다.`);
      return 1;
    }
  }
  for (const args of [
    ["install", "--frozen-lockfile"],
    ["exec", "lefthook", "install"],
    ["--filter", "api", "run", "setup"],
    ["--filter", "web", "run", "setup"],
  ]) {
    const result = execute("pnpm", args, { cwd: root, stdio: "inherit" });
    if (exitCode(result) !== 0) return exitCode(result);
  }
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = setup(resolve(import.meta.dirname, ".."));
