import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "./manifest.ts";
import { parse } from "yaml";
import { isDeepStrictEqual } from "node:util";

function versions(file: string) {
  const pkg: unknown = JSON.parse(readFileSync(file, "utf8"));
  const result = new Map<string, { section: string; version: unknown }[]>();
  if (!isRecord(pkg)) return result;
  const sections = {
    dependencies: pkg.dependencies,
    devDependencies: pkg.devDependencies,
    overrides: pkg.overrides,
    "pnpm.overrides": isRecord(pkg.pnpm) ? pkg.pnpm.overrides : undefined,
  };
  for (const [section, entries] of Object.entries(sections)) {
    if (!isRecord(entries)) continue;
    for (const [name, version] of Object.entries(entries)) {
      const values = result.get(name) ?? [];
      values.push({ section, version });
      result.set(name, values);
    }
  }
  return result;
}

/** 앱에만 필요한 의존성은 허용하고 공통 패키지의 모든 선언을 비교한다. */
export function verifyFrontendDependencies(repoRoot: string): string[] {
  const files = ["nextjs", "nextjs-admin"].map((name) =>
    join(repoRoot, "templates", name, "package.json"),
  );
  if (files.some((file) => !existsSync(file))) return [];
  const [web, admin] = [versions(files[0] ?? ""), versions(files[1] ?? "")] as const;
  const problems: string[] = [];
  for (const [name, left] of web) {
    const right = admin.get(name);
    if (!right) continue;
    for (const a of left)
      for (const b of right) {
        if (a.section.includes("overrides") !== b.section.includes("overrides")) continue;
        if (JSON.stringify(a.version) === JSON.stringify(b.version)) continue;
        problems.push(
          `${name}: nextjs ${a.section}=${JSON.stringify(a.version)}, nextjs-admin ${b.section}=${JSON.stringify(b.version)} — 두 package.json의 공통 의존성을 같은 버전으로 고치고 잠금 파일을 갱신한다.`,
        );
      }
  }
  const workspaceFiles = ["nextjs", "nextjs-admin"].map((name) =>
    join(repoRoot, "templates", name, "pnpm-workspace.yaml"),
  );
  if (workspaceFiles.every((file) => existsSync(file))) {
    const [left, right] = workspaceFiles.map(
      (file) => parse(readFileSync(file, "utf8")) as Record<string, unknown>,
    );
    for (const key of ["minimumReleaseAge", "allowBuilds", "overrides"])
      if (!isDeepStrictEqual(left?.[key], right?.[key]))
        problems.push(
          `${key}: nextjs=${JSON.stringify(left?.[key])}, nextjs-admin=${JSON.stringify(right?.[key])} — 두 pnpm-workspace.yaml의 설정을 맞추고 잠금 파일을 갱신한다.`,
        );
  }
  return problems;
}

/** 백엔드와 각 프론트의 공통 직접 의존성과 설치 정책을 비교한다. */
export function verifyBackendDependencies(repoRoot: string): string[] {
  const names = ["nestjs", "nextjs", "nextjs-admin"];
  const files = names.map((name) => join(repoRoot, "templates", name, "package.json"));
  if (files.some((file) => !existsSync(file))) return [];
  const backend = versions(files[0] ?? "");
  const problems: string[] = [];
  for (const [index, frontend] of names.slice(1).entries()) {
    const declarations = versions(files[index + 1] ?? "");
    for (const [name, left] of backend) {
      const right = declarations.get(name);
      if (!right) continue;
      for (const a of left)
        for (const b of right) {
          if (a.section.includes("overrides") || b.section.includes("overrides")) continue;
          if (isDeepStrictEqual(a.version, b.version)) continue;
          problems.push(
            `${name}: nestjs ${a.section}=${JSON.stringify(a.version)}, ${frontend} ${b.section}=${JSON.stringify(b.version)} — 백엔드와 프론트의 공통 의존성을 같은 버전으로 고치고 잠금 파일을 갱신한다.`,
          );
        }
    }
  }
  const workspaceFiles = names.map((name) =>
    join(repoRoot, "templates", name, "pnpm-workspace.yaml"),
  );
  if (workspaceFiles.every((file) => existsSync(file))) {
    const workspaces = workspaceFiles.map(
      (file) => parse(readFileSync(file, "utf8")) as Record<string, unknown>,
    );
    const backendWorkspace = workspaces[0];
    for (const [index, frontend] of names.slice(1).entries()) {
      const workspace = workspaces[index + 1];
      for (const key of ["minimumReleaseAge", "overrides"])
        if (!isDeepStrictEqual(backendWorkspace?.[key], workspace?.[key]))
          problems.push(
            `${key}: nestjs=${JSON.stringify(backendWorkspace?.[key])}, ${frontend}=${JSON.stringify(workspace?.[key])} — pnpm-workspace.yaml의 설정을 맞추고 잠금 파일을 갱신한다.`,
          );
      const left = backendWorkspace?.allowBuilds;
      const right = workspace?.allowBuilds;
      if (isRecord(left) && isRecord(right))
        for (const [key, value] of Object.entries(left))
          if (Object.hasOwn(right, key) && !isDeepStrictEqual(value, right[key]))
            problems.push(
              `allowBuilds.${key}: nestjs=${JSON.stringify(value)}, ${frontend}=${JSON.stringify(right[key])} — 같은 키의 빌드 허용 값을 맞춘다`,
            );
    }
  }
  return problems;
}
