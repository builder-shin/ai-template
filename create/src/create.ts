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
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { CreateOptions } from "./arguments.ts";
import { CreateError } from "./errors.ts";
import { initializeGit, runGit } from "./git.ts";
import { templateFiles } from "./repository.ts";
import { renameStandalone } from "./standalone.ts";

function canonicalPath(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  return join(canonicalPath(dirname(path)), relative(dirname(path), path));
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

function validateTarget(target: string, repository: string): void {
  if (inside(resolve(target), repository) || inside(canonicalPath(target), repository)) {
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
}

export function createProject(options: CreateOptions, repository: string): CreateResult {
  const root = realpathSync(repository);
  validateTarget(options.target, root);
  const files = templateFiles(root, options.template);
  const sha = runGit(root, ["rev-parse", "--short", "HEAD"]).trim();
  const parent = dirname(options.target);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(join(parent, `aitpl-${options.name}-`));
  let moved = false;
  try {
    for (const file of files) {
      const destination = join(staging, file.path);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(root, "templates", options.template, file.path), destination);
      if (process.platform !== "win32") chmodSync(destination, file.executable ? 0o755 : 0o644);
    }
    renameStandalone(staging, options.template, options.name);
    // 생성 중 다른 프로세스가 대상을 채웠다면 덮어쓰지 않는다.
    validateTarget(options.target, root);
    if (existsSync(options.target)) rmdirSync(options.target);
    renameSync(staging, options.target);
    moved = true;
    const committed = options.git ? initializeGit(options.target, options.name, sha) : false;
    return { target: options.target, committed };
  } catch (error) {
    rmSync(moved ? options.target : staging, { recursive: true, force: true });
    throw error;
  }
}
