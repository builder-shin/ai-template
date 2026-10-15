import type { Backend } from "./backends.ts";
import { CreateError } from "./errors.ts";
export interface AssetEdit {
  readonly find: string;
  readonly replace: string;
}
export const NESTJS_ASSET_EDITS: Readonly<Record<string, readonly AssetEdit[]>> = {
  ".github/workflows/ci.yml": [
    {
      find: '      - uses: astral-sh/setup-uv@c18668ad3cf93ea998bef934396af7bb5c839dc7 # v10.2.0\n        with:\n          version: "0.12.19"\n          working-directory: apps/api\n',
      replace: "",
    },
    { find: "docker build apps/api", replace: "docker build -f apps/api/Dockerfile ." },
  ],
  "scripts/apps.mjs": [
    {
      find: "export function appNames(root) {",
      replace:
        'export function backendOf(apiFolder) {\n  return existsSync(join(apiFolder, "pyproject.toml")) ? "fastapi" : "nestjs";\n}\n\nexport function appNames(root) {',
    },
  ],
  "scripts/setup.mjs": [
    {
      find: 'import { resolve } from "node:path";',
      replace: 'import { join, resolve } from "node:path";',
    },
    {
      find: 'import { frontendNames } from "./apps.mjs";',
      replace: 'import { backendOf, frontendNames } from "./apps.mjs";',
    },
    {
      find: '    ["uv", "uv"],',
      replace: '    ...(backendOf(join(root, "apps/api")) === "fastapi" ? [["uv", "uv"]] : []),',
    },
  ],
  "scripts/frontend-e2e.mjs": [
    {
      find: 'import { resolve } from "node:path";',
      replace:
        'import { join, resolve } from "node:path";\nimport { backendOf } from "./apps.mjs";',
    },
    {
      find: "export function frontendEnvironment(app, source) {",
      replace:
        'export function frontendEnvironment(\n  app,\n  source,\n  backend = backendOf(resolve(import.meta.dirname, "../apps/api")),\n) {',
    },
    { find: 'E2E_TARGET: "fastapi",', replace: "E2E_TARGET: backend," },
    {
      find: "env: frontendEnvironment(app, source),",
      replace: 'env: frontendEnvironment(app, source, backendOf(join(root, "apps/api"))),',
    },
  ],
  "scripts/runners.test.mjs": [
    {
      find: '      ["--version"],\n      ["--version"],\n      ["--version"],',
      replace: '      ["--version"],\n      ["--version"],',
    },
    {
      find: 'for (const tool of ["pnpm", "uv", "docker"])',
      replace: 'for (const tool of ["pnpm", "docker"])',
    },
    {
      find: 'assert.equal(env.E2E_TARGET, "fastapi");',
      replace: 'assert.equal(env.E2E_TARGET, "nestjs");',
    },
  ],
  "README.md": [
    {
      find: "FastAPI와 Next.js BFF 조합 프로젝트다. Node 24, pnpm 12.6.0, uv와 Docker가 필요하다.",
      replace: "NestJS와 Next.js BFF 조합 프로젝트다. Node 24, pnpm 12.6.0과 Docker가 필요하다.",
    },
  ],
  "AGENTS.md": [
    {
      find: "FastAPI와 Next.js BFF를 함께 개발하는 프로젝트다. Node 24, pnpm 12.6.0과 uv를 쓴다.",
      replace: "NestJS와 Next.js BFF를 함께 개발하는 프로젝트다. Node 24와 pnpm 12.6.0을 쓴다.",
    },
    {
      find: "FastAPI api·worker·scheduler, Python 잠금 파일, 개발 인프라",
      replace: "NestJS api·worker·scheduler, Prisma와 개발 인프라",
    },
    { find: "프론트 FastAPI E2E", replace: "프론트 NestJS E2E" },
    { find: "실제 연결은 FastAPI E2E가 확인한다.", replace: "실제 연결은 NestJS E2E가 확인한다." },
    { find: "Docker·uv·프록시", replace: "Docker·프록시" },
    {
      find: "- 프론트 잠금 파일의 앱 importer는",
      replace:
        "- API·프론트는 루트 잠금 파일 하나를 공유한다. 프론트 해석을 먼저 검증하고 API 잠금을 병합한 뒤 frozen 설치 전후로 모든 원본을 검증한다. API 빌드 정책은 충돌 없는 합집합이다. 생성 뒤 의존성 변경은 프로젝트가 소유하며 전체 check·빌드로 검증한다.\n- 프론트 잠금 파일의 앱 importer는",
    },
  ],
};
export function applyAssetEdits(path: string, text: string, backend: Backend): string {
  if (backend === "fastapi") return text;
  for (const { find, replace } of NESTJS_ASSET_EDITS[path] ?? []) {
    if (text.split(find).length !== 2)
      throw new CreateError(
        `자산 편집 기준이 바뀌었다: ${path}`,
        "조합 자산과 정확한 편집 표를 함께 검토한다.",
      );
    text = text.replace(find, replace);
  }
  return text;
}
