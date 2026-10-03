import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { CreateOptions } from "./arguments.ts";
import { CreateError, errorReason } from "./errors.ts";
import { initialCommitMessage, initializeGit, runGit } from "./git.ts";
import { templateFiles } from "./repository.ts";
import { renameStandalone } from "./standalone.ts";
import { writeCombo, type ComboTools } from "./combo.ts";
import { runPnpm } from "./pnpm.ts";

function canonicalPath(path: string): string {
  if (existsSync(path)) return realpathSync.native(path);
  const parent = dirname(path);
  if (parent === path)
    throw new CreateError(
      "대상 폴더의 드라이브나 공유를 찾을 수 없다",
      "접근할 수 있는 드라이브나 공유의 폴더를 지정한다.",
    );
  return join(canonicalPath(parent), relative(parent, path));
}

function inside(path: string, repository: string): boolean {
  const remainder = relative(repository, path);
  return (
    remainder === "" ||
    (!isAbsolute(remainder) &&
      remainder !== ".." &&
      !remainder.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))
  );
}

function validateTarget(target: string, repositories: readonly string[]): void {
  if (
    repositories.some(
      (repository) =>
        inside(resolve(target), repository) || inside(canonicalPath(target), repository),
    )
  ) {
    throw new CreateError("대상 폴더가 템플릿 저장소 안에 있다", "저장소 밖의 폴더를 지정한다.");
  }
  let info;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink() || readdirSync(target).length > 0) {
    throw new CreateError(
      "대상 폴더가 비어 있지 않거나 일반 폴더가 아니다",
      "없는 폴더 또는 비어 있는 일반 폴더를 지정한다.",
    );
  }
}

export interface CreateResult {
  readonly target: string;
  readonly committed: boolean;
  readonly commitMessage: string;
}

export function createProject(
  options: CreateOptions,
  repository: string,
  tools: ComboTools = {},
): CreateResult {
  const root = realpathSync.native(repository);
  const worktrees = runGit(root, ["worktree", "list", "--porcelain"])
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => canonicalPath(line.slice("worktree ".length)));
  validateTarget(options.target, worktrees);
  const templates =
    options.template === "combo" ? (["fastapi", "nextjs"] as const) : [options.template];
  const plans = templates.map((template) => ({ template, files: templateFiles(root, template) }));
  const pnpm = tools.pnpm ?? runPnpm;
  if (options.template === "combo") pnpm(root, ["--version"]);
  const sha = runGit(root, ["rev-parse", "--short", "HEAD"]).trim();
  const parent = dirname(options.target);
  const firstCreated = mkdirSync(parent, { recursive: true });
  let staging: string | undefined;
  const copiedFiles: string[] = [];
  const executableFiles: string[] = [];
  let moved = false;
  const movedEntries: string[] = [];
  try {
    staging = mkdtempSync(join(parent, `aitpl-${options.name}-`));
    for (const { template, files } of plans)
      for (const file of files) {
        const destination = join(
          staging,
          options.template === "combo" ? `apps/${template === "fastapi" ? "api" : "web"}` : "",
          file.path,
        );
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(join(root, "templates", template, file.path), destination);
        copiedFiles.push(relative(staging, destination).split(sep).join("/"));
        if (file.executable)
          executableFiles.push(relative(staging, destination).split(sep).join("/"));
        if (process.platform !== "win32") chmodSync(destination, file.executable ? 0o755 : 0o644);
      }
    if (options.template === "combo")
      writeCombo(
        staging,
        root,
        options.name,
        tools.assets ?? join(root, "create/assets/combo"),
        pnpm,
      );
    else renameStandalone(staging, options.template, options.name);
    // 생성 중 다른 프로세스가 대상을 채웠다면 덮어쓰지 않는다.
    validateTarget(options.target, worktrees);
    // Node에는 umask를 읽는 대체 API가 없다. 새 대상도 mkdir의 기본 권한을 따른다.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    if (process.platform !== "win32") chmodSync(staging, 0o777 & ~process.umask());
    try {
      if (existsSync(options.target)) {
        // 기존 빈 폴더의 소유자·권한과 그 안에서 열린 터미널을 유지한다.
        for (const entry of readdirSync(staging)) {
          const destination = join(options.target, entry);
          renameSync(join(staging, entry), destination);
          movedEntries.push(destination);
        }
        rmdirSync(staging);
      } else {
        renameSync(staging, options.target);
        moved = true;
      }
    } catch (error) {
      throw process.platform === "win32" &&
        error instanceof Error &&
        "code" in error &&
        (error.code === "EBUSY" || error.code === "EPERM")
        ? new CreateError(
            `대상 폴더를 옮기지 못했다(${errorReason(error)})`,
            "폴더를 사용하는 프로그램을 닫고 다시 실행한다.",
          )
        : error;
    }
    if (options.git && !moved) movedEntries.push(join(options.target, ".git"));
    const committed = options.git
      ? initializeGit(
          options.target,
          options.name,
          sha,
          copiedFiles.filter((file) => existsSync(join(options.target, file))),
          executableFiles.filter((file) => existsSync(join(options.target, file))),
        )
      : false;
    return {
      target: options.target,
      committed,
      commitMessage: initialCommitMessage(options.name, sha),
    };
  } catch (error) {
    const paths = [staging, ...(moved ? [options.target] : movedEntries), firstCreated].filter(
      (path): path is string => path !== undefined,
    );
    for (const path of paths) {
      try {
        rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (cleanupError) {
        console.error(
          `pnpm new: 생성 실패(${errorReason(error)}) 뒤 정리하지 못했다(${errorReason(cleanupError)}) — ` +
            `남은 경로 ${paths.filter(existsSync).join(", ")}를 사용하는 프로그램을 닫고 정리한다.`,
        );
      }
    }
    throw error;
  }
}
