import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { listFiles, sameFile } from "./files.ts";

/** 템플릿 루트의 template.json. verify-templates가 템플릿 종류에 맞게 검사하는 데 쓴다. */
export interface TemplateManifest {
  readonly name: string;
  readonly kind: "backend" | "frontend";
  /** 명령 어휘를 실행하는 도구. pnpm은 package.json scripts를, uv는 FastAPI 사이클에서 정한 실행기를 본다. */
  readonly runner: "pnpm" | "uv";
  /** 골든 모듈 경로(템플릿 루트 기준). 예: src/modules/posts */
  readonly goldenModule: string;
}

/** 공유 자산 원본과, 그 사본이 들어갈 템플릿 안의 경로. */
export interface SharedAsset {
  readonly source: string;
  /** 생략하면 통째로 교체한다. 덮어 놓기는 원본 파일만 같은 상대 경로에 덮는다. */
  readonly mode?: "overlay";
  /** pnpm sync가 누적하는 원본 파일 경로. 지운 파일도 남겨 낡은 사본을 찾는다. */
  readonly managedFiles?: readonly string[];
  readonly targets: readonly { readonly template: string; readonly path: string }[];
}

export interface SharedAssetsManifest {
  readonly assets: readonly SharedAsset[];
}

export const BASE_COMMANDS = ["setup", "dev", "check", "fix", "test", "test:e2e", "gen"];
export const BACKEND_COMMANDS = ["db:migrate", "db:reset", "e2e:serve"];

export function requiredCommands(manifest: TemplateManifest): string[] {
  return manifest.kind === "backend" ? [...BASE_COMMANDS, ...BACKEND_COMMANDS] : BASE_COMMANDS;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** template.json을 읽고 형식을 검사한다. 문제가 있으면 문제 목록을 돌려준다. */
export function readTemplateManifest(dir: string): TemplateManifest | string[] {
  const path = join(dir, "template.json");
  if (!existsSync(path))
    return ["template.json이 없다. name, kind, runner, goldenModule을 적는다."];
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(raw)) return ["template.json은 객체여야 한다."];
  const problems: string[] = [];
  if (typeof raw.name !== "string") problems.push("template.json의 name은 문자열이어야 한다.");
  if (raw.kind !== "backend" && raw.kind !== "frontend") {
    problems.push('template.json의 kind는 "backend" 또는 "frontend"여야 한다.');
  }
  if (raw.runner !== "pnpm" && raw.runner !== "uv") {
    problems.push('template.json의 runner는 "pnpm" 또는 "uv"여야 한다.');
  }
  if (typeof raw.goldenModule !== "string") {
    problems.push("template.json의 goldenModule은 문자열이어야 한다.");
  }
  return problems.length > 0 ? problems : (raw as unknown as TemplateManifest);
}

/** child가 parent 안쪽이면 true. parent 자신이면 false다. */
function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/** templates/ 바로 아래 폴더 이름 하나인지 본다. Windows는 "C:"를 드라이브로 풀므로 ":"도 막는다. */
function isTemplateName(name: string): boolean {
  return name !== "" && name !== "." && name !== ".." && !/[\\/:]/.test(name);
}

/**
 * 공유 자산 사본의 절대 경로. templates/<template>/ 안쪽일 때만 돌려준다. 덮어 놓기는 루트도 허용한다.
 * manifest 검사와 pnpm sync가 함께 쓰는 가드라, 검사를 거치지 않은 manifest로도 템플릿 밖을 지우지 못한다.
 */
export function copyPath(
  repoRoot: string,
  template: string,
  path: string,
  overlay = false,
): string | undefined {
  if (!isTemplateName(template) || isAbsolute(path)) return undefined;
  const templates = resolve(repoRoot, "templates");
  const base = resolve(templates, template);
  // 이름 규칙과 별개로, 템플릿 폴더가 정말 templates/ 바로 아래로 풀렸는지 다시 본다.
  if (dirname(base) !== templates) return undefined;
  const destination = resolve(base, path);
  return isInside(base, destination) || (overlay && destination === base) ? destination : undefined;
}

/** 공유 자산 원본의 절대 경로. 저장소 안이면서 templates/ 밖인 상대 경로일 때만 돌려준다. */
export function sourcePath(repoRoot: string, source: string): string | undefined {
  if (isAbsolute(source)) return undefined;
  const root = resolve(repoRoot);
  const location = resolve(root, source);
  const templates = resolve(root, "templates");
  // relative로 비교해야 Windows에서 대소문자만 다른 "Templates"도 templates/로 본다.
  const inTemplates = relative(templates, location) === "" || isInside(templates, location);
  return isInside(root, location) && !inTemplates ? location : undefined;
}

function sourceProblems(repoRoot: string, source: unknown, at: string): string[] {
  const rule = `${at}: 저장소 안이면서 templates/ 밖인 상대 경로를 적는다.`;
  if (typeof source !== "string") return [rule];
  const location = sourcePath(repoRoot, source);
  if (location === undefined) return [rule];
  return existsSync(location)
    ? []
    : [`${at}: ${source}가 없다. 저장소에 있는 파일이나 폴더를 적는다.`];
}

function targetProblems(repoRoot: string, target: unknown, at: string, overlay: boolean): string[] {
  if (!isRecord(target)) return [`${at}: { "template", "path" } 꼴의 객체여야 한다.`];
  const { template, path } = target;
  if (typeof template !== "string" || !isTemplateName(template)) {
    return [
      `${at}.template: templates/ 바로 아래 폴더 이름 하나를 적는다. 빈 값, ".", "..", 그리고 "/", "\\", ":" 같은 구분자는 안 된다.`,
    ];
  }
  if (typeof path === "string" && copyPath(repoRoot, template, path, overlay) !== undefined)
    return [];
  if (overlay)
    return [
      `${at}.path: 템플릿 밖의 경로다 — 템플릿 안의 상대 경로(templates/${template}/)를 적는다. 루트 값은 "."이다.`,
    ];
  return [
    `${at}.path: templates/${template}/ 안쪽의 상대 경로를 적는다. 빈 값, ".", 절대 경로, 템플릿 밖으로 나가는 경로는 안 된다.`,
  ];
}

function assetProblems(repoRoot: string, asset: unknown, at: string): string[] {
  if (!isRecord(asset)) return [`${at}: { "source", "targets" } 꼴의 객체여야 한다.`];
  const problems = sourceProblems(repoRoot, asset.source, `${at}.source`);
  if (asset.mode !== undefined && asset.mode !== "overlay") {
    problems.push(
      `${at}.mode: 알 수 없는 복사 방식이다 — mode 값을 빼거나 덮어 놓기 값("overlay")을 적는다.`,
    );
  }
  if (asset.mode === "overlay" && problems.length === 0 && typeof asset.source === "string") {
    if (!statSync(join(repoRoot, asset.source)).isDirectory()) {
      problems.push(`${at}.source: 덮어 놓기 원본이 폴더가 아니다 — 원본 폴더를 적는다.`);
    } else if (linkedPath(repoRoot, join(repoRoot, asset.source)) !== undefined) {
      problems.push(`${at}.source: ${asset.source} 원본 경로에 링크가 있다 — 일반 폴더를 적는다.`);
    }
  }
  if (asset.managedFiles !== undefined) {
    if (asset.mode !== "overlay" || !Array.isArray(asset.managedFiles)) {
      problems.push(
        `${at}.managedFiles: 삭제 기록 형식이 틀렸다 — overlay 항목에 파일 경로 배열을 적는다.`,
      );
    } else {
      for (const [index, file] of (asset.managedFiles as unknown[]).entries()) {
        if (!isManagedFile(file))
          problems.push(
            `${at}.managedFiles[${String(index)}]: 안전한 파일 경로가 아니다 — node_modules를 뺀 슬래시 구분 상대 파일 경로를 적는다.`,
          );
      }
    }
  }
  if (!Array.isArray(asset.targets)) return [...problems, `${at}.targets: 배열이어야 한다.`];
  return [
    ...problems,
    ...(asset.targets as unknown[]).flatMap((target, index) =>
      targetProblems(repoRoot, target, `${at}.targets[${String(index)}]`, asset.mode === "overlay"),
    ),
  ];
}

/** 공유 자산 manifest의 형식과 경로 규칙을 검사한다. 문제마다 항목 위치(예: assets[0].targets[1].path)를 붙인다. */
export function sharedAssetsProblems(repoRoot: string, manifest: unknown): string[] {
  if (!isRecord(manifest) || !Array.isArray(manifest.assets)) {
    return ['{ "assets": [...] } 꼴의 객체여야 한다.'];
  }
  const problems = (manifest.assets as unknown[]).flatMap((asset, index) =>
    assetProblems(repoRoot, asset, `assets[${String(index)}]`),
  );
  return problems.length > 0
    ? problems
    : writeProblems(repoRoot, manifest as unknown as SharedAssetsManifest);
}

/** 기록은 운영체제와 관계없이 정규화된 상대 파일 경로만 받는다. */
function isManagedFile(file: unknown): file is string {
  return (
    typeof file === "string" &&
    !/[\\:]/.test(file) &&
    file
      .split("/")
      .every((part) => part !== "" && part !== "." && part !== ".." && part !== "node_modules")
  );
}

/** 덮어 놓기는 캐시를 포함해 모든 원본 파일을 복사한다. 설치물만 뺀다. */
export function overlayFiles(repoRoot: string, asset: SharedAsset): string[] {
  return listFiles(join(repoRoot, asset.source), new Set(["node_modules"]));
}

/** 원본 파일과 삭제 기록을 합친 관리 범위. 기록은 템플릿에 복사하지 않는다. */
export function managedFiles(repoRoot: string, asset: SharedAsset): string[] {
  return [...new Set([...overlayFiles(repoRoot, asset), ...(asset.managedFiles ?? [])])].sort();
}

function linkedPath(repoRoot: string, location: string): string | undefined {
  let path = location;
  while (isInside(resolve(repoRoot), path)) {
    if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) return path;
    path = dirname(path);
  }
  return undefined;
}

/** 링크를 따라 쓰거나 폴더 전체를 덮지 않도록 모든 대상 파일을 미리 검사한다. */
function overlayDestinationProblems(
  repoRoot: string,
  destination: string,
  current: boolean,
  source: string,
  recorded = true,
): string[] {
  let path = destination;
  while (isInside(resolve(repoRoot), path)) {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink())
      return [
        `${relative(repoRoot, path).replaceAll("\\", "/")}: 대상에 링크가 있다 — 일반 폴더나 파일로 바꾼 뒤 pnpm sync한다.`,
      ];
    if (path === destination && current && stat?.isDirectory())
      return [
        `${relative(repoRoot, path).replaceAll("\\", "/")}: 사본 파일 자리에 폴더가 있다 — 앱 파일을 옮기고 원본(${source})을 고친 뒤 pnpm sync한다.`,
      ];
    path = dirname(path);
  }
  if (
    current &&
    !recorded &&
    lstatSync(destination, { throwIfNoEntry: false })?.isFile() &&
    !lstatSync(join(repoRoot, source)).isSymbolicLink() &&
    !sameFile(join(repoRoot, source), destination)
  ) {
    return [
      `${relative(repoRoot, destination).replaceAll("\\", "/")}: 앱 파일 자리에 새 원본(${source})을 쓸 수 없다 — 앱 파일을 옮기거나 원본과 같은 내용으로 맞춘 뒤 pnpm sync한다.`,
    ];
  }
  return [];
}

function writeProblems(repoRoot: string, manifest: SharedAssetsManifest): string[] {
  const problems: string[] = [];
  const writes: { path: string; owner: string }[] = [];
  for (const [index, asset] of manifest.assets.entries()) {
    const files = asset.mode === "overlay" ? managedFiles(repoRoot, asset) : [""];
    const current = new Set(asset.mode === "overlay" ? overlayFiles(repoRoot, asset) : []);
    const recorded = new Set(asset.managedFiles ?? []);
    const byCase = new Map<string, string>();
    for (const file of files) {
      const previous = byCase.get(file.toLowerCase());
      if (previous !== undefined && previous !== file) {
        problems.push(
          `assets[${String(index)}].managedFiles: 대소문자만 다른 경로가 있다(${previous}, ${file}) — 옛 경로의 사본을 지우고 managedFiles에서 뺀 뒤 pnpm sync한다.`,
        );
      }
      byCase.set(file.toLowerCase(), file);
    }
    if (byCase.size !== files.length) continue;
    for (const file of current) {
      const source = join(repoRoot, asset.source, file);
      if (lstatSync(source).isSymbolicLink())
        problems.push(
          `${asset.source}/${file}: 원본 파일에 링크가 있다 — 일반 파일로 바꾼 뒤 pnpm sync한다.`,
        );
    }
    for (const [targetIndex, target] of asset.targets.entries()) {
      const base = copyPath(repoRoot, target.template, target.path, asset.mode === "overlay");
      if (base === undefined) continue;
      const owner = `assets[${String(index)}].targets[${String(targetIndex)}]`;
      if (asset.mode === "overlay") {
        problems.push(...overlayDestinationProblems(repoRoot, base, false, asset.source));
      }
      for (const file of files) {
        const path = resolve(base, file);
        for (const previous of writes) {
          if (
            relative(previous.path, path) === "" ||
            isInside(previous.path, path) ||
            isInside(path, previous.path)
          ) {
            if (previous.owner !== owner)
              problems.push(
                `${owner}: 쓰기 경로가 겹친다(${previous.owner}, ${relative(repoRoot, path).replaceAll("\\", "/")}) — 한 항목만 쓰도록 경로를 나눈다.`,
              );
          }
        }
        writes.push({ path, owner });
        if (asset.mode === "overlay")
          problems.push(
            ...overlayDestinationProblems(
              repoRoot,
              path,
              current.has(file),
              `${asset.source.replaceAll("\\", "/")}/${file}`,
              recorded.has(file),
            ),
          );
      }
    }
  }
  return problems;
}

/** scripts/shared-assets.json을 읽고 검사한다. 문제가 있으면 문제 목록을 돌려준다. */
export function readSharedAssets(repoRoot: string): SharedAssetsManifest | string[] {
  const path = join(repoRoot, "scripts", "shared-assets.json");
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  const problems = sharedAssetsProblems(repoRoot, raw);
  return problems.length > 0 ? problems : (raw as SharedAssetsManifest);
}
