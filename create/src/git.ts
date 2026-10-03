import { spawnSync } from "node:child_process";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";
import { CreateError, errorReason } from "./errors.ts";

export function runGit(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    env: gitEnvironment(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.signal === "SIGINT" || result.signal === "SIGTERM")
    throw new CreateError("git 실행을 중단했다", "정리가 끝난 뒤 다시 실행한다.", 130);
  if (result.error && "code" in result.error && result.error.code === "ENOENT") {
    throw new CreateError("git을 찾을 수 없다", "git을 설치하고 PATH에 추가한다.");
  }
  if (result.error || result.status !== 0) {
    // Node의 선언과 달리 spawn 실패 때 stderr는 null일 수 있다.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const firstLine = (result.stderr ?? "").trim().split(/\r?\n/)[0] ?? "";
    const reason = result.error
      ? errorReason(result.error)
      : firstLine.length > 0
        ? errorReason(firstLine)
        : `종료 코드 ${String(result.status)}`;
    throw new CreateError(
      `git ${args[0] ?? ""} 실행에 실패했다(${reason})`,
      "git 저장소·사용자 설정·서명 설정과 쓰기 권한을 확인한다.",
    );
  }
  return result.stdout;
}

export const initialCommitMessage = (name: string, sha: string): string =>
  `chore: create ${name} from ai-template ${sha}`;

export function initializeGit(
  target: string,
  name: string,
  sha: string,
  copiedFiles: readonly string[],
  executableFiles: readonly string[] = [],
): boolean {
  runGit(target, ["init", "-b", "main"]);
  // 조합이 만든 파일은 프로젝트 ignore만 적용하고, 복사한 템플릿 파일은 모두 포함한다.
  const createdFiles = runGit(target, [
    "-c",
    "core.excludesFile=",
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ])
    .split("\0")
    .filter(Boolean);
  const files = [...new Set([...copiedFiles, ...createdFiles])];
  for (let index = 0; index < files.length; index += 50)
    runGit(target, ["add", "-f", "--", ...files.slice(index, index + 50)]);
  // Windows에서도 원본 인덱스의 실행 권한을 첫 커밋에 보존한다.
  for (let index = 0; index < executableFiles.length; index += 50)
    runGit(target, [
      "update-index",
      "--chmod=+x",
      "--",
      ...executableFiles.slice(index, index + 50),
    ]);
  // 자동 추측한 신원으로 커밋하지 않고 사용자가 설정한 신원을 확인한다.
  try {
    if (!runGit(target, ["config", "--get", "user.name"]).trim()) return false;
    if (!runGit(target, ["config", "--get", "user.email"]).trim()) return false;
    runGit(target, ["var", "GIT_AUTHOR_IDENT"]);
    runGit(target, ["var", "GIT_COMMITTER_IDENT"]);
  } catch (error) {
    if (error instanceof CreateError && error.exitCode === 130) throw error;
    return false;
  }
  runGit(target, ["commit", "-m", initialCommitMessage(name, sha)]);
  return true;
}
