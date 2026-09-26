import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { Step } from "./run-steps.ts";

export interface PackageJson {
  readonly name?: string;
  readonly scripts?: Readonly<Record<string, string>>;
}

export function readPackageJson(dir: string): PackageJson {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as PackageJson;
}

/** 루트 package.json의 `check:*` 스크립트를 선언 순서대로 단계로 만든다. */
export function rootSteps(rootDir: string, pkg: PackageJson): Step[] {
  return Object.keys(pkg.scripts ?? {})
    .filter((script) => script.startsWith("check:"))
    .map((script) => ({
      name: script.slice("check:".length),
      command: `pnpm run -s ${script}`,
      cwd: rootDir,
    }));
}

/** pnpm-workspace.yaml의 packages 패턴을 디렉터리 목록으로 푼다. `dir`과 `dir/*`만 지원한다. */
export function workspacePackageDirs(rootDir: string): string[] {
  const workspace = parse(readFileSync(join(rootDir, "pnpm-workspace.yaml"), "utf8")) as {
    packages?: string[];
  };
  const dirs: string[] = [];
  for (const pattern of workspace.packages ?? []) {
    if (pattern.endsWith("/*")) {
      const parent = join(rootDir, pattern.slice(0, -2));
      if (!existsSync(parent)) continue;
      const names = readdirSync(parent, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      for (const name of names) {
        if (existsSync(join(parent, name, "package.json"))) dirs.push(join(parent, name));
      }
    } else if (pattern.includes("*")) {
      throw new Error(`지원하지 않는 workspace 패턴: ${pattern}. 'dir' 또는 'dir/*' 형태만 쓴다.`);
    } else if (existsSync(join(rootDir, pattern, "package.json"))) {
      dirs.push(join(rootDir, pattern));
    }
  }
  return dirs;
}

/** check 스크립트가 있는 워크스페이스 패키지마다 단계를 하나씩 만든다. */
export function packageSteps(dirs: readonly string[]): Step[] {
  return dirs.flatMap((dir) => {
    const pkg = readPackageJson(dir);
    if (pkg.scripts?.check === undefined) return [];
    return [{ name: pkg.name ?? dir, command: "pnpm run -s check", cwd: dir }];
  });
}

/** 루트 `check:*` 단계를 먼저, 워크스페이스 패키지의 `check` 단계를 이어서 돌린다. */
export function discoverSteps(rootDir: string): Step[] {
  const root = rootSteps(rootDir, readPackageJson(rootDir));
  return [...root, ...packageSteps(workspacePackageDirs(rootDir))];
}
