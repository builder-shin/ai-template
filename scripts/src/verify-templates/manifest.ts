import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

export function readSharedAssets(repoRoot: string): SharedAssetsManifest {
  const path = join(repoRoot, "scripts", "shared-assets.json");
  return JSON.parse(readFileSync(path, "utf8")) as SharedAssetsManifest;
}
