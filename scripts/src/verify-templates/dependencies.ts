import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "./manifest.ts";

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
  return problems;
}
