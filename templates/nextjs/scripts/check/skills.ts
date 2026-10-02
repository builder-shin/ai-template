import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sources from "../skills/sources.json";
import { readProjectFiles } from "./files";

export type SkillSource = {
  name: string;
  package: string;
  version: string;
  url: string;
  commit: string | null;
  installedDirectory: string | null;
  files: Record<string, string>;
  fileUrls?: Record<string, string>;
};

export const officialSkills: readonly SkillSource[] = sources;

export const skillDigest = (text: string) =>
  createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");

function compare(
  actual: Record<string, string>,
  expected: Record<string, string>,
  prefix: string,
): string[] {
  const problems: string[] = [];
  for (const name of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
    const message = !(name in actual)
      ? "파일이 없다"
      : !(name in expected)
        ? "원본에 없는 파일이다"
        : skillDigest(actual[name]!) !== expected[name]
          ? "고정 원본과 다르다"
          : null;
    if (message)
      problems.push(
        `${prefix}${name}:1 skill-copy — ${message}. pnpm skills:sync으로 복원하고 추가 파일은 지운다.`,
      );
  }
  return problems;
}

export function checkSkillCopies(
  files: Record<string, string>,
  pinned: readonly SkillSource[] = officialSkills,
): string[] {
  return pinned.flatMap((source) => {
    const prefix = `.claude/skills/${source.name}/`;
    const actual = Object.fromEntries(
      Object.entries(files)
        .filter(([path]) => path.startsWith(prefix))
        .map(([path, text]) => [path.slice(prefix.length), text]),
    );
    return compare(actual, source.files, prefix);
  });
}

export function checkInstalledSkill(
  source: SkillSource,
  version: string | null,
  installed: Record<string, string>,
): string[] {
  if (version !== source.version)
    return [
      `node_modules/${source.package}/package.json:1 skill-source — ${source.package}@${source.version}이 필요하다. pnpm install --frozen-lockfile을 실행한다.`,
    ];
  return source.installedDirectory
    ? compare(
        installed,
        source.files,
        `node_modules/${source.package}/${source.installedDirectory}/`,
      )
    : [];
}

/** 복사한 프로젝트의 패키지만 찾는다. git과 네트워크는 쓰지 않는다. */
export function installedSkill(
  root: string,
  source: SkillSource,
): { version: string | null; files: Record<string, string> } {
  // exports로 숨긴 package.json도 읽으며 상위 프로젝트로 탐색하지 않는다.
  const packagePath = join(root, "node_modules", source.package, "package.json");
  if (!existsSync(packagePath)) return { version: null, files: {} };
  const metadata: { version: string } = JSON.parse(readFileSync(packagePath, "utf8"));
  const folder = source.installedDirectory && join(dirname(packagePath), source.installedDirectory);
  return {
    version: metadata.version,
    files: folder && existsSync(folder) ? readProjectFiles(folder) : {},
  };
}

/** 프로젝트 파일에서 제외한 설치 버전과 skill 원문도 캐시 입력으로 쓴다. */
export function installedSkillState(root: string): Record<string, string> {
  const state: Record<string, string> = {};
  for (const source of officialSkills) {
    const installed = installedSkill(root, source);
    state["node_modules/" + source.package + "/package.json"] = JSON.stringify(installed.version);
    if (source.installedDirectory) {
      const prefix = "node_modules/" + source.package + "/" + source.installedDirectory + "/";
      for (const [name, text] of Object.entries(installed.files))
        state[prefix + name] = skillDigest(text);
    }
  }
  return state;
}

export function checkOfficialSkills(root: string, files: Record<string, string>): string[] {
  return [
    ...checkSkillCopies(files),
    ...officialSkills.flatMap((source) => {
      const installed = installedSkill(root, source);
      return checkInstalledSkill(source, installed.version, installed.files);
    }),
  ];
}
