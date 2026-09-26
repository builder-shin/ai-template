import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

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
  readonly targets: readonly { readonly template: string; readonly path: string }[];
}

export interface SharedAssetsManifest {
  readonly assets: readonly SharedAsset[];
}

export const BASE_COMMANDS = ["setup", "dev", "check", "fix", "test", "test:e2e", "gen"];
export const BACKEND_COMMANDS = ["db:migrate", "db:reset"];

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

/** templates/ 바로 아래 폴더 이름 하나인지 본다. 빈 값, ".", "..", 경로 구분자는 안 된다. */
function isTemplateName(name: string): boolean {
  return name !== "" && name !== "." && name !== ".." && !/[\\/]/.test(name);
}

/**
 * 공유 자산 사본의 절대 경로. templates/<template>/ 안쪽(템플릿 루트 자체는 제외)일 때만 돌려준다.
 * manifest 검사와 pnpm sync가 함께 쓰는 가드라, 검사를 거치지 않은 manifest로도 템플릿 밖을 지우지 못한다.
 */
export function copyPath(repoRoot: string, template: string, path: string): string | undefined {
  if (!isTemplateName(template) || isAbsolute(path)) return undefined;
  const base = resolve(repoRoot, "templates", template);
  const destination = resolve(base, path);
  return isInside(base, destination) ? destination : undefined;
}

/** 공유 자산 원본의 절대 경로. 저장소 안이면서 templates/ 밖인 상대 경로일 때만 돌려준다. */
export function sourcePath(repoRoot: string, source: string): string | undefined {
  if (isAbsolute(source)) return undefined;
  const root = resolve(repoRoot);
  const location = resolve(root, source);
  const templates = resolve(root, "templates");
  const inTemplates = location === templates || isInside(templates, location);
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

function targetProblems(repoRoot: string, target: unknown, at: string): string[] {
  if (!isRecord(target)) return [`${at}: { "template", "path" } 꼴의 객체여야 한다.`];
  const { template, path } = target;
  if (typeof template !== "string" || !isTemplateName(template)) {
    return [
      `${at}.template: templates/ 바로 아래 폴더 이름 하나를 적는다. 빈 값, ".", "..", 경로 구분자는 안 된다.`,
    ];
  }
  if (typeof path === "string" && copyPath(repoRoot, template, path) !== undefined) return [];
  return [
    `${at}.path: templates/${template}/ 안쪽의 상대 경로를 적는다. 빈 값, ".", 절대 경로, 템플릿 밖으로 나가는 경로는 안 된다.`,
  ];
}

function assetProblems(repoRoot: string, asset: unknown, at: string): string[] {
  if (!isRecord(asset)) return [`${at}: { "source", "targets" } 꼴의 객체여야 한다.`];
  const problems = sourceProblems(repoRoot, asset.source, `${at}.source`);
  if (!Array.isArray(asset.targets)) return [...problems, `${at}.targets: 배열이어야 한다.`];
  return [
    ...problems,
    ...(asset.targets as unknown[]).flatMap((target, index) =>
      targetProblems(repoRoot, target, `${at}.targets[${String(index)}]`),
    ),
  ];
}

/** 공유 자산 manifest의 형식과 경로 규칙을 검사한다. 문제마다 항목 위치(예: assets[0].targets[1].path)를 붙인다. */
export function sharedAssetsProblems(repoRoot: string, manifest: unknown): string[] {
  if (!isRecord(manifest) || !Array.isArray(manifest.assets)) {
    return ['{ "assets": [...] } 꼴의 객체여야 한다.'];
  }
  return (manifest.assets as unknown[]).flatMap((asset, index) =>
    assetProblems(repoRoot, asset, `assets[${String(index)}]`),
  );
}

/** scripts/shared-assets.json을 읽고 검사한다. 문제가 있으면 문제 목록을 돌려준다. */
export function readSharedAssets(repoRoot: string): SharedAssetsManifest | string[] {
  const path = join(repoRoot, "scripts", "shared-assets.json");
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  const problems = sharedAssetsProblems(repoRoot, raw);
  return problems.length > 0 ? problems : (raw as SharedAssetsManifest);
}
