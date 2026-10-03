import { spawnSync } from "node:child_process";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";
import { CreateError } from "./errors.ts";

export function runGit(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    env: gitEnvironment(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error && "code" in result.error && result.error.code === "ENOENT") {
    throw new CreateError("git을 찾을 수 없다", "git을 설치하고 PATH에 추가한다.");
  }
  if (result.error || result.status !== 0) {
    throw new CreateError(
      `git ${args[0] ?? ""} 실행에 실패했다`,
      "git 저장소·사용자 설정·서명 설정과 쓰기 권한을 확인한다.",
    );
  }
  return result.stdout;
}

export function initializeGit(target: string, name: string, sha: string): boolean {
  runGit(target, ["init", "-b", "main"]);
  // 자동 추측한 신원으로 커밋하지 않고 사용자가 설정한 신원을 확인한다.
  try {
    if (!runGit(target, ["config", "--get", "user.name"]).trim()) return false;
    if (!runGit(target, ["config", "--get", "user.email"]).trim()) return false;
    runGit(target, ["var", "GIT_AUTHOR_IDENT"]);
    runGit(target, ["var", "GIT_COMMITTER_IDENT"]);
  } catch {
    return false;
  }
  runGit(target, ["add", "--all"]);
  runGit(target, ["commit", "-m", `chore: create ${name} from ai-template ${sha}`]);
  return true;
}
