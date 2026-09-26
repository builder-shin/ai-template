# 기반(하위 프로젝트 0) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네 템플릿이 함께 쓸 기반을 만든다. JSON:API 플랫폼 계약(TypeSpec → OpenAPI 3.1), API 스타일 룰셋, 적합성 테스트 틀, 하네스 표준과 그 검사 도구, 저장소 CI가 여기에 들어간다.

**Architecture:** pnpm 12 워크스페이스에 패키지 네 개(`contract/typespec`, `contract/api-style`, `contract/conformance`, `scripts`)를 둔다. 계약은 TypeSpec 원본을 `contract/openapi.yaml`로 컴파일해 커밋하고, 룰셋·적합성 테스트·구조 비교 도구는 모두 이 파일을 기준으로 삼는다. 루트 `pnpm check`는 루트의 `check:*` 스크립트와 패키지마다의 `check`를 찾아 돌리는 실행기이고, 이 저장소의 완료 기준이다.

**Tech Stack:** Node 24, pnpm 12.6.0, TypeScript 6.0.3, TypeSpec 1.16.0, @redocly/openapi-core 2.54.2, openapi-typescript 7.13.0, openapi-fetch 0.17.0, Vitest 5.0.1, ESLint 10.11.0과 typescript-eslint 8.70.1, Prettier 3.9.9, tsx 4.23.15, yaml 2.9.1, lefthook 2.1.14, oasdiff 1.32.1, Betterleaks 1.8.1

**Spec:** `docs/superpowers/specs/2026-09-26-ai-template-foundation-design.md` (§9가 이 계획의 범위다)

## Global Constraints

- 모든 의존성 버전은 정확히 고정한다(`^`, `~` 금지). pnpm 12는 `minimumReleaseAge` 기본값이 1440분이라 출시 후 하루가 안 된 버전은 설치를 거부한다. 버전을 올릴 때는 출시 후 하루가 지났는지 먼저 확인한다.
- 빌드 스크립트가 있는 의존성은 `pnpm-workspace.yaml`의 `allowBuilds`에 `true` 또는 `false`로 명시한다. 빠지면 pnpm 12가 `ERR_PNPM_IGNORED_BUILDS`로 설치를 멈춘다.
- pnpm 12에서 조용한 실행은 `pnpm run -s <스크립트>`로 쓴다. `pnpm -s <스크립트>`는 오류다.
- TypeScript는 `tsconfig.base.json`의 엄격 옵션을 끄지 않는다. 상대 import에는 `.ts` 확장자를 붙이고, `erasableSyntaxOnly` 때문에 enum, namespace, 생성자 매개변수 프로퍼티를 쓰지 않는다.
- 생성물은 직접 고치지 않는다: `contract/openapi.yaml`(TypeSpec 컴파일 결과), `contract/conformance/src/generated/api.ts`(openapi-typescript 결과). 원본을 고치고 `pnpm gen`을 돌린다.
- 파일 크기는 소스 400줄, 테스트 600줄 이하다(ESLint `max-lines`).
- 문서, 주석, 도구가 내는 메시지는 한국어로 쓰고 식별자는 영어로 쓴다. API 에러의 `title`·`detail`만 개발자용 영어다.
- 커밋 메시지에 AI 관련 태그(`Co-Authored-By: Claude …` 등)를 넣지 않는다.
- Windows에서는 저장소나 git worktree를 깊은 경로에 두지 않는다. 경로가 길면(약 100자 이상) pnpm 12의 재귀 실행(`pnpm -r`, 즉 `pnpm gen`과 `pnpm test`)이 작업 상태 파일을 쓰지 못해 실패한다.
- 각 단계의 명령은 저장소 루트에서 실행한다.
- 이 계획의 모든 파일과 명령은 2026-09-26에 빈 저장소에서 태스크 순서대로 재연해 검증했다. 기대 출력과 다르면 계획을 의심하기 전에 버전, 순서, 경로 길이를 먼저 확인한다.

## 사전 준비

- Node 24 이상, git, 네트워크(첫 `pnpm install`, Task 12·13의 도구 다운로드)가 필요하다.
- pnpm 11 이상이 있으면 `packageManager` 필드를 보고 12.6.0으로 자동 전환한다. pnpm이 없으면 `corepack enable`부터 한다.
- 작업 브랜치는 `feat/foundation`이다. 스펙은 이미 커밋돼 있다.

## 파일 구조

```
ai-template/
├── AGENTS.md, CLAUDE.md          # 템플릿 저장소 작업 규칙 (CLAUDE.md는 @AGENTS.md 한 줄)
├── package.json                  # 루트 스크립트: check, check:*, fix, test, gen, tool, spec-compare, sync
├── pnpm-workspace.yaml           # packages: contract/*, scripts / allowBuilds
├── tsconfig.base.json            # 모든 패키지가 extends하는 엄격한 TS 설정
├── eslint.config.js, .prettierrc.json, .prettierignore
├── .gitignore, .gitattributes, .editorconfig
├── lefthook.yml, .betterleaks.toml
├── .github/workflows/ci.yml
├── contract/
│   ├── openapi.yaml              # 생성물: TypeSpec 컴파일 결과
│   ├── typespec/                 # @ai-template/contract
│   │   ├── src/jsonapi.tsp       # JSON:API 문서 템플릿
│   │   ├── src/errors.tsp        # 에러 코드, 에러 문서, 에러 응답 alias
│   │   ├── src/realtime.tsp      # 실시간 이벤트 페이로드
│   │   ├── src/main.tsp          # 서비스 정의, import, x-realtime-* 확장
│   │   ├── src/resources/*.tsp   # health, roles, files, users, posts(골든), audit-logs, auth, sessions
│   │   ├── scripts/check-fresh.ts
│   │   └── test/*.test.ts        # 계약 내용 테스트 (test/spec.ts 헬퍼)
│   ├── api-style/                # @ai-template/api-style
│   │   ├── redocly.yaml, plugin.js, lint.js
│   │   ├── rules/*.js            # 순수 함수 규칙 8개 + util.js
│   │   └── test/                 # 픽스처와 규칙 테스트
│   └── conformance/              # @ai-template/conformance
│       ├── src/jsonapi/assertions.ts
│       ├── src/client.ts, src/targets.ts, src/side-channels.ts
│       ├── src/generated/api.ts  # 생성물
│       └── scripts/check-generated.ts
├── scripts/                      # @ai-template/scripts
│   ├── src/check/                # check 실행기
│   ├── src/tools/                # 고정 버전 바이너리 설치기(oasdiff, betterleaks)
│   ├── src/spec-compare/         # 계약 대비 이름·경로 비교, oasdiff breaking
│   ├── src/agents-md/            # AGENTS.md·CLAUDE.md 짝 검사
│   ├── src/verify-templates/     # 하네스 표준 검사
│   ├── src/sync/                 # 공유 자산 동기화
│   └── shared-assets.json
├── templates/.gitkeep
└── docs/
    ├── harness/standard.md
    └── conventions/jsonapi.md, error-codes.md
```

## 태스크 개요

| #   | 태스크                                          | 끝난 뒤 `pnpm check` |
| --- | ----------------------------------------------- | -------------------- |
| 1   | 저장소 뼈대와 루트 도구                         | 포맷·린트만          |
| 2   | check 실행기                                    | 3단계                |
| 3   | 계약 패키지와 JSON:API 핵심                     | 4단계                |
| 4   | API 스타일 룰셋 ① 본문·에러·요청 문서·type 규칙 | 5단계                |
| 5   | API 스타일 룰셋 ② 컬렉션·include·이름·camelCase | 5단계                |
| 6   | 계약: 사용자·역할·권한·파일                     | 5단계                |
| 7   | 계약: 골든 모듈 posts와 감사 로그               | 5단계                |
| 8   | 계약: 인증과 세션                               | 5단계                |
| 9   | 계약: 실시간 이벤트                             | 5단계                |
| 10  | 적합성 테스트 틀 ① JSON:API 검증기              | 6단계                |
| 11  | 적합성 테스트 틀 ② 타입 클라이언트·대상·부수 채널 | 6단계              |
| 12  | 고정 버전 도구 설치기와 커밋 hook               | 6단계                |
| 13  | 구조 비교 도구                                  | 6단계                |
| 14  | 지침 파일 검사기                                | 7단계                |
| 15  | 템플릿 검증기와 공유 자산 동기화                | 8단계                |
| 16  | 하네스 표준과 규약 문서                         | 8단계                |
| 17  | CI와 마무리 점검                                | 8단계                |

---

### Task 1: 저장소 뼈대와 루트 도구

pnpm 12 워크스페이스, 엄격한 TypeScript 기본 설정, ESLint·Prettier, 템플릿 저장소용 AGENTS.md와 CLAUDE.md를 만든다. 이 태스크의 check는 포맷과 린트만 돈다(다음 태스크에서 실행기로 바뀐다).

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.gitignore`
- Create: `.gitattributes`
- Create: `.editorconfig`
- Create: `templates/.gitkeep`
- Create: `AGENTS.md`
- Create: `CLAUDE.md`

**Interfaces:**
- Consumes: 없음
- Produces: `tsconfig.base.json`(모든 패키지가 extends), `eslint.config.js`, 루트 스크립트 `check:format`·`check:lint`(이후 실행기가 `check:*`로 자동 발견), `pnpm-workspace.yaml`의 `packages: [contract/*, scripts]`

- [ ] **Step 1: 루트 설정 파일을 만든다**

`package.json`:

```json
{
  "name": "ai-template",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "check": "pnpm run check:format && pnpm run check:lint",
    "check:format": "prettier --check .",
    "check:lint": "eslint .",
    "fix": "prettier --write . && eslint --fix .",
    "test": "pnpm -r run test",
    "gen": "pnpm -r run gen"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/node": "24.13.6",
    "eslint": "10.11.0",
    "prettier": "3.9.9",
    "tsx": "4.23.15",
    "typescript": "6.0.3",
    "typescript-eslint": "8.70.1",
    "vitest": "5.0.1",
    "yaml": "2.9.1"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - contract/*
  - scripts
allowBuilds:
  esbuild: true
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  }
}
```

`eslint.config.js`:

```js
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["**/node_modules/**", "**/generated/**", "templates/**", "**/test/fixtures/**"],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "max-lines": ["error", { max: 400 }],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", minimumDescriptionLength: 10 },
      ],
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "max-lines": ["error", { max: 600 }] },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    // JS 파일은 tsc(checkJs)가 정의되지 않은 식별자를 검사한다.
    rules: { "no-undef": "off" },
  },
);
```

`.prettierrc.json`:

```json
{
  "printWidth": 100
}
```

`.prettierignore`:

```gitignore
pnpm-lock.yaml
contract/openapi.yaml
**/generated/**
docs/superpowers/**
templates/**
```

`.gitignore`:

```gitignore
node_modules/
.cache/
coverage/
*.log
.DS_Store
.env
.env.*
!.env.example
.tmp/
```

`.gitattributes`:

```gitattributes
* text=auto eol=lf
*.exe binary
*.gz binary
*.zip binary
*.png binary
```

`.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

`templates/.gitkeep`: 빈 파일로 만든다.

- [ ] **Step 2: 지침 파일을 만든다**

CLAUDE.md는 `@AGENTS.md` 한 줄만 담는다. 규칙은 모두 AGENTS.md에 쓴다(스펙 §6.1).

`AGENTS.md`:

```markdown
# ai-template

AI 바이브코딩에 최적화한 프로젝트 템플릿(FastAPI, NestJS, Next.js, Next.js admin)을 만드는 저장소다.
설계는 `docs/superpowers/specs/2026-09-26-ai-template-foundation-design.md`를 따른다.

## 명령

| 명령         | 하는 일                           |
| ------------ | --------------------------------- |
| `pnpm check` | 완료 기준. 모든 검사를 돌린다     |
| `pnpm fix`   | 포맷과 자동 수정 가능한 린트 수정 |

## 규칙

- 작업을 끝내기 전에 `pnpm check`를 통과시킨다.
```

`CLAUDE.md`:

```markdown
@AGENTS.md
```

- [ ] **Step 3: 의존성을 설치한다**

`packageManager`가 pnpm 12.6.0을 가리키므로 pnpm 11 이상이면 자동으로 12.6.0으로 바뀐다. `allowBuilds`에 없는 빌드 스크립트가 있으면 pnpm 12는 설치를 멈춘다(ERR_PNPM_IGNORED_BUILDS).

Run: `pnpm install`
Expected: 성공한다(종료 코드 0).

- [ ] **Step 4: check가 통과하는지 확인한다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `All matched files use Prettier code style!`가 있다.

- [ ] **Step 5: 줄바꿈을 정규화하고 커밋한다**

`.gitattributes`를 더했으니 이미 커밋된 파일의 줄바꿈도 LF로 맞춘다.

```bash
git add --renormalize .
git add -A
git commit -m "chore: set up pnpm workspace and root lint tooling"
```


### Task 2: check 실행기

루트 `pnpm check`가 루트의 `check:*` 스크립트와 각 워크스페이스 패키지의 `check`를 찾아 차례로 돌리고, 모두 통과하면 한 줄만, 실패하면 실패한 단계의 출력만 보여 주게 한다(스펙 §6.2 출력 원칙).

**Files:**
- Create: `scripts/package.json`
- Create: `scripts/tsconfig.json`
- Create: `scripts/vitest.config.ts`
- Create: `scripts/test/check/run-steps.test.ts`
- Create: `scripts/test/check/discover.test.ts`
- Create: `scripts/src/check/run-steps.ts`
- Create: `scripts/src/check/discover.ts`
- Create: `scripts/src/check/cli.ts`
- Modify: `package.json` (파일 전체를 이 태스크의 내용으로 바꾼다)

**Interfaces:**
- Consumes: Task 1의 루트 `check:*` 스크립트와 `pnpm-workspace.yaml`
- Produces: `runStep(step: Step): Promise<StepResult>`, `runSteps(steps)`, `formatReport(results): string`, `discoverSteps(rootDir): Step[]`, `workspacePackageDirs(rootDir): string[]`, `readPackageJson(dir)`. 규칙: 루트 check에 단계를 더하려면 `check:<이름>` 스크립트를 추가하고, 패키지는 자기 `check` 스크립트만 두면 된다.

- [ ] **Step 1: scripts 패키지 뼈대를 만들고 설치한다**

`scripts/package.json`:

```json
{
  "name": "@ai-template/scripts",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "check": "pnpm run typecheck && pnpm run test"
  }
}
```

`scripts/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`scripts/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: 설치한다**

Run: `pnpm install`
Expected: 성공한다(종료 코드 0).

- [ ] **Step 3: 실패하는 테스트를 쓴다**

`scripts/test/check/run-steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatReport, runStep, type StepResult } from "../../src/check/run-steps.ts";

const cwd = process.cwd();

describe("runStep", () => {
  it("성공한 명령의 출력을 모은다", async () => {
    const result = await runStep({ name: "ok", command: `node -e "console.log('hello')"`, cwd });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("hello");
  });

  it("0이 아닌 종료 코드를 실패로 기록한다", async () => {
    const command = `node -e "console.error('boom'); process.exit(3)"`;
    const result = await runStep({ name: "fail", command, cwd });
    expect(result.ok).toBe(false);
    expect(result.output).toContain("boom");
  });
});

describe("formatReport", () => {
  const passed: StepResult = { name: "lint", ok: true, output: "noise", durationMs: 1000 };
  const failed: StepResult = { name: "test", ok: false, output: "1 failed\n", durationMs: 500 };

  it("모두 통과하면 한 줄만 낸다", () => {
    expect(formatReport([passed, passed])).toBe("check 통과: 2단계, 2.0s");
  });

  it("실패하면 실패한 단계의 출력과 요약만 보여 준다", () => {
    const report = formatReport([passed, failed]);
    expect(report).toContain("✗ test\n1 failed");
    expect(report).not.toContain("noise");
    expect(report.endsWith("check 실패: test (통과 1/2)")).toBe(true);
  });
});
```

`scripts/test/check/discover.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverSteps, workspacePackageDirs } from "../../src/check/discover.ts";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value));
}

function makeWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "check-"));
  writeJson(join(root, "package.json"), {
    scripts: { check: "x", "check:format": "f", build: "b", "check:lint": "l" },
  });
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - contract/*\n  - scripts\n");
  for (const dir of ["contract/b", "contract/a", "scripts"]) {
    mkdirSync(join(root, dir), { recursive: true });
    writeJson(join(root, dir, "package.json"), {
      name: `@t/${dir.replace("/", "-")}`,
      scripts: { check: "c" },
    });
  }
  mkdirSync(join(root, "contract", "no-package"));
  return root;
}

describe("discoverSteps", () => {
  it("루트 check:* 스크립트를 먼저, 워크스페이스 패키지를 이름 순으로 돌린다", () => {
    const names = discoverSteps(makeWorkspace()).map((step) => step.name);
    expect(names).toEqual(["format", "lint", "@t/contract-a", "@t/contract-b", "@t/scripts"]);
  });

  it("package.json이 없는 디렉터리는 건너뛴다", () => {
    const dirs = workspacePackageDirs(makeWorkspace());
    expect(dirs.some((dir) => dir.endsWith("no-package"))).toBe(false);
  });

  it("지원하지 않는 패턴은 오류로 알린다", () => {
    const root = makeWorkspace();
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - 'packages/**'\n");
    expect(() => workspacePackageDirs(root)).toThrow(/지원하지 않는 workspace 패턴/);
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인한다**

구현 파일이 없어서 모듈을 불러오지 못해 실패한다.

Run: `pnpm --filter @ai-template/scripts test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `run-steps.ts`가 있다.

- [ ] **Step 5: 실행기를 구현한다**

`scripts/src/check/run-steps.ts`:

```ts
import { spawn } from "node:child_process";

export interface Step {
  readonly name: string;
  readonly command: string;
  readonly cwd: string;
}

export interface StepResult {
  readonly name: string;
  readonly ok: boolean;
  readonly output: string;
  readonly durationMs: number;
}

/** 명령 하나를 쉘로 실행하고 출력을 모은다. 출력은 실패했을 때만 보여 준다. */
export function runStep(step: Step): Promise<StepResult> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const child = spawn(step.command, {
      cwd: step.cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    let output = "";
    const collect = (chunk: Buffer) => {
      output += chunk.toString("utf8");
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      const durationMs = performance.now() - startedAt;
      resolve({ name: step.name, ok: false, output: `${output}${error.message}\n`, durationMs });
    });
    child.on("close", (code) => {
      const durationMs = performance.now() - startedAt;
      resolve({ name: step.name, ok: code === 0, output, durationMs });
    });
  });
}

export async function runSteps(steps: readonly Step[]): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const step of steps) {
    results.push(await runStep(step));
  }
  return results;
}

/** 모두 통과하면 한 줄을, 실패하면 실패한 단계의 출력과 요약을 돌려준다. */
export function formatReport(results: readonly StepResult[]): string {
  const totalMs = results.reduce((sum, result) => sum + result.durationMs, 0);
  const total = String(results.length);
  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    return `check 통과: ${total}단계, ${(totalMs / 1000).toFixed(1)}s`;
  }
  const sections = failed.map((result) => `✗ ${result.name}\n${result.output.trimEnd()}`);
  const passed = String(results.length - failed.length);
  const names = failed.map((result) => result.name).join(", ");
  return [...sections, `check 실패: ${names} (통과 ${passed}/${total})`].join("\n\n");
}
```

`scripts/src/check/discover.ts`:

```ts
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
```

`scripts/src/check/cli.ts`:

```ts
import { discoverSteps } from "./discover.ts";
import { formatReport, runSteps } from "./run-steps.ts";

const results = await runSteps(discoverSteps(process.cwd()));
console.log(formatReport(results));
process.exitCode = results.every((result) => result.ok) ? 0 : 1;
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/scripts test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  7 passed`가 있다.

- [ ] **Step 7: 루트 check를 실행기로 바꾼다**

`package.json` (전체 교체):

```json
{
  "name": "ai-template",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "check": "tsx scripts/src/check/cli.ts",
    "check:format": "prettier --check .",
    "check:lint": "eslint .",
    "fix": "prettier --write . && eslint --fix .",
    "test": "pnpm -r run test",
    "gen": "pnpm -r run gen"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/node": "24.13.6",
    "eslint": "10.11.0",
    "prettier": "3.9.9",
    "tsx": "4.23.15",
    "typescript": "6.0.3",
    "typescript-eslint": "8.70.1",
    "vitest": "5.0.1",
    "yaml": "2.9.1"
  }
}
```

- [ ] **Step 8: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 3단계`가 있다.

- [ ] **Step 9: 커밋한다**

```bash
git add -A
git commit -m "feat(scripts): add a quiet check runner that discovers steps"
```


### Task 3: 계약 패키지와 JSON:API 핵심

TypeSpec 계약 패키지를 만든다. JSON:API 문서 템플릿, 에러 코드와 에러 응답, 헬스체크를 정의하고 `contract/openapi.yaml`로 컴파일한다. 커밋된 결과가 원본과 같은지 검사하는 `check:fresh`도 둔다.

**Files:**
- Create: `contract/typespec/package.json`
- Create: `contract/typespec/tspconfig.yaml`
- Create: `contract/typespec/tsconfig.json`
- Create: `contract/typespec/vitest.config.ts`
- Create: `contract/typespec/test/spec.ts`
- Create: `contract/typespec/test/core.test.ts`
- Create: `contract/typespec/src/jsonapi.tsp`
- Create: `contract/typespec/src/errors.tsp`
- Create: `contract/typespec/src/resources/health.tsp`
- Create: `contract/typespec/src/main.tsp`
- Create: `contract/typespec/scripts/check-fresh.ts`

**Interfaces:**
- Consumes: Task 1의 `tsconfig.base.json`, Task 2의 실행기(패키지 `check` 자동 포함)
- Produces: TypeSpec `JsonApi` 네임스페이스: `Resource<TType, TAttributes>`, `ResourceWithRelationships<TType, TAttributes, TRelationships>`, `ToOne<TType>`, `ToMany<TType>`, `ResourceIdentifier<TType>`, `Document<TResource>`, `CollectionDocument<TResource>`, `CreateDocument<TType, TAttributes>`, `CreateDocumentWithRelationships<…>`, `UpdateDocument<…>`, `UpdateDocumentWithRelationships<…>`, `alias PageQuery`, `Body<TDocument>`, `Ok<TDocument>`, `Created<TDocument>`, `Accepted`, `NoContent`, `MediaType`. `Platform` 네임스페이스: `ErrorCode`, `ErrorObject`, `ErrorDocument`, 에러 응답 alias(`BadRequest` … `ServiceUnavailable`), `CommonErrors`, `BodyErrors`, `AuthErrors`. 테스트 헬퍼 `test/spec.ts`: `spec`, `operation(method, path)`, `schema(name)`, `refName`, `responseRef(op, status, mediaType?)`, `requestRef(op)`, `parameterNames(op)`, `statuses(op)`, `auth(op)`, `resourceType(schema)`, `includedRefs(schema)`.

- [ ] **Step 1: 계약 패키지 뼈대를 만든다**

TypeSpec 소스는 `src/` 아래에만 둔다. `tsp format`의 glob이 node_modules 안의 라이브러리 파일까지 건드리지 않게 하기 위해서다. 컴파일 결과는 한 단계 위 `contract/openapi.yaml`에 쓴다.

`contract/typespec/package.json`:

```json
{
  "name": "@ai-template/contract",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsp compile src/main.tsp",
    "gen": "pnpm run build",
    "format": "tsp format \"src/**/*.tsp\"",
    "check:format": "tsp format \"src/**/*.tsp\" --check",
    "check:fresh": "tsx scripts/check-fresh.ts",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "check": "pnpm run check:format && pnpm run check:fresh && pnpm run typecheck && pnpm run test"
  },
  "devDependencies": {
    "@typespec/compiler": "1.16.0",
    "@typespec/http": "1.16.0",
    "@typespec/openapi": "1.16.0",
    "@typespec/openapi3": "1.16.0"
  }
}
```

`contract/typespec/tspconfig.yaml`:

```yaml
emit:
  - "@typespec/openapi3"
options:
  "@typespec/openapi3":
    emitter-output-dir: "{project-root}/.."
    output-file: "openapi.yaml"
    openapi-versions:
      - 3.1.0
    new-line: lf
warn-as-error: true
```

`contract/typespec/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["scripts", "test", "vitest.config.ts"]
}
```

`contract/typespec/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: 설치한다**

Run: `pnpm install`
Expected: 성공한다(종료 코드 0).

- [ ] **Step 3: 실패하는 테스트를 쓴다**

`contract/typespec/test/spec.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

/** 테스트가 쓰는 만큼만 좁힌 OpenAPI 3.1 타입. */
export interface Schema {
  type?: string;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  $ref?: string;
}

export interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: Schema;
}

interface Content {
  content?: Record<string, { schema?: Schema }>;
}

export interface Operation {
  operationId?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: Content;
  responses: Record<string, Content & { headers?: Record<string, unknown> }>;
  security?: Record<string, string[]>[];
  [extension: `x-${string}`]: unknown;
}

export interface OpenApiDocument {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<string, Schema>;
    securitySchemes?: Record<string, unknown>;
  };
  [extension: `x-${string}`]: unknown;
}

export const MEDIA_TYPE = "application/vnd.api+json";

const specPath = fileURLToPath(new URL("../../openapi.yaml", import.meta.url));
export const spec = parse(readFileSync(specPath, "utf8")) as OpenApiDocument;

export function operation(method: string, path: string): Operation {
  const found = spec.paths[path]?.[method];
  if (found === undefined) throw new Error(`계약에 ${method.toUpperCase()} ${path}가 없다`);
  return found;
}

export function schema(name: string): Schema {
  const found = spec.components.schemas[name];
  if (found === undefined) throw new Error(`계약에 스키마 ${name}가 없다`);
  return found;
}

export function refName(target: Schema | undefined): string | undefined {
  return target?.$ref?.split("/").at(-1);
}

export function responseRef(op: Operation, status: string, mediaType = MEDIA_TYPE) {
  return refName(op.responses[status]?.content?.[mediaType]?.schema);
}

export function requestRef(op: Operation): string | undefined {
  return refName(op.requestBody?.content?.[MEDIA_TYPE]?.schema);
}

export function parameterNames(op: Operation): string[] {
  return (op.parameters ?? []).map((parameter) => parameter.name);
}

export function statuses(op: Operation): string[] {
  return Object.keys(op.responses).sort();
}

/** 보안 요구가 없으면 "none", 빈 요구가 섞여 있으면 "optional", 아니면 "required". */
export function auth(op: Operation): "none" | "optional" | "required" {
  if (op.security === undefined) return "none";
  return op.security.some((requirement) => Object.keys(requirement).length === 0)
    ? "optional"
    : "required";
}

/** 단일 값 enum인 `type` 속성의 값을 돌려준다. 예: PostResource → "posts" */
export function resourceType(resourceSchema: Schema): unknown {
  return resourceSchema.properties?.type?.enum?.[0];
}

/** `included` 배열 항목이 참조하는 스키마 이름. */
export function includedRefs(documentSchema: Schema): string[] {
  const items = documentSchema.properties?.included?.items;
  const variants = items?.anyOf ?? items?.oneOf ?? (items ? [items] : []);
  return variants.map((variant) => refName(variant) ?? "").sort();
}
```

`contract/typespec/test/core.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { operation, refName, responseRef, schema, spec, statuses } from "./spec.ts";

const ERROR_CODES = [
  "jsonapi.unsupported_media_type",
  "jsonapi.not_acceptable",
  "jsonapi.invalid_document",
  "jsonapi.invalid_query",
  "jsonapi.unsupported_include",
  "jsonapi.unsupported_sort",
  "validation.required",
  "validation.too_short",
  "validation.too_long",
  "validation.invalid_format",
  "validation.out_of_range",
  "validation.invalid_choice",
  "validation.already_taken",
  "auth.unauthenticated",
  "auth.invalid_credentials",
  "auth.token_expired",
  "auth.token_invalid",
  "auth.refresh_token_reused",
  "auth.oauth_code_invalid",
  "auth.email_not_verified",
  "auth.account_deactivated",
  "auth.verification_token_invalid",
  "permission.denied",
  "role.system_role_protected",
  "resource.not_found",
  "resource.conflict",
  "post.invalid_transition",
  "file.too_large",
  "file.type_not_allowed",
  "file.upload_incomplete",
  "rate_limit.exceeded",
  "internal.unexpected",
  "service.unavailable",
];

describe("계약 기본", () => {
  it("OpenAPI 3.1 문서다", () => {
    expect(spec.openapi).toBe("3.1.0");
  });

  it("에러 코드 목록이 스펙 §5.4와 같다", () => {
    expect(schema("ErrorCode").enum).toEqual(ERROR_CODES);
  });

  it("에러 문서는 errors와 meta.traceId를 반드시 담는다", () => {
    const document = schema("ErrorDocument");
    expect(document.required).toEqual(["errors", "meta"]);
    expect(document.properties?.meta?.required).toEqual(["traceId"]);
    expect(refName(document.properties?.errors?.items)).toBe("ErrorObject");
  });

  it("에러 객체는 status, code, title을 반드시 담는다", () => {
    const error = schema("ErrorObject");
    expect(error.required).toEqual(["status", "code", "title"]);
    expect(refName(error.properties?.code)).toBe("ErrorCode");
    expect(refName(error.properties?.source)).toBe("ErrorSource");
  });
});

describe("헬스체크 (JSON:API 예외)", () => {
  it("live는 application/json으로 HealthReport를 돌려준다", () => {
    const live = operation("get", "/health/live");
    expect(statuses(live)).toEqual(["200"]);
    expect(responseRef(live, "200", "application/json")).toBe("HealthReport");
  });

  it("ready는 준비되지 않았으면 503을 돌려준다", () => {
    const ready = operation("get", "/health/ready");
    expect(statuses(ready)).toEqual(["200", "503"]);
    expect(responseRef(ready, "503", "application/json")).toBe("HealthReport");
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인한다**

아직 `contract/openapi.yaml`이 없어서 실패한다.

Run: `pnpm --filter @ai-template/contract test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `openapi.yaml`가 있다.

- [ ] **Step 5: JSON:API 템플릿, 에러, 헬스체크, 서비스 정의를 쓴다**

에러 응답은 이름 있는 모델이 아니라 `alias`로 선언한다. 모델로 선언하면 아직 어떤 operation도 쓰지 않을 때 TypeSpec이 `BadRequest` 같은 이름을 스키마로 내보내 스키마 이름 규칙을 깬다.

`contract/typespec/src/jsonapi.tsp`:

```typespec
import "@typespec/http";

using Http;

/** JSON:API 1.1 문서를 만드는 템플릿. 리소스 파일은 `model XDocument is JsonApi.Document<XResource>`처럼 이름을 붙여 쓴다. */
namespace JsonApi;

/** JSON:API 미디어 타입. 요청과 응답 모두 이 값만 쓴다. */
alias MediaType = "application/vnd.api+json";

/** 관계가 가리키는 리소스 식별자. */
model ResourceIdentifier<TType extends string> {
  type: TType;
  id: string;
}

/** 단수 관계. 대상이 없으면 data가 null이다. */
model ToOne<TType extends string> {
  data: ResourceIdentifier<TType> | null;
}

/** 복수 관계. */
model ToMany<TType extends string> {
  data: ResourceIdentifier<TType>[];
}

/** 관계가 없는 리소스 객체. */
model Resource<TType extends string, TAttributes extends {}> {
  type: TType;
  id: string;
  attributes: TAttributes;
}

/** 관계가 있는 리소스 객체. */
model ResourceWithRelationships<
  TType extends string,
  TAttributes extends {},
  TRelationships extends {}
> {
  ...Resource<TType, TAttributes>;
  relationships: TRelationships;
}

/** 단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다. */
model Document<TResource> {
  data: TResource;
}

/** 컬렉션 문서. 페이지 링크와 페이지 메타를 항상 담는다. */
model CollectionDocument<TResource> {
  data: TResource[];
  links: PaginationLinks;
  meta: CollectionMeta;
}

/** 생성 요청 문서. */
model CreateDocument<TType extends string, TAttributes> {
  data: {
    type: TType;
    attributes: TAttributes;
  };
}

/** 관계를 함께 보내는 생성 요청 문서. */
model CreateDocumentWithRelationships<
  TType extends string,
  TAttributes,
  TRelationships extends {}
> {
  data: {
    type: TType;
    attributes: TAttributes;
    relationships?: TRelationships;
  };
}

/** 수정 요청 문서. 속성 모델의 필드는 모두 선택이어야 한다. */
model UpdateDocument<TType extends string, TAttributes extends {}> {
  data: {
    type: TType;
    id: string;
    attributes?: TAttributes;
  };
}

/** 관계를 함께 보내는 수정 요청 문서. */
model UpdateDocumentWithRelationships<
  TType extends string,
  TAttributes extends {},
  TRelationships extends {}
> {
  data: {
    type: TType;
    id: string;
    attributes?: TAttributes;
    relationships?: TRelationships;
  };
}

/** 컬렉션의 페이지 링크. 앞뒤 페이지가 없으면 null이다. */
@friendlyName("PaginationLinks")
model PaginationLinks {
  first: url;
  last: url;
  prev: url | null;
  next: url | null;
}

/** 페이지 정보. totalPages는 ceil(total / size)이다. */
@friendlyName("PageMeta")
model PageMeta {
  number: int32;
  size: int32;
  total: int32;
  totalPages: int32;
}

@friendlyName("CollectionMeta")
model CollectionMeta {
  page: PageMeta;
}

/** 모든 컬렉션 GET에 펼쳐 넣는 페이지 쿼리. */
alias PageQuery = {
  /** 1부터 시작하는 페이지 번호. */
  @query("page[number]") @minValue(1) pageNumber?: int32 = 1;

  /** 페이지 크기. 최대 100. */
  @query("page[size]")
  @minValue(1)
  @maxValue(100)
  pageSize?: int32 = 20;
};

/** JSON:API 요청 본문. */
model Body<TDocument> {
  @header("Content-Type") contentType: MediaType;
  @body body: TDocument;
}

/** 200 OK. */
model Ok<TDocument> {
  @statusCode _: 200;
  @header("Content-Type") contentType: MediaType;
  @body body: TDocument;
}

/** 201 Created. */
model Created<TDocument> {
  @statusCode _: 201;
  @header("Content-Type") contentType: MediaType;
  @body body: TDocument;
}

/** 202 Accepted. 비동기로 처리하며 본문이 없다. */
model Accepted {
  @statusCode _: 202;
}

/** 204 No Content. */
model NoContent {
  @statusCode _: 204;
}
```

`contract/typespec/src/errors.tsp`:

```typespec
import "@typespec/http";
import "./jsonapi.tsp";

using Http;

namespace Platform;

/** 기계가 읽는 에러 코드. 형식은 `<영역>.<snake_case 사유>`. 새 코드는 docs/conventions/error-codes.md에도 추가한다. */
union ErrorCode {
  "jsonapi.unsupported_media_type",
  "jsonapi.not_acceptable",
  "jsonapi.invalid_document",
  "jsonapi.invalid_query",
  "jsonapi.unsupported_include",
  "jsonapi.unsupported_sort",
  "validation.required",
  "validation.too_short",
  "validation.too_long",
  "validation.invalid_format",
  "validation.out_of_range",
  "validation.invalid_choice",
  "validation.already_taken",
  "auth.unauthenticated",
  "auth.invalid_credentials",
  "auth.token_expired",
  "auth.token_invalid",
  "auth.refresh_token_reused",
  "auth.oauth_code_invalid",
  "auth.email_not_verified",
  "auth.account_deactivated",
  "auth.verification_token_invalid",
  "permission.denied",
  "role.system_role_protected",
  "resource.not_found",
  "resource.conflict",
  "post.invalid_transition",
  "file.too_large",
  "file.type_not_allowed",
  "file.upload_incomplete",
  "rate_limit.exceeded",
  "internal.unexpected",
  "service.unavailable",
}

/** 에러가 가리키는 위치. */
model ErrorSource {
  /** 요청 본문 안의 JSON Pointer. 예: /data/attributes/title */
  pointer?: string;

  /** 문제가 된 쿼리 파라미터 이름. */
  parameter?: string;
}

model ErrorObject {
  /** HTTP 상태 코드(문자열). */
  status: string;

  code: ErrorCode;

  /** 개발자용 영어 요약. 사용자에게 보여 주지 않는다. */
  title: string;

  /** 개발자용 영어 설명. */
  detail?: string;

  source?: ErrorSource;
  meta?: {
    /** 번역 메시지에 끼워 넣을 변수. */
    params?: Record<unknown>;
  };
}

model ErrorDocument {
  errors: ErrorObject[];
  meta: {
    traceId: string;
  };
}

alias ErrorBody = {
  @header("Content-Type") contentType: JsonApi.MediaType;
  @body body: ErrorDocument;
};

alias BadRequest = {
  @statusCode _: 400;
  ...ErrorBody;
};

alias Unauthorized = {
  @statusCode _: 401;
  ...ErrorBody;
};

alias Forbidden = {
  @statusCode _: 403;
  ...ErrorBody;
};

alias NotFound = {
  @statusCode _: 404;
  ...ErrorBody;
};

alias NotAcceptable = {
  @statusCode _: 406;
  ...ErrorBody;
};

alias Conflict = {
  @statusCode _: 409;
  ...ErrorBody;
};

alias UnsupportedMediaType = {
  @statusCode _: 415;
  ...ErrorBody;
};

alias UnprocessableEntity = {
  @statusCode _: 422;
  ...ErrorBody;
};

alias TooManyRequests = {
  @statusCode _: 429;
  @header("Retry-After") retryAfter: int32;
  ...ErrorBody;
};

alias InternalServerError = {
  @statusCode _: 500;
  ...ErrorBody;
};

alias ServiceUnavailable = {
  @statusCode _: 503;
  ...ErrorBody;
};

/** 모든 JSON:API 엔드포인트가 돌려줄 수 있는 에러. */
alias CommonErrors =
  | BadRequest
  | NotAcceptable
  | TooManyRequests
  | InternalServerError
  | ServiceUnavailable;

/** 본문을 받는 엔드포인트에 더해지는 에러. */
alias BodyErrors = UnsupportedMediaType | UnprocessableEntity;

/** 로그인이 필요한 엔드포인트에 더해지는 에러. */
alias AuthErrors = Unauthorized | Forbidden;
```

`contract/typespec/src/resources/health.tsp`:

```typespec
import "@typespec/http";
import "@typespec/openapi";

using Http;
using OpenAPI;

namespace Platform;

/** 헬스체크 결과. JSON:API가 아닌 예외 엔드포인트라 application/json으로 응답한다. */
model HealthReport {
  status: "ok" | "unavailable";

  /** 의존 대상별 상태. 예: { "database": "ok", "redis": "ok" } */
  checks: Record<"ok" | "unavailable">;
}

@route("/health")
@tag("health")
interface Health {
  /** 프로세스가 살아 있는지 확인한다. */
  @get
  @route("live")
  live(): {
    @statusCode _: 200;
    @body body: HealthReport;
  };

  /** DB, Redis, 스토리지 연결까지 확인한다. 하나라도 실패하면 503이다. */
  @get
  @route("ready")
  ready():
    | {
        @statusCode _: 200;
        @body body: HealthReport;
      }
    | {
        @statusCode _: 503;
        @body body: HealthReport;
      };
}
```

`contract/typespec/src/main.tsp`:

```typespec
import "@typespec/http";
import "@typespec/openapi";
import "./jsonapi.tsp";
import "./errors.tsp";
import "./resources/health.tsp";

using Http;
using OpenAPI;

/** AI 템플릿 플랫폼 API 계약. FastAPI와 NestJS 템플릿이 똑같이 구현한다. */
@service(#{ title: "AI Template Platform API" })
@info(#{ version: "1.0.0" })
@server("http://localhost:8000", "로컬 개발 서버")
namespace Platform;
```

`contract/typespec/scripts/check-fresh.ts`:

```ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** TypeSpec 원본을 임시 폴더로 컴파일해 커밋된 contract/openapi.yaml과 비교한다. */
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const committedPath = join(packageDir, "..", "openapi.yaml");
const outDir = mkdtempSync(join(tmpdir(), "contract-"));

const compile = spawnSync(
  `tsp compile src/main.tsp --option "@typespec/openapi3.emitter-output-dir=${outDir}"`,
  { cwd: packageDir, shell: true, encoding: "utf8" },
);
if (compile.status !== 0) {
  console.error(compile.stdout, compile.stderr);
  process.exit(1);
}

const fresh = readFileSync(join(outDir, "openapi.yaml"), "utf8");
const committed = readFileSync(committedPath, "utf8");
if (fresh !== committed) {
  console.error(
    "contract/openapi.yaml이 TypeSpec 원본과 다르다. 직접 고치지 말고 `pnpm gen`으로 다시 생성해 커밋한다.",
  );
  process.exit(1);
}
```

- [ ] **Step 6: 컴파일한다**

`warn-as-error: true`라서 경고가 하나라도 있으면 실패한다.

Run: `pnpm --filter @ai-template/contract run build`
Expected: 성공한다(종료 코드 0). 출력에 `Compilation completed successfully.`가 있다.

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/contract test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  6 passed`가 있다.

- [ ] **Step 8: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 4단계`가 있다.

- [ ] **Step 9: 커밋한다**

```bash
git add -A
git commit -m "feat(contract): add JSON:API TypeSpec core, errors and health"
```


### Task 4: API 스타일 룰셋 ① 본문·에러·요청 문서·type 규칙

Redocly 기반 JSON:API 룰셋 패키지를 만들고 첫 네 규칙(media-type, error-response, request-document, type-matches-path)을 구현한다. 규칙은 문서 전체를 받아 문제 목록을 돌려주는 순수 함수이고, `defineRule`이 Redocly 규칙으로 감싼다. 검증은 모든 규칙을 통과하는 최소 픽스처를 한 군데씩 고쳐 `그 규칙만` 잡히는지 확인한다.

**Files:**
- Create: `contract/api-style/package.json`
- Create: `contract/api-style/tsconfig.json`
- Create: `contract/api-style/vitest.config.ts`
- Create: `contract/api-style/redocly.yaml`
- Create: `contract/api-style/plugin.js`
- Create: `contract/api-style/test/fixtures/valid.yaml`
- Create: `contract/api-style/test/lint.ts`
- Create: `contract/api-style/test/document-rules.test.ts`
- Create: `contract/api-style/rules/util.js`
- Create: `contract/api-style/rules/media-type.js`
- Create: `contract/api-style/rules/error-response.js`
- Create: `contract/api-style/rules/request-document.js`
- Create: `contract/api-style/rules/type-matches-path.js`
- Create: `contract/api-style/lint.js`

**Interfaces:**
- Consumes: Task 3의 `contract/openapi.yaml`(`lint:contract`가 검사)
- Produces: `rules/util.js`: `MEDIA_TYPE`, `API_PREFIX`, `OAUTH_PREFIX`, `isRecord`, `record`, `jsonApiOperations(doc)`, `refName`, `namedSchema`, `deref`, `constValue(schema, property)`, `bodySchema(body)`, `resourceName(type)`, `defineRule(check)`. 규칙 id는 `jsonapi/<파일 이름>`. `lint.js <파일>`은 위반마다 `파일#위치 [규칙] 메시지`를 찍는다(백엔드 템플릿도 사본으로 쓴다). 테스트 헬퍼 `test/lint.ts`: `validFixture()`, `at(node, ...keys)`, `removeParameter(operation, name)`, `ruleIds(doc)`.

- [ ] **Step 1: 룰셋 패키지 뼈대를 만든다**

규칙은 Node만 있으면 도는 순수 JS(`// @ts-check`)로 쓴다. 백엔드 템플릿에 사본으로 들어가기 때문이다. `tsc`가 checkJs로 타입을 검사한다.

`contract/api-style/package.json`:

```json
{
  "name": "@ai-template/api-style",
  "private": true,
  "type": "module",
  "scripts": {
    "lint:contract": "node lint.js ../openapi.yaml",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "check": "pnpm run typecheck && pnpm run test && pnpm run lint:contract"
  },
  "devDependencies": {
    "@redocly/openapi-core": "2.54.2"
  }
}
```

`contract/api-style/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true
  },
  "include": ["plugin.js", "lint.js", "rules", "test", "vitest.config.ts"]
}
```

`contract/api-style/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: 설치한다**

Run: `pnpm install`
Expected: 성공한다(종료 코드 0).

- [ ] **Step 3: 내장 규칙만 켠 설정과 빈 플러그인을 둔다**

`contract/api-style/redocly.yaml`:

```yaml
plugins:
  - ./plugin.js
rules:
  struct: error
  operation-operationId: error
  operation-operationId-unique: error
  operation-parameters-unique: error
  operation-tag-defined: error
  path-parameters-defined: error
  paths-kebab-case: error
  no-path-trailing-slash: error
```

`contract/api-style/plugin.js`:

```js
// @ts-check

/** JSON:API 규약 룰셋. 규칙은 다음 단계에서 등록한다. */
export default function jsonApiPlugin() {
  return { id: "jsonapi", rules: { oas3: {} } };
}
```

- [ ] **Step 4: 픽스처와 실패하는 테스트를 쓴다**

`contract/api-style/test/fixtures/valid.yaml`:

```yaml
# 모든 규칙을 통과하는 최소 JSON:API 스펙. 규칙 테스트는 이 문서를 한 군데만 고쳐서 쓴다.
openapi: 3.1.0
info:
  title: Fixture API
  version: 1.0.0
tags:
  - name: widgets
  - name: me
  - name: oauth
  - name: health
paths:
  /api/v1/widgets:
    get:
      operationId: Widgets_list
      tags: [widgets]
      parameters:
        - { name: "page[number]", in: query, schema: { type: integer } }
        - { name: "page[size]", in: query, schema: { type: integer } }
        - { name: sort, in: query, schema: { type: string } }
        - { name: include, in: query, schema: { type: string } }
        - { name: "fields[widgets]", in: query, schema: { type: string } }
      x-jsonapi-sort: [name]
      x-jsonapi-include: [owner]
      responses:
        "200":
          description: OK
          content:
            application/vnd.api+json:
              schema: { $ref: "#/components/schemas/WidgetCollectionDocument" }
        "400":
          description: Bad Request
          content:
            application/vnd.api+json:
              schema: { $ref: "#/components/schemas/ErrorDocument" }
    post:
      operationId: Widgets_create
      tags: [widgets]
      requestBody:
        required: true
        content:
          application/vnd.api+json:
            schema: { $ref: "#/components/schemas/WidgetCreateDocument" }
      responses:
        "201":
          description: Created
          content:
            application/vnd.api+json:
              schema: { $ref: "#/components/schemas/WidgetDocument" }
        "422":
          description: Unprocessable Entity
          content:
            application/vnd.api+json:
              schema: { $ref: "#/components/schemas/ErrorDocument" }
  /api/v1/widgets/{id}:
    patch:
      operationId: Widgets_update
      tags: [widgets]
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      requestBody:
        required: true
        content:
          application/vnd.api+json:
            schema: { $ref: "#/components/schemas/WidgetUpdateDocument" }
      responses:
        "200":
          description: OK
          content:
            application/vnd.api+json:
              schema: { $ref: "#/components/schemas/WidgetDocument" }
        "404":
          description: Not Found
          content:
            application/vnd.api+json:
              schema: { $ref: "#/components/schemas/ErrorDocument" }
    delete:
      operationId: Widgets_delete
      tags: [widgets]
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        "204":
          description: No Content
        "404":
          description: Not Found
          content:
            application/vnd.api+json:
              schema: { $ref: "#/components/schemas/ErrorDocument" }
  /api/v1/me:
    get:
      operationId: Me_get
      tags: [me]
      responses:
        "200":
          description: OK
          content:
            application/vnd.api+json:
              schema: { $ref: "#/components/schemas/UserDocument" }
        "401":
          description: Unauthorized
          content:
            application/vnd.api+json:
              schema: { $ref: "#/components/schemas/ErrorDocument" }
  /api/v1/oauth/google/authorize:
    get:
      operationId: OAuth_authorize
      tags: [oauth]
      responses:
        "302":
          description: Found
        "400":
          description: Bad Request
          content:
            application/vnd.api+json:
              schema: { $ref: "#/components/schemas/ErrorDocument" }
  /health/live:
    get:
      operationId: Health_live
      tags: [health]
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/HealthReport" }
components:
  schemas:
    ErrorCode:
      type: string
      enum: [internal.unexpected]
    ErrorObject:
      type: object
      required: [status, code, title]
      properties:
        status: { type: string }
        code: { $ref: "#/components/schemas/ErrorCode" }
        title: { type: string }
    ErrorDocument:
      type: object
      required: [errors, meta]
      properties:
        errors:
          type: array
          items: { $ref: "#/components/schemas/ErrorObject" }
        meta:
          type: object
          required: [traceId]
          properties:
            traceId: { type: string }
    PageMeta:
      type: object
      required: [number, size, total, totalPages]
      properties:
        number: { type: integer }
        size: { type: integer }
        total: { type: integer }
        totalPages: { type: integer }
    PaginationLinks:
      type: object
      required: [first, last, prev, next]
      properties:
        first: { type: string }
        last: { type: string }
        prev: { type: [string, "null"] }
        next: { type: [string, "null"] }
    CollectionMeta:
      type: object
      required: [page]
      properties:
        page: { $ref: "#/components/schemas/PageMeta" }
    WidgetAttributes:
      type: object
      required: [name]
      properties:
        name: { type: string }
        createdAt: { type: string, format: date-time }
    WidgetResource:
      type: object
      required: [type, id, attributes]
      properties:
        type: { type: string, enum: [widgets] }
        id: { type: string }
        attributes: { $ref: "#/components/schemas/WidgetAttributes" }
    WidgetDocument:
      type: object
      required: [data]
      properties:
        data: { $ref: "#/components/schemas/WidgetResource" }
    WidgetCollectionDocument:
      type: object
      required: [data, links, meta]
      properties:
        data:
          type: array
          items: { $ref: "#/components/schemas/WidgetResource" }
        links: { $ref: "#/components/schemas/PaginationLinks" }
        meta: { $ref: "#/components/schemas/CollectionMeta" }
    WidgetCreateDocument:
      type: object
      required: [data]
      properties:
        data:
          type: object
          required: [type, attributes]
          properties:
            type: { type: string, enum: [widgets] }
            attributes: { $ref: "#/components/schemas/WidgetAttributes" }
    WidgetUpdateDocument:
      type: object
      required: [data]
      properties:
        data:
          type: object
          required: [type, id]
          properties:
            type: { type: string, enum: [widgets] }
            id: { type: string }
            attributes: { $ref: "#/components/schemas/WidgetAttributes" }
    UserResource:
      type: object
      required: [type, id, attributes]
      properties:
        type: { type: string, enum: [users] }
        id: { type: string }
        attributes:
          type: object
          properties:
            name: { type: string }
    UserDocument:
      type: object
      required: [data]
      properties:
        data: { $ref: "#/components/schemas/UserResource" }
    HealthReport:
      type: object
      properties:
        status: { type: string }
```

`contract/api-style/test/lint.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lintFromString, loadConfig } from "@redocly/openapi-core";
import { parse, stringify } from "yaml";

export type Json = Record<string, unknown>;

const configPath = fileURLToPath(new URL("../redocly.yaml", import.meta.url));
const fixturePath = fileURLToPath(new URL("./fixtures/valid.yaml", import.meta.url));

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 매번 새로 읽어서 테스트끼리 변경이 섞이지 않게 한다. */
export function validFixture(): Json {
  return parse(readFileSync(fixturePath, "utf8")) as Json;
}

/** 경로를 따라 내려가 객체를 돌려준다. 픽스처의 한 곳을 고칠 때 쓴다. */
export function at(node: Json, ...keys: string[]): Json {
  let current: unknown = node;
  for (const key of keys) {
    current = isJson(current) ? current[key] : undefined;
  }
  if (!isJson(current)) throw new Error(`${keys.join(" > ")}가 객체가 아니다`);
  return current;
}

/** operation의 파라미터 중 이름이 `name`인 것을 뺀다. */
export function removeParameter(operation: Json, name: string): void {
  const parameters = Array.isArray(operation.parameters) ? (operation.parameters as unknown[]) : [];
  operation.parameters = parameters.filter(
    (parameter) => isJson(parameter) && parameter.name !== name,
  );
}

/** 룰셋으로 문서를 검사해 발생한 규칙 id를 중복 없이 정렬해 돌려준다. */
export async function ruleIds(doc: Json): Promise<string[]> {
  const config = await loadConfig({ configPath });
  const problems = await lintFromString({
    source: stringify(doc),
    absoluteRef: fixturePath,
    config,
  });
  return [...new Set(problems.map((problem) => problem.ruleId))].sort();
}
```

`contract/api-style/test/document-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { at, ruleIds, validFixture } from "./lint.ts";

const WIDGETS = "/api/v1/widgets";
const WIDGET = "/api/v1/widgets/{id}";

describe("유효한 픽스처", () => {
  it("어떤 규칙도 위반하지 않는다", async () => {
    expect(await ruleIds(validFixture())).toEqual([]);
  });
});

describe("jsonapi/media-type", () => {
  it("JSON:API 경로에서 다른 미디어 타입을 쓰면 잡는다", async () => {
    const doc = validFixture();
    const content = at(doc, "paths", WIDGETS, "get", "responses", "200", "content");
    content["application/json"] = content["application/vnd.api+json"];
    delete content["application/vnd.api+json"];
    expect(await ruleIds(doc)).toEqual(["jsonapi/media-type"]);
  });

  it("헬스체크처럼 API 밖의 경로는 검사하지 않는다", async () => {
    const doc = validFixture();
    const content = at(doc, "paths", "/health/live", "get", "responses", "200", "content");
    expect(Object.keys(content)).toEqual(["application/json"]);
    expect(await ruleIds(doc)).toEqual([]);
  });
});

describe("jsonapi/error-response", () => {
  it("4xx 응답이 ErrorDocument를 참조하지 않으면 잡는다", async () => {
    const doc = validFixture();
    const media = at(doc, "paths", WIDGETS, "get", "responses", "400", "content");
    at(media, "application/vnd.api+json").schema = {
      $ref: "#/components/schemas/WidgetDocument",
    };
    expect(await ruleIds(doc)).toEqual(["jsonapi/error-response"]);
  });

  it("4xx 응답이 하나도 없으면 잡는다", async () => {
    const doc = validFixture();
    const responses = at(doc, "paths", WIDGET, "delete", "responses");
    delete responses["404"];
    expect(await ruleIds(doc)).toEqual(["jsonapi/error-response"]);
  });
});

describe("jsonapi/request-document", () => {
  it("POST 본문이 CreateDocument가 아니면 잡는다", async () => {
    const doc = validFixture();
    const content = at(doc, "paths", WIDGETS, "post", "requestBody", "content");
    at(content, "application/vnd.api+json").schema = {
      $ref: "#/components/schemas/WidgetUpdateDocument",
    };
    expect(await ruleIds(doc)).toEqual(["jsonapi/request-document"]);
  });
});

describe("jsonapi/type-matches-path", () => {
  it("응답 리소스의 type이 경로와 다르면 잡는다", async () => {
    const doc = validFixture();
    const content = at(doc, "paths", WIDGETS, "post", "responses", "201", "content");
    at(content, "application/vnd.api+json").schema = {
      $ref: "#/components/schemas/UserDocument",
    };
    expect(await ruleIds(doc)).toEqual(["jsonapi/type-matches-path"]);
  });

  it("별칭으로 등록한 경로(me → users)는 통과한다", async () => {
    const doc = validFixture();
    const content = at(doc, "paths", "/api/v1/me", "get", "responses", "200", "content");
    expect(at(content, "application/vnd.api+json").schema).toEqual({
      $ref: "#/components/schemas/UserDocument",
    });
    expect(await ruleIds(doc)).toEqual([]);
  });
});
```

- [ ] **Step 5: 테스트가 실패하는지 확인한다**

유효한 픽스처 테스트는 통과하고, 규칙이 아직 없으므로 위반을 잡아야 하는 테스트는 빈 배열을 받아 실패한다.

Run: `pnpm --filter @ai-template/api-style test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `jsonapi/media-type`가 있다.

- [ ] **Step 6: 공통 유틸과 네 규칙을 구현한다**

`contract/api-style/rules/util.js`:

```js
// @ts-check

/** @typedef {Record<string, unknown>} Json */
/** @typedef {{ path: (string | number)[], message: string }} Problem */
/** @typedef {{ path: string, method: string, operation: Json }} JsonApiOperation */

export const MEDIA_TYPE = "application/vnd.api+json";
export const API_PREFIX = "/api/v1/";
export const OAUTH_PREFIX = "/api/v1/oauth/";

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

/**
 * @param {unknown} value
 * @returns {value is Json}
 */
export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {Json}
 */
export function record(value) {
  return isRecord(value) ? value : {};
}

/**
 * JSON:API 규칙을 적용할 operation. `/api/v1` 아래이고 OAuth 리다이렉트가 아닌 것.
 * @param {Json} doc
 * @returns {JsonApiOperation[]}
 */
export function jsonApiOperations(doc) {
  /** @type {JsonApiOperation[]} */
  const found = [];
  for (const [path, item] of Object.entries(record(doc.paths))) {
    if (!path.startsWith(API_PREFIX) || path.startsWith(OAUTH_PREFIX)) continue;
    for (const method of METHODS) {
      const operation = record(item)[method];
      if (isRecord(operation)) found.push({ path, method, operation });
    }
  }
  return found;
}

/**
 * @param {unknown} schema
 * @returns {string | undefined}
 */
export function refName(schema) {
  if (!isRecord(schema) || typeof schema.$ref !== "string") return undefined;
  return schema.$ref.split("/").at(-1);
}

/**
 * components.schemas에서 이름으로 스키마를 찾는다.
 * @param {Json} doc
 * @param {string | undefined} name
 * @returns {Json | undefined}
 */
export function namedSchema(doc, name) {
  if (name === undefined) return undefined;
  const found = record(record(doc.components).schemas)[name];
  return isRecord(found) ? found : undefined;
}

/**
 * `$ref`면 따라가고, 아니면 그대로 돌려준다.
 * @param {Json} doc
 * @param {unknown} schema
 * @returns {Json | undefined}
 */
export function deref(doc, schema) {
  const name = refName(schema);
  if (name !== undefined) return namedSchema(doc, name);
  return isRecord(schema) ? schema : undefined;
}

/**
 * 속성의 단일 값 enum을 돌려준다. 예: { properties: { type: { enum: ["posts"] } } } → "posts"
 * @param {Json | undefined} schema
 * @param {string} property
 * @returns {string | undefined}
 */
export function constValue(schema, property) {
  const values = record(record(schema?.properties)[property]).enum;
  if (!Array.isArray(values) || values.length !== 1) return undefined;
  const [value] = values;
  return typeof value === "string" ? value : undefined;
}

/**
 * 본문의 JSON:API 스키마(`application/vnd.api+json`)를 돌려준다.
 * @param {unknown} body requestBody 또는 response 객체
 * @returns {unknown}
 */
export function bodySchema(body) {
  return record(record(record(body).content)[MEDIA_TYPE]).schema;
}

/**
 * 리소스 type을 스키마 이름 접두사로 바꾼다. 예: audit-logs → AuditLog
 * @param {string} type
 * @returns {string}
 */
export function resourceName(type) {
  const words = type.split("-");
  const last = words.pop() ?? "";
  let singular = last;
  if (last.endsWith("ies")) singular = `${last.slice(0, -3)}y`;
  else if (last.endsWith("sses")) singular = last.slice(0, -2);
  else if (last.endsWith("s")) singular = last.slice(0, -1);
  return [...words, singular].map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
}

/**
 * 문서 전체를 받아 문제 목록을 돌려주는 검사 함수를 Redocly 규칙으로 감싼다.
 * @param {(doc: Json, options: Json) => Problem[]} check
 */
export function defineRule(check) {
  /** @param {Json} options */
  return (options) => ({
    Root: {
      /**
       * @param {Json} root
       * @param {{ report: (problem: { message: string, location: unknown }) => void, location: { child: (path: (string | number)[]) => { key: () => unknown } } }} context
       */
      leave(root, context) {
        for (const problem of check(root, options)) {
          context.report({
            message: problem.message,
            location: context.location.child(problem.path).key(),
          });
        }
      },
    },
  });
}
```

`contract/api-style/rules/media-type.js`:

```js
// @ts-check
import { MEDIA_TYPE, defineRule, jsonApiOperations, record } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

/**
 * `/api/v1` 아래 요청·응답 본문은 JSON:API 미디어 타입만 쓴다.
 * @param {Json} doc
 * @returns {Problem[]}
 */
export function check(doc) {
  /** @type {Problem[]} */
  const problems = [];
  for (const { path, method, operation } of jsonApiOperations(doc)) {
    /** @type {{ at: string[], content: Json }[]} */
    const bodies = [
      { at: ["requestBody", "content"], content: record(record(operation.requestBody).content) },
    ];
    for (const [status, response] of Object.entries(record(operation.responses))) {
      bodies.push({
        at: ["responses", status, "content"],
        content: record(record(response).content),
      });
    }
    for (const { at, content } of bodies) {
      for (const mediaType of Object.keys(content)) {
        if (mediaType === MEDIA_TYPE) continue;
        problems.push({
          path: ["paths", path, method, ...at, mediaType],
          message: `JSON:API 본문은 "${MEDIA_TYPE}"만 쓴다. "${mediaType}"를 "${MEDIA_TYPE}"로 바꾼다.`,
        });
      }
    }
  }
  return problems;
}

export default defineRule(check);
```

`contract/api-style/rules/error-response.js`:

```js
// @ts-check
import { bodySchema, defineRule, jsonApiOperations, record, refName } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

/**
 * JSON:API operation은 4xx 응답을 하나 이상 선언하고, 모든 4xx·5xx 응답은 ErrorDocument를 참조한다.
 * @param {Json} doc
 * @returns {Problem[]}
 */
export function check(doc) {
  /** @type {Problem[]} */
  const problems = [];
  for (const { path, method, operation } of jsonApiOperations(doc)) {
    const responses = record(operation.responses);
    const codes = Object.keys(responses);
    if (!codes.some((code) => code.startsWith("4"))) {
      problems.push({
        path: ["paths", path, method, "responses"],
        message: "JSON:API operation은 4xx 에러 응답을 하나 이상 선언한다(예: CommonErrors).",
      });
    }
    for (const code of codes.filter((status) => /^[45]/.test(status))) {
      if (refName(bodySchema(responses[code])) === "ErrorDocument") continue;
      problems.push({
        path: ["paths", path, method, "responses", code],
        message: `${code} 응답은 application/vnd.api+json 본문으로 ErrorDocument를 참조한다.`,
      });
    }
  }
  return problems;
}

export default defineRule(check);
```

`contract/api-style/rules/request-document.js`:

```js
// @ts-check
import { bodySchema, defineRule, jsonApiOperations, refName } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

/** @type {Record<string, string>} */
const EXPECTED_SUFFIX = { post: "CreateDocument", patch: "UpdateDocument" };

/**
 * POST 본문은 `*CreateDocument`, PATCH 본문은 `*UpdateDocument`를 참조한다.
 * @param {Json} doc
 * @returns {Problem[]}
 */
export function check(doc) {
  /** @type {Problem[]} */
  const problems = [];
  for (const { path, method, operation } of jsonApiOperations(doc)) {
    const suffix = EXPECTED_SUFFIX[method];
    if (suffix === undefined) continue;
    const name = refName(bodySchema(operation.requestBody));
    if (name?.endsWith(suffix)) continue;
    problems.push({
      path: ["paths", path, method, "requestBody"],
      message: `${method.toUpperCase()} 본문은 이름이 "${suffix}"로 끝나는 스키마를 참조한다(현재: ${name ?? "없음"}).`,
    });
  }
  return problems;
}

export default defineRule(check);
```

`contract/api-style/rules/type-matches-path.js`:

```js
// @ts-check
import {
  API_PREFIX,
  bodySchema,
  constValue,
  defineRule,
  deref,
  jsonApiOperations,
  record,
} from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

/**
 * 문서 스키마의 data가 가리키는 리소스 type. 컬렉션이면 배열 항목을 본다.
 * @param {Json} doc
 * @param {unknown} documentSchema
 * @returns {string | undefined}
 */
function dataType(doc, documentSchema) {
  const data = record(record(deref(doc, documentSchema)?.properties).data);
  const resource = data.type === "array" ? deref(doc, data.items) : deref(doc, data);
  return constValue(resource, "type");
}

/**
 * 리소스 type은 경로의 첫 세그먼트와 같다. 예: /api/v1/audit-logs → audit-logs
 * 별칭은 옵션 `aliases`로 준다. 예: { me: "users" }
 * @param {Json} doc
 * @param {Json} options
 * @returns {Problem[]}
 */
export function check(doc, options) {
  const aliases = record(options.aliases);
  /** @type {Problem[]} */
  const problems = [];
  for (const { path, method, operation } of jsonApiOperations(doc)) {
    const segment = path.slice(API_PREFIX.length).split("/")[0] ?? "";
    const alias = aliases[segment];
    const expected = typeof alias === "string" ? alias : segment;
    /** @type {{ at: (string | number)[], type: string | undefined }[]} */
    const bodies = [
      { at: ["requestBody"], type: dataType(doc, bodySchema(operation.requestBody)) },
    ];
    for (const [status, response] of Object.entries(record(operation.responses))) {
      if (status.startsWith("2")) {
        bodies.push({ at: ["responses", status], type: dataType(doc, bodySchema(response)) });
      }
    }
    for (const { at, type } of bodies) {
      if (type === undefined || type === expected) continue;
      problems.push({
        path: ["paths", path, method, ...at],
        message: `경로 ${path}의 리소스 type은 "${expected}"여야 한다(현재: "${type}").`,
      });
    }
  }
  return problems;
}

export default defineRule(check);
```

`contract/api-style/plugin.js` (전체 교체):

```js
// @ts-check
import errorResponse from "./rules/error-response.js";
import mediaType from "./rules/media-type.js";
import requestDocument from "./rules/request-document.js";
import typeMatchesPath from "./rules/type-matches-path.js";

/** JSON:API 규약 룰셋. redocly.yaml에서 `jsonapi/<규칙>`으로 켠다. */
export default function jsonApiPlugin() {
  return {
    id: "jsonapi",
    rules: {
      oas3: {
        "media-type": mediaType,
        "error-response": errorResponse,
        "request-document": requestDocument,
        "type-matches-path": typeMatchesPath,
      },
    },
  };
}
```

`contract/api-style/redocly.yaml` (전체 교체):

```yaml
plugins:
  - ./plugin.js
rules:
  struct: error
  operation-operationId: error
  operation-operationId-unique: error
  operation-parameters-unique: error
  operation-tag-defined: error
  path-parameters-defined: error
  paths-kebab-case: error
  no-path-trailing-slash: error
  jsonapi/media-type: error
  jsonapi/error-response: error
  jsonapi/request-document: error
  jsonapi/type-matches-path:
    severity: error
    aliases:
      me: users
```

`contract/api-style/lint.js`:

```js
// @ts-check
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lint, loadConfig } from "@redocly/openapi-core";

/** 사용법: node lint.js <OpenAPI 파일>. 위반마다 `파일#위치 [규칙] 메시지` 한 줄을 출력한다. */
const target = resolve(process.argv[2] ?? "../openapi.yaml");
const configPath = fileURLToPath(new URL("./redocly.yaml", import.meta.url));
const config = await loadConfig({ configPath });
const problems = await lint({ ref: target, config });

for (const problem of problems) {
  const pointer = problem.location[0]?.pointer ?? "";
  console.error(`${target}${pointer} [${problem.ruleId}] ${problem.message}`);
}
if (problems.length > 0) {
  console.error(`API 스타일 위반 ${String(problems.length)}건`);
  process.exitCode = 1;
}
```

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/api-style test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  8 passed`가 있다.

- [ ] **Step 8: 루트 check를 돌린다**

api-style의 check가 `lint:contract`로 실제 계약도 검사한다.

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 5단계`가 있다.

- [ ] **Step 9: 커밋한다**

```bash
git add -A
git commit -m "feat(api-style): add JSON:API media type, error and document rules"
```


### Task 5: API 스타일 룰셋 ② 컬렉션·include·스키마 이름·camelCase 규칙

나머지 네 규칙(collection-parameters, include-extension, schema-naming, camel-case-properties)을 구현하고 모든 규칙을 켠다. 스키마 이름 규칙의 공용 목록은 `redocly.yaml`의 `shared` 옵션으로 준다.

**Files:**
- Create: `contract/api-style/test/shape-rules.test.ts`
- Create: `contract/api-style/rules/collection-parameters.js`
- Create: `contract/api-style/rules/include-extension.js`
- Create: `contract/api-style/rules/schema-naming.js`
- Create: `contract/api-style/rules/camel-case-properties.js`
- Modify: `contract/api-style/plugin.js` (파일 전체를 이 태스크의 내용으로 바꾼다)
- Modify: `contract/api-style/redocly.yaml` (파일 전체를 이 태스크의 내용으로 바꾼다)

**Interfaces:**
- Consumes: Task 4의 `rules/util.js`, `test/lint.ts`, 픽스처
- Produces: 규칙 `jsonapi/collection-parameters`, `jsonapi/include-extension`, `jsonapi/schema-naming`(옵션 `shared: string[]`), `jsonapi/camel-case-properties`. 공용 스키마 목록: ErrorCode, ErrorDocument, ErrorObject, ErrorSource, PageMeta, PaginationLinks, CollectionMeta, Locale, OAuthProvider, HealthReport.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`contract/api-style/test/shape-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resourceName } from "../rules/util.js";
import { at, removeParameter, ruleIds, validFixture } from "./lint.ts";

const WIDGETS = "/api/v1/widgets";

describe("jsonapi/collection-parameters", () => {
  it("컬렉션 GET에 page[size]가 없으면 잡는다", async () => {
    const doc = validFixture();
    removeParameter(at(doc, "paths", WIDGETS, "get"), "page[size]");
    expect(await ruleIds(doc)).toEqual(["jsonapi/collection-parameters"]);
  });

  it("컬렉션 GET에 fields[...]가 없으면 잡는다", async () => {
    const doc = validFixture();
    removeParameter(at(doc, "paths", WIDGETS, "get"), "fields[widgets]");
    expect(await ruleIds(doc)).toEqual(["jsonapi/collection-parameters"]);
  });

  it("x-jsonapi-sort가 없으면 잡는다", async () => {
    const doc = validFixture();
    delete at(doc, "paths", WIDGETS, "get")["x-jsonapi-sort"];
    expect(await ruleIds(doc)).toEqual(["jsonapi/collection-parameters"]);
  });
});

describe("jsonapi/include-extension", () => {
  it("include 파라미터가 있는데 x-jsonapi-include가 없으면 잡는다", async () => {
    const doc = validFixture();
    delete at(doc, "paths", WIDGETS, "get")["x-jsonapi-include"];
    expect(await ruleIds(doc)).toEqual(["jsonapi/include-extension"]);
  });

  it("x-jsonapi-include만 있고 include 파라미터가 없으면 잡는다", async () => {
    const doc = validFixture();
    removeParameter(at(doc, "paths", WIDGETS, "get"), "include");
    expect(await ruleIds(doc)).toEqual(["jsonapi/include-extension"]);
  });
});

describe("jsonapi/schema-naming", () => {
  it("리소스 이름으로 시작하지 않는 스키마를 잡는다", async () => {
    const doc = validFixture();
    at(doc, "components", "schemas").Gadget = { type: "object" };
    expect(await ruleIds(doc)).toEqual(["jsonapi/schema-naming"]);
  });

  it("점이 들어간 스키마 이름을 잡는다", async () => {
    const doc = validFixture();
    at(doc, "components", "schemas")["JsonApi.Widget"] = { type: "object" };
    expect(await ruleIds(doc)).toEqual(["jsonapi/schema-naming"]);
  });

  it("리소스 이름으로 시작하는 보조 스키마는 통과한다", async () => {
    const doc = validFixture();
    at(doc, "components", "schemas").WidgetStatus = { type: "string", enum: ["on", "off"] };
    expect(await ruleIds(doc)).toEqual([]);
  });

  it("type을 단수 PascalCase 리소스 이름으로 바꾼다", () => {
    expect(resourceName("posts")).toBe("Post");
    expect(resourceName("audit-logs")).toBe("AuditLog");
    expect(resourceName("email-verification-requests")).toBe("EmailVerificationRequest");
    expect(resourceName("categories")).toBe("Category");
    expect(resourceName("addresses")).toBe("Address");
  });
});

describe("jsonapi/camel-case-properties", () => {
  it("snake_case 속성 이름을 잡는다", async () => {
    const doc = validFixture();
    at(doc, "components", "schemas", "WidgetAttributes", "properties").created_at = {
      type: "string",
    };
    expect(await ruleIds(doc)).toEqual(["jsonapi/camel-case-properties"]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @ai-template/api-style test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `jsonapi/collection-parameters`가 있다.

- [ ] **Step 3: 네 규칙을 구현하고 모두 켠다**

`contract/api-style/rules/collection-parameters.js`:

```js
// @ts-check
import { bodySchema, defineRule, jsonApiOperations, record, refName } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

const REQUIRED = ["page[number]", "page[size]", "sort"];

/**
 * 컬렉션을 돌려주는 GET은 페이지·정렬·필드 선택 파라미터와 `x-jsonapi-sort`를 선언한다.
 * @param {Json} doc
 * @returns {Problem[]}
 */
export function check(doc) {
  /** @type {Problem[]} */
  const problems = [];
  for (const { path, method, operation } of jsonApiOperations(doc)) {
    if (method !== "get") continue;
    const document = refName(bodySchema(record(operation.responses)["200"]));
    if (!document?.endsWith("CollectionDocument")) continue;
    const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
    const names = parameters.map((parameter) => record(parameter).name);
    for (const name of REQUIRED.filter((required) => !names.includes(required))) {
      problems.push({
        path: ["paths", path, method, "parameters"],
        message: `컬렉션 GET은 "${name}" 파라미터를 선언한다(JsonApi.PageQuery와 sort를 펼쳐 넣는다).`,
      });
    }
    if (!names.some((name) => typeof name === "string" && name.startsWith("fields["))) {
      problems.push({
        path: ["paths", path, method, "parameters"],
        message: "컬렉션 GET은 주 리소스의 fields[<type>] 파라미터를 선언한다.",
      });
    }
    const sortable = operation["x-jsonapi-sort"];
    if (!Array.isArray(sortable) || sortable.length === 0) {
      problems.push({
        path: ["paths", path, method],
        message: '컬렉션 GET은 정렬 가능한 필드를 x-jsonapi-sort로 선언한다(예: ["createdAt"]).',
      });
    }
  }
  return problems;
}

export default defineRule(check);
```

`contract/api-style/rules/include-extension.js`:

```js
// @ts-check
import { defineRule, jsonApiOperations, record } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

/**
 * `include` 파라미터와 허용 경로 목록 `x-jsonapi-include`는 항상 함께 선언한다.
 * @param {Json} doc
 * @returns {Problem[]}
 */
export function check(doc) {
  /** @type {Problem[]} */
  const problems = [];
  for (const { path, method, operation } of jsonApiOperations(doc)) {
    const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
    const hasInclude = parameters.some((parameter) => record(parameter).name === "include");
    const paths = operation["x-jsonapi-include"];
    const hasPaths = Array.isArray(paths) && paths.length > 0;
    if (hasInclude && !hasPaths) {
      problems.push({
        path: ["paths", path, method],
        message:
          'include 파라미터가 있으면 허용 경로를 x-jsonapi-include로 선언한다(예: ["author"]).',
      });
    }
    if (!hasInclude && hasPaths) {
      problems.push({
        path: ["paths", path, method, "x-jsonapi-include"],
        message: "x-jsonapi-include를 선언했다면 include 쿼리 파라미터도 선언한다.",
      });
    }
  }
  return problems;
}

export default defineRule(check);
```

`contract/api-style/rules/schema-naming.js`:

```js
// @ts-check
import { constValue, defineRule, record, resourceName } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

/**
 * 스키마가 선언한 JSON:API 리소스 type. 리소스 객체는 type을, 요청 문서는 data.type을 본다.
 * @param {string} name
 * @param {Json} schema
 * @returns {string | undefined}
 */
function declaredType(name, schema) {
  if (name.endsWith("Resource")) return constValue(schema, "type");
  if (name.endsWith("CreateDocument") || name.endsWith("UpdateDocument")) {
    return constValue(record(record(schema.properties).data), "type");
  }
  return undefined;
}

/**
 * 스키마 이름은 점이 없고, 공용 목록(`shared` 옵션)에 있거나 리소스 이름으로 시작한다.
 * 리소스 이름은 type의 단수 PascalCase다. 예: audit-logs → AuditLog
 * @param {Json} doc
 * @param {Json} options
 * @returns {Problem[]}
 */
export function check(doc, options) {
  const shared = Array.isArray(options.shared) ? options.shared : [];
  const schemas = Object.entries(record(record(doc.components).schemas));
  /** @type {Problem[]} */
  const problems = [];
  const prefixes = new Set();
  for (const [name, schema] of schemas) {
    const type = declaredType(name, record(schema));
    if (type === undefined) continue;
    const prefix = resourceName(type);
    prefixes.add(prefix);
    if (!name.startsWith(prefix)) {
      problems.push({
        path: ["components", "schemas", name],
        message: `type "${type}"을 선언한 스키마 이름은 "${prefix}"로 시작한다.`,
      });
    }
  }
  for (const [name] of schemas) {
    if (name.includes(".")) {
      problems.push({
        path: ["components", "schemas", name],
        message: `스키마 이름 "${name}"에 점을 쓰지 않는다. TypeSpec에서는 @friendlyName으로 이름을 정한다.`,
      });
      continue;
    }
    if (shared.includes(name) || [...prefixes].some((prefix) => name.startsWith(prefix))) continue;
    problems.push({
      path: ["components", "schemas", name],
      message: `스키마 "${name}"는 리소스 이름(예: Post, AuditLog)으로 시작하거나 공용 목록에 있어야 한다.`,
    });
  }
  return problems;
}

export default defineRule(check);
```

`contract/api-style/rules/camel-case-properties.js`:

```js
// @ts-check
import { defineRule, isRecord } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;

/**
 * 문서 어디에 있든 스키마 `properties`의 키는 camelCase다.
 * @param {Json} doc
 * @returns {Problem[]}
 */
export function check(doc) {
  /** @type {Problem[]} */
  const problems = [];
  /**
   * @param {unknown} node
   * @param {(string | number)[]} path
   */
  const visit = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        visit(item, [...path, index]);
      });
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "properties" && isRecord(value)) {
        for (const property of Object.keys(value).filter((name) => !CAMEL_CASE.test(name))) {
          problems.push({
            path: [...path, key, property],
            message: `속성 이름 "${property}"를 camelCase로 바꾼다(예: created_at → createdAt).`,
          });
        }
      }
      visit(value, [...path, key]);
    }
  };
  visit(doc, []);
  return problems;
}

export default defineRule(check);
```

`contract/api-style/plugin.js` (전체 교체):

```js
// @ts-check
import camelCaseProperties from "./rules/camel-case-properties.js";
import collectionParameters from "./rules/collection-parameters.js";
import errorResponse from "./rules/error-response.js";
import includeExtension from "./rules/include-extension.js";
import mediaType from "./rules/media-type.js";
import requestDocument from "./rules/request-document.js";
import schemaNaming from "./rules/schema-naming.js";
import typeMatchesPath from "./rules/type-matches-path.js";

/** JSON:API 규약 룰셋. redocly.yaml에서 `jsonapi/<규칙>`으로 켠다. */
export default function jsonApiPlugin() {
  return {
    id: "jsonapi",
    rules: {
      oas3: {
        "media-type": mediaType,
        "error-response": errorResponse,
        "request-document": requestDocument,
        "type-matches-path": typeMatchesPath,
        "collection-parameters": collectionParameters,
        "include-extension": includeExtension,
        "schema-naming": schemaNaming,
        "camel-case-properties": camelCaseProperties,
      },
    },
  };
}
```

`contract/api-style/redocly.yaml` (전체 교체):

```yaml
plugins:
  - ./plugin.js
rules:
  struct: error
  operation-operationId: error
  operation-operationId-unique: error
  operation-parameters-unique: error
  operation-tag-defined: error
  path-parameters-defined: error
  paths-kebab-case: error
  no-path-trailing-slash: error
  jsonapi/media-type: error
  jsonapi/error-response: error
  jsonapi/request-document: error
  jsonapi/type-matches-path:
    severity: error
    aliases:
      me: users
  jsonapi/collection-parameters: error
  jsonapi/include-extension: error
  jsonapi/schema-naming:
    severity: error
    shared:
      - ErrorCode
      - ErrorDocument
      - ErrorObject
      - ErrorSource
      - PageMeta
      - PaginationLinks
      - CollectionMeta
      - Locale
      - OAuthProvider
      - HealthReport
  jsonapi/camel-case-properties: error
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/api-style test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  18 passed`가 있다.

- [ ] **Step 5: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 5단계`가 있다.

- [ ] **Step 6: 커밋한다**

```bash
git add -A
git commit -m "feat(api-style): add collection, include, naming and casing rules"
```


### Task 6: 계약: 사용자·역할·권한·파일

스펙 §4.3, §4.4, §4.10, §5.6의 사용자(`/me`, `/users`), 역할, 권한, 파일 엔드포인트를 TypeSpec으로 정의한다. 공개 사용자 표현(`UserPublicResource`)을 따로 두어 공개 글에 포함될 때 이메일이 새지 않게 한다.

**Files:**
- Create: `contract/typespec/test/accounts.test.ts`
- Create: `contract/typespec/src/resources/roles.tsp`
- Create: `contract/typespec/src/resources/files.tsp`
- Create: `contract/typespec/src/resources/users.tsp`
- Modify: `contract/typespec/src/main.tsp` (파일 전체를 이 태스크의 내용으로 바꾼다)

**Interfaces:**
- Consumes: Task 3의 `JsonApi` 템플릿과 에러 alias, Task 5의 룰셋(`pnpm check`가 계약을 검사)
- Produces: 스키마 `UserResource`, `UserPublicResource`, `UserDocument`, `UserCollectionDocument`, `UserMeDocument`, `UserMeUpdateDocument`, `UserUpdateDocument`, `Locale`, `UserStatus`, `RoleResource`, `RoleDocument`, `RoleCollectionDocument`, `RoleCreateDocument`, `RoleUpdateDocument`, `PermissionCode`, `PermissionResource`, `PermissionCollectionDocument`, `FileResource`(meta: `FileMeta`), `FileDocument`, `FileCreateDocument`, `FileUpdateDocument`, `FileStatus`, `FileUpload`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`contract/typespec/test/accounts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  auth,
  includedRefs,
  operation,
  parameterNames,
  requestRef,
  resourceType,
  responseRef,
  schema,
  spec,
  statuses,
} from "./spec.ts";

describe("사용자 (§4.10, §5.6)", () => {
  it("전체 속성과 공개 속성을 나눠 둔다", () => {
    expect(resourceType(schema("UserResource"))).toBe("users");
    expect(resourceType(schema("UserPublicResource"))).toBe("users");
    expect(Object.keys(schema("UserPublicAttributes").properties ?? {})).toEqual(["name"]);
    expect(schema("UserAttributes").required).toEqual([
      "email",
      "name",
      "locale",
      "status",
      "emailVerifiedAt",
      "createdAt",
      "updatedAt",
    ]);
  });

  it("GET /me는 로그인이 필요하고 meta.permissions를 담는다", () => {
    const me = operation("get", "/api/v1/me");
    expect(auth(me)).toBe("required");
    expect(responseRef(me, "200")).toBe("UserMeDocument");
    const meta = schema("UserMeDocument").properties?.meta;
    expect(meta?.required).toEqual(["permissions"]);
  });

  it("PATCH /me와 DELETE /me(탈퇴)가 있다", () => {
    expect(requestRef(operation("patch", "/api/v1/me"))).toBe("UserMeUpdateDocument");
    expect(statuses(operation("delete", "/api/v1/me"))).toContain("204");
  });

  it("관리용 목록은 users:read 권한과 필터를 선언한다", () => {
    const list = operation("get", "/api/v1/users");
    expect(list["x-permission"]).toBe("users:read");
    expect(parameterNames(list)).toEqual(
      expect.arrayContaining(["filter[q]", "filter[status]", "filter[role]", "fields[users]"]),
    );
    expect(responseRef(list, "200")).toBe("UserCollectionDocument");
    expect(includedRefs(schema("UserCollectionDocument"))).toEqual([
      "FileResource",
      "RoleResource",
    ]);
  });

  it("상태와 역할 변경은 users:manage 권한이 필요하다", () => {
    const update = operation("patch", "/api/v1/users/{id}");
    expect(update["x-permission"]).toBe("users:manage");
    expect(requestRef(update)).toBe("UserUpdateDocument");
    expect(statuses(update)).toEqual(expect.arrayContaining(["200", "404", "409", "415", "422"]));
  });
});

describe("역할과 권한 (§4.3)", () => {
  it("권한 코드 목록이 스펙과 같다", () => {
    expect(schema("PermissionCode").enum).toEqual([
      "admin:access",
      "users:read",
      "users:manage",
      "roles:read",
      "roles:manage",
      "audit-logs:read",
      "posts:create",
      "posts:manage",
    ]);
  });

  it("역할 CRUD 권한을 나눠 선언한다", () => {
    expect(operation("get", "/api/v1/roles")["x-permission"]).toBe("roles:read");
    expect(operation("post", "/api/v1/roles")["x-permission"]).toBe("roles:manage");
    expect(operation("delete", "/api/v1/roles/{id}")["x-permission"]).toBe("roles:manage");
    expect(statuses(operation("delete", "/api/v1/roles/{id}"))).toContain("422");
  });

  it("권한 목록은 id가 권한 코드인 읽기 전용 컬렉션이다", () => {
    const list = operation("get", "/api/v1/permissions");
    expect(responseRef(list, "200")).toBe("PermissionCollectionDocument");
    expect(Object.keys(spec.paths["/api/v1/permissions"] ?? {})).toEqual(["get"]);
  });
});

describe("파일 (§4.4)", () => {
  it("생성하면 meta.upload에 presigned URL을 담는다", () => {
    const create = operation("post", "/api/v1/files");
    expect(requestRef(create)).toBe("FileCreateDocument");
    expect(responseRef(create, "201")).toBe("FileDocument");
    expect(Object.keys(schema("FileMeta").properties ?? {})).toEqual([
      "upload",
      "downloadUrl",
      "downloadUrlExpiresAt",
    ]);
  });

  it("조회는 비로그인도 시도할 수 있다(읽기 규칙은 백엔드가 판정)", () => {
    expect(auth(operation("get", "/api/v1/files/{id}"))).toBe("optional");
  });

  it("업로드 완료 확인은 PATCH로 status를 ready로 바꾼다", () => {
    const update = operation("patch", "/api/v1/files/{id}");
    expect(requestRef(update)).toBe("FileUpdateDocument");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @ai-template/contract test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `UserResource`가 있다.

- [ ] **Step 3: 리소스를 정의하고 main.tsp에 등록한다**

`@patch(#{ implicitOptionality: false })`로 PATCH 본문을 자동으로 선택 속성으로 바꾸지 않게 한다. 선택 여부는 `*UpdateAttributes` 모델에 직접 적는다.

`contract/typespec/src/resources/roles.tsp`:

```typespec
import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";

using Http;
using OpenAPI;

namespace Platform;

/** 코드에 정의된 권한. 역할은 이 값들의 묶음이다. */
union PermissionCode {
  "admin:access",
  "users:read",
  "users:manage",
  "roles:read",
  "roles:manage",
  "audit-logs:read",
  "posts:create",
  "posts:manage",
}

model RoleAttributes {
  name: string;
  description: string | null;
  permissions: PermissionCode[];

  /** 시드된 시스템 역할(admin, member). 삭제할 수 없다. */
  isSystem: boolean;

  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

model RoleCreateAttributes {
  @minLength(1) @maxLength(50) name: string;
  @maxLength(200) description?: string | null;
  permissions: PermissionCode[];
}

model RoleUpdateAttributes {
  @minLength(1) @maxLength(50) name?: string;
  @maxLength(200) description?: string | null;
  permissions?: PermissionCode[];
}

model RoleResource is JsonApi.Resource<"roles", RoleAttributes>;
model RoleDocument is JsonApi.Document<RoleResource>;
model RoleCollectionDocument is JsonApi.CollectionDocument<RoleResource>;
model RoleCreateDocument is JsonApi.CreateDocument<"roles", RoleCreateAttributes>;
model RoleUpdateDocument is JsonApi.UpdateDocument<"roles", RoleUpdateAttributes>;

/** 권한 하나. id는 권한 코드(예: posts:manage)다. */
model PermissionAttributes {
  description: string;

  /** 화면에서 묶어 보여 줄 그룹. 예: posts */
  group: string;
}

model PermissionResource is JsonApi.Resource<"permissions", PermissionAttributes>;
model PermissionCollectionDocument is JsonApi.CollectionDocument<PermissionResource>;

@route("/api/v1/roles")
@tag("roles")
@useAuth(BearerAuth)
interface Roles {
  @get
  @extension("x-permission", "roles:read")
  @extension("x-jsonapi-sort", #["name", "createdAt"])
  list(
    ...JsonApi.PageQuery,
    @query sort?: string,
    @query("fields[roles]") fieldsRoles?: string,
    @query("filter[q]") filterQ?: string,
  ): JsonApi.Ok<RoleCollectionDocument> | AuthErrors | CommonErrors;

  @post
  @extension("x-permission", "roles:manage")
  create(...JsonApi.Body<RoleCreateDocument>):
    | JsonApi.Created<RoleDocument>
    | AuthErrors
    | BodyErrors
    | CommonErrors;

  @get
  @route("{id}")
  @extension("x-permission", "roles:read")
  get(@path @format("uuid") id: string, @query("fields[roles]") fieldsRoles?: string):
    | JsonApi.Ok<RoleDocument>
    | AuthErrors
    | NotFound
    | CommonErrors;

  @patch(#{ implicitOptionality: false })
  @route("{id}")
  @extension("x-permission", "roles:manage")
  update(@path @format("uuid") id: string, ...JsonApi.Body<RoleUpdateDocument>):
    | JsonApi.Ok<RoleDocument>
    | AuthErrors
    | NotFound
    | Conflict
    | BodyErrors
    | CommonErrors;

  /** 시스템 역할은 지울 수 없다(role.system_role_protected, 422). */
  @delete
  @route("{id}")
  @extension("x-permission", "roles:manage")
  delete(@path @format("uuid") id: string):
    | JsonApi.NoContent
    | AuthErrors
    | NotFound
    | UnprocessableEntity
    | CommonErrors;
}

@route("/api/v1/permissions")
@tag("permissions")
@useAuth(BearerAuth)
interface Permissions {
  @get
  @extension("x-permission", "roles:read")
  @extension("x-jsonapi-sort", #["id"])
  list(
    ...JsonApi.PageQuery,
    @query sort?: string,
    @query("fields[permissions]") fieldsPermissions?: string,
  ): JsonApi.Ok<PermissionCollectionDocument> | AuthErrors | CommonErrors;
}
```

`contract/typespec/src/resources/files.tsp`:

```typespec
import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";

using Http;
using OpenAPI;

namespace Platform;

/** pending: 업로드 URL만 발급됨. ready: 백엔드가 객체를 확인함. */
union FileStatus {
  "pending",
  "ready",
}

model FileAttributes {
  filename: string;
  contentType: string;
  size: int64;
  status: FileStatus;
  createdAt: utcDateTime;
}

model FileRelationships {
  owner: JsonApi.ToOne<"users">;
}

/** 브라우저가 스토리지에 직접 올릴 때 쓰는 presigned 요청 정보. */
model FileUpload {
  url: url;
  method: "PUT";

  /** 업로드 요청에 그대로 붙여야 하는 헤더. */
  headers: Record<string>;

  expiresAt: utcDateTime;
}

model FileMeta {
  /** POST /files 응답에만 있다. */
  upload?: FileUpload;

  /** ready인 파일에만 있다. 수명이 짧다. */
  downloadUrl?: url;

  downloadUrlExpiresAt?: utcDateTime;
}

model FileCreateAttributes {
  @minLength(1) @maxLength(255) filename: string;
  contentType: string;
  @minValue(1) size: int64;
}

model FileUpdateAttributes {
  /** 업로드를 마쳤다고 알린다. 백엔드가 객체를 확인한 뒤 ready로 바꾼다. */
  status?: "ready";
}

model FileResource is JsonApi.ResourceWithRelationships<
  "files",
  FileAttributes,
  FileRelationships
> {
  meta?: FileMeta;
}

model FileDocument is JsonApi.Document<FileResource>;
model FileCreateDocument is JsonApi.CreateDocument<"files", FileCreateAttributes>;
model FileUpdateDocument is JsonApi.UpdateDocument<"files", FileUpdateAttributes>;

@route("/api/v1/files")
@tag("files")
@useAuth(BearerAuth)
interface Files {
  /** 크기와 MIME을 검사한 뒤 pending 파일을 만들고 meta.upload에 presigned URL을 담는다. */
  @post
  create(...JsonApi.Body<FileCreateDocument>):
    | JsonApi.Created<FileDocument>
    | AuthErrors
    | BodyErrors
    | CommonErrors;

  /** 소유자, 또는 이 파일을 참조하는 리소스를 읽을 수 있는 사람만 조회한다(예: 발행된 글의 커버 이미지는 누구나). */
  @get
  @route("{id}")
  @useAuth(BearerAuth | NoAuth)
  get(@path @format("uuid") id: string, @query("fields[files]") fieldsFiles?: string):
    | JsonApi.Ok<FileDocument>
    | AuthErrors
    | NotFound
    | CommonErrors;

  /** status를 ready로 바꿔 업로드 완료를 알린다. 객체가 없으면 file.upload_incomplete(422). */
  @patch(#{ implicitOptionality: false })
  @route("{id}")
  update(@path @format("uuid") id: string, ...JsonApi.Body<FileUpdateDocument>):
    | JsonApi.Ok<FileDocument>
    | AuthErrors
    | NotFound
    | Conflict
    | BodyErrors
    | CommonErrors;

  @delete
  @route("{id}")
  delete(@path @format("uuid") id: string):
    | JsonApi.NoContent
    | AuthErrors
    | NotFound
    | CommonErrors;
}
```

`contract/typespec/src/resources/users.tsp`:

```typespec
import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";
import "./roles.tsp";
import "./files.tsp";

using Http;
using OpenAPI;

namespace Platform;

union Locale {
  "ko",
  "en",
}

union UserStatus {
  "active",
  "deactivated",
}

/** 본인과 users:read 권한자에게 보이는 전체 속성. */
model UserAttributes {
  email: string;
  name: string;
  locale: Locale;
  status: UserStatus;
  emailVerifiedAt: utcDateTime | null;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

model UserRelationships {
  roles: JsonApi.ToMany<"roles">;
  avatar: JsonApi.ToOne<"files">;
}

/** 다른 사람과 비로그인 사용자에게 보이는 공개 속성. 이메일을 절대 담지 않는다. */
model UserPublicAttributes {
  name: string;
}

model UserPublicRelationships {
  avatar: JsonApi.ToOne<"files">;
}

model UserResource is JsonApi.ResourceWithRelationships<"users", UserAttributes, UserRelationships>;

model UserPublicResource is JsonApi.ResourceWithRelationships<
  "users",
  UserPublicAttributes,
  UserPublicRelationships
>;

model UserDocument is JsonApi.Document<UserResource> {
  included?: (RoleResource | FileResource)[];
}

model UserCollectionDocument is JsonApi.CollectionDocument<UserResource> {
  included?: (RoleResource | FileResource)[];
}

/** GET /me 응답. meta.permissions에 실제 적용되는 권한을 담는다. */
model UserMeDocument is JsonApi.Document<UserResource> {
  included?: (RoleResource | FileResource)[];
  meta: {
    permissions: PermissionCode[];
  };
}

model UserMeUpdateAttributes {
  @minLength(1) @maxLength(100) name?: string;
  locale?: Locale;
}

model UserMeUpdateRelationships {
  avatar?: JsonApi.ToOne<"files">;
}

model UserMeUpdateDocument is JsonApi.UpdateDocumentWithRelationships<
  "users",
  UserMeUpdateAttributes,
  UserMeUpdateRelationships
>;

model UserUpdateAttributes {
  status?: UserStatus;
}

model UserUpdateRelationships {
  roles?: JsonApi.ToMany<"roles">;
}

model UserUpdateDocument is JsonApi.UpdateDocumentWithRelationships<
  "users",
  UserUpdateAttributes,
  UserUpdateRelationships
>;

alias UserQuery = {
  @query include?: string;
  @query("fields[users]") fieldsUsers?: string;
  @query("fields[roles]") fieldsRoles?: string;
  @query("fields[files]") fieldsFiles?: string;
};

@route("/api/v1/me")
@tag("me")
@useAuth(BearerAuth)
interface Me {
  @get
  @extension("x-jsonapi-include", #["roles", "avatar"])
  get(...UserQuery): JsonApi.Ok<UserMeDocument> | AuthErrors | CommonErrors;

  @patch(#{ implicitOptionality: false })
  update(...JsonApi.Body<UserMeUpdateDocument>):
    | JsonApi.Ok<UserMeDocument>
    | AuthErrors
    | Conflict
    | BodyErrors
    | CommonErrors;

  /** 회원 탈퇴. 개인정보를 익명화하고 모든 세션을 폐기한다. */
  @delete
  delete(): JsonApi.NoContent | AuthErrors | CommonErrors;
}

@route("/api/v1/users")
@tag("users")
@useAuth(BearerAuth)
interface Users {
  @get
  @extension("x-permission", "users:read")
  @extension("x-jsonapi-sort", #["createdAt", "name", "email"])
  @extension("x-jsonapi-include", #["roles", "avatar"])
  list(
    ...JsonApi.PageQuery,
    @query sort?: string,
    ...UserQuery,
    @query("filter[q]") filterQ?: string,
    @query("filter[status]") filterStatus?: UserStatus,
    @query("filter[role]") filterRole?: string,
  ): JsonApi.Ok<UserCollectionDocument> | AuthErrors | CommonErrors;

  @get
  @route("{id}")
  @extension("x-permission", "users:read")
  @extension("x-jsonapi-include", #["roles", "avatar"])
  get(@path @format("uuid") id: string, ...UserQuery):
    | JsonApi.Ok<UserDocument>
    | AuthErrors
    | NotFound
    | CommonErrors;

  /** 상태(비활성화)와 역할을 바꾼다. */
  @patch(#{ implicitOptionality: false })
  @route("{id}")
  @extension("x-permission", "users:manage")
  update(@path @format("uuid") id: string, ...JsonApi.Body<UserUpdateDocument>):
    | JsonApi.Ok<UserDocument>
    | AuthErrors
    | NotFound
    | Conflict
    | BodyErrors
    | CommonErrors;
}
```

`contract/typespec/src/main.tsp` (전체 교체):

```typespec
import "@typespec/http";
import "@typespec/openapi";
import "./jsonapi.tsp";
import "./errors.tsp";
import "./resources/health.tsp";
import "./resources/roles.tsp";
import "./resources/files.tsp";
import "./resources/users.tsp";

using Http;
using OpenAPI;

/** AI 템플릿 플랫폼 API 계약. FastAPI와 NestJS 템플릿이 똑같이 구현한다. */
@service(#{ title: "AI Template Platform API" })
@info(#{ version: "1.0.0" })
@server("http://localhost:8000", "로컬 개발 서버")
namespace Platform;
```

- [ ] **Step 4: 컴파일한다**

Run: `pnpm --filter @ai-template/contract run build`
Expected: 성공한다(종료 코드 0). 출력에 `Compilation completed successfully.`가 있다.

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/contract test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  17 passed`가 있다.

- [ ] **Step 6: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 5단계`가 있다.

- [ ] **Step 7: 커밋한다**

```bash
git add -A
git commit -m "feat(contract): add users, roles, permissions and files"
```


### Task 7: 계약: 골든 모듈 posts와 감사 로그

스펙 §4.9의 골든 모듈 `posts`와 §4.6의 감사 로그를 정의한다. `posts.tsp`는 새 리소스가 따라 할 정답 구조다.

**Files:**
- Create: `contract/typespec/test/posts.test.ts`
- Create: `contract/typespec/src/resources/posts.tsp`
- Create: `contract/typespec/src/resources/audit-logs.tsp`
- Modify: `contract/typespec/src/main.tsp` (파일 전체를 이 태스크의 내용으로 바꾼다)

**Interfaces:**
- Consumes: Task 6의 `UserPublicResource`, `UserResource`, `FileResource`
- Produces: 스키마 `PostStatus`, `PostAttributes`, `PostRelationships`, `PostResource`, `PostDocument`, `PostCollectionDocument`, `PostCreateDocument`, `PostUpdateDocument`, `AuditLogResource`, `AuditLogDocument`, `AuditLogCollectionDocument`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`contract/typespec/test/posts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  auth,
  includedRefs,
  operation,
  parameterNames,
  requestRef,
  resourceType,
  responseRef,
  schema,
  statuses,
} from "./spec.ts";

const COLLECTION = "/api/v1/posts";
const ITEM = "/api/v1/posts/{id}";

describe("골든 모듈 posts (§4.9)", () => {
  it("다섯 가지 operation을 모두 선언한다", () => {
    expect(responseRef(operation("get", COLLECTION), "200")).toBe("PostCollectionDocument");
    expect(responseRef(operation("post", COLLECTION), "201")).toBe("PostDocument");
    expect(responseRef(operation("get", ITEM), "200")).toBe("PostDocument");
    expect(responseRef(operation("patch", ITEM), "200")).toBe("PostDocument");
    expect(statuses(operation("delete", ITEM))).toContain("204");
  });

  it("목록은 페이지·정렬·포함·필드·필터 파라미터를 선언한다", () => {
    const list = operation("get", COLLECTION);
    expect(parameterNames(list)).toEqual([
      "page[number]",
      "page[size]",
      "sort",
      "include",
      "fields[posts]",
      "fields[users]",
      "fields[files]",
      "filter[status]",
      "filter[author]",
      "filter[q]",
    ]);
    expect(list["x-jsonapi-sort"]).toEqual(["createdAt", "publishedAt", "title"]);
    expect(list["x-jsonapi-include"]).toEqual(["author", "coverImage"]);
  });

  it("읽기는 비로그인도 되고, 쓰기는 로그인이 필요하다", () => {
    expect(auth(operation("get", COLLECTION))).toBe("optional");
    expect(auth(operation("get", ITEM))).toBe("optional");
    expect(auth(operation("post", COLLECTION))).toBe("required");
    expect(auth(operation("patch", ITEM))).toBe("required");
    expect(auth(operation("delete", ITEM))).toBe("required");
    expect(operation("post", COLLECTION)["x-permission"]).toBe("posts:create");
  });

  it("리소스는 type이 posts이고 작성자와 커버 이미지 관계를 가진다", () => {
    const resource = schema("PostResource");
    expect(resourceType(resource)).toBe("posts");
    expect(Object.keys(schema("PostRelationships").properties ?? {})).toEqual([
      "author",
      "coverImage",
    ]);
  });

  it("포함 리소스는 공개 사용자와 파일이다(이메일이 새지 않는다)", () => {
    expect(includedRefs(schema("PostDocument"))).toEqual(["FileResource", "UserPublicResource"]);
    expect(includedRefs(schema("PostCollectionDocument"))).toEqual([
      "FileResource",
      "UserPublicResource",
    ]);
  });

  it("생성·수정 문서를 쓰고 수정은 409와 422를 선언한다", () => {
    expect(requestRef(operation("post", COLLECTION))).toBe("PostCreateDocument");
    const update = operation("patch", ITEM);
    expect(requestRef(update)).toBe("PostUpdateDocument");
    expect(statuses(update)).toEqual(expect.arrayContaining(["409", "415", "422"]));
  });

  it("공통 에러(400, 406, 429, 500, 503)를 모든 operation에 선언한다", () => {
    for (const [method, path] of [
      ["get", COLLECTION],
      ["post", COLLECTION],
      ["get", ITEM],
      ["patch", ITEM],
      ["delete", ITEM],
    ] as const) {
      expect(statuses(operation(method, path))).toEqual(
        expect.arrayContaining(["400", "406", "429", "500", "503"]),
      );
    }
  });

  it("429 응답은 Retry-After 헤더를 담는다", () => {
    const tooMany = operation("get", COLLECTION).responses["429"];
    expect(Object.keys(tooMany?.headers ?? {})).toContain("Retry-After");
  });
});

describe("감사 로그 (§4.6)", () => {
  it("audit-logs:read 권한으로 목록과 단건을 읽는다", () => {
    const list = operation("get", "/api/v1/audit-logs");
    expect(list["x-permission"]).toBe("audit-logs:read");
    expect(resourceType(schema("AuditLogResource"))).toBe("audit-logs");
    expect(parameterNames(list)).toEqual(
      expect.arrayContaining([
        "filter[actor]",
        "filter[action]",
        "filter[targetType]",
        "filter[createdFrom]",
        "filter[createdTo]",
      ]),
    );
    expect(operation("get", "/api/v1/audit-logs/{id}")["x-permission"]).toBe("audit-logs:read");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @ai-template/contract test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `/api/v1/posts`가 있다.

- [ ] **Step 3: 리소스를 정의하고 main.tsp에 등록한다**

`contract/typespec/src/resources/posts.tsp`:

```typespec
import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";
import "./users.tsp";
import "./files.tsp";

using Http;
using OpenAPI;

namespace Platform;

/** 골든 모듈. 새 리소스는 이 파일의 구조를 그대로 따른다. */
union PostStatus {
  "draft",
  "published",
}

model PostAttributes {
  @minLength(1) @maxLength(200) title: string;

  /** 마크다운 본문. */
  body: string;

  status: PostStatus;

  /** 발행하면 채워지고, 발행을 취소하면 null이 된다. */
  publishedAt: utcDateTime | null;

  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

model PostRelationships {
  author: JsonApi.ToOne<"users">;
  coverImage: JsonApi.ToOne<"files">;
}

model PostCreateAttributes {
  @minLength(1) @maxLength(200) title: string;
  body: string;

  /** 생략하면 draft. */
  status?: PostStatus;
}

model PostUpdateAttributes {
  @minLength(1) @maxLength(200) title?: string;
  body?: string;

  /** draft ↔ published 전이. 허용되지 않는 전이는 post.invalid_transition(422). */
  status?: PostStatus;
}

model PostWriteRelationships {
  coverImage?: JsonApi.ToOne<"files">;
}

model PostResource is JsonApi.ResourceWithRelationships<"posts", PostAttributes, PostRelationships>;

model PostDocument is JsonApi.Document<PostResource> {
  included?: (UserPublicResource | FileResource)[];
}

model PostCollectionDocument is JsonApi.CollectionDocument<PostResource> {
  included?: (UserPublicResource | FileResource)[];
}

model PostCreateDocument is JsonApi.CreateDocumentWithRelationships<
  "posts",
  PostCreateAttributes,
  PostWriteRelationships
>;

model PostUpdateDocument is JsonApi.UpdateDocumentWithRelationships<
  "posts",
  PostUpdateAttributes,
  PostWriteRelationships
>;

alias PostQuery = {
  @query include?: string;
  @query("fields[posts]") fieldsPosts?: string;
  @query("fields[users]") fieldsUsers?: string;
  @query("fields[files]") fieldsFiles?: string;
};

@route("/api/v1/posts")
@tag("posts")
interface Posts {
  /** 기본은 발행된 글만 돌려준다. 초안은 작성자 본인(filter[author]=본인 id)이거나 posts:manage 권한이 있을 때만 보인다. */
  @get
  @useAuth(BearerAuth | NoAuth)
  @extension("x-jsonapi-sort", #["createdAt", "publishedAt", "title"])
  @extension("x-jsonapi-include", #["author", "coverImage"])
  list(
    ...JsonApi.PageQuery,
    @query sort?: string,
    ...PostQuery,
    @query("filter[status]") filterStatus?: PostStatus,
    @query("filter[author]") filterAuthor?: string,
    @query("filter[q]") filterQ?: string,
  ): JsonApi.Ok<PostCollectionDocument> | AuthErrors | CommonErrors;

  @post
  @useAuth(BearerAuth)
  @extension("x-permission", "posts:create")
  create(...JsonApi.Body<PostCreateDocument>):
    | JsonApi.Created<PostDocument>
    | AuthErrors
    | BodyErrors
    | CommonErrors;

  @get
  @route("{id}")
  @useAuth(BearerAuth | NoAuth)
  @extension("x-jsonapi-include", #["author", "coverImage"])
  get(@path @format("uuid") id: string, ...PostQuery):
    | JsonApi.Ok<PostDocument>
    | AuthErrors
    | NotFound
    | CommonErrors;

  /** 작성자 또는 posts:manage 권한자만 고친다. status를 바꿔 발행하거나 발행을 취소한다. */
  @patch(#{ implicitOptionality: false })
  @route("{id}")
  @useAuth(BearerAuth)
  update(@path @format("uuid") id: string, ...JsonApi.Body<PostUpdateDocument>):
    | JsonApi.Ok<PostDocument>
    | AuthErrors
    | NotFound
    | Conflict
    | BodyErrors
    | CommonErrors;

  /** 작성자 또는 posts:manage 권한자만 지운다. 관리자가 남의 글을 지우면 감사 로그를 남긴다. */
  @delete
  @route("{id}")
  @useAuth(BearerAuth)
  delete(@path @format("uuid") id: string):
    | JsonApi.NoContent
    | AuthErrors
    | NotFound
    | CommonErrors;
}
```

`contract/typespec/src/resources/audit-logs.tsp`:

```typespec
import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";
import "./users.tsp";

using Http;
using OpenAPI;

namespace Platform;

/** 보안·관리 행위 기록. 백엔드만 쓰고 API로는 읽기만 한다. */
model AuditLogAttributes {
  /** 예: user.deactivated, role.updated, session.login_failed */
  action: string;

  targetType: string | null;
  targetId: string | null;
  metadata: Record<unknown>;
  ipAddress: string | null;
  createdAt: utcDateTime;
}

model AuditLogRelationships {
  actor: JsonApi.ToOne<"users">;
}

model AuditLogResource is JsonApi.ResourceWithRelationships<
  "audit-logs",
  AuditLogAttributes,
  AuditLogRelationships
>;

model AuditLogDocument is JsonApi.Document<AuditLogResource> {
  included?: UserResource[];
}

model AuditLogCollectionDocument is JsonApi.CollectionDocument<AuditLogResource> {
  included?: UserResource[];
}

alias AuditLogQuery = {
  @query include?: string;
  @query("fields[audit-logs]") fieldsAuditLogs?: string;
  @query("fields[users]") fieldsUsers?: string;
};

@route("/api/v1/audit-logs")
@tag("audit-logs")
@useAuth(BearerAuth)
interface AuditLogs {
  @get
  @extension("x-permission", "audit-logs:read")
  @extension("x-jsonapi-sort", #["createdAt"])
  @extension("x-jsonapi-include", #["actor"])
  list(
    ...JsonApi.PageQuery,
    @query sort?: string,
    ...AuditLogQuery,
    @query("filter[actor]") filterActor?: string,
    @query("filter[action]") filterAction?: string,
    @query("filter[targetType]") filterTargetType?: string,
    @query("filter[createdFrom]") filterCreatedFrom?: utcDateTime,
    @query("filter[createdTo]") filterCreatedTo?: utcDateTime,
  ): JsonApi.Ok<AuditLogCollectionDocument> | AuthErrors | CommonErrors;

  @get
  @route("{id}")
  @extension("x-permission", "audit-logs:read")
  @extension("x-jsonapi-include", #["actor"])
  get(@path @format("uuid") id: string, ...AuditLogQuery):
    | JsonApi.Ok<AuditLogDocument>
    | AuthErrors
    | NotFound
    | CommonErrors;
}
```

`contract/typespec/src/main.tsp` (전체 교체):

```typespec
import "@typespec/http";
import "@typespec/openapi";
import "./jsonapi.tsp";
import "./errors.tsp";
import "./resources/health.tsp";
import "./resources/roles.tsp";
import "./resources/files.tsp";
import "./resources/users.tsp";
import "./resources/posts.tsp";
import "./resources/audit-logs.tsp";

using Http;
using OpenAPI;

/** AI 템플릿 플랫폼 API 계약. FastAPI와 NestJS 템플릿이 똑같이 구현한다. */
@service(#{ title: "AI Template Platform API" })
@info(#{ version: "1.0.0" })
@server("http://localhost:8000", "로컬 개발 서버")
namespace Platform;
```

- [ ] **Step 4: 컴파일한다**

Run: `pnpm --filter @ai-template/contract run build`
Expected: 성공한다(종료 코드 0). 출력에 `Compilation completed successfully.`가 있다.

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/contract test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  26 passed`가 있다.

- [ ] **Step 6: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 5단계`가 있다.

- [ ] **Step 7: 커밋한다**

```bash
git add -A
git commit -m "feat(contract): add golden posts module and audit logs"
```


### Task 8: 계약: 인증과 세션

스펙 §4.2, §5.5의 가입, 이메일 인증, 로그인·갱신·소셜 로그인 완료(grantType 판별 유니온), 세션 폐기, 비밀번호 재설정·변경, OAuth 리다이렉트(예외), 실시간 티켓을 정의한다.

**Files:**
- Create: `contract/typespec/test/auth.test.ts`
- Create: `contract/typespec/src/resources/auth.tsp`
- Create: `contract/typespec/src/resources/sessions.tsp`
- Modify: `contract/typespec/src/main.tsp` (파일 전체를 이 태스크의 내용으로 바꾼다)

**Interfaces:**
- Consumes: Task 6의 `Locale`
- Produces: 스키마 `RegistrationCreateDocument`, `RegistrationDocument`, `EmailVerificationRequestCreateDocument`, `EmailVerificationCreateDocument`, `EmailVerificationDocument`, `PasswordResetRequestCreateDocument`, `PasswordResetCreateDocument`, `PasswordResetDocument`, `PasswordChangeCreateDocument`, `PasswordChangeDocument`, `OAuthProvider`, `SessionGrant`(oneOf `SessionPasswordGrant` | `SessionRefreshTokenGrant` | `SessionOAuthCodeGrant`), `SessionCreateDocument`, `SessionWithTokensDocument`, `SessionCollectionDocument`, `SessionRevocationCreateDocument`, `SessionRevocationDocument`, `RealtimeTicketCreateDocument`, `RealtimeTicketDocument`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`contract/typespec/test/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  auth,
  operation,
  refName,
  requestRef,
  resourceType,
  responseRef,
  schema,
  spec,
  statuses,
} from "./spec.ts";

describe("가입과 이메일 인증 (§4.2)", () => {
  it("가입은 공개 엔드포인트이고 201로 가입 리소스를 돌려준다", () => {
    const create = operation("post", "/api/v1/registrations");
    expect(auth(create)).toBe("none");
    expect(requestRef(create)).toBe("RegistrationCreateDocument");
    expect(responseRef(create, "201")).toBe("RegistrationDocument");
  });

  it("인증 메일 재발송과 비밀번호 재설정 요청은 항상 202다", () => {
    for (const path of ["/api/v1/email-verification-requests", "/api/v1/password-reset-requests"]) {
      const create = operation("post", path);
      expect(statuses(create)).toContain("202");
      expect(statuses(create)).not.toContain("201");
    }
  });

  it("이메일 인증과 비밀번호 재설정은 토큰을 받는다", () => {
    expect(requestRef(operation("post", "/api/v1/email-verifications"))).toBe(
      "EmailVerificationCreateDocument",
    );
    expect(requestRef(operation("post", "/api/v1/password-resets"))).toBe(
      "PasswordResetCreateDocument",
    );
  });

  it("비밀번호 변경은 로그인이 필요하다", () => {
    expect(auth(operation("post", "/api/v1/password-changes"))).toBe("required");
  });
});

describe("세션 (§4.2, §5.5)", () => {
  it("로그인·갱신·소셜 로그인 완료를 grantType 판별 유니온으로 받는다", () => {
    const grant = schema("SessionGrant");
    expect(grant.oneOf?.map((variant) => refName(variant))).toEqual([
      "SessionPasswordGrant",
      "SessionRefreshTokenGrant",
      "SessionOAuthCodeGrant",
    ]);
    const create = operation("post", "/api/v1/sessions");
    expect(auth(create)).toBe("none");
    expect(responseRef(create, "201")).toBe("SessionWithTokensDocument");
  });

  it("토큰은 생성 응답에만 있고 목록에는 없다", () => {
    const withTokens = Object.keys(schema("SessionWithTokensAttributes").properties ?? {});
    expect(withTokens).toEqual(expect.arrayContaining(["accessToken", "refreshToken"]));
    const plain = Object.keys(schema("SessionAttributes").properties ?? {});
    expect(plain).not.toContain("accessToken");
    expect(resourceType(schema("SessionWithTokensResource"))).toBe("sessions");
  });

  it("현재 세션 로그아웃과 특정 세션 폐기를 나눠 둔다", () => {
    expect(statuses(operation("delete", "/api/v1/sessions/current"))).toContain("204");
    expect(statuses(operation("delete", "/api/v1/sessions/{id}"))).toContain("404");
  });

  it("다른 기기·전체 로그아웃은 session-revocations로 한다", () => {
    const create = operation("post", "/api/v1/session-revocations");
    expect(requestRef(create)).toBe("SessionRevocationCreateDocument");
    expect(schema("SessionRevocationScope").enum).toEqual(["others", "all"]);
  });

  it("실시간 티켓은 로그인한 사용자만 발급받는다", () => {
    const create = operation("post", "/api/v1/realtime-tickets");
    expect(auth(create)).toBe("required");
    expect(responseRef(create, "201")).toBe("RealtimeTicketDocument");
  });
});

describe("OAuth 리다이렉트 (JSON:API 예외)", () => {
  it("authorize와 callback은 302로 리다이렉트한다", () => {
    for (const path of [
      "/api/v1/oauth/{provider}/authorize",
      "/api/v1/oauth/{provider}/callback",
    ]) {
      const redirect = operation("get", path);
      expect(statuses(redirect)).toContain("302");
      expect(Object.keys(redirect.responses["302"]?.headers ?? {})).toEqual(["location"]);
    }
  });

  it("제공자는 google, kakao, naver다", () => {
    expect(schema("OAuthProvider").enum).toEqual(["google", "kakao", "naver"]);
  });

  it("계약의 모든 경로가 /api/v1 또는 /health 아래에 있다", () => {
    for (const path of Object.keys(spec.paths)) {
      expect(path.startsWith("/api/v1/") || path.startsWith("/health/")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @ai-template/contract test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `/api/v1/registrations`가 있다.

- [ ] **Step 3: 리소스를 정의하고 main.tsp에 등록한다**

`contract/typespec/src/resources/auth.tsp`:

```typespec
import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";
import "./users.tsp";

using Http;
using OpenAPI;

namespace Platform;

model RegistrationAttributes {
  email: string;
  createdAt: utcDateTime;
}

model RegistrationRelationships {
  user: JsonApi.ToOne<"users">;
}

model RegistrationCreateAttributes {
  @format("email") email: string;
  @minLength(8) @maxLength(128) password: string;
  @minLength(1) @maxLength(100) name: string;

  /** 생략하면 Accept-Language로 정한다. */
  locale?: Locale;
}

model RegistrationResource is JsonApi.ResourceWithRelationships<
  "registrations",
  RegistrationAttributes,
  RegistrationRelationships
>;

model RegistrationDocument is JsonApi.Document<RegistrationResource>;
model RegistrationCreateDocument is JsonApi.CreateDocument<
  "registrations",
  RegistrationCreateAttributes
>;

model EmailVerificationRequestCreateAttributes {
  @format("email") email: string;
}

model EmailVerificationRequestCreateDocument is JsonApi.CreateDocument<
  "email-verification-requests",
  EmailVerificationRequestCreateAttributes
>;

model EmailVerificationAttributes {
  verifiedAt: utcDateTime;
}

model EmailVerificationCreateAttributes {
  /** 인증 메일에 담긴 토큰. */
  token: string;
}

model EmailVerificationResource is JsonApi.Resource<
  "email-verifications",
  EmailVerificationAttributes
>;

model EmailVerificationDocument is JsonApi.Document<EmailVerificationResource>;
model EmailVerificationCreateDocument is JsonApi.CreateDocument<
  "email-verifications",
  EmailVerificationCreateAttributes
>;

model PasswordResetRequestCreateAttributes {
  @format("email") email: string;
}

model PasswordResetRequestCreateDocument is JsonApi.CreateDocument<
  "password-reset-requests",
  PasswordResetRequestCreateAttributes
>;

model PasswordResetAttributes {
  createdAt: utcDateTime;
}

model PasswordResetCreateAttributes {
  /** 재설정 메일에 담긴 토큰. */
  token: string;

  @minLength(8) @maxLength(128) password: string;
}

model PasswordResetResource is JsonApi.Resource<"password-resets", PasswordResetAttributes>;
model PasswordResetDocument is JsonApi.Document<PasswordResetResource>;
model PasswordResetCreateDocument is JsonApi.CreateDocument<
  "password-resets",
  PasswordResetCreateAttributes
>;

model PasswordChangeAttributes {
  createdAt: utcDateTime;
}

model PasswordChangeCreateAttributes {
  currentPassword: string;
  @minLength(8) @maxLength(128) newPassword: string;
}

model PasswordChangeResource is JsonApi.Resource<"password-changes", PasswordChangeAttributes>;
model PasswordChangeDocument is JsonApi.Document<PasswordChangeResource>;
model PasswordChangeCreateDocument is JsonApi.CreateDocument<
  "password-changes",
  PasswordChangeCreateAttributes
>;

union OAuthProvider {
  "google",
  "kakao",
  "naver",
}

@route("/api/v1/registrations")
@tag("registrations")
interface Registrations {
  /** 가입하고 인증 메일을 보낸다. 이미 쓰는 이메일이면 validation.already_taken(422). */
  @post
  create(...JsonApi.Body<RegistrationCreateDocument>):
    | JsonApi.Created<RegistrationDocument>
    | BodyErrors
    | CommonErrors;
}

@route("/api/v1/email-verification-requests")
@tag("email-verifications")
interface EmailVerificationRequests {
  /** 인증 메일을 다시 보낸다. 계정이 있는지 드러내지 않도록 항상 202를 돌려준다. */
  @post
  create(...JsonApi.Body<EmailVerificationRequestCreateDocument>):
    | JsonApi.Accepted
    | BodyErrors
    | CommonErrors;
}

@route("/api/v1/email-verifications")
@tag("email-verifications")
interface EmailVerifications {
  /** 토큰이 틀리거나 만료되면 auth.verification_token_invalid(422). */
  @post
  create(...JsonApi.Body<EmailVerificationCreateDocument>):
    | JsonApi.Created<EmailVerificationDocument>
    | BodyErrors
    | CommonErrors;
}

@route("/api/v1/password-reset-requests")
@tag("passwords")
interface PasswordResetRequests {
  /** 재설정 메일을 보낸다. 계정이 있는지 드러내지 않도록 항상 202를 돌려준다. */
  @post
  create(...JsonApi.Body<PasswordResetRequestCreateDocument>):
    | JsonApi.Accepted
    | BodyErrors
    | CommonErrors;
}

@route("/api/v1/password-resets")
@tag("passwords")
interface PasswordResets {
  /** 토큰으로 비밀번호를 바꾸고 모든 세션을 폐기한다. */
  @post
  create(...JsonApi.Body<PasswordResetCreateDocument>):
    | JsonApi.Created<PasswordResetDocument>
    | BodyErrors
    | CommonErrors;
}

@route("/api/v1/password-changes")
@tag("passwords")
@useAuth(BearerAuth)
interface PasswordChanges {
  /** 현재 세션을 뺀 나머지 세션을 폐기한다. */
  @post
  create(...JsonApi.Body<PasswordChangeCreateDocument>):
    | JsonApi.Created<PasswordChangeDocument>
    | AuthErrors
    | BodyErrors
    | CommonErrors;
}

/** 소셜 로그인 리다이렉트. 본문이 없는 JSON:API 예외 엔드포인트다. */
@route("/api/v1/oauth/{provider}")
@tag("oauth")
interface OAuth {
  /** 제공자 로그인 화면으로 보낸다. redirectUri는 허용 목록으로 검사한다. */
  @get
  @route("authorize")
  authorize(@path provider: OAuthProvider, @query redirectUri: url):
    | {
        @statusCode _: 302;
        @header location: url;
      }
    | BadRequest
    | NotFound
    | TooManyRequests
    | InternalServerError;

  /** 제공자가 돌아오는 곳. 1회용 코드(60초)를 붙여 프론트 콜백으로 보낸다. */
  @get
  @route("callback")
  callback(
    @path provider: OAuthProvider,
    @query state: string,
    @query code?: string,
    @query error?: string,
  ):
    | {
        @statusCode _: 302;
        @header location: url;
      }
    | BadRequest
    | NotFound
    | TooManyRequests
    | InternalServerError;
}
```

`contract/typespec/src/resources/sessions.tsp`:

```typespec
import "@typespec/http";
import "@typespec/openapi";
import "../jsonapi.tsp";
import "../errors.tsp";

using Http;
using OpenAPI;

namespace Platform;

model SessionPasswordGrant {
  grantType: "password";
  @format("email") email: string;
  password: string;
}

model SessionRefreshTokenGrant {
  grantType: "refreshToken";
  refreshToken: string;
}

model SessionOAuthCodeGrant {
  grantType: "oauthCode";

  /** OAuth 콜백이 프론트로 넘긴 1회용 코드. */
  code: string;
}

/** 로그인, 토큰 갱신, 소셜 로그인 완료를 grantType으로 구분한다. */
@discriminated(#{ envelope: "none", discriminatorPropertyName: "grantType" })
union SessionGrant {
  password: SessionPasswordGrant,
  refreshToken: SessionRefreshTokenGrant,
  oauthCode: SessionOAuthCodeGrant,
}

model SessionAttributes {
  userAgent: string | null;
  createdAt: utcDateTime;
  lastUsedAt: utcDateTime;

  /** 요청을 보낸 세션이면 true. */
  current: boolean;
}

/** POST /sessions의 201 응답에만 담기는 토큰. */
model SessionTokens {
  accessToken: string;
  accessTokenExpiresAt: utcDateTime;
  refreshToken: string;
  refreshTokenExpiresAt: utcDateTime;
}

model SessionWithTokensAttributes {
  ...SessionAttributes;
  ...SessionTokens;
}

model SessionRelationships {
  user: JsonApi.ToOne<"users">;
}

model SessionResource is JsonApi.ResourceWithRelationships<
  "sessions",
  SessionAttributes,
  SessionRelationships
>;

model SessionWithTokensResource is JsonApi.ResourceWithRelationships<
  "sessions",
  SessionWithTokensAttributes,
  SessionRelationships
>;

model SessionWithTokensDocument is JsonApi.Document<SessionWithTokensResource>;
model SessionCollectionDocument is JsonApi.CollectionDocument<SessionResource>;
model SessionCreateDocument is JsonApi.CreateDocument<"sessions", SessionGrant>;

union SessionRevocationScope {
  "others",
  "all",
}

model SessionRevocationAttributes {
  scope: SessionRevocationScope;
  revokedCount: int32;
  createdAt: utcDateTime;
}

model SessionRevocationCreateAttributes {
  scope: SessionRevocationScope;
}

model SessionRevocationResource is JsonApi.Resource<
  "session-revocations",
  SessionRevocationAttributes
>;

model SessionRevocationDocument is JsonApi.Document<SessionRevocationResource>;
model SessionRevocationCreateDocument is JsonApi.CreateDocument<
  "session-revocations",
  SessionRevocationCreateAttributes
>;

model RealtimeTicketAttributes {
  /** Socket.IO 연결의 auth.ticket에 넣는다. 30초 안에 한 번만 쓸 수 있다. */
  token: string;

  expiresAt: utcDateTime;
}

model RealtimeTicketCreateAttributes {}

model RealtimeTicketResource is JsonApi.Resource<"realtime-tickets", RealtimeTicketAttributes>;
model RealtimeTicketDocument is JsonApi.Document<RealtimeTicketResource>;
model RealtimeTicketCreateDocument is JsonApi.CreateDocument<
  "realtime-tickets",
  RealtimeTicketCreateAttributes
>;

@route("/api/v1/sessions")
@tag("sessions")
interface Sessions {
  /** 토큰은 이 응답에만 담긴다. 이미 쓴 refresh token이면 세션 계열 전체를 폐기하고 auth.refresh_token_reused(401). */
  @post
  create(...JsonApi.Body<SessionCreateDocument>):
    | JsonApi.Created<SessionWithTokensDocument>
    | AuthErrors
    | BodyErrors
    | CommonErrors;

  /** 내 활성 세션 목록. */
  @get
  @useAuth(BearerAuth)
  @extension("x-jsonapi-sort", #["createdAt", "lastUsedAt"])
  list(
    ...JsonApi.PageQuery,
    @query sort?: string,
    @query("fields[sessions]") fieldsSessions?: string,
  ): JsonApi.Ok<SessionCollectionDocument> | AuthErrors | CommonErrors;

  /** 현재 세션 로그아웃. */
  @delete
  @route("current")
  @useAuth(BearerAuth)
  deleteCurrent(): JsonApi.NoContent | AuthErrors | CommonErrors;

  /** 내 세션 하나를 폐기한다. */
  @delete
  @route("{id}")
  @useAuth(BearerAuth)
  delete(@path @format("uuid") id: string):
    | JsonApi.NoContent
    | AuthErrors
    | NotFound
    | CommonErrors;
}

@route("/api/v1/session-revocations")
@tag("sessions")
@useAuth(BearerAuth)
interface SessionRevocations {
  /** scope가 others면 현재 세션을 뺀 나머지를, all이면 전부 폐기한다. */
  @post
  create(...JsonApi.Body<SessionRevocationCreateDocument>):
    | JsonApi.Created<SessionRevocationDocument>
    | AuthErrors
    | BodyErrors
    | CommonErrors;
}

@route("/api/v1/realtime-tickets")
@tag("realtime")
@useAuth(BearerAuth)
interface RealtimeTickets {
  /** BFF가 발급받아 브라우저에 넘긴다. 브라우저는 access token을 모른다. */
  @post
  create(...JsonApi.Body<RealtimeTicketCreateDocument>):
    | JsonApi.Created<RealtimeTicketDocument>
    | AuthErrors
    | BodyErrors
    | CommonErrors;
}
```

`contract/typespec/src/main.tsp` (전체 교체):

```typespec
import "@typespec/http";
import "@typespec/openapi";
import "./jsonapi.tsp";
import "./errors.tsp";
import "./resources/health.tsp";
import "./resources/roles.tsp";
import "./resources/files.tsp";
import "./resources/users.tsp";
import "./resources/posts.tsp";
import "./resources/audit-logs.tsp";
import "./resources/auth.tsp";
import "./resources/sessions.tsp";

using Http;
using OpenAPI;

/** AI 템플릿 플랫폼 API 계약. FastAPI와 NestJS 템플릿이 똑같이 구현한다. */
@service(#{ title: "AI Template Platform API" })
@info(#{ version: "1.0.0" })
@server("http://localhost:8000", "로컬 개발 서버")
namespace Platform;
```

- [ ] **Step 4: 컴파일한다**

Run: `pnpm --filter @ai-template/contract run build`
Expected: 성공한다(종료 코드 0). 출력에 `Compilation completed successfully.`가 있다.

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/contract test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  38 passed`가 있다.

- [ ] **Step 6: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 5단계`가 있다.

- [ ] **Step 7: 커밋한다**

```bash
git add -A
git commit -m "feat(contract): add registration, sessions, passwords and OAuth"
```


### Task 9: 계약: 실시간 이벤트

스펙 §4.7의 Socket.IO 이벤트 페이로드 스키마와, OpenAPI 루트 확장 `x-realtime-channels`·`x-realtime-events`를 정의한다. 이 태스크로 계약이 완성된다.

**Files:**
- Create: `contract/typespec/test/realtime.test.ts`
- Create: `contract/typespec/src/realtime.tsp`
- Modify: `contract/typespec/src/main.tsp` (파일 전체를 이 태스크의 내용으로 바꾼다)

**Interfaces:**
- Consumes: Task 7의 `PostResource`
- Produces: 스키마 `SessionRevokedEventDocument`, `UserMeUpdatedEventDocument`, `PostCreatedEventDocument`, `PostUpdatedEventDocument`, `PostPublishedEventDocument`, `PostDeletedEventDocument`. 루트 확장 `x-realtime-channels: {name, permission, description}[]`, `x-realtime-events: {name, rooms, payload}[]`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`contract/typespec/test/realtime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resourceType, schema, spec } from "./spec.ts";

interface RealtimeEvent {
  name: string;
  rooms: string[];
  payload: string;
}

interface RealtimeChannel {
  name: string;
  permission: string | null;
}

const events = spec["x-realtime-events"] as RealtimeEvent[];
const channels = spec["x-realtime-channels"] as RealtimeChannel[];

describe("실시간 (§4.7)", () => {
  it("이벤트 목록이 스펙의 표와 같다", () => {
    expect(events.map((event) => event.name)).toEqual([
      "session.revoked",
      "me.updated",
      "post.created",
      "post.updated",
      "post.published",
      "post.deleted",
    ]);
  });

  it("모든 이벤트 페이로드가 계약의 스키마로 존재한다", () => {
    for (const event of events) {
      expect(() => schema(event.payload)).not.toThrow();
    }
  });

  it("글 이벤트 페이로드는 posts 리소스 문서다", () => {
    const published = schema("PostPublishedEventDocument").properties?.data;
    expect(published?.$ref).toBe("#/components/schemas/PostResource");
    expect(resourceType(schema("PostResource"))).toBe("posts");
  });

  it("공개 채널과 권한이 필요한 채널을 구분한다", () => {
    expect(channels).toEqual([
      expect.objectContaining({ name: "posts", permission: null }),
      expect.objectContaining({ name: "posts:all", permission: "posts:manage" }),
    ]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @ai-template/contract test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `realtime`가 있다.

- [ ] **Step 3: 이벤트 스키마와 확장 필드를 정의한다**

`contract/typespec/src/realtime.tsp`:

```typespec
import "./jsonapi.tsp";
import "./resources/posts.tsp";

namespace Platform;

/** Socket.IO 이벤트 페이로드. 이벤트 목록과 받는 곳은 main.tsp의 x-realtime-events에 있다. */
union SessionRevokedReason {
  "logout",
  "password_reset",
  "account_deactivated",
  "revoked",
}

model SessionRevokedEventDocument {
  meta: {
    reason: SessionRevokedReason;
  };
}

/** 클라이언트는 이 이벤트를 받으면 GET /me를 다시 부른다. */
model UserMeUpdatedEventDocument {
  meta: {
    changed: ("roles" | "status" | "profile")[];
  };
}

model PostCreatedEventDocument is JsonApi.Document<PostResource>;
model PostUpdatedEventDocument is JsonApi.Document<PostResource>;
model PostPublishedEventDocument is JsonApi.Document<PostResource>;

model PostDeletedEventDocument {
  data: JsonApi.ResourceIdentifier<"posts">;
}
```

`contract/typespec/src/main.tsp` (전체 교체):

```typespec
import "@typespec/http";
import "@typespec/openapi";
import "./jsonapi.tsp";
import "./errors.tsp";
import "./realtime.tsp";
import "./resources/health.tsp";
import "./resources/roles.tsp";
import "./resources/files.tsp";
import "./resources/users.tsp";
import "./resources/posts.tsp";
import "./resources/audit-logs.tsp";
import "./resources/auth.tsp";
import "./resources/sessions.tsp";

using Http;
using OpenAPI;

/** AI 템플릿 플랫폼 API 계약. FastAPI와 NestJS 템플릿이 똑같이 구현한다. */
@service(#{ title: "AI Template Platform API" })
@info(#{ version: "1.0.0" })
@server("http://localhost:8000", "로컬 개발 서버")
@extension(
  "x-realtime-channels",
  #[
    #{
      name: "posts",
      permission: null,
      description: "발행된 글의 이벤트. 익명 연결도 구독할 수 있다.",
    },
    #{ name: "posts:all", permission: "posts:manage", description: "모든 글의 이벤트." }
  ]
)
@extension(
  "x-realtime-events",
  #[
    #{
      name: "session.revoked",
      rooms: #["user:{userId}"],
      payload: "SessionRevokedEventDocument",
    },
    #{ name: "me.updated", rooms: #["user:{userId}"], payload: "UserMeUpdatedEventDocument" },
    #{
      name: "post.created",
      rooms: #["posts:all", "user:{authorId}"],
      payload: "PostCreatedEventDocument",
    },
    #{
      name: "post.updated",
      rooms: #["posts:all", "user:{authorId}", "posts (발행된 글일 때)"],
      payload: "PostUpdatedEventDocument",
    },
    #{
      name: "post.published",
      rooms: #["posts", "posts:all", "user:{authorId}"],
      payload: "PostPublishedEventDocument",
    },
    #{
      name: "post.deleted",
      rooms: #["posts:all", "user:{authorId}", "posts (발행된 글이었을 때)"],
      payload: "PostDeletedEventDocument",
    }
  ]
)
namespace Platform;
```

- [ ] **Step 4: 컴파일한다**

Run: `pnpm --filter @ai-template/contract run build`
Expected: 성공한다(종료 코드 0). 출력에 `Compilation completed successfully.`가 있다.

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/contract test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  42 passed`가 있다.

- [ ] **Step 6: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 5단계`가 있다.

- [ ] **Step 7: 커밋한다**

```bash
git add -A
git commit -m "feat(contract): add realtime event payloads and channel list"
```


### Task 10: 적합성 테스트 틀 ① JSON:API 검증기

백엔드 응답이 JSON:API 1.1을 지키는지 검사하는 순수 함수(문서 구조, full linkage, 에러 문서, 컬렉션 페이지, sparse fieldset, 미디어 타입)를 만든다. 플랫폼 흐름 테스트 케이스는 하위 프로젝트 1에서 FastAPI와 함께 쓴다.

**Files:**
- Create: `contract/conformance/package.json`
- Create: `contract/conformance/tsconfig.json`
- Create: `contract/conformance/vitest.config.ts`
- Create: `contract/conformance/test/jsonapi/assertions.test.ts`
- Create: `contract/conformance/src/jsonapi/assertions.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `src/jsonapi/assertions.ts`: `MEDIA_TYPE`, `class JsonApiViolation extends Error { problems: readonly string[] }`, `documentProblems(body)`, `linkageProblems(body)`, `errorDocumentProblems(body, status?)`, `collectionProblems(body)`, `sparseFieldsetProblems(body, fields)`, `mediaTypeProblems({status, headers})`, `assertDocument`, `assertErrorDocument`, `assertCollection`, `assertSparseFieldset`, `assertMediaType`.

- [ ] **Step 1: 적합성 패키지 뼈대를 만든다**

`contract/conformance/package.json`:

```json
{
  "name": "@ai-template/conformance",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "check": "pnpm run typecheck && pnpm run test"
  }
}
```

`contract/conformance/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "scripts", "test", "vitest.config.ts"]
}
```

`contract/conformance/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: 설치한다**

Run: `pnpm install`
Expected: 성공한다(종료 코드 0).

- [ ] **Step 3: 실패하는 테스트를 쓴다**

`contract/conformance/test/jsonapi/assertions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  JsonApiViolation,
  MEDIA_TYPE,
  assertCollection,
  assertDocument,
  assertErrorDocument,
  assertMediaType,
  assertSparseFieldset,
  collectionProblems,
  documentProblems,
  errorDocumentProblems,
  linkageProblems,
  sparseFieldsetProblems,
} from "../../src/jsonapi/assertions.ts";

const post = {
  type: "posts",
  id: "p1",
  attributes: { title: "안녕", status: "published" },
  relationships: { author: { data: { type: "users", id: "u1" } } },
};
const author = { type: "users", id: "u1", attributes: { name: "지우" } };

function collection(overrides: Record<string, unknown> = {}) {
  return {
    data: [post],
    links: { first: "/p?1", last: "/p?1", prev: null, next: null },
    meta: { page: { number: 1, size: 20, total: 1, totalPages: 1 } },
    ...overrides,
  };
}

describe("documentProblems", () => {
  it("올바른 단건 문서와 포함 리소스를 통과시킨다", () => {
    expect(() => {
      assertDocument({ data: post, included: [author] });
    }).not.toThrow();
  });

  it("data, errors, meta가 모두 없으면 잡는다", () => {
    expect(documentProblems({ links: {} })).toContain("data, errors, meta 중 하나는 있어야 한다");
  });

  it("data와 errors를 함께 담으면 잡는다", () => {
    expect(documentProblems({ data: null, errors: [] })).toContain(
      "data와 errors를 함께 담을 수 없다",
    );
  });

  it("정의되지 않은 최상위 멤버를 잡는다", () => {
    expect(documentProblems({ data: null, result: 1 })).toContain(
      '최상위에 정의되지 않은 멤버 "result"가 있다',
    );
  });

  it("id가 없는 리소스를 잡는다", () => {
    expect(documentProblems({ data: { type: "posts" } })).toContain("data.id: 문자열이어야 한다");
  });

  it("같은 리소스가 두 번 나오면 잡는다", () => {
    expect(documentProblems({ data: [author], included: [author] })).toContain(
      "리소스 users:u1가 문서에 두 번 나온다",
    );
  });
});

describe("linkageProblems", () => {
  it("아무도 참조하지 않는 포함 리소스를 잡는다", () => {
    const stray = { type: "files", id: "f1" };
    expect(linkageProblems({ data: post, included: [author, stray] })).toEqual([
      "included의 files:f1를 참조하는 관계가 없다(full linkage 위반)",
    ]);
  });
});

describe("errorDocumentProblems", () => {
  const error = { status: "422", code: "validation.required", title: "Required" };

  it("올바른 에러 문서를 통과시킨다", () => {
    expect(() => {
      assertErrorDocument({ errors: [error], meta: { traceId: "t1" } }, 422);
    }).not.toThrow();
  });

  it("traceId가 없으면 잡는다", () => {
    expect(errorDocumentProblems({ errors: [error], meta: {} })).toContain(
      "meta.traceId: 문자열이어야 한다",
    );
  });

  it("status가 응답 코드와 다르면 잡는다", () => {
    expect(errorDocumentProblems({ errors: [error], meta: { traceId: "t" } }, 400)).toContain(
      'errors[0].status: "400"여야 한다(현재: 422)',
    );
  });

  it("errors가 비어 있으면 잡는다", () => {
    expect(errorDocumentProblems({ errors: [], meta: { traceId: "t" } })).toContain(
      "errors는 비어 있지 않은 배열이어야 한다",
    );
  });
});

describe("collectionProblems", () => {
  it("올바른 컬렉션을 통과시킨다", () => {
    expect(() => {
      assertCollection(collection());
    }).not.toThrow();
  });

  it("totalPages가 ceil(total / size)가 아니면 잡는다", () => {
    const meta = { page: { number: 1, size: 20, total: 41, totalPages: 2 } };
    expect(collectionProblems(collection({ meta }))).toContain(
      "meta.page.totalPages는 ceil(total / size)여야 한다",
    );
  });

  it("다음 페이지 링크가 없으면 잡는다", () => {
    const links = { first: "/p", last: "/p", prev: null };
    expect(collectionProblems(collection({ links }))).toContain(
      "links.next: 문자열 또는 null이어야 한다",
    );
  });
});

describe("sparseFieldsetProblems", () => {
  it("요청한 필드만 있으면 통과시킨다", () => {
    const sparse = { data: { type: "posts", id: "p1", attributes: { title: "안녕" } } };
    expect(() => {
      assertSparseFieldset(sparse, { posts: ["title"] });
    }).not.toThrow();
  });

  it("요청하지 않은 속성과 관계를 잡는다", () => {
    expect(sparseFieldsetProblems({ data: post }, { posts: ["title"] })).toEqual([
      "posts:p1에 요청하지 않은 필드 status가 있다",
      "posts:p1에 요청하지 않은 필드 author가 있다",
    ]);
  });
});

describe("mediaTypeProblems", () => {
  it("본문이 있는 응답의 Content-Type을 검사한다", () => {
    const wrong = { status: 200, headers: new Headers({ "content-type": "application/json" }) };
    expect(() => {
      assertMediaType(wrong);
    }).toThrow(JsonApiViolation);
  });

  it("204와 202는 본문이 없으므로 검사하지 않는다", () => {
    expect(() => {
      assertMediaType({ status: 204, headers: new Headers() });
    }).not.toThrow();
    const ok = { status: 200, headers: new Headers({ "content-type": MEDIA_TYPE }) };
    expect(() => {
      assertMediaType(ok);
    }).not.toThrow();
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @ai-template/conformance test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `assertions.ts`가 있다.

- [ ] **Step 5: 검증기를 구현한다**

`contract/conformance/src/jsonapi/assertions.ts`:

```ts
/** 백엔드 응답이 JSON:API 1.1을 지키는지 검사한다. 각 함수는 문제 목록을 돌려주고, assert*는 문제가 있으면 던진다. */

export const MEDIA_TYPE = "application/vnd.api+json";

type Json = Record<string, unknown>;

const TOP_LEVEL_MEMBERS = new Set(["data", "errors", "meta", "links", "included", "jsonapi"]);

export class JsonApiViolation extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`JSON:API 위반 ${String(problems.length)}건:\n- ${problems.join("\n- ")}`);
    this.name = "JsonApiViolation";
    this.problems = problems;
  }
}

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function throwIfAny(problems: readonly string[]): void {
  if (problems.length > 0) throw new JsonApiViolation(problems);
}

function resourceProblems(resource: unknown, where: string): string[] {
  if (!isJson(resource)) return [`${where}: 리소스 객체가 아니다`];
  const problems: string[] = [];
  if (typeof resource.type !== "string") problems.push(`${where}.type: 문자열이어야 한다`);
  if (typeof resource.id !== "string") problems.push(`${where}.id: 문자열이어야 한다`);
  for (const member of ["attributes", "relationships", "links", "meta"]) {
    if (member in resource && !isJson(resource[member])) {
      problems.push(`${where}.${member}: 객체여야 한다`);
    }
  }
  return problems;
}

/** 배열이면 그대로, 아니면 한 원소짜리 배열로 돌려준다. */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [value];
}

/** 주 데이터와 포함 리소스 중 객체인 것만 모은다. */
function resourcesOf(document: Json): Json[] {
  const included = Array.isArray(document.included) ? (document.included as unknown[]) : [];
  return [...asArray(document.data), ...included].filter(isJson);
}

/** 최상위 구조와 리소스 객체 모양을 검사한다. */
export function documentProblems(body: unknown): string[] {
  if (!isJson(body)) return ["문서는 JSON 객체여야 한다"];
  const problems: string[] = [];
  if (!("data" in body) && !("errors" in body) && !("meta" in body)) {
    problems.push("data, errors, meta 중 하나는 있어야 한다");
  }
  if ("data" in body && "errors" in body) problems.push("data와 errors를 함께 담을 수 없다");
  if ("included" in body && !("data" in body)) problems.push("included는 data가 있을 때만 쓴다");
  for (const member of Object.keys(body)) {
    if (!TOP_LEVEL_MEMBERS.has(member) && !member.includes(":")) {
      problems.push(`최상위에 정의되지 않은 멤버 "${member}"가 있다`);
    }
  }
  if (Array.isArray(body.data)) {
    body.data.forEach((resource, index) => {
      problems.push(...resourceProblems(resource, `data[${String(index)}]`));
    });
  } else if (body.data !== null && body.data !== undefined) {
    problems.push(...resourceProblems(body.data, "data"));
  }
  if ("included" in body) {
    if (!Array.isArray(body.included)) problems.push("included는 배열이어야 한다");
    else {
      body.included.forEach((resource, index) => {
        problems.push(...resourceProblems(resource, `included[${String(index)}]`));
      });
    }
  }
  const seen = new Set<string>();
  for (const resource of resourcesOf(body)) {
    const key = `${String(resource.type)}:${String(resource.id)}`;
    if (seen.has(key)) problems.push(`리소스 ${key}가 문서에 두 번 나온다`);
    seen.add(key);
  }
  return problems;
}

/** included의 모든 리소스가 어떤 관계에서든 참조되는지(full linkage) 검사한다. sparse fieldset 요청에는 쓰지 않는다. */
export function linkageProblems(body: unknown): string[] {
  if (!isJson(body) || !Array.isArray(body.included)) return [];
  const referenced = new Set<string>();
  for (const resource of resourcesOf(body)) {
    const relationships = isJson(resource.relationships) ? resource.relationships : {};
    for (const relationship of Object.values(relationships)) {
      const data = isJson(relationship) ? relationship.data : undefined;
      for (const identifier of asArray(data)) {
        if (isJson(identifier))
          referenced.add(`${String(identifier.type)}:${String(identifier.id)}`);
      }
    }
  }
  return body.included
    .filter(isJson)
    .map((resource) => `${String(resource.type)}:${String(resource.id)}`)
    .filter((key) => !referenced.has(key))
    .map((key) => `included의 ${key}를 참조하는 관계가 없다(full linkage 위반)`);
}

/** 에러 문서를 검사한다. status를 주면 모든 에러 객체의 status와 비교한다. */
export function errorDocumentProblems(body: unknown, status?: number): string[] {
  const problems = documentProblems(body);
  if (!isJson(body)) return problems;
  if (!Array.isArray(body.errors) || body.errors.length === 0) {
    return [...problems, "errors는 비어 있지 않은 배열이어야 한다"];
  }
  body.errors.forEach((error, index) => {
    const where = `errors[${String(index)}]`;
    if (!isJson(error)) {
      problems.push(`${where}: 객체가 아니다`);
      return;
    }
    for (const member of ["status", "code", "title"]) {
      if (typeof error[member] !== "string") problems.push(`${where}.${member}: 문자열이어야 한다`);
    }
    if (status !== undefined && error.status !== String(status)) {
      problems.push(`${where}.status: "${String(status)}"여야 한다(현재: ${String(error.status)})`);
    }
  });
  const meta = isJson(body.meta) ? body.meta : {};
  if (typeof meta.traceId !== "string") problems.push("meta.traceId: 문자열이어야 한다");
  return problems;
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

/** 컬렉션 문서의 페이지 링크와 페이지 메타가 일관되는지 검사한다. */
export function collectionProblems(body: unknown): string[] {
  const problems = documentProblems(body);
  if (!isJson(body)) return problems;
  if (!Array.isArray(body.data)) problems.push("컬렉션의 data는 배열이어야 한다");
  const links = isJson(body.links) ? body.links : {};
  for (const key of ["first", "last"]) {
    if (typeof links[key] !== "string") problems.push(`links.${key}: 문자열이어야 한다`);
  }
  for (const key of ["prev", "next"]) {
    if (!isNullableString(links[key])) problems.push(`links.${key}: 문자열 또는 null이어야 한다`);
  }
  const meta = isJson(body.meta) ? body.meta : {};
  const page = isJson(meta.page) ? meta.page : {};
  const { number, size, total, totalPages } = page;
  if (![number, size, total, totalPages].every((value) => Number.isInteger(value))) {
    return [...problems, "meta.page의 number, size, total, totalPages는 정수여야 한다"];
  }
  const [pageNumber, pageSize, count, pages] = [number, size, total, totalPages] as number[];
  if ((pageNumber ?? 0) < 1) problems.push("meta.page.number는 1 이상이어야 한다");
  if (pages !== Math.ceil((count ?? 0) / (pageSize ?? 1))) {
    problems.push("meta.page.totalPages는 ceil(total / size)여야 한다");
  }
  if (Array.isArray(body.data) && body.data.length > (pageSize ?? 0)) {
    problems.push("data의 개수가 meta.page.size보다 많다");
  }
  return problems;
}

/** fields[type]으로 요청한 필드 외에는 attributes와 relationships에 없어야 한다. */
export function sparseFieldsetProblems(
  body: unknown,
  fields: Readonly<Record<string, readonly string[]>>,
): string[] {
  if (!isJson(body)) return ["문서는 JSON 객체여야 한다"];
  const problems: string[] = [];
  for (const resource of resourcesOf(body)) {
    const allowed = fields[String(resource.type)];
    if (allowed === undefined) continue;
    for (const member of ["attributes", "relationships"]) {
      const values = isJson(resource[member]) ? resource[member] : {};
      for (const key of Object.keys(values).filter((name) => !allowed.includes(name))) {
        problems.push(
          `${String(resource.type)}:${String(resource.id)}에 요청하지 않은 필드 ${key}가 있다`,
        );
      }
    }
  }
  return problems;
}

/** 본문이 있는 응답의 Content-Type은 정확히 JSON:API 미디어 타입이어야 한다. */
export function mediaTypeProblems(response: { status: number; headers: Headers }): string[] {
  if (response.status === 202 || response.status === 204) return [];
  const contentType = response.headers.get("content-type");
  return contentType === MEDIA_TYPE
    ? []
    : [`Content-Type은 "${MEDIA_TYPE}"여야 한다(현재: ${contentType ?? "없음"})`];
}

export function assertDocument(body: unknown): void {
  throwIfAny([...documentProblems(body), ...linkageProblems(body)]);
}

export function assertErrorDocument(body: unknown, status?: number): void {
  throwIfAny(errorDocumentProblems(body, status));
}

export function assertCollection(body: unknown): void {
  throwIfAny([...collectionProblems(body), ...linkageProblems(body)]);
}

export function assertSparseFieldset(
  body: unknown,
  fields: Readonly<Record<string, readonly string[]>>,
): void {
  throwIfAny([...documentProblems(body), ...sparseFieldsetProblems(body, fields)]);
}

export function assertMediaType(response: { status: number; headers: Headers }): void {
  throwIfAny(mediaTypeProblems(response));
}
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/conformance test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  18 passed`가 있다.

- [ ] **Step 7: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 6단계`가 있다.

- [ ] **Step 8: 커밋한다**

```bash
git add -A
git commit -m "feat(conformance): add JSON:API document validators"
```


### Task 11: 적합성 테스트 틀 ② 타입 클라이언트, 대상, 부수 채널

계약에서 TypeScript 타입을 생성하고(openapi-typescript), JSON:API 헤더와 Bearer 토큰을 붙이는 타입 클라이언트(openapi-fetch)를 만든다. 대상(fastapi·nestjs·mock) 설정과 부수 채널(메일함, OAuth) 인터페이스를 정의하고, 생성물 최신 여부 검사를 check에 넣는다.

**Files:**
- Create: `contract/conformance/test/client.test.ts`
- Create: `contract/conformance/test/targets.test.ts`
- Create: `contract/conformance/src/client.ts`
- Create: `contract/conformance/src/targets.ts`
- Create: `contract/conformance/src/side-channels.ts`
- Create: `contract/conformance/scripts/check-generated.ts`
- Modify: `contract/conformance/package.json` (파일 전체를 이 태스크의 내용으로 바꾼다)

**Interfaces:**
- Consumes: Task 9의 완성된 `contract/openapi.yaml`, Task 10의 `MEDIA_TYPE`
- Produces: `src/generated/api.ts`(생성물, 직접 수정 금지), `createApiClient({ baseUrl, accessToken?, fetch? })`, `type ApiClient`, `TARGET_NAMES`, `type TargetName`, `resolveTarget(env): { name, baseUrl }`(환경 변수 `CONFORMANCE_TARGET`, `CONFORMANCE_BASE_URL`), `interface Mailbox { latest(to, options?), clear() }`, `interface OAuthDriver { authorize(provider, redirectUri) }`, `interface SideChannels`, `extractToken(mail)`.

- [ ] **Step 1: 생성 스크립트와 의존성을 더한다**

`@ai-template/contract`를 workspace 의존성으로 두어 `pnpm -r run gen`이 계약 컴파일 → 타입 생성 순서로 돈다.

`contract/conformance/package.json` (전체 교체):

```json
{
  "name": "@ai-template/conformance",
  "private": true,
  "type": "module",
  "scripts": {
    "gen": "openapi-typescript ../openapi.yaml -o src/generated/api.ts",
    "check:generated": "tsx scripts/check-generated.ts",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "check": "pnpm run check:generated && pnpm run typecheck && pnpm run test"
  },
  "dependencies": {
    "openapi-fetch": "0.17.0"
  },
  "devDependencies": {
    "@ai-template/contract": "workspace:*",
    "openapi-typescript": "7.13.0"
  }
}
```

- [ ] **Step 2: 설치한다**

Run: `pnpm install`
Expected: 성공한다(종료 코드 0).

- [ ] **Step 3: 계약에서 타입을 생성한다**

Run: `pnpm --filter @ai-template/conformance run gen`
Expected: 성공한다(종료 코드 0). 출력에 `src/generated/api.ts`가 있다.

- [ ] **Step 4: 실패하는 테스트를 쓴다**

테스트의 가짜 비밀번호와 토큰 줄 끝에 `betterleaks:allow` 주석을 단다. Task 12의 비밀 스캔이 이 줄을 오탐하지 않게 하기 위해서다.

`contract/conformance/test/client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/client.ts";
import { MEDIA_TYPE } from "../src/jsonapi/assertions.ts";

function recordingFetch(body: unknown, status = 200) {
  const requests: Request[] = [];
  const fetch = (request: Request) => {
    requests.push(request);
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": MEDIA_TYPE } }),
    );
  };
  return { requests, fetch };
}

const emptyPage = {
  data: [],
  links: { first: "/p", last: "/p", prev: null, next: null },
  meta: { page: { number: 1, size: 5, total: 0, totalPages: 0 } },
};

describe("createApiClient", () => {
  it("JSON:API 헤더, Bearer 토큰, 대괄호 쿼리를 보낸다", async () => {
    const { requests, fetch } = recordingFetch(emptyPage);
    const client = createApiClient({ baseUrl: "http://api.test", accessToken: "t0k", fetch });

    const { data } = await client.GET("/api/v1/posts", {
      params: { query: { "page[size]": 5, "filter[status]": "published" } },
    });

    const [request] = requests;
    expect(request?.headers.get("Accept")).toBe(MEDIA_TYPE);
    expect(request?.headers.get("Authorization")).toBe("Bearer t0k");
    const query = new URL(request?.url ?? "").searchParams;
    expect(query.get("page[size]")).toBe("5");
    expect(query.get("filter[status]")).toBe("published");
    expect(data?.meta.page.total).toBe(0);
  });

  it("본문이 있는 요청은 JSON:API Content-Type으로 보낸다", async () => {
    const { requests, fetch } = recordingFetch({}, 201);
    const client = createApiClient({ baseUrl: "http://api.test", fetch });

    await client.POST("/api/v1/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: { grantType: "password", email: "a@example.com", password: "secret-pw" }, // betterleaks:allow 테스트용 가짜 값
        },
      },
    });

    const [request] = requests;
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("Content-Type")).toBe(MEDIA_TYPE);
    expect(request?.headers.get("Authorization")).toBeNull();
  });
});
```

`contract/conformance/test/targets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractToken } from "../src/side-channels.ts";
import { resolveTarget } from "../src/targets.ts";

describe("resolveTarget", () => {
  it("대상 이름과 주소를 읽고 끝의 슬래시를 뗀다", () => {
    const target = resolveTarget({
      CONFORMANCE_TARGET: "fastapi",
      CONFORMANCE_BASE_URL: "http://localhost:8000/",
    });
    expect(target).toEqual({ name: "fastapi", baseUrl: "http://localhost:8000" });
  });

  it("모르는 대상이면 허용 목록과 함께 알린다", () => {
    expect(() =>
      resolveTarget({ CONFORMANCE_TARGET: "django", CONFORMANCE_BASE_URL: "http://x" }),
    ).toThrow("CONFORMANCE_TARGET은 fastapi, nestjs, mock 중 하나여야 한다(현재: django).");
  });

  it("주소가 없으면 예시와 함께 알린다", () => {
    expect(() => resolveTarget({ CONFORMANCE_TARGET: "mock" })).toThrow(/CONFORMANCE_BASE_URL/);
  });
});

describe("extractToken", () => {
  it("메일 본문 링크에서 token을 꺼낸다", () => {
    const mail = {
      to: "a@example.com",
      subject: "이메일 인증",
      text: "아래 링크를 누르세요\nhttp://localhost:3000/verify?token=abc.DEF-123_x\n", // betterleaks:allow 테스트용 가짜 토큰
    };
    expect(extractToken(mail)).toBe("abc.DEF-123_x");
  });

  it("token이 없으면 제목과 함께 알린다", () => {
    expect(() => extractToken({ to: "a", subject: "환영", text: "반가워요" })).toThrow(/환영/);
  });
});
```

- [ ] **Step 5: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @ai-template/conformance test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `client.ts`가 있다.

- [ ] **Step 6: 클라이언트, 대상, 부수 채널, 생성물 검사를 구현한다**

`contract/conformance/src/client.ts`:

```ts
import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./generated/api.ts";
import { MEDIA_TYPE } from "./jsonapi/assertions.ts";

export interface ClientOptions {
  readonly baseUrl: string;
  readonly accessToken?: string;
  readonly fetch?: (request: Request) => Promise<Response>;
}

/** 계약 타입으로 만든 JSON:API 클라이언트. 모든 요청에 JSON:API 헤더를 붙인다. */
export function createApiClient(options: ClientOptions) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    headers: { Accept: MEDIA_TYPE, "Content-Type": MEDIA_TYPE },
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const token = options.accessToken;
  if (token !== undefined) {
    const bearer: Middleware = {
      onRequest({ request }) {
        request.headers.set("Authorization", `Bearer ${token}`);
        return request;
      },
    };
    client.use(bearer);
  }
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
```

`contract/conformance/src/targets.ts`:

```ts
export const TARGET_NAMES = ["fastapi", "nestjs", "mock"] as const;

export type TargetName = (typeof TARGET_NAMES)[number];

export interface TargetConfig {
  readonly name: TargetName;
  readonly baseUrl: string;
}

function isTargetName(value: string): value is TargetName {
  return (TARGET_NAMES as readonly string[]).includes(value);
}

/** 환경 변수에서 적합성 테스트 대상을 읽는다. CONFORMANCE_TARGET과 CONFORMANCE_BASE_URL이 필요하다. */
export function resolveTarget(env: Readonly<Record<string, string | undefined>>): TargetConfig {
  const name = env.CONFORMANCE_TARGET ?? "";
  if (!isTargetName(name)) {
    throw new Error(
      `CONFORMANCE_TARGET은 ${TARGET_NAMES.join(", ")} 중 하나여야 한다(현재: ${name || "없음"}).`,
    );
  }
  const baseUrl = env.CONFORMANCE_BASE_URL;
  if (baseUrl === undefined || !URL.canParse(baseUrl)) {
    throw new Error("CONFORMANCE_BASE_URL에 대상 주소를 넣는다. 예: http://localhost:8000");
  }
  return { name, baseUrl: baseUrl.replace(/\/+$/, "") };
}
```

`contract/conformance/src/side-channels.ts`:

```ts
import type { components } from "./generated/api.ts";

export type OAuthProvider = components["schemas"]["OAuthProvider"];

export interface ReceivedMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** 대상이 보낸 메일을 읽는다. 실제 백엔드는 Mailpit으로, 목은 테스트 전용 엔드포인트로 구현한다. */
export interface Mailbox {
  /** 받는 사람에게 온 가장 최근 메일. 제한 시간 안에 오지 않으면 던진다. */
  latest(to: string, options?: { readonly timeoutMs?: number }): Promise<ReceivedMail>;
  clear(): Promise<void>;
}

/** 소셜 로그인을 끝까지 진행해 프론트 콜백으로 넘어갈 1회용 코드를 얻는다. */
export interface OAuthDriver {
  authorize(provider: OAuthProvider, redirectUri: string): Promise<{ readonly code: string }>;
}

export interface SideChannels {
  readonly mailbox: Mailbox;
  readonly oauth: OAuthDriver;
}

/** 인증·재설정 메일 본문의 링크에서 token 쿼리 값을 꺼낸다. */
export function extractToken(mail: ReceivedMail): string {
  const token = /[?&]token=([A-Za-z0-9._~-]+)/.exec(mail.text)?.[1];
  if (token === undefined) {
    throw new Error(`메일 "${mail.subject}"에서 token 쿼리가 있는 링크를 찾지 못했다`);
  }
  return token;
}
```

`contract/conformance/scripts/check-generated.ts`:

```ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** 계약에서 타입을 임시 파일로 다시 생성해 커밋된 src/generated/api.ts와 비교한다. */
const packageDir = fileURLToPath(new URL("..", import.meta.url));
const fresh = join(mkdtempSync(join(tmpdir(), "conformance-")), "api.ts");

const generate = spawnSync(`openapi-typescript ../openapi.yaml -o "${fresh}"`, {
  cwd: packageDir,
  shell: true,
  encoding: "utf8",
});
if (generate.status !== 0) {
  console.error(generate.stdout, generate.stderr);
  process.exit(1);
}

const committed = readFileSync(join(packageDir, "src", "generated", "api.ts"), "utf8");
if (readFileSync(fresh, "utf8") !== committed) {
  console.error(
    "src/generated/api.ts가 contract/openapi.yaml과 다르다. 직접 고치지 말고 `pnpm gen`으로 다시 생성한다.",
  );
  process.exit(1);
}
```

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/conformance test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  25 passed`가 있다.

- [ ] **Step 8: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 6단계`가 있다.

- [ ] **Step 9: 커밋한다**

```bash
git add -A
git commit -m "feat(conformance): add typed client, targets and side channels"
```


### Task 12: 고정 버전 도구 설치기와 커밋 hook

oasdiff와 Betterleaks를 버전·SHA-256을 고정해 GitHub 릴리스에서 받아 `node_modules/.cache`에 두고 실행하는 `pnpm tool`을 만든다. lefthook으로 커밋 전 포맷·린트·비밀 스캔과 푸시 전 check를 건다.

**Files:**
- Create: `scripts/test/tools/install.test.ts`
- Create: `scripts/src/tools/manifest.ts`
- Create: `scripts/src/tools/install.ts`
- Create: `scripts/src/tools/cli.ts`
- Create: `lefthook.yml`
- Create: `.betterleaks.toml`
- Modify: `package.json` (파일 전체를 이 태스크의 내용으로 바꾼다)
- Modify: `pnpm-workspace.yaml` (파일 전체를 이 태스크의 내용으로 바꾼다)

**Interfaces:**
- Consumes: Task 2의 scripts 패키지
- Produces: `manifest.ts`: `PLATFORMS`, `type Platform`, `interface ToolSpec`, `TOOLS.oasdiff`, `TOOLS.betterleaks`, `isToolName`. `install.ts`: `currentPlatform(platform?, arch?)`, `downloadUrl(tool, asset)`, `verifySha256(data, asset)`, `interface InstallDeps { download, extract }`, `defaultDeps`, `ensureTool(tool, cacheDir, deps?, platform?): Promise<string>`. 루트 스크립트 `pnpm tool <oasdiff|betterleaks> [인자]`, `prepare: lefthook install`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`scripts/test/tools/install.test.ts`:

```ts
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  currentPlatform,
  downloadUrl,
  ensureTool,
  type InstallDeps,
} from "../../src/tools/install.ts";
import { TOOLS, type ToolSpec } from "../../src/tools/manifest.ts";

const payload = new TextEncoder().encode("fake archive");
const payloadSha = createHash("sha256").update(payload).digest("hex");

const fakeTool: ToolSpec = {
  name: "fake",
  version: "1.0.0",
  repo: "acme/fake",
  tag: "v1.0.0",
  binary: "fake",
  assets: {
    "linux-x64": { file: "fake_linux.tar.gz", sha256: payloadSha },
    "win32-x64": { file: "fake_windows.zip", sha256: payloadSha },
  },
};

function fakeDeps() {
  const downloads: string[] = [];
  const deps: InstallDeps = {
    download(url) {
      downloads.push(url);
      return Promise.resolve(payload);
    },
    extract(_archive, destination) {
      writeFileSync(join(destination, "fake"), "binary");
      writeFileSync(join(destination, "fake.exe"), "binary");
    },
  };
  return { downloads, deps };
}

describe("currentPlatform", () => {
  it("플랫폼과 아키텍처를 합쳐 키를 만든다", () => {
    expect(currentPlatform("win32", "x64")).toBe("win32-x64");
    expect(currentPlatform("darwin", "arm64")).toBe("darwin-arm64");
  });

  it("지원하지 않는 조합이면 지원 목록과 함께 알린다", () => {
    expect(() => currentPlatform("freebsd", "x64")).toThrow(/지원하지 않는 플랫폼: freebsd-x64/);
  });
});

describe("ensureTool", () => {
  it("GitHub 릴리스 주소에서 받아 설치하고, 두 번째에는 캐시를 쓴다", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "tools-"));
    const { downloads, deps } = fakeDeps();

    const first = await ensureTool(fakeTool, cacheDir, deps, "linux-x64");
    const second = await ensureTool(fakeTool, cacheDir, deps, "linux-x64");

    expect(existsSync(first)).toBe(true);
    expect(second).toBe(first);
    expect(downloads).toEqual([
      "https://github.com/acme/fake/releases/download/v1.0.0/fake_linux.tar.gz",
    ]);
  });

  it("Windows에서는 .exe 실행 파일을 찾는다", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "tools-"));
    const installed = await ensureTool(fakeTool, cacheDir, fakeDeps().deps, "win32-x64");
    expect(installed.endsWith("fake.exe")).toBe(true);
  });

  it("체크섬이 다르면 압축을 풀지 않고 멈춘다", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "tools-"));
    const tampered: ToolSpec = {
      ...fakeTool,
      assets: { "linux-x64": { file: "fake_linux.tar.gz", sha256: "0".repeat(64) } },
    };
    await expect(ensureTool(tampered, cacheDir, fakeDeps().deps, "linux-x64")).rejects.toThrow(
      /체크섬이 맞지 않다/,
    );
  });

  it("해당 플랫폼 바이너리가 없으면 알린다", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "tools-"));
    await expect(ensureTool(fakeTool, cacheDir, fakeDeps().deps, "darwin-arm64")).rejects.toThrow(
      /darwin-arm64용 바이너리를 제공하지 않는다/,
    );
  });
});

describe("manifest", () => {
  it("모든 도구가 지원 플랫폼마다 sha256을 가진다", () => {
    for (const tool of Object.values(TOOLS)) {
      for (const asset of Object.values(tool.assets)) {
        expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(downloadUrl(tool, asset)).toContain(`/releases/download/${tool.tag}/`);
      }
    }
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @ai-template/scripts test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `install.ts`가 있다.

- [ ] **Step 3: manifest, 설치기, CLI를 구현한다**

Windows에서는 zip과 tar.gz를 모두 푸는 내장 bsdtar(`%SystemRoot%\System32\tar.exe`)를 쓴다. Git Bash의 GNU tar는 zip을 풀지 못한다.

`scripts/src/tools/manifest.ts`:

```ts
/** 저장소가 쓰는 외부 바이너리. 버전을 올릴 때는 GitHub 릴리스의 checksums.txt에서 sha256을 함께 옮긴다. */

export const PLATFORMS = [
  "win32-x64",
  "linux-x64",
  "linux-arm64",
  "darwin-x64",
  "darwin-arm64",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export interface ToolAsset {
  readonly file: string;
  readonly sha256: string;
}

export interface ToolSpec {
  readonly name: string;
  readonly version: string;
  /** GitHub 저장소. 예: oasdiff/oasdiff */
  readonly repo: string;
  readonly tag: string;
  /** 확장자 없는 실행 파일 이름. Windows에서는 .exe를 붙인다. */
  readonly binary: string;
  readonly assets: Readonly<Partial<Record<Platform, ToolAsset>>>;
}

const OASDIFF_DARWIN: ToolAsset = {
  file: "oasdiff_1.32.1_darwin_all.tar.gz",
  sha256: "e4d74b7e2dfb9d4819e7fc720c905ec86547e4637ac270a2b0187c0f1fb7187e",
};

export const TOOLS = {
  oasdiff: {
    name: "oasdiff",
    version: "1.32.1",
    repo: "oasdiff/oasdiff",
    tag: "v1.32.1",
    binary: "oasdiff",
    assets: {
      "win32-x64": {
        file: "oasdiff_1.32.1_windows_amd64.tar.gz",
        sha256: "4d0758b32d454e6011e59db93884af1ca27ae2b212d990f36738ea5efb5d7f28",
      },
      "linux-x64": {
        file: "oasdiff_1.32.1_linux_amd64.tar.gz",
        sha256: "7c8939fc49b75ee11fec66a5b83b37a2fca6aee109fed85013b1ba2ac2a1ee7f",
      },
      "linux-arm64": {
        file: "oasdiff_1.32.1_linux_arm64.tar.gz",
        sha256: "32fff58a120f75a723d6c2422444691c37fa6813fed61d23f53dbcb604b30f6d",
      },
      "darwin-x64": OASDIFF_DARWIN,
      "darwin-arm64": OASDIFF_DARWIN,
    },
  },
  betterleaks: {
    name: "betterleaks",
    version: "1.8.1",
    repo: "betterleaks/betterleaks",
    tag: "v1.8.1",
    binary: "betterleaks",
    assets: {
      "win32-x64": {
        file: "betterleaks_1.8.1_windows_x64.zip",
        sha256: "94310d028285a1bcce7f160bc19eb62f87de6460c95bfd4319151ef5b501ed3f",
      },
      "linux-x64": {
        file: "betterleaks_1.8.1_linux_x64.tar.gz",
        sha256: "efa407244e1ea8e35f582b8a42becdeac08bdead04f68eb752adda722d583c2a",
      },
      "linux-arm64": {
        file: "betterleaks_1.8.1_linux_arm64.tar.gz",
        sha256: "bbb578b12a2f65d7082ab436abf37724232bc71d8a078e3c41336574420f1b48",
      },
      "darwin-x64": {
        file: "betterleaks_1.8.1_darwin_x64.tar.gz",
        sha256: "6abc37df76f881cffae406aa2cec72bea6e6ae64b4e771b3ed21b4aac472ed10",
      },
      "darwin-arm64": {
        file: "betterleaks_1.8.1_darwin_arm64.tar.gz",
        sha256: "8e80f33b5f2a7426b390347b9fd466033723cb94b6bdffa7572632e2eaec964e",
      },
    },
  },
} as const satisfies Record<string, ToolSpec>;

export type ToolName = keyof typeof TOOLS;

export function isToolName(value: string): value is ToolName {
  return Object.hasOwn(TOOLS, value);
}
```

`scripts/src/tools/install.ts`:

```ts
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS, type Platform, type ToolAsset, type ToolSpec } from "./manifest.ts";

export interface InstallDeps {
  readonly download: (url: string) => Promise<Uint8Array>;
  readonly extract: (archive: string, destination: string) => void;
}

export function currentPlatform(platform: string = process.platform, arch: string = process.arch) {
  const key = `${platform}-${arch}`;
  const found = PLATFORMS.find((candidate) => candidate === key);
  if (found === undefined) {
    throw new Error(`지원하지 않는 플랫폼: ${key}. 지원 목록: ${PLATFORMS.join(", ")}`);
  }
  return found;
}

export function downloadUrl(tool: ToolSpec, asset: ToolAsset): string {
  return `https://github.com/${tool.repo}/releases/download/${tool.tag}/${asset.file}`;
}

export function verifySha256(data: Uint8Array, asset: ToolAsset): void {
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== asset.sha256) {
    throw new Error(
      `${asset.file} 체크섬이 맞지 않다(기대 ${asset.sha256}, 실제 ${actual}). 받은 파일이 변조됐거나 manifest가 틀렸다.`,
    );
  }
}

/** 실제 네트워크와 시스템 tar를 쓴다. Windows는 zip도 푸는 내장 bsdtar(System32)를 쓴다. */
export const defaultDeps: InstallDeps = {
  async download(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} 다운로드 실패: HTTP ${String(response.status)}`);
    return new Uint8Array(await response.arrayBuffer());
  },
  extract(archive, destination) {
    const tar =
      process.platform === "win32"
        ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
        : "tar";
    const result = spawnSync(tar, ["-xf", archive, "-C", destination], { stdio: "inherit" });
    if (result.status !== 0) throw new Error(`${archive} 압축 해제 실패`);
  },
};

function findFile(dir: string, name: string): string | undefined {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return path;
    if (entry.isDirectory()) {
      const found = findFile(path, name);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** 도구를 캐시 폴더에 설치하고 실행 파일 경로를 돌려준다. 이미 설치돼 있으면 다시 받지 않는다. */
export async function ensureTool(
  tool: ToolSpec,
  cacheDir: string,
  deps: InstallDeps = defaultDeps,
  platform: Platform = currentPlatform(),
): Promise<string> {
  const asset = tool.assets[platform];
  if (asset === undefined) {
    throw new Error(`${tool.name} ${tool.version}은 ${platform}용 바이너리를 제공하지 않는다.`);
  }
  const dir = join(cacheDir, `${tool.name}-${tool.version}-${platform}`);
  const binary = platform.startsWith("win32") ? `${tool.binary}.exe` : tool.binary;
  const cached = existsSync(dir) ? findFile(dir, binary) : undefined;
  if (cached !== undefined) return cached;

  const data = await deps.download(downloadUrl(tool, asset));
  verifySha256(data, asset);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const archive = join(dir, asset.file);
  writeFileSync(archive, data);
  deps.extract(archive, dir);
  rmSync(archive);

  const installed = findFile(dir, binary);
  if (installed === undefined) throw new Error(`${asset.file} 안에 ${binary}가 없다`);
  if (!platform.startsWith("win32")) chmodSync(installed, 0o755);
  return installed;
}
```

`scripts/src/tools/cli.ts`:

```ts
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ensureTool } from "./install.ts";
import { TOOLS, isToolName } from "./manifest.ts";

/** 사용법: pnpm tool <도구> [인자...]. 처음 한 번만 내려받고 node_modules/.cache에 둔다. */
export const TOOL_CACHE_DIR = join(process.cwd(), "node_modules", ".cache", "ai-template-tools");

const [name, ...args] = process.argv.slice(2);
if (name === undefined || !isToolName(name)) {
  console.error(`사용법: pnpm tool <${Object.keys(TOOLS).join("|")}> [인자...]`);
  process.exit(2);
}

const binary = await ensureTool(TOOLS[name], TOOL_CACHE_DIR);
const result = spawnSync(binary, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/scripts test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  14 passed`가 있다.

- [ ] **Step 5: tool 스크립트, lefthook, 비밀 스캔 설정을 더한다**

lefthook의 postinstall은 믿지 않는다(`allowBuilds`에서 false). hook 설치는 루트 `prepare`가 명시적으로 한다. `.betterleaks.toml`은 비밀 값이 들어갈 수 없는 lockfile과 계약 파일만 제외한다.

`package.json` (전체 교체):

```json
{
  "name": "ai-template",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "prepare": "lefthook install",
    "check": "tsx scripts/src/check/cli.ts",
    "check:format": "prettier --check .",
    "check:lint": "eslint .",
    "fix": "prettier --write . && eslint --fix .",
    "test": "pnpm -r run test",
    "gen": "pnpm -r run gen",
    "tool": "tsx scripts/src/tools/cli.ts"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/node": "24.13.6",
    "eslint": "10.11.0",
    "lefthook": "2.1.14",
    "prettier": "3.9.9",
    "tsx": "4.23.15",
    "typescript": "6.0.3",
    "typescript-eslint": "8.70.1",
    "vitest": "5.0.1",
    "yaml": "2.9.1"
  }
}
```

`pnpm-workspace.yaml` (전체 교체):

```yaml
packages:
  - contract/*
  - scripts
allowBuilds:
  esbuild: true
  lefthook: false
```

`lefthook.yml`:

```yaml
# 커밋 전에는 빠른 검사와 비밀 스캔을, 푸시 전에는 전체 check를 돌린다.
pre-commit:
  parallel: true
  jobs:
    - name: format
      glob: "*.{ts,js,mjs,json,md,yaml,yml}"
      run: pnpm exec prettier --write --ignore-unknown {staged_files}
      stage_fixed: true
    - name: lint
      glob: "*.{ts,js,mjs}"
      run: pnpm exec eslint --no-warn-ignored {staged_files}
    - name: secrets
      run: pnpm run -s tool betterleaks git --pre-commit --staged --no-banner --redact
pre-push:
  jobs:
    - name: check
      run: pnpm check
```

`.betterleaks.toml`:

```toml
# 기본 규칙을 그대로 쓰되, 비밀 값이 들어갈 수 없는 파일은 검사하지 않는다.
# - pnpm-lock.yaml: 패키지 이름과 해시뿐이다(@inquirer/password 같은 이름이 오탐된다).
# - 계약: TypeSpec 원본과 생성된 OpenAPI에는 필드 이름(password 등)과 스키마 참조만 있다.
# 테스트의 가짜 값은 줄 끝에 `betterleaks:allow` 주석을 달아 하나씩 허용한다.
prefilter = '''
filter.matchesAny(attributes["path"], [
  `^pnpm-lock\.yaml$`,
  `^contract/openapi\.yaml$`,
  `^contract/typespec/src/.+\.tsp$`,
])
'''

[extend]
useDefault = true
```

- [ ] **Step 6: 설치해서 git hook을 건다**

Run: `pnpm install`
Expected: 성공한다(종료 코드 0). 출력에 `sync hooks`가 있다.

- [ ] **Step 7: oasdiff를 받아 실행해 본다**

처음 한 번은 GitHub에서 받는다(약 7MB). 이후에는 캐시를 쓴다.

Run: `pnpm tool oasdiff --version`
Expected: 성공한다(종료 코드 0). 출력에 `oasdiff version 1.32.1`가 있다.

- [ ] **Step 8: Betterleaks를 받아 실행해 본다**

pnpm 12는 `pnpm -s <스크립트>` 형식을 받지 않는다. 항상 `pnpm run -s <스크립트>`로 쓴다.

Run: `pnpm run -s tool betterleaks version`
Expected: 성공한다(종료 코드 0). 출력에 `1.8.1`가 있다.

- [ ] **Step 9: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 6단계`가 있다.

- [ ] **Step 10: 커밋한다(이제 pre-commit hook이 돈다)**

```bash
git add -A
git commit -m "feat(scripts): add pinned tool installer and git hooks"
```


### Task 13: 구조 비교 도구

백엔드가 내보낸 OpenAPI를 계약과 비교한다. 계약의 스키마 이름이 모두 있는지(포함 관계), operation 집합이 같은지(경로 파라미터 이름은 무시), 계약을 깨는 변경이 없는지(oasdiff)를 본다.

**Files:**
- Create: `scripts/test/fixtures/specs/contract.yaml`
- Create: `scripts/test/fixtures/specs/compatible.yaml`
- Create: `scripts/test/fixtures/specs/broken.yaml`
- Create: `scripts/test/spec-compare/compare.test.ts`
- Create: `scripts/test/spec-compare/breaking.test.ts`
- Create: `scripts/src/spec-compare/compare.ts`
- Create: `scripts/src/spec-compare/breaking.ts`
- Create: `scripts/src/spec-compare/cli.ts`
- Modify: `package.json` (파일 전체를 이 태스크의 내용으로 바꾼다)

**Interfaces:**
- Consumes: Task 12의 `ensureTool`, `TOOLS.oasdiff`
- Produces: `compare.ts`: `interface OpenApiLike`, `interface Comparison { missingSchemas, missingOperations, extraOperations }`, `normalizePath(path)`, `operationKeys(spec)`, `compareSpecs(contract, implementation)`, `describeComparison(result): string[]`. `breaking.ts`: `checkBreaking(contractPath, implementationPath, cacheDir): Promise<{ ok, output }>`. 루트 스크립트 `pnpm spec-compare <계약> <구현>`.

- [ ] **Step 1: 픽스처와 실패하는 테스트를 쓴다**

`scripts/test/fixtures/specs/contract.yaml`:

```yaml
openapi: 3.1.0
info:
  title: Contract
  version: 1.0.0
paths:
  /api/v1/posts/{id}:
    get:
      operationId: getPost
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        "200":
          description: OK
          content:
            application/vnd.api+json:
              schema: { $ref: "#/components/schemas/PostDocument" }
components:
  schemas:
    PostDocument:
      type: object
      required: [data]
      properties:
        data:
          type: object
          required: [type, id, attributes]
          properties:
            type: { type: string, enum: [posts] }
            id: { type: string }
            attributes:
              type: object
              required: [title]
              properties:
                title: { type: string }
```

`scripts/test/fixtures/specs/compatible.yaml`:

```yaml
# contract.yaml과 호환된다: 경로 파라미터 이름이 다르고 응답에 필드가 하나 더 있다.
openapi: 3.1.0
info:
  title: Implementation
  version: 1.0.0
paths:
  /api/v1/posts/{post_id}:
    get:
      operationId: getPost
      parameters:
        - { name: post_id, in: path, required: true, schema: { type: string } }
      responses:
        "200":
          description: OK
          content:
            application/vnd.api+json:
              schema: { $ref: "#/components/schemas/PostDocument" }
components:
  schemas:
    PostDocument:
      type: object
      required: [data]
      properties:
        data:
          type: object
          required: [type, id, attributes]
          properties:
            type: { type: string, enum: [posts] }
            id: { type: string }
            attributes:
              type: object
              required: [title]
              properties:
                title: { type: string }
                subtitle: { type: string }
```

`scripts/test/fixtures/specs/broken.yaml`:

```yaml
# contract.yaml을 깨뜨린다: 응답의 필수 필드 title이 선택이 됐다.
openapi: 3.1.0
info:
  title: Implementation
  version: 1.0.0
paths:
  /api/v1/posts/{id}:
    get:
      operationId: getPost
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        "200":
          description: OK
          content:
            application/vnd.api+json:
              schema: { $ref: "#/components/schemas/PostDocument" }
components:
  schemas:
    PostDocument:
      type: object
      required: [data]
      properties:
        data:
          type: object
          required: [type, id, attributes]
          properties:
            type: { type: string, enum: [posts] }
            id: { type: string }
            attributes:
              type: object
              properties:
                title: { type: string }
```

`scripts/test/spec-compare/compare.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  compareSpecs,
  describeComparison,
  normalizePath,
  type OpenApiLike,
} from "../../src/spec-compare/compare.ts";

const contract: OpenApiLike = {
  paths: {
    "/api/v1/posts": { get: {}, post: {} },
    "/api/v1/posts/{id}": { get: {}, parameters: [] },
  },
  components: { schemas: { PostDocument: {}, ErrorDocument: {} } },
};

describe("compareSpecs", () => {
  it("경로 파라미터 이름이 달라도, 보조 스키마가 더 있어도 통과한다", () => {
    const implementation: OpenApiLike = {
      paths: {
        "/api/v1/posts": { get: {}, post: {} },
        "/api/v1/posts/{post_id}": { get: {} },
      },
      components: { schemas: { PostDocument: {}, ErrorDocument: {}, PostCreateData: {} } },
    };
    expect(describeComparison(compareSpecs(contract, implementation))).toEqual([]);
  });

  it("계약의 스키마가 없으면 이름을 알려 준다", () => {
    const implementation: OpenApiLike = {
      ...contract,
      components: { schemas: { PostDocument: {} } },
    };
    expect(compareSpecs(contract, implementation).missingSchemas).toEqual(["ErrorDocument"]);
  });

  it("빠진 operation과 계약에 없는 operation을 모두 잡는다", () => {
    const implementation: OpenApiLike = {
      ...contract,
      paths: {
        "/api/v1/posts": { get: {} },
        "/api/v1/posts/{id}": { get: {}, delete: {} },
      },
    };
    const result = compareSpecs(contract, implementation);
    expect(result.missingOperations).toEqual(["POST /api/v1/posts"]);
    expect(result.extraOperations).toEqual(["DELETE /api/v1/posts/{}"]);
  });
});

describe("normalizePath", () => {
  it("경로 파라미터 이름을 지운다", () => {
    expect(normalizePath("/api/v1/oauth/{provider}/callback")).toBe("/api/v1/oauth/{}/callback");
  });
});
```

`scripts/test/spec-compare/breaking.test.ts`:

```ts
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkBreaking } from "../../src/spec-compare/breaking.ts";

/** oasdiff는 처음 한 번 GitHub에서 받아 저장소의 node_modules/.cache에 둔다. */
const cacheDir = fileURLToPath(
  new URL("../../../node_modules/.cache/ai-template-tools", import.meta.url),
);
const fixture = (name: string) =>
  fileURLToPath(new URL(`../fixtures/specs/${name}`, import.meta.url));

describe("checkBreaking", () => {
  it("파라미터 이름 변경과 응답 필드 추가는 깨는 변경이 아니다", async () => {
    const result = await checkBreaking(
      fixture("contract.yaml"),
      fixture("compatible.yaml"),
      cacheDir,
    );
    expect(result.ok).toBe(true);
  }, 120_000);

  it("필수 응답 필드를 선택으로 바꾸면 깨는 변경으로 잡는다", async () => {
    const result = await checkBreaking(fixture("contract.yaml"), fixture("broken.yaml"), cacheDir);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("title");
  }, 120_000);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @ai-template/scripts test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `compare.ts`가 있다.

- [ ] **Step 3: 비교 도구와 CLI를 구현한다**

`scripts/src/spec-compare/compare.ts`:

```ts
/** 백엔드가 내보낸 OpenAPI가 계약과 같은 이름·경로를 쓰는지 비교한다. 구조 호환은 breaking.ts(oasdiff)가 본다. */

export interface OpenApiLike {
  readonly paths?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly components?: { readonly schemas?: Readonly<Record<string, unknown>> };
}

export interface Comparison {
  readonly missingSchemas: readonly string[];
  readonly missingOperations: readonly string[];
  readonly extraOperations: readonly string[];
}

const METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

/** 경로 파라미터 이름을 지운다. 예: /posts/{post_id} → /posts/{} */
export function normalizePath(path: string): string {
  return path.replace(/\{[^}]+\}/g, "{}");
}

export function operationKeys(spec: OpenApiLike): Set<string> {
  const keys = new Set<string>();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of Object.keys(item).filter((key) => METHODS.has(key))) {
      keys.add(`${method.toUpperCase()} ${normalizePath(path)}`);
    }
  }
  return keys;
}

/**
 * 계약의 스키마 이름은 모두 구현에 있어야 한다(구현의 보조 스키마가 더 있는 것은 괜찮다).
 * operation 집합은 정확히 같아야 한다. 경로 파라미터 이름은 달라도 된다.
 */
export function compareSpecs(contract: OpenApiLike, implementation: OpenApiLike): Comparison {
  const implementedSchemas = new Set(Object.keys(implementation.components?.schemas ?? {}));
  const contractOperations = operationKeys(contract);
  const implementedOperations = operationKeys(implementation);
  return {
    missingSchemas: Object.keys(contract.components?.schemas ?? {})
      .filter((name) => !implementedSchemas.has(name))
      .sort(),
    missingOperations: [...contractOperations]
      .filter((key) => !implementedOperations.has(key))
      .sort(),
    extraOperations: [...implementedOperations]
      .filter((key) => !contractOperations.has(key))
      .sort(),
  };
}

export function describeComparison(result: Comparison): string[] {
  return [
    ...result.missingSchemas.map(
      (name) => `스키마 ${name}가 구현 스펙에 없다. 계약과 같은 이름으로 모델을 만든다.`,
    ),
    ...result.missingOperations.map((key) => `${key}를 구현하지 않았다.`),
    ...result.extraOperations.map(
      (key) =>
        `${key}는 계약에 없다. 플랫폼 기능이면 계약(contract/typespec)에 먼저 추가하고, 프로젝트 전용 기능이면 생성된 프로젝트에서 만든다.`,
    ),
  ];
}
```

`scripts/src/spec-compare/breaking.ts`:

```ts
import { spawnSync } from "node:child_process";
import { ensureTool } from "../tools/install.ts";
import { TOOLS } from "../tools/manifest.ts";

export interface BreakingResult {
  readonly ok: boolean;
  readonly output: string;
}

/** 구현 스펙이 계약을 쓰는 클라이언트를 깨뜨리는지 oasdiff로 검사한다. */
export async function checkBreaking(
  contractPath: string,
  implementationPath: string,
  cacheDir: string,
): Promise<BreakingResult> {
  const oasdiff = await ensureTool(TOOLS.oasdiff, cacheDir);
  const args = ["breaking", contractPath, implementationPath, "--fail-on", "ERR"];
  const result = spawnSync(oasdiff, [...args, "--format", "singleline", "--color", "never"], {
    encoding: "utf8",
  });
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}`.trim() };
}
```

`scripts/src/spec-compare/cli.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { checkBreaking } from "./breaking.ts";
import { compareSpecs, describeComparison, type OpenApiLike } from "./compare.ts";

/** 사용법: pnpm spec-compare <계약 파일> <구현 스펙 파일>. 이름·경로 비교와 breaking 검사를 모두 돌린다. */
const [contractPath, implementationPath] = process.argv.slice(2);
if (contractPath === undefined || implementationPath === undefined) {
  console.error("사용법: pnpm spec-compare <계약 파일> <구현 스펙 파일>");
  process.exit(2);
}

const load = (path: string) => parse(readFileSync(path, "utf8")) as OpenApiLike;
const problems = describeComparison(compareSpecs(load(contractPath), load(implementationPath)));
const cacheDir = join(process.cwd(), "node_modules", ".cache", "ai-template-tools");
const breaking = await checkBreaking(contractPath, implementationPath, cacheDir);
if (!breaking.ok) problems.push(`계약을 깨는 변경이 있다(oasdiff):\n${breaking.output}`);

for (const problem of problems) console.error(problem);
process.exitCode = problems.length > 0 ? 1 : 0;
```

`package.json` (전체 교체):

```json
{
  "name": "ai-template",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "prepare": "lefthook install",
    "check": "tsx scripts/src/check/cli.ts",
    "check:format": "prettier --check .",
    "check:lint": "eslint .",
    "fix": "prettier --write . && eslint --fix .",
    "test": "pnpm -r run test",
    "gen": "pnpm -r run gen",
    "tool": "tsx scripts/src/tools/cli.ts",
    "spec-compare": "tsx scripts/src/spec-compare/cli.ts"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/node": "24.13.6",
    "eslint": "10.11.0",
    "lefthook": "2.1.14",
    "prettier": "3.9.9",
    "tsx": "4.23.15",
    "typescript": "6.0.3",
    "typescript-eslint": "8.70.1",
    "vitest": "5.0.1",
    "yaml": "2.9.1"
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/scripts test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  20 passed`가 있다.

- [ ] **Step 5: 계약끼리 비교하면 통과하는지 확인한다**

Run: `pnpm run -s spec-compare contract/openapi.yaml contract/openapi.yaml`
Expected: 성공한다(종료 코드 0).

- [ ] **Step 6: 깨는 변경을 알려 주는지 확인한다**

Run: `pnpm run -s spec-compare scripts/test/fixtures/specs/contract.yaml scripts/test/fixtures/specs/broken.yaml`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `response-property-became-optional`가 있다.

- [ ] **Step 7: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 6단계`가 있다.

- [ ] **Step 8: 커밋한다**

```bash
git add -A
git commit -m "feat(scripts): add contract comparison with oasdiff breaking check"
```


### Task 14: 지침 파일 검사기

AGENTS.md마다 `@AGENTS.md` 한 줄짜리 CLAUDE.md가 있는지, 하위 폴더 CLAUDE.md가 그 한 줄만 담는지, 루트 AGENTS.md가 200줄 이하인지 검사해 루트 check에 넣는다.

**Files:**
- Create: `scripts/test/agents-md/check.test.ts`
- Create: `scripts/src/agents-md/check.ts`
- Create: `scripts/src/agents-md/cli.ts`
- Modify: `package.json` (파일 전체를 이 태스크의 내용으로 바꾼다)

**Interfaces:**
- Consumes: Task 2의 실행기(`check:*` 자동 발견)
- Produces: `checkAgentsMd(root, { exclude? }): Problem[]`, `MAX_ROOT_AGENTS_LINES = 200`, `IMPORT_LINE = "@AGENTS.md"`, `interface Problem { path, message }`. 루트 스크립트 `check:agents-md`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`scripts/test/agents-md/check.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkAgentsMd } from "../../src/agents-md/check.ts";

/** { "상대 경로": "내용" }으로 임시 폴더를 만든다. */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "agents-md-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const paths = (root: string) => checkAgentsMd(root).map((problem) => problem.path);

describe("checkAgentsMd", () => {
  it("짝이 맞으면 통과한다. 루트 CLAUDE.md는 import 뒤에 내용을 더할 수 있다", () => {
    const root = tree({
      "AGENTS.md": "# 규칙\n",
      "CLAUDE.md": "@AGENTS.md\n\n## Claude 전용\n- hook이 check를 돌린다\n",
      "src/modules/AGENTS.md": "# 모듈 규칙\n",
      "src/modules/CLAUDE.md": "@AGENTS.md\n",
    });
    expect(checkAgentsMd(root)).toEqual([]);
  });

  it("AGENTS.md 옆에 CLAUDE.md가 없으면 잡는다", () => {
    const root = tree({ "AGENTS.md": "a", "CLAUDE.md": "@AGENTS.md", "db/AGENTS.md": "b" });
    expect(paths(root)).toEqual(["db/CLAUDE.md"]);
  });

  it("하위 폴더 CLAUDE.md에 다른 내용이 있으면 잡는다", () => {
    const root = tree({ "db/AGENTS.md": "b", "db/CLAUDE.md": "@AGENTS.md\n마이그레이션 규칙" });
    expect(checkAgentsMd(root)[0]?.message).toMatch(/한 줄만 담는다/);
  });

  it("첫 줄이 import가 아니면 잡는다", () => {
    const root = tree({ "AGENTS.md": "a", "CLAUDE.md": "# 규칙\n@AGENTS.md" });
    expect(checkAgentsMd(root)[0]?.message).toMatch(/첫 줄은 "@AGENTS.md"/);
  });

  it("AGENTS.md 없이 CLAUDE.md만 있으면 잡는다", () => {
    const root = tree({ "lib/CLAUDE.md": "직접 쓴 규칙" });
    expect(paths(root)).toEqual(["lib/CLAUDE.md"]);
  });

  it("루트 AGENTS.md가 200줄을 넘으면 잡는다", () => {
    const root = tree({ "AGENTS.md": "줄\n".repeat(201), "CLAUDE.md": "@AGENTS.md" });
    expect(paths(root)).toEqual(["AGENTS.md"]);
  });

  it("fixtures와 제외한 루트 폴더는 보지 않는다", () => {
    const root = tree({
      "test/fixtures/bad/AGENTS.md": "x",
      "templates/web/AGENTS.md": "x",
    });
    expect(checkAgentsMd(root, { exclude: ["templates"] })).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @ai-template/scripts test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `agents-md`가 있다.

- [ ] **Step 3: 검사기와 CLI를 구현하고 루트 check에 넣는다**

`scripts/src/agents-md/check.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const MAX_ROOT_AGENTS_LINES = 200;
export const IMPORT_LINE = "@AGENTS.md";

/** 테스트 픽스처처럼 일부러 규칙을 어긴 폴더와 도구 폴더는 보지 않는다. */
const SKIPPED_DIRS = new Set(["node_modules", ".git", ".cache", "fixtures"]);

export interface Problem {
  readonly path: string;
  readonly message: string;
}

export interface CheckOptions {
  /** 루트 바로 아래에서 건너뛸 폴더. 예: 템플릿 저장소는 templates/를 따로 검사한다. */
  readonly exclude?: readonly string[];
}

function meaningfulLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * AGENTS.md마다 `@AGENTS.md`로 시작하는 CLAUDE.md가 옆에 있어야 한다.
 * 하위 폴더의 CLAUDE.md는 그 한 줄만 담고, 루트 CLAUDE.md만 Claude 전용 내용을 덧붙일 수 있다.
 * 루트 AGENTS.md는 200줄 이하다.
 */
export function checkAgentsMd(root: string, options: CheckOptions = {}): Problem[] {
  const problems: Problem[] = [];
  const excluded = new Set(options.exclude ?? []);

  const visit = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    const at = (name: string) => relative(root, join(dir, name)).replaceAll("\\", "/");
    const isRoot = dir === root;

    if (files.has("AGENTS.md") && !files.has("CLAUDE.md")) {
      problems.push({
        path: at("CLAUDE.md"),
        message: `AGENTS.md 옆에 "${IMPORT_LINE}" 한 줄짜리 CLAUDE.md를 만든다.`,
      });
    }
    if (files.has("CLAUDE.md")) {
      const lines = meaningfulLines(readFileSync(join(dir, "CLAUDE.md"), "utf8"));
      if (!files.has("AGENTS.md")) {
        problems.push({
          path: at("CLAUDE.md"),
          message: "규칙은 AGENTS.md에 쓰고 CLAUDE.md는 `@AGENTS.md`만 담는다.",
        });
      } else if (lines[0] !== IMPORT_LINE) {
        problems.push({ path: at("CLAUDE.md"), message: `첫 줄은 "${IMPORT_LINE}"여야 한다.` });
      } else if (!isRoot && lines.length > 1) {
        problems.push({
          path: at("CLAUDE.md"),
          message: `하위 폴더의 CLAUDE.md는 "${IMPORT_LINE}" 한 줄만 담는다. 규칙은 AGENTS.md로 옮긴다.`,
        });
      }
    }
    if (isRoot && files.has("AGENTS.md")) {
      const count = readFileSync(join(dir, "AGENTS.md"), "utf8").trimEnd().split(/\r?\n/).length;
      if (count > MAX_ROOT_AGENTS_LINES) {
        problems.push({
          path: at("AGENTS.md"),
          message: `${String(count)}줄이다. ${String(MAX_ROOT_AGENTS_LINES)}줄 이하로 줄이고 자세한 내용은 docs/로 옮긴다.`,
        });
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || SKIPPED_DIRS.has(entry.name)) continue;
      if (isRoot && excluded.has(entry.name)) continue;
      visit(join(dir, entry.name));
    }
  };

  visit(root);
  return problems;
}
```

`scripts/src/agents-md/cli.ts`:

```ts
import { resolve } from "node:path";
import { checkAgentsMd } from "./check.ts";

/** 사용법: tsx scripts/src/agents-md/cli.ts [루트]. templates/는 verify-templates가 템플릿마다 따로 검사한다. */
const root = resolve(process.argv[2] ?? ".");
const problems = checkAgentsMd(root, { exclude: ["templates"] });
for (const problem of problems) console.error(`${problem.path}: ${problem.message}`);
process.exitCode = problems.length > 0 ? 1 : 0;
```

`package.json` (전체 교체):

```json
{
  "name": "ai-template",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "prepare": "lefthook install",
    "check": "tsx scripts/src/check/cli.ts",
    "check:format": "prettier --check .",
    "check:lint": "eslint .",
    "check:agents-md": "tsx scripts/src/agents-md/cli.ts .",
    "fix": "prettier --write . && eslint --fix .",
    "test": "pnpm -r run test",
    "gen": "pnpm -r run gen",
    "tool": "tsx scripts/src/tools/cli.ts",
    "spec-compare": "tsx scripts/src/spec-compare/cli.ts"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/node": "24.13.6",
    "eslint": "10.11.0",
    "lefthook": "2.1.14",
    "prettier": "3.9.9",
    "tsx": "4.23.15",
    "typescript": "6.0.3",
    "typescript-eslint": "8.70.1",
    "vitest": "5.0.1",
    "yaml": "2.9.1"
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/scripts test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  27 passed`가 있다.

- [ ] **Step 5: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 7단계`가 있다.

- [ ] **Step 6: 커밋한다**

```bash
git add -A
git commit -m "feat(scripts): check AGENTS.md and CLAUDE.md pairing"
```


### Task 15: 템플릿 검증기와 공유 자산 동기화

`templates/` 아래 템플릿마다 하네스 표준(template.json, 지침 파일, 명령 어휘, exec form hook, 필수 파일, 공유 자산 사본)을 검사하고, 공유 자산을 원본에서 사본으로 복사하는 `pnpm sync`를 만든다. 지금은 템플릿이 없으므로 검사는 통과한다.

**Files:**
- Create: `scripts/test/verify-templates/verify.test.ts`
- Create: `scripts/src/verify-templates/manifest.ts`
- Create: `scripts/src/verify-templates/files.ts`
- Create: `scripts/src/verify-templates/verify.ts`
- Create: `scripts/src/verify-templates/cli.ts`
- Create: `scripts/src/sync/sync.ts`
- Create: `scripts/src/sync/cli.ts`
- Create: `scripts/shared-assets.json`
- Modify: `package.json` (파일 전체를 이 태스크의 내용으로 바꾼다)

**Interfaces:**
- Consumes: Task 14의 `checkAgentsMd`
- Produces: `manifest.ts`: `interface TemplateManifest { name, kind: "backend"|"frontend", runner: "pnpm"|"uv", goldenModule }`, `interface SharedAssetsManifest { assets: { source, targets: { template, path }[] }[] }`, `BASE_COMMANDS`, `BACKEND_COMMANDS`, `requiredCommands`, `readTemplateManifest(dir)`, `readSharedAssets(repoRoot)`. `files.ts`: `listFiles(dir)`, `diffDirs(source, copy)`. `verify.ts`: `REQUIRED_HOOKS`, `verifyTemplate(repoRoot, name, shared): string[]`. `sync.ts`: `syncSharedAssets(repoRoot, manifest): string[]`. 파일 `scripts/shared-assets.json`, 루트 스크립트 `check:templates`, `sync`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`scripts/test/verify-templates/verify.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncSharedAssets } from "../../src/sync/sync.ts";
import type { SharedAssetsManifest } from "../../src/verify-templates/manifest.ts";
import { verifyTemplate } from "../../src/verify-templates/verify.ts";

const WEB = "templates/web";
const COMMANDS = ["setup", "dev", "check", "fix", "test", "test:e2e", "gen"];
const HOOK = { type: "command", command: "node", args: [".claude/hooks/check.mjs"] };
const EVENTS = ["PostToolUse", "Stop", "PreToolUse", "SessionStart"];

const shared: SharedAssetsManifest = {
  assets: [{ source: "contract", targets: [{ template: "web", path: "contract" }] }],
};

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function writeJson(root: string, path: string, value: unknown): void {
  write(root, path, JSON.stringify(value));
}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    name: "web",
    kind: "frontend",
    runner: "pnpm",
    goldenModule: "src/features/posts",
    ...overrides,
  };
}

/** 하네스 표준을 모두 지킨 web 템플릿과 공유 자산 원본을 가진 임시 저장소. */
function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "verify-"));
  writeJson(repo, `${WEB}/template.json`, manifest());
  write(repo, `${WEB}/AGENTS.md`, "# web\n");
  write(repo, `${WEB}/CLAUDE.md`, "@AGENTS.md\n");
  writeJson(repo, `${WEB}/package.json`, {
    scripts: Object.fromEntries(COMMANDS.map((command) => [command, "echo"])),
  });
  writeJson(repo, `${WEB}/.claude/settings.json`, {
    hooks: Object.fromEntries(EVENTS.map((event) => [event, [{ hooks: [HOOK] }]])),
  });
  write(repo, `${WEB}/.env.example`, "API_BASE_URL=\n");
  write(repo, `${WEB}/docs/recipes/add-feature.md`, "# 기능 추가\n");
  write(repo, `${WEB}/src/features/posts/index.ts`, "export {};\n");
  write(repo, "contract/openapi.yaml", "openapi: 3.1.0\n");
  write(repo, `${WEB}/contract/openapi.yaml`, "openapi: 3.1.0\n");
  return repo;
}

const verify = (repo: string) => verifyTemplate(repo, "web", shared);

describe("verifyTemplate", () => {
  it("하네스 표준을 모두 지키면 통과한다", () => {
    expect(verify(makeRepo())).toEqual([]);
  });

  it("template.json이 없으면 무엇을 적을지 알려 준다", () => {
    const repo = makeRepo();
    rmSync(join(repo, WEB, "template.json"));
    expect(verify(repo)).toEqual([
      "template.json이 없다. name, kind, runner, goldenModule을 적는다.",
    ]);
  });

  it("빠진 명령을 잡고, 백엔드는 db 명령도 요구한다", () => {
    const repo = makeRepo();
    writeJson(repo, `${WEB}/template.json`, manifest({ kind: "backend" }));
    const problems = verify(repo);
    expect(problems).toContain('명령 "db:migrate"가 없다(docs/harness/standard.md의 명령 어휘).');
    expect(problems).toContain('명령 "db:reset"가 없다(docs/harness/standard.md의 명령 어휘).');
  });

  it("아직 검사 방법이 없는 runner는 구현하라고 알린다", () => {
    const repo = makeRepo();
    writeJson(repo, `${WEB}/template.json`, manifest({ runner: "uv" }));
    expect(verify(repo)[0]).toMatch(/runner "uv"의 명령 검사는 아직 없다/);
  });

  it("쉘 형식(args 없음) hook을 잡는다", () => {
    const repo = makeRepo();
    const hooks: Record<string, unknown> = Object.fromEntries(
      EVENTS.map((event) => [event, [{ hooks: [HOOK] }]]),
    );
    hooks.Stop = [{ hooks: [{ type: "command", command: "node .claude/hooks/check.mjs" }] }];
    writeJson(repo, `${WEB}/.claude/settings.json`, { hooks });
    expect(verify(repo)).toEqual(["Stop hook이 없거나 exec form(command + args)이 아니다."]);
  });

  it("필수 파일과 골든 모듈이 없으면 잡는다", () => {
    const repo = makeRepo();
    rmSync(join(repo, WEB, ".env.example"));
    rmSync(join(repo, WEB, "docs"), { recursive: true });
    rmSync(join(repo, WEB, "src"), { recursive: true });
    expect(verify(repo)).toEqual([
      ".env.example이 없다.",
      "docs/recipes/에 레시피(.md)가 하나도 없다.",
      "골든 모듈 src/features/posts이 없다.",
    ]);
  });

  it("지침 파일 짝이 맞지 않으면 잡는다", () => {
    const repo = makeRepo();
    rmSync(join(repo, WEB, "CLAUDE.md"));
    expect(verify(repo)[0]).toMatch(/^CLAUDE\.md: AGENTS\.md 옆에/);
  });

  it("공유 자산 사본이 원본과 다르면 잡고, sync하면 복구된다", () => {
    const repo = makeRepo();
    write(repo, `${WEB}/contract/openapi.yaml`, "openapi: 3.0.0\n");
    expect(verify(repo)).toEqual([
      "contract가 원본 contract와 다르다(openapi.yaml). pnpm sync를 돌린다.",
    ]);
    syncSharedAssets(repo, shared);
    expect(verify(repo)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @ai-template/scripts test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `verify.ts`가 있다.

- [ ] **Step 3: 검증기, 동기화, CLI를 구현하고 루트 check에 넣는다**

`scripts/src/verify-templates/manifest.ts`:

```ts
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

function isRecord(value: unknown): value is Record<string, unknown> {
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
```

`scripts/src/verify-templates/files.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const IGNORED = new Set(["node_modules", ".cache"]);

/** 폴더 안의 파일을 상대 경로(슬래시 구분)로 모두 나열한다. node_modules는 뺀다. */
export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (IGNORED.has(entry.name)) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(relative(dir, path).replaceAll("\\", "/"));
    }
  };
  visit(dir);
  return files.sort();
}

/** 두 폴더의 파일 목록과 내용이 같은지 비교해 다른 파일을 돌려준다. */
export function diffDirs(source: string, copy: string): string[] {
  const sourceFiles = listFiles(source);
  const copyFiles = listFiles(copy);
  const all = [...new Set([...sourceFiles, ...copyFiles])].sort();
  return all.filter((file) => {
    if (!sourceFiles.includes(file) || !copyFiles.includes(file)) return true;
    return !readFileSync(join(source, file)).equals(readFileSync(join(copy, file)));
  });
}
```

`scripts/src/verify-templates/verify.ts`:

```ts
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkAgentsMd } from "../agents-md/check.ts";
import { diffDirs, listFiles } from "./files.ts";
import {
  readTemplateManifest,
  requiredCommands,
  type SharedAssetsManifest,
  type TemplateManifest,
} from "./manifest.ts";

export const REQUIRED_HOOKS = ["PostToolUse", "Stop", "PreToolUse", "SessionStart"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** runner가 선언한 명령 이름. 아직 검사 방법이 없는 runner면 undefined. */
function declaredCommands(dir: string, manifest: TemplateManifest): Set<string> | undefined {
  if (manifest.runner !== "pnpm") return undefined;
  const path = join(dir, "package.json");
  if (!existsSync(path)) return new Set();
  const pkg: unknown = JSON.parse(readFileSync(path, "utf8"));
  const scripts = isRecord(pkg) && isRecord(pkg.scripts) ? pkg.scripts : {};
  return new Set(Object.keys(scripts));
}

function commandProblems(dir: string, manifest: TemplateManifest): string[] {
  const declared = declaredCommands(dir, manifest);
  if (declared === undefined) {
    return [
      `runner "${manifest.runner}"의 명령 검사는 아직 없다. 해당 템플릿 사이클에서 구현한다.`,
    ];
  }
  return requiredCommands(manifest)
    .filter((command) => !declared.has(command))
    .map((command) => `명령 "${command}"가 없다(docs/harness/standard.md의 명령 어휘).`);
}

/** 필수 hook 이벤트마다 exec form(command + args) hook이 하나 이상 있어야 한다. */
function hookProblems(dir: string): string[] {
  const path = join(dir, ".claude", "settings.json");
  if (!existsSync(path)) return [".claude/settings.json이 없다."];
  const settings: unknown = JSON.parse(readFileSync(path, "utf8"));
  const hooks = isRecord(settings) && isRecord(settings.hooks) ? settings.hooks : {};
  return REQUIRED_HOOKS.filter((event) => {
    const groups = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
    return !groups.some((group) => {
      const entries =
        isRecord(group) && Array.isArray(group.hooks) ? (group.hooks as unknown[]) : [];
      return entries.some(
        (entry) => isRecord(entry) && entry.type === "command" && Array.isArray(entry.args),
      );
    });
  }).map((event) => `${event} hook이 없거나 exec form(command + args)이 아니다.`);
}

function requiredFileProblems(dir: string, manifest: TemplateManifest): string[] {
  const problems: string[] = [];
  if (!existsSync(join(dir, ".env.example"))) problems.push(".env.example이 없다.");
  const recipes = listFiles(join(dir, "docs", "recipes")).filter((file) => file.endsWith(".md"));
  if (recipes.length === 0) problems.push("docs/recipes/에 레시피(.md)가 하나도 없다.");
  const golden = join(dir, manifest.goldenModule);
  if (!existsSync(golden) || !statSync(golden).isDirectory()) {
    problems.push(`골든 모듈 ${manifest.goldenModule}이 없다.`);
  }
  return problems;
}

function sharedAssetProblems(
  repoRoot: string,
  templateName: string,
  shared: SharedAssetsManifest,
): string[] {
  return shared.assets.flatMap((asset) =>
    asset.targets
      .filter((target) => target.template === templateName)
      .flatMap((target) => {
        const copy = join(repoRoot, "templates", templateName, target.path);
        const changed = diffDirs(join(repoRoot, asset.source), copy);
        return changed.length === 0
          ? []
          : [
              `${target.path}가 원본 ${asset.source}와 다르다(${changed.join(", ")}). pnpm sync를 돌린다.`,
            ];
      }),
  );
}

/** 템플릿 하나를 하네스 표준으로 검사한다. */
export function verifyTemplate(
  repoRoot: string,
  templateName: string,
  shared: SharedAssetsManifest,
): string[] {
  const dir = join(repoRoot, "templates", templateName);
  const manifest = readTemplateManifest(dir);
  if (Array.isArray(manifest)) return manifest;
  return [
    ...checkAgentsMd(dir).map((problem) => `${problem.path}: ${problem.message}`),
    ...commandProblems(dir, manifest),
    ...hookProblems(dir),
    ...requiredFileProblems(dir, manifest),
    ...sharedAssetProblems(repoRoot, templateName, shared),
  ];
}
```

`scripts/src/verify-templates/cli.ts`:

```ts
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readSharedAssets } from "./manifest.ts";
import { verifyTemplate } from "./verify.ts";

/** templates/ 아래 템플릿마다 하네스 표준을 검사한다. 템플릿이 없으면 통과한다. */
const repoRoot = process.cwd();
const templatesDir = join(repoRoot, "templates");
const names = existsSync(templatesDir)
  ? readdirSync(templatesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

const shared = readSharedAssets(repoRoot);
let failed = 0;
for (const name of names) {
  const problems = verifyTemplate(repoRoot, name, shared);
  for (const problem of problems) console.error(`templates/${name}: ${problem}`);
  if (problems.length > 0) failed += 1;
}
if (names.length === 0) console.log("검사할 템플릿이 없다.");
process.exitCode = failed > 0 ? 1 : 0;
```

`scripts/src/sync/sync.ts`:

```ts
import { cpSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import type { SharedAssetsManifest } from "../verify-templates/manifest.ts";

/** 공유 자산 원본을 각 템플릿의 사본 위치로 통째로 복사한다. node_modules는 복사하지 않는다. */
export function syncSharedAssets(repoRoot: string, manifest: SharedAssetsManifest): string[] {
  const copied: string[] = [];
  for (const asset of manifest.assets) {
    for (const target of asset.targets) {
      const destination = join(repoRoot, "templates", target.template, target.path);
      rmSync(destination, { recursive: true, force: true });
      cpSync(join(repoRoot, asset.source), destination, {
        recursive: true,
        filter: (path) => basename(path) !== "node_modules",
      });
      copied.push(`${asset.source} → templates/${target.template}/${target.path}`);
    }
  }
  return copied;
}
```

`scripts/src/sync/cli.ts`:

```ts
import { readSharedAssets } from "../verify-templates/manifest.ts";
import { syncSharedAssets } from "./sync.ts";

/** 사용법: pnpm sync. scripts/shared-assets.json에 적힌 원본을 템플릿으로 복사한다. */
const copied = syncSharedAssets(process.cwd(), readSharedAssets(process.cwd()));
console.log(copied.length > 0 ? copied.join("\n") : "동기화할 공유 자산이 없다.");
```

`scripts/shared-assets.json`:

```json
{
  "assets": []
}
```

`package.json` (전체 교체):

```json
{
  "name": "ai-template",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "prepare": "lefthook install",
    "check": "tsx scripts/src/check/cli.ts",
    "check:format": "prettier --check .",
    "check:lint": "eslint .",
    "check:agents-md": "tsx scripts/src/agents-md/cli.ts .",
    "check:templates": "tsx scripts/src/verify-templates/cli.ts",
    "fix": "prettier --write . && eslint --fix .",
    "test": "pnpm -r run test",
    "gen": "pnpm -r run gen",
    "tool": "tsx scripts/src/tools/cli.ts",
    "spec-compare": "tsx scripts/src/spec-compare/cli.ts",
    "sync": "tsx scripts/src/sync/cli.ts"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/node": "24.13.6",
    "eslint": "10.11.0",
    "lefthook": "2.1.14",
    "prettier": "3.9.9",
    "tsx": "4.23.15",
    "typescript": "6.0.3",
    "typescript-eslint": "8.70.1",
    "vitest": "5.0.1",
    "yaml": "2.9.1"
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/scripts test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  35 passed`가 있다.

- [ ] **Step 5: 동기화할 자산이 없다고 알리는지 확인한다**

Run: `pnpm run -s sync`
Expected: 성공한다(종료 코드 0). 출력에 `동기화할 공유 자산이 없다.`가 있다.

- [ ] **Step 6: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 8단계`가 있다.

- [ ] **Step 7: 커밋한다**

```bash
git add -A
git commit -m "feat(scripts): verify templates against the harness standard"
```


### Task 16: 하네스 표준과 규약 문서

템플릿 사이클이 따를 하네스 표준(`docs/harness/standard.md`), JSON:API 규약 상세(`docs/conventions/jsonapi.md`), 에러 코드 목록(`docs/conventions/error-codes.md`)을 쓴다. 에러 코드 목록이 계약의 enum과 어긋나면 실패하는 테스트를 둔다.

**Files:**
- Create: `contract/typespec/test/error-codes-doc.test.ts`
- Create: `docs/conventions/error-codes.md`
- Create: `docs/conventions/jsonapi.md`
- Create: `docs/harness/standard.md`

**Interfaces:**
- Consumes: Task 3의 `ErrorCode`, Task 4·5의 규칙 이름, Task 15의 `template.json` 형식
- Produces: 문서 세 개. 템플릿 사이클의 규범이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`contract/typespec/test/error-codes-doc.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { schema } from "./spec.ts";

const docPath = fileURLToPath(new URL("../../../docs/conventions/error-codes.md", import.meta.url));

/** 표의 첫 칸에 백틱으로 적힌 코드를 순서대로 모은다. */
function documentedCodes(): string[] {
  return readFileSync(docPath, "utf8")
    .split(/\r?\n/)
    .map((line) => /^\|\s*`([^`]+)`\s*\|/.exec(line)?.[1])
    .filter((code): code is string => code !== undefined);
}

describe("docs/conventions/error-codes.md", () => {
  it("계약의 ErrorCode와 같은 코드를 같은 순서로 적는다", () => {
    expect(documentedCodes()).toEqual(schema("ErrorCode").enum);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @ai-template/contract test`
Expected: 실패한다(종료 코드가 0이 아님). 출력에 `error-codes.md`가 있다.

- [ ] **Step 3: 문서를 쓴다**

`docs/conventions/error-codes.md`:

```markdown
# 에러 코드

API 에러 객체의 `code` 값 목록이다. 원본은 `contract/typespec/src/errors.tsp`의 `ErrorCode`이고, 이 표와 어긋나면 계약 테스트가 실패한다.

- 형식은 `<영역>.<snake_case 사유>`다.
- 클라이언트는 `code`와 `meta.params`만 믿고 문구를 번역한다. `title`과 `detail`은 개발자용 영어다.
- 새 코드는 TypeSpec의 `ErrorCode`와 이 표에 함께 추가하고, 프론트 템플릿의 번역 카탈로그에도 넣는다.

| 코드                              | HTTP | 의미                                              |
| --------------------------------- | ---- | ------------------------------------------------- |
| `jsonapi.unsupported_media_type`  | 415  | 요청 Content-Type이 JSON:API 미디어 타입이 아니다 |
| `jsonapi.not_acceptable`          | 406  | Accept가 JSON:API 미디어 타입을 허용하지 않는다   |
| `jsonapi.invalid_document`        | 400  | 요청 본문이 JSON:API 문서 형식이 아니다           |
| `jsonapi.invalid_query`           | 400  | 모르는 쿼리 파라미터나 필터다                     |
| `jsonapi.unsupported_include`     | 400  | 허용하지 않은 include 경로다                      |
| `jsonapi.unsupported_sort`        | 400  | 허용하지 않은 정렬 필드다                         |
| `validation.required`             | 422  | 필수 값이 없다                                    |
| `validation.too_short`            | 422  | 값이 너무 짧다(`meta.params.min`)                 |
| `validation.too_long`             | 422  | 값이 너무 길다(`meta.params.max`)                 |
| `validation.invalid_format`       | 422  | 형식이 틀렸다(이메일, UUID 등)                    |
| `validation.out_of_range`         | 422  | 허용 범위를 벗어났다                              |
| `validation.invalid_choice`       | 422  | 허용된 값이 아니다                                |
| `validation.already_taken`        | 422  | 이미 쓰는 값이다(예: 가입 이메일)                 |
| `auth.unauthenticated`            | 401  | 로그인이 필요하다                                 |
| `auth.invalid_credentials`        | 401  | 이메일이나 비밀번호가 틀렸다                      |
| `auth.token_expired`              | 401  | access token이 만료됐다                           |
| `auth.token_invalid`              | 401  | 토큰이 올바르지 않다                              |
| `auth.refresh_token_reused`       | 401  | 이미 쓴 refresh token이다. 세션 계열을 폐기했다   |
| `auth.oauth_code_invalid`         | 401  | 소셜 로그인 1회용 코드가 틀렸거나 만료됐다        |
| `auth.email_not_verified`         | 403  | 이메일 인증을 마치지 않았다                       |
| `auth.account_deactivated`        | 403  | 비활성화된 계정이다                               |
| `auth.verification_token_invalid` | 422  | 인증·재설정 토큰이 틀렸거나 만료됐다              |
| `permission.denied`               | 403  | 권한이 없다                                       |
| `role.system_role_protected`      | 422  | 시스템 역할은 지울 수 없다                        |
| `resource.not_found`              | 404  | 리소스가 없다                                     |
| `resource.conflict`               | 409  | 요청이 현재 상태와 충돌한다(예: 본문 id 불일치)   |
| `post.invalid_transition`         | 422  | 허용되지 않는 글 상태 전이다                      |
| `file.too_large`                  | 422  | 파일이 너무 크다(`meta.params.max`)               |
| `file.type_not_allowed`           | 422  | 허용하지 않는 MIME 타입이다                       |
| `file.upload_incomplete`          | 422  | 스토리지에 업로드된 객체가 없다                   |
| `rate_limit.exceeded`             | 429  | 요청 한도를 넘었다. `Retry-After`를 따른다        |
| `internal.unexpected`             | 500  | 예상하지 못한 서버 오류다                         |
| `service.unavailable`             | 503  | 의존 서비스(DB 등)를 쓸 수 없다                   |
```

`docs/conventions/jsonapi.md`:

```markdown
# JSON:API 규약

플랫폼 API는 [JSON:API 1.1](https://jsonapi.org/format/)을 따른다. 이 문서는 스펙이 정하지 않은 부분을 우리가 어떻게 정했는지 적는다. 원본은 `contract/typespec/`이고, 규칙 대부분은 `contract/api-style/` 룰셋이 기계적으로 검사한다.

## 적용 범위

- `/api/v1` 아래의 모든 요청·응답 본문은 JSON:API 문서다. 미디어 타입은 `application/vnd.api+json` 하나만 쓴다.
- 예외는 두 가지다.
  - OAuth 리다이렉트(`/api/v1/oauth/{provider}/authorize`, `/callback`): 본문 없이 302로 응답한다.
  - 헬스체크(`/health/live`, `/health/ready`): API 밖에 있고 `application/json`으로 응답한다.
- 확장(Atomic Operations 등)과 프로필은 쓰지 않는다.

## 문서와 리소스

- `type`은 복수형 kebab-case이고 URL 첫 세그먼트와 같다(`/api/v1/audit-logs` ↔ `audit-logs`). `/api/v1/me`만 `users`를 돌려주는 별칭이다.
- `id`는 UUIDv7 문자열이다. 권한(`permissions`)만 권한 코드를 id로 쓴다.
- 속성과 관계 이름은 camelCase다.
- 관계 전용 엔드포인트(`/relationships/...`)는 두지 않는다. 관계는 리소스를 `PATCH`해서 바꾸고, 관계의 `self` 링크도 내보내지 않는다.
- 생성은 201과 문서, 삭제는 204로 응답한다. 비동기로 처리하는 생성(인증 메일 재발송, 비밀번호 재설정 요청)은 계정이 있는지 드러내지 않도록 항상 202다.
- CRUD가 아닌 동작도 리소스로 표현한다. 예: 로그인은 `POST /sessions`, 글 발행은 `PATCH /posts/{id}`로 `status: "published"`.

## 스키마 이름

두 백엔드는 아래 이름을 그대로 재현한다. `<Name>`은 `type`의 단수 PascalCase다(`audit-logs` → `AuditLog`).

| 스키마                 | 이름                                                                |
| ---------------------- | ------------------------------------------------------------------- |
| 속성, 관계             | `<Name>Attributes`, `<Name>Relationships`                           |
| 리소스 객체            | `<Name>Resource`                                                    |
| 단건·컬렉션 문서       | `<Name>Document`, `<Name>CollectionDocument`                        |
| 생성·수정 요청 문서    | `<Name>CreateDocument`, `<Name>UpdateDocument`                      |
| 생성·수정 요청 속성    | `<Name>CreateAttributes`, `<Name>UpdateAttributes`                  |
| 실시간 이벤트 페이로드 | `<Resource><Event>EventDocument` (예: `PostPublishedEventDocument`) |

- 그 밖의 보조 스키마(`PostStatus`, `SessionGrant` 등)도 리소스 이름으로 시작한다.
- 리소스에 속하지 않는 공용 스키마는 다음뿐이다: `ErrorCode`, `ErrorDocument`, `ErrorObject`, `ErrorSource`, `PageMeta`, `PaginationLinks`, `CollectionMeta`, `Locale`, `OAuthProvider`, `HealthReport`. 늘리려면 룰셋(`redocly.yaml`의 `shared`)과 이 목록을 함께 고친다.
- 백엔드 스펙에는 계약의 스키마 이름이 모두 있어야 한다. 백엔드 생성기가 중첩 모델에 붙이는 보조 이름(예: `PostCreateData`)은 더 있어도 된다. 프론트 코드는 계약에 있는 이름만 참조한다.

## 쿼리 파라미터

| 파라미터                     | 규칙                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `include`                    | 허용 경로를 operation의 `x-jsonapi-include`에 적는다. 그 밖의 경로는 400 `jsonapi.unsupported_include`     |
| `fields[type]`               | 모든 리소스에서 지원한다. 요청하면 그 밖의 필드를 넣지 않는다                                              |
| `sort`                       | 허용 필드를 `x-jsonapi-sort`에 적는다. `-` 접두사는 내림차순. 그 밖은 400 `jsonapi.unsupported_sort`       |
| `page[number]`, `page[size]` | 기본 1과 20, 최대 100. `meta.page{number,size,total,totalPages}`와 `links.first/prev/next/last`를 돌려준다 |
| `filter[...]`                | 리소스마다 명시한 필터만 받는다. 검색은 `filter[q]`. 모르는 필터는 400 `jsonapi.invalid_query`             |

- `totalPages`는 `ceil(total / size)`다. 결과가 없으면 0이다.
- 계약의 스키마는 필드를 모두 담은 기본 표현이다. `fields[type]`을 요청한 응답은 그 표현에서 요청한 필드만 남긴 투영이다. 적합성 테스트는 이 경우 `assertSparseFieldset`으로 검사한다.
- 포함 리소스는 문서 안의 어떤 관계에서든 참조되어야 한다(full linkage). 같은 리소스를 두 번 담지 않는다.

## 에러

- 에러 응답은 `{ "errors": [...], "meta": { "traceId": "..." } }`이다.
- 에러 객체는 `status`(문자열), `code`, `title`, `detail`, `source.pointer` 또는 `source.parameter`, `meta.params`를 담는다.
- 필드 검증 오류는 필드마다 에러 객체 하나를 만들어 422로 응답한다.
- 코드 목록은 [error-codes.md](error-codes.md)에 있다.

## 인증과 권한 표기

- 로그인이 필요한 operation은 `security: [{ BearerAuth: [] }]`, 로그인이 선택이면 `[{ BearerAuth: [] }, {}]`다.
- 권한이 필요한 operation은 `x-permission`에 권한 코드를 적는다. 소유권 규칙(작성자만 수정 등)은 description에 적는다.

## 실시간

- OpenAPI 루트의 `x-realtime-channels`가 구독 가능한 채널과 필요한 권한을, `x-realtime-events`가 이벤트 이름·받는 곳·페이로드 스키마를 적는다.
- 페이로드도 JSON:API 문서이고 `components.schemas`에 있다. 그래서 프론트엔드는 같은 생성 과정으로 이벤트 타입을 얻는다.

## 계약을 바꾸는 방법

1. `contract/typespec/src/`의 TypeSpec을 고친다. 새 리소스는 `resources/posts.tsp`의 구조를 따른다.
2. `pnpm gen`으로 `contract/openapi.yaml`과 적합성 테스트 타입을 다시 만든다. 생성물은 직접 고치지 않는다.
3. `pnpm check`로 룰셋, 계약 테스트, 생성물 최신 여부를 확인한다.
4. 에러 코드를 더했다면 [error-codes.md](error-codes.md)에도 적는다.

## 룰셋 규칙

| 규칙                            | 검사                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| `jsonapi/media-type`            | `/api/v1` 본문은 `application/vnd.api+json`만 쓴다                      |
| `jsonapi/error-response`        | 4xx 응답이 하나 이상 있고, 4xx·5xx는 `ErrorDocument`를 참조한다         |
| `jsonapi/request-document`      | POST 본문은 `*CreateDocument`, PATCH 본문은 `*UpdateDocument`다         |
| `jsonapi/type-matches-path`     | 요청·응답 리소스의 `type`이 경로 첫 세그먼트와 같다(`me` → `users`)     |
| `jsonapi/collection-parameters` | 컬렉션 GET은 페이지·정렬·필드 선택 파라미터와 `x-jsonapi-sort`를 가진다 |
| `jsonapi/include-extension`     | `include` 파라미터와 `x-jsonapi-include`를 함께 선언한다                |
| `jsonapi/schema-naming`         | 스키마 이름이 위의 이름 규칙을 따른다                                   |
| `jsonapi/camel-case-properties` | 스키마 속성 이름은 camelCase다                                          |

백엔드 템플릿은 이 룰셋의 사본으로 자기가 내보낸 `openapi.json`을 검사한다(`node lint.js <파일>`).
```

`docs/harness/standard.md`:

````markdown
# 하네스 표준

모든 템플릿이 지켜야 하는 AI 바이브코딩 하네스다. 원칙은 **문서는 짧게, 규칙은 기계가 강제**다. `pnpm check:templates`(`scripts/src/verify-templates`)가 이 문서의 [검사 목록](#verify-templates가-검사하는-것)을 템플릿마다 확인한다.

## 지침 파일

- `AGENTS.md`가 규칙의 단일 원본이다. 루트 AGENTS.md는 200줄 이하로, 명령·구조 지도·핵심 규칙·완료 기준·문서 링크만 담는다.
- 폴더별 규칙은 그 폴더의 `AGENTS.md`에 둔다. Claude Code는 그 폴더의 파일을 읽을 때 불러온다.
- 모든 `AGENTS.md` 옆에 `@AGENTS.md` 한 줄짜리 `CLAUDE.md`를 둔다. 루트 CLAUDE.md만 import 뒤에 Claude 전용의 짧은 내용을 더할 수 있다.
  - 근거: Claude Code(v2.1.277+)는 경로에 CLAUDE.md가 없을 때만 AGENTS.md를 직접 읽고, 일부 세션은 아예 읽지 못한다. import는 모든 세션에서 동작하고 두 번 읽지 않는다. Windows에서는 심볼릭 링크 대신 import를 쓴다.
- `.claude/rules/`는 쓰지 않는다(규칙 원본이 둘이 되므로).
- 긴 설명과 절차는 `docs/`(아키텍처, 레시피, 규약)에 두고 AGENTS.md에서 링크한다.
- 프레임워크가 에이전트 문서에 자동으로 써 넣는 내용(예: Next.js 16.3의 관리 블록)은 우리 규칙과 섞이지 않게 처리한다.

## template.json

템플릿 루트에 둔다. verify-templates는 이 값으로 템플릿 종류에 맞는 검사를 고른다.

```json
{
  "name": "web",
  "kind": "frontend",
  "runner": "pnpm",
  "goldenModule": "src/features/posts"
}
```

| 필드           | 값                                                                            |
| -------------- | ----------------------------------------------------------------------------- |
| `name`         | `templates/` 아래 폴더 이름                                                   |
| `kind`         | `backend` 또는 `frontend`                                                     |
| `runner`       | `pnpm`(package.json scripts) 또는 `uv`(FastAPI 사이클에서 검사 방법을 정한다) |
| `goldenModule` | 골든 모듈 `posts`의 경로                                                      |

## 명령 어휘

| 명령         | 의미                                                                         | 대상   |
| ------------ | ---------------------------------------------------------------------------- | ------ |
| `setup`      | 의존성 설치, 인프라 기동, 마이그레이션, 시드. 여러 번 실행해도 안전하다      | 모두   |
| `dev`        | 개발 서버. 백엔드는 api·worker·scheduler, 프론트는 단독 모드에서 목 서버도   | 모두   |
| `check`      | 포맷, 린트, 타입, 테스트(E2E 제외), 생성물 최신 여부, 계약 린트, 하네스 검사 | 모두   |
| `fix`        | 포맷과 자동 수정 가능한 린트                                                 | 모두   |
| `test`       | 테스트(E2E 제외)                                                             | 모두   |
| `test:e2e`   | E2E                                                                          | 모두   |
| `gen`        | 코드 생성(OpenAPI 내보내기, 클라이언트·타입, ORM 클라이언트)                 | 모두   |
| `db:migrate` | 마이그레이션 적용                                                            | 백엔드 |
| `db:reset`   | 로컬 DB를 마이그레이션과 시드 상태로 되돌린다                                | 백엔드 |

- 완료 기준은 `check` 통과 하나다.
- `check`의 빠른 경로(포맷, 린트, 타입, 변경 관련 테스트, 생성물 최신 여부)는 Stop hook이 쓰고, 전체 `check`는 pre-push와 CI가 돌린다.
- 인프라가 필요한 테스트 전에 인프라가 떠 있는지 확인하고, 꺼져 있으면 "`setup`을 실행하라"며 바로 실패한다.
- 출력: 성공은 한 줄, 실패는 `파일:줄 규칙 — 고치는 방법`. 커스텀 규칙의 메시지는 "대신 이렇게 하라"로 쓴다.

## 기계적 강제

| 대상      | 장치                                                                                       |
| --------- | ------------------------------------------------------------------------------------------ |
| 타입      | TS strict(`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` 포함), Python 엄격 모드 |
| 억제 주석 | `any`, `type: ignore`, `eslint-disable`, `noqa`는 사유가 없으면 실패                       |
| 아키텍처  | 모듈 경계(다른 모듈 내부 import 금지)와 계층 방향(라우터 → 서비스 → 저장소)                |
| API       | 백엔드가 내보낸 `openapi.json`을 JSON:API 룰셋 사본으로 검사                               |
| 생성물    | "직접 수정 금지" 헤더, 최신 여부 검사, Claude Code 권한으로 Edit·Write 차단                |
| 다국어    | 프론트 카탈로그의 로케일 간 키 일치, 백엔드 메일 템플릿의 로케일 누락                      |
| 설정      | `.env.example`과 설정 검증 스키마의 일치                                                   |
| 지침 파일 | AGENTS.md·CLAUDE.md 짝, CLAUDE.md 내용, 루트 AGENTS.md 200줄 이하                          |
| 파일 크기 | 소스 400줄, 테스트 600줄 초과 시 실패(생성물 제외)                                         |
| 비밀      | 커밋 전 Betterleaks 스캔                                                                   |

## Claude Code hooks

모든 hook은 쉘을 거치지 않는 exec form이다. Windows(Git Bash 또는 PowerShell), macOS, Linux에서 똑같이 동작한다.

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/stop-check.mjs"]
          }
        ]
      }
    ]
  }
}
```

| 이벤트                              | 동작                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `PostToolUse` (`Edit`, `Write`)     | 고친 파일만 포맷하고 빠른 린트를 돌려 남은 오류를 Claude에게 전달한다                      |
| `Stop`                              | `stop_hook_active`면 통과. 작업 트리에 변경이 있으면 빠른 `check`를 돌리고 실패하면 막는다 |
| `PreToolUse` (`Bash`, `PowerShell`) | 원격 DB 대상 명령, 강제 푸시, 적용된 마이그레이션 수정·삭제 같은 위험한 명령을 막는다      |
| `SessionStart`                      | 인프라 기동 여부, 적용 안 된 마이그레이션, 생성물 최신 여부를 요약해 넣는다                |

- Claude Code는 진전 없이 연속 8번 막힌 Stop hook을 무시한다. 무한 반복은 `stop_hook_active`로 먼저 끊는다.
- hook 스크립트도 입력 JSON 픽스처로 테스트한다. 출력 형식은 구현할 때 공식 레퍼런스(https://code.claude.com/docs/en/hooks)로 확인한다.

## 권한 (`.claude/settings.json`)

- 허용: 명령 어휘와 읽기 전용 git 명령.
- 차단: 비밀이 든 환경 파일 읽기, 생성물 경로의 Edit·Write, 위험한 명령.
- `.env.example`은 AI가 읽어야 하므로 `.env*` 같은 넓은 차단 패턴을 쓰지 않는다.

## 골든 모듈, 생성기, 레시피, skill

- 골든 모듈 `posts`는 모든 계층, 테스트, 권한, 실시간, 다국어의 정답 예시다.
- 생성기(`gen:module <name>` 등)는 골든 모듈을 복사해 이름을 바꾸고 등록 작업(라우터·모듈 등록, 권한 문자열, i18n 키, 마이그레이션 초안, 테스트)까지 처리한다.
- 절차의 원본은 `docs/recipes/*.md`다. Claude Code skill(`.claude/skills/<이름>/SKILL.md`)은 레시피를 불러오고 생성기를 호출하는 얇은 포장이다.
- 공식 제공 skill이 있으면 넣는다(FastAPI 공식 에이전트 skill, Next.js `next-dev-loop`, Playwright CLI skill).

## 외부 도구 연결

- 프론트엔드의 `.mcp.json`에 버전을 고정한 `next-devtools-mcp`를 넣는다. 백엔드는 기본으로 MCP를 넣지 않는다.
- 화면 확인은 Playwright의 에이전트용 CLI와 skill로 한다.
- 설치된 버전의 문서를 보게 한다. Next.js는 `node_modules/next/dist/docs`, 그 밖의 라이브러리는 템플릿의 `docs/stack.md`에 버전과 문서 링크를 적는다.

## 최종 안전망

- lefthook: pre-commit에서 스테이징된 파일을 포맷·린트하고 Betterleaks로 비밀을 스캔한다. pre-push에서 `check`를 돌린다.
- CI: `check`, `test:e2e`, Docker 이미지 빌드.

## 공유 자산

- 템플릿은 저장소의 다른 폴더를 참조하지 않는다. 공유 자산은 사본으로 들어간다.
- 원본과 사본 위치는 `scripts/shared-assets.json`에 적는다. `pnpm sync`가 원본을 사본 위치로 통째로 복사한다.
- 사본을 직접 고치지 않는다. 원본을 고치고 `pnpm sync`를 돌린다.

## verify-templates가 검사하는 것

1. `template.json`이 있고 형식이 맞다.
2. 지침 파일 짝, CLAUDE.md 내용, 루트 AGENTS.md 길이.
3. 템플릿 종류에 맞는 명령 어휘가 모두 있다.
4. `.claude/settings.json`에 `PostToolUse`, `Stop`, `PreToolUse`, `SessionStart` hook이 exec form으로 있다.
5. `.env.example`, `docs/recipes/*.md`, 골든 모듈 폴더가 있다.
6. 공유 자산 사본이 원본과 같다.
````

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @ai-template/contract test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  43 passed`가 있다.

- [ ] **Step 5: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 8단계`가 있다.

- [ ] **Step 6: 커밋한다**

```bash
git add -A
git commit -m "docs: add harness standard and JSON:API conventions"
```


### Task 17: CI와 마무리 점검

GitHub Actions CI(설치, check, git 이력 비밀 스캔)를 더하고 AGENTS.md를 최종 구조에 맞게 고친다. 스펙 §9.2 완료 조건을 모두 확인한다.

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `AGENTS.md` (파일 전체를 이 태스크의 내용으로 바꾼다)

**Interfaces:**
- Consumes: 앞선 모든 태스크
- Produces: `.github/workflows/ci.yml`, 최종 `AGENTS.md`

- [ ] **Step 1: CI 워크플로와 최종 AGENTS.md를 쓴다**

CI의 `fetch-depth: 0`은 Betterleaks가 git 이력 전체를 검사하기 위해서다. 도구 캐시 키는 manifest 파일 해시다.

`.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Cache pinned tools
        uses: actions/cache@v6
        with:
          path: node_modules/.cache/ai-template-tools
          key: tools-${{ runner.os }}-${{ hashFiles('scripts/src/tools/manifest.ts') }}
      - run: pnpm check
      - name: Scan git history for secrets
        run: pnpm run -s tool betterleaks git . --no-banner --redact
```

`AGENTS.md` (전체 교체):

```markdown
# ai-template

AI 바이브코딩에 최적화한 프로젝트 템플릿(FastAPI, NestJS, Next.js, Next.js admin)을 만드는 저장소다.
설계는 `docs/superpowers/specs/2026-09-26-ai-template-foundation-design.md`를 따른다.

## 구조

| 경로                    | 내용                                                           |
| ----------------------- | -------------------------------------------------------------- |
| `contract/typespec/`    | 플랫폼 API 계약 원본(TypeSpec)                                 |
| `contract/openapi.yaml` | 계약 컴파일 결과. 생성물이라 직접 고치지 않는다                |
| `contract/api-style/`   | JSON:API 룰셋(Redocly). 백엔드 템플릿이 사본으로 쓴다          |
| `contract/conformance/` | 두 백엔드와 목에 똑같이 돌리는 적합성 테스트 틀                |
| `templates/`            | 템플릿. 각 폴더는 그대로 복사하면 동작하는 독립 프로젝트다     |
| `scripts/`              | check 실행기, 도구 설치기, 구조 비교, 지침·템플릿 검사, 동기화 |
| `docs/`                 | 하네스 표준, API 규약, 스펙과 계획                             |

## 명령

| 명령                               | 하는 일                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `pnpm check`                       | 완료 기준. 성공하면 한 줄, 실패하면 실패한 단계의 출력만 보여 준다 |
| `pnpm fix`                         | 포맷과 자동 수정 가능한 린트                                       |
| `pnpm gen`                         | 계약을 컴파일하고 적합성 테스트 타입을 다시 만든다                 |
| `pnpm sync`                        | 공유 자산 원본을 템플릿 사본 위치로 복사한다                       |
| `pnpm tool <oasdiff\|betterleaks>` | 버전을 고정한 바이너리를 받아 실행한다                             |
| `pnpm spec-compare <계약> <구현>`  | 백엔드 스펙이 계약과 이름·경로가 같고 계약을 깨지 않는지 본다      |

## 규칙

- 작업을 끝내기 전에 `pnpm check`를 통과시킨다.
- 계약은 `contract/typespec/src/`만 고치고 `pnpm gen`으로 생성물을 만든다. `contract/openapi.yaml`과 `**/generated/**`는 직접 고치지 않는다.
- API 규약은 `docs/conventions/jsonapi.md`, 에러 코드는 `docs/conventions/error-codes.md`를 따른다.
- 템플릿은 저장소의 다른 폴더를 참조하지 않는다. 공유 자산은 원본을 고친 뒤 `pnpm sync`한다.
- 템플릿은 `docs/harness/standard.md`를 지킨다. `pnpm check`가 `templates/`를 검사한다.
- 검사를 더하려면 루트 package.json에 `check:<이름>` 스크립트를 추가한다. 워크스페이스 패키지는 자기 `check` 스크립트만 두면 자동으로 포함된다.
- 커밋 전 hook이 포맷·린트·비밀 스캔을 돌린다. 테스트용 가짜 비밀은 줄 끝에 `betterleaks:allow` 주석을 단다.
```

- [ ] **Step 2: 루트 check를 돌린다**

Run: `pnpm check`
Expected: 성공한다(종료 코드 0). 출력에 `check 통과: 8단계`가 있다.

- [ ] **Step 3: 생성물이 원본과 같은지 확인한다**

`pnpm gen` 뒤에 `contract/` 아래 변경이 없어야 한다.

Run: `pnpm gen`
Expected: 성공한다(종료 코드 0).

이어서 `git status --porcelain -- contract`를 돌리면 아무것도 출력하지 않는다.

- [ ] **Step 4: 전체 테스트를 돌린다**

계약 43, 스크립트 35, 룰셋 18, 적합성 25로 모두 121개다.

Run: `pnpm test`
Expected: 성공한다(종료 코드 0). 출력에 `Tests  43 passed`가 있다.

- [ ] **Step 5: git 이력 전체의 비밀 스캔을 돌린다**

Run: `pnpm run -s tool betterleaks git . --no-banner --redact`
Expected: 성공한다(종료 코드 0). 출력에 `no leaks found`가 있다.

- [ ] **Step 6: 커밋한다**

```bash
git add -A
git commit -m "ci: add GitHub Actions workflow and finalize AGENTS.md"
```


---

## 완료 조건 확인 (스펙 §9.2)

| 완료 조건                                                             | 확인 방법                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 루트 `pnpm check`와 CI가 통과한다                                     | Task 17의 `pnpm check`(8단계). CI는 원격 저장소에 올린 뒤 첫 실행에서 확인한다                          |
| `contract/openapi.yaml`이 TypeSpec 결과와 같고 룰셋 위반이 0건이다     | contract의 `check:fresh`, api-style의 `lint:contract`(둘 다 `pnpm check`에 포함), Task 17의 `pnpm gen` 뒤 변경 없음 |
| 룰셋·구조 비교·verify-templates가 잡아야 할 위반을 실제로 잡는다       | Task 4·5의 규칙별 픽스처 테스트, Task 13의 compatible/broken 픽스처, Task 15의 위반별 테스트             |
| 계약이 §4 기능, §5.6 엔드포인트, §5.4 에러 코드, §4.7 이벤트를 모두 담는다 | Task 3·6·7·8·9의 계약 테스트(43개)와 Task 16의 에러 코드 문서 동기화 테스트                           |

## 스펙 대비 조정 사항

계획을 쓰며 실제 도구로 검증하다가 정한 것들이다. 스펙에도 반영했다.

- **스키마 이름 비교는 포함 관계다.** 계약의 스키마 이름은 백엔드 스펙에 모두 있어야 하고, 백엔드 생성기가 붙이는 보조 이름은 더 있어도 된다. operation 집합은 정확히 같아야 한다(경로 파라미터 이름은 무시).
- **명명 규칙에 `<Name>CreateAttributes`·`<Name>UpdateAttributes`, 이벤트 페이로드 `<Resource><Event>EventDocument`, 공용 스키마 10개 목록을 더했다.**
- **에러 응답은 TypeSpec `alias`다.** 이름 있는 모델이면 아직 쓰이지 않을 때 스키마로 새어 나와 이름 규칙을 깬다.
- **비밀 스캐너는 Betterleaks 1.8.1이다.** `.betterleaks.toml`은 lockfile과 계약 파일만 제외하고, 테스트의 가짜 비밀은 줄 끝 `betterleaks:allow` 주석으로 허용한다.
- **룰셋은 순수 JS(`// @ts-check`)이고, 결과는 `lint.js`가 찍는다.** Redocly CLI 대신 코어 API를 써서 텔레메트리를 피하고 출력 형식을 하네스 원칙에 맞췄다. Python 전용 FastAPI 템플릿에서 이 Node 도구를 돌리는 방법은 FastAPI 사이클에서 정한다.
- **외부 바이너리(oasdiff, Betterleaks)는 npm 배포판이 없어서 `pnpm tool`이 GitHub 릴리스에서 버전과 SHA-256을 고정해 받는다.** Windows에서는 zip도 푸는 내장 bsdtar를 쓴다.
- **lefthook hook 설치는 postinstall이 아니라 루트 `prepare`가 한다.** postinstall은 첫 설치에서 돌지 않는 경우가 있었다.
