# create CLI 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** create CLI 설계(하위 프로젝트 3)를 구현한다. 저장소에서 `pnpm new`를 실행하면 저장소 밖에 단독 fastapi·nextjs 프로젝트나 FastAPI+web 조합 모노레포가 생긴다. web `gen`의 백엔드 스펙 입력, FastAPI의 `e2e:serve`, 저장소의 actionlint·검사 규칙, 조합 루트의 실행기·하네스·CI와 문서까지 8개 태스크로 마친다.

그리고 다음을 통과시킨다.

- 저장소 루트 `pnpm check`: Task 1~2는 9단계, Task 3의 `workflows`(actionlint)로 10단계, Task 4의 `@ai-template/create` 패키지로 11단계
- `pnpm --filter @ai-template/create check`: 타입 검사와 Vitest 52개, Node 테스트 23개(Task 7 기준)
- web을 고친 태스크: 템플릿 `pnpm check` 9단계 → `pnpm build` → `pnpm test:e2e`(목 20개)를 차례로
- FastAPI를 고친 태스크: 인프라 없는 검사(uv·Ruff·basedpyright·architecture·harness와 DB 없는 pytest)
- 생성 smoke(Task 4~7): OS 임시 폴더의 `aitpl-` 폴더에 단독·조합을 만든다. Docker 없이 생성 web의 검사, 인프라 없는 FastAPI 검사, hook 디스패처와 이미지 입력을 확인한다
- GitHub Actions: 기존 작업과 새 `create-combo`, `create-standalone`. `create-combo`는 조합의 `pnpm setup` → `pnpm check` → 실제 api 위의 `pnpm test:e2e` → 두 이미지 빌드 → 조합 web 컨테이너의 `GET /` 200이다. `create-standalone`은 단독 fastapi·nextjs의 setup → check다

**Architecture:**

- 템플릿 입력(Task 1~2): web `gen`이 선택 설정 `gen.config.json`으로 백엔드 OpenAPI에서 web 타입을 만든다. FastAPI는 compose 프로젝트 이름을 고정한다. 새 명령 `e2e:serve`는 `test:e2e`와 같은 서버 준비 위에서 받은 명령을 실행한다.
- 저장소 하네스(Task 3): 루트 `.gitattributes`·`.editorconfig`를 두 템플릿에 동기화하고 템플릿마다 CI 워크플로를 둔다. 고정 actionlint의 `check:workflows`와 verify-templates의 새 규칙이 이 파일을 검사한다.
- 생성 CLI(Task 4~6): 새 workspace 패키지 `create/`다. 단독은 템플릿의 git 추적 파일을 형제 임시 폴더에 복사해 이름을 바꾸고 옮긴 뒤 첫 커밋을 만든다. 조합은 `apps/api`·`apps/web` 배치와 `create/assets/combo/`의 루트 파일·실행기를 더한다. 루트 잠금 파일은 web 잠금 파일에서 만들고, 두 앱 설정을 합친 Claude·lefthook·Betterleaks 설정과 hook 디스패처를 둔다.
- CI와 문서(Task 7~8): 조합 CI 워크플로와 조합용 web 이미지의 원본, 저장소 CI의 `create-combo`·`create-standalone`을 더한다. 마지막으로 기반·create 설계와 지침에 구현 결정과 검증 범위를 반영한다.

**Tech Stack:** 버전은 정확히 고정한다. 다음은 `fa988ad`의 package.json·pyproject.toml·잠금 파일·워크플로·Dockerfile의 값이다. 새 npm 패키지 종류는 조합 루트의 turbo 하나, 새 바이너리는 actionlint 하나다.

- 실행: Node 24 LTS(검증 환경 v24.19.0), pnpm 12.6.0(`packageManager`), TypeScript 6.0.3 strict, tsx 4.23.15.
- 저장소 도구: Vitest 5.0.1, ESLint 10.11.0, typescript-eslint 8.70.1, @eslint/js 10.0.1, Prettier 3.9.9, lefthook 2.1.14, @types/node 24.13.6, yaml 2.9.1, smol-toml 1.9.0.
- create 패키지 `@ai-template/create`: 의존성은 저장소에 이미 있는 yaml 2.9.1과 smol-toml 1.9.0(Task 6), Node 내장 모듈뿐이다. 테스트는 루트의 Vitest와 `node --test`다.
- 고정 바이너리: actionlint 1.7.12(`v1.7.12`, 2026-03-30 공개). Windows x64, Linux x64·arm64, macOS x64·arm64의 sha256은 릴리스의 `actionlint_1.7.12_checksums.txt` 값이다. Betterleaks 1.8.1과 oasdiff 1.32.1은 바꾸지 않는다.
- 조합 루트: turbo 2.11.6, lefthook 2.1.14·prettier 3.9.9(web과 같다), `packageManager: pnpm@12.6.0`, `engines.node: ">=24 <25"`(web과 같다), workspace의 `overrides.typescript: 6.0.3`. turbo 최신 2.11.7은 선정 시각(2026-10-03 06:28 UTC)에 공개 후 24시간이 지나지 않았다.
- web 템플릿(버전을 바꾸지 않는다): Next.js 16.3.8, React 19.3.0, openapi-typescript 7.13.0, yaml 2.9.1, @playwright/test 1.63.0, typescript-eslint 8.71.0. 계약·목 사본의 TypeSpec 1.16.0과 Hono 4.13.11도 그대로다.
- FastAPI 템플릿(버전을 바꾸지 않는다): Python 3.14(이미지 3.14.7), uv 0.12.19, fastapi 0.141.1, pydantic 2.13.5, pydantic-settings 2.15.0, httpx 0.28.1, redis 8.1.0, poethepoet 0.48.0, ruff 0.16.9, basedpyright 1.40.1, pytest 9.1.1, import-linter 2.15.
- 이미지: 조합 web은 `node:24.19.0-bookworm-slim`에 pnpm 12.6.0을 설치해 빌드하고 UID/GID 10001로 `node apps/web/server.js`를 실행한다(PORT 3000). api 이미지는 FastAPI 템플릿의 Dockerfile(`ghcr.io/astral-sh/uv:0.12.19`, `python:3.14.7-slim-trixie`)이다.
- CI: SHA 고정 actions/checkout v7.0.1(`3d3c42e5aac5ba805825da76410c181273ba90b1`), pnpm/action-setup v6.1.0(`ea17c68df8912ef543352723c149a84f56e3d413`), actions/setup-node v7.0.0(`820762786026740c76f36085b0efc47a31fe5020`), astral-sh/setup-uv v10.2.0(`c18668ad3cf93ea998bef934396af7bb5c839dc7`). ubuntu-latest, Node 24, pnpm 12.6.0, uv 0.12.19다.

**Spec:** `docs/superpowers/specs/2026-10-03-create-cli-design.md`(이하 설계)의 §1~§8. 상위 문서는 `docs/superpowers/specs/2026-09-26-ai-template-foundation-design.md`(§3.3·§6.2·§6.8·§6.9·§7.1·§7.5·§10)와 하네스 표준 `docs/harness/standard.md`다. 템플릿 동작은 FastAPI·보강·web 설계를 따른다. 승인된 설계가 들어간 main `76acb4f`에서 시작한다. 구현하며 정한 결정은 Task 8이 설계 본문에 반영한다. 그 전에는 아래 "이 계획에서 정한 것"과 각 태스크 설명을 따른다.

## Global Constraints

설계와 W4 계획의 공통 규칙을 적용한다. 모든 태스크의 요구 사항은 이 목록을 포함한다.

**Docker와 데이터 보호**

- 로컬에서는 Docker를 쓰지 않는다. Docker Desktop을 시작하지 않으며 `docker`·`docker compose` 명령을 실행하지 않는다.
- 이 PC의 compose 프로젝트 `fastapi`(사용자 개발 데이터 볼륨 `fastapi_postgres-data`·`fastapi_seaweedfs-data`)와 `joon`은 건드리지 않는다. 그 컨테이너·볼륨·네트워크·이미지를 쓰거나 내리거나 지우지 않는다.
- 다음은 Docker나 개발 스택이 필요하므로 로컬에서 실행하지 않는다.
  - `pnpm conformance fastapi`, `pnpm web-e2e fastapi`
  - `templates/fastapi`와 생성한 FastAPI(단독 루트, 조합의 `apps/api`)의 `uv run poe setup|dev|check|test|test:e2e|e2e:serve|db:migrate|db:reset|db:revision`
  - 조합 루트의 `pnpm setup`·`pnpm check`·`pnpm test:e2e`·`pnpm dev`·`pnpm db:migrate`·`pnpm db:reset`
- 폴더 이름 `fastapi`는 작업 폴더가 달라도 기본 compose 프로젝트 이름이 된다. 위 명령은 다른 작업 트리에서도 개발 데이터를 가리킬 수 있다.
- Docker가 필요한 확인(FastAPI setup·DB 기반 테스트, 실제 `e2e:serve`, 조합 `test:e2e`, 이미지 빌드와 컨테이너 시작)은 GitHub Actions에서 한다. 구현자는 순수 부분을 단위 테스트로 확인하고 PR CI 결과로 마무리한다.
- FastAPI의 로컬 검증은 다음뿐이다: `uv sync --frozen`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run basedpyright`, `uv run python -m tools.checks architecture`, `uv run python -m tools.checks harness`, DB·Valkey가 필요 없는 pytest 파일. Windows에서 Python 도구의 한국어 출력이 깨지면 `PYTHONUTF8=1`을 준다.

**생성 프로젝트**

- 수동으로 만드는 프로젝트는 OS 임시 폴더(`node -p "require('node:os').tmpdir()"`) 아래 `aitpl-`로 시작하는 이름에만 둔다. 저장소와 작업 트리 안에는 만들지 않는다. CI도 `$RUNNER_TEMP/aitpl-*`을 쓴다.
- 생성 프로젝트에서는 각 smoke 단계가 적은 명령만 실행한다. 단독 web의 `pnpm check`와 조합의 `pnpm --filter web run check`는 목 프로세스만 쓰므로 허용한다(설계 §8.2).
- 테스트는 자기가 만든 임시 폴더를 지운다. 기존 테스트의 생성 위치와 정리 방식은 바꾸지 않는다.
- 수동 smoke 폴더는 끝나면 지운다. 셸이 재귀 삭제를 거부하면 남기고 경로를 보고한다. Windows에서 `node_modules`가 든 폴더는 `Remove-Item -LiteralPath "\\?\<경로>" -Recurse -Force`로 지운다.
- CLI는 템플릿 폴더의 커밋하지 않은 추적 변경을 거절한다. 템플릿을 고치는 태스크의 생성 smoke는 커밋 뒤에 돌린다(Task 5·7). 계획은 두 태스크의 smoke를 커밋 단계 뒤에 둔다.

**git 환경**

- `create/`의 코드·테스트와 조합의 `scripts/`·`.claude/hooks/`가 부르는 git은 상속된 저장소 지정 변수를 지운 환경에서 실행한다. 지우는 변수는 `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_NAMESPACE`, `GIT_PREFIX`다.
- create는 `scripts/src/files/git-environment.ts`의 `gitEnvironment()`를 쓴다. W4에서 pre-push hook 안의 테스트가 상속된 `GIT_DIR`로 실제 저장소를 다시 초기화한 일이 있었다.
- 테스트 픽스처는 임시 `GIT_CONFIG_GLOBAL`의 명시적 신원과 `-c commit.gpgsign=false`로 커밋한다. CLI는 사용자의 git 설정과 서명을 그대로 따르고, git이 환경에서 추측한 신원으로 커밋하지 않는다.

**버전**

- 버전은 2026-10-03에 확인했다. 의존성은 정확히 고정한다(`^`, `~`, 범위 금지). Node 24, pnpm 12.6.0, TypeScript 6.0.3과 기존 도구 버전을 유지한다.
- pnpm 12.6.0의 `minimumReleaseAge` 1440분(24시간)을 지킨다. 새 pin은 `pnpm view <패키지>@<버전> time`으로 공개 후 하루가 지났는지 확인한다. 잠금 파일은 pnpm 명령으로만 바꾼다.
- 고정 바이너리는 릴리스의 checksum 파일에 있는 sha256으로 검사한다.

**독립성**

- 템플릿 폴더는 각각 독립 프로젝트다. `templates/<이름>/` 안의 코드와 문서는 그 밖의 파일·폴더를 참조하지 않는다. 조합 프로젝트는 경로 없이 개념으로 설명한다.
- `create/`는 생성기다. `templates/*`와 복사할 저장소 루트 파일(`.gitattributes`, `.editorconfig`)을 읽고 `scripts/src/files/git-environment.ts`를 쓴다.
- 템플릿 안의 공유 사본은 루트 `pnpm sync`로만 만든다(`scripts/shared-assets.json`). 사본과 생성물(`contract/openapi.yaml`, `**/generated/**`, `src/lib/api/schema.d.ts`)을 직접 고치지 않는다.

**언어와 커밋**

- 문서·주석·AGENTS.md·CLI 메시지·검사 출력은 한국어로 짧고 쉽게 쓴다. 실패 메시지는 `<무엇이 문제인지> — <고치는 방법>`이고 CLI 오류는 `pnpm new: `로 시작한다.
- 커밋은 영문 Conventional Commits다. 트레일러(`Co-Authored-By` 포함)·AI 태그·생성 표시를 쓰지 않는다. `--no-verify`를 쓰지 않으며 hook이 실패하면 원인을 고친다.
- 태스크마다 정확히 한 커밋을 만든다. 생성물도 커밋하고 끝난 뒤 `git status --short`가 비어야 한다. 텍스트 파일만 추가한다. 테스트용 가짜 비밀은 줄 끝에 `betterleaks:allow` 사유 주석을 단다.

**그 밖**

- `.env` 파일을 읽거나 출력하지 않는다. 키와 공개 기본값은 `.env.example`에서 확인한다.
- 루트 `pnpm check`가 통과해야 한다. web의 check·build·E2E는 빌드 산출물을 함께 쓰므로 차례로 실행한다. 캐시 없는 검사는 `templates/nextjs/.cache/check.json`만 지운 뒤 실행한다. 직접 띄운 서버를 남기지 않는다.

## 이 계획에서 정한 것

설계가 구현에 맡긴 결정과 검증 방법을 적는다. 각 태스크 설명에도 필요한 것을 적었다.

1. 태스크 순서와 경계
   - 템플릿 입력(Task 1~2)을 먼저 둔다. Task 3의 verify-templates는 백엔드에 `e2e:serve`를 요구하고, Task 5의 조합은 web `gen`의 백엔드 스펙 입력을 쓴다.
   - Task 3이 두 템플릿에 CI와 줄바꿈 설정을 넣은 뒤 Task 4의 CLI가 그 파일까지 복사한다. 조합 CI와 이미지(Task 7)는 조합 생성(Task 5)과 하네스(Task 6) 뒤다. 설계·지침의 최종 정리는 Task 8이다.
2. 설계 본문과의 관계
   - 시작점 `76acb4f`의 설계는 승인본이다. 다음 결정은 구현에서 정했고 Task 8이 설계 §2·§3·§5·§6·§7·§8에 반영한다.
   - 조합 `gen`의 캐시 끔, `overrides.typescript`, turbo 2.11.6, 설정된 git 신원 확인, 동적 설정 포맷, PostToolUse·PreToolUse의 편집 matcher, Betterleaks의 루트 저장소 인자, 조합 web 이미지의 설치·빌드 방식, `create-combo`의 컨테이너 확인과 `aitpl-` CI 경로다.
   - 표기도 구현에 맞춘다: 두 앱 `check`의 순서 없는 차례 실행과 `db:*` 전달(§5.4), web dev의 Next.js 기본 바인딩(§6), `create-standalone`의 Chromium Linux 의존성 단계(§7.3).
   - 리뷰는 각 태스크를 이 계획과 `76acb4f`의 설계로 본다. 위 결정이 승인본과 다른 곳은 이 계획을 따른다.
3. Docker 없는 검증(모든 태스크)
   - 로컬에서는 단위·통합 테스트와 생성 smoke만 한다. 생성 web의 check는 목 프로세스만 쓴다(설계 §8.2).
   - Docker가 필요한 완료 조건(설계 §1.2·§8.2)은 PR CI의 `create-combo`·`create-standalone`이 확인한다.
4. web의 백엔드 스펙 입력(Task 1)
   - 선택 설정 하나로 web 타입의 입력만 바꾼다. 계약 사본과 목 타입은 TypeSpec에 남아 프론트 대역이 된다.
   - FastAPI의 `openapi.json`으로 만든 타입으로도 web check가 통과했다(설계 §8.3 #1). FastAPI는 고치지 않는다.
5. `e2e:serve`(Task 2)
   - 서버 준비·로그·정리는 `test:e2e`와 한 함수로 공유한다. 명령에는 백엔드가 아는 `E2E_*` 값만 넘기고 web 변수로 바꾸는 일은 조합의 실행기가 맡는다.
6. 단독 생성(Task 4)
   - 추적 파일만 바이트 그대로 복사한다. 이름은 README 첫 줄, web package 이름, FastAPI compose 이름과 앱 이미지만 바꾼다. YAML은 값의 범위만 바꿔 주석·앵커를 보존한다.
   - 형제 임시 폴더 `aitpl-<이름>-XXXXXX`에서 만든 뒤 옮긴다. 어느 단계든 실패하면 아무것도 남기지 않는다.
7. 조합 생성(Task 5)
   - pnpm 12 잠금 파일의 두 YAML 문서 가운데 의존성 문서의 importer만 옮긴다. workspace를 옮기면 목의 openapi-typescript가 TypeScript peer로 5.9.3을 고른다. `overrides.typescript: 6.0.3`으로 막고, web importer·resolution·snapshot이 바뀌면 생성이 실패한다.
   - `gen`은 api 내보내기와 web의 TypeSpec·목 생성물 전체의 복원 범위를 검증하지 않아 캐시하지 않는다. `check`·`test`는 캐시한다.
   - web의 Turbopack·standalone 추적 루트는 가장 가까운 `pnpm-workspace.yaml` 폴더다. 단독은 web 폴더, 조합은 조합 루트다.
8. 하네스(Task 6)
   - 앱 설정이 hook의 단일 원본이다. 루트 디스패처가 앱 설정을 매번 읽어 그 앱 폴더에서 실행하고 결과를 이벤트별 규칙으로 합친다.
   - 비밀 스캔은 web의 고정 Betterleaks를 web 작업 폴더에서 실행한다. 그래서 루트 저장소 `git ../..`와 설정 `--config ../../.betterleaks.toml`을 함께 준다. 설정만 주면 저장소 범위가 web으로 좁아져 루트 파일을 읽지 않는다.
9. 조합 web 이미지와 CI(Task 7)
   - pnpm 12.6.0은 root manifest가 있으면 filtered 설치에도 루트 도구를 설치한다. `pnpm run`은 나머지 workspace를 자동 설치한다. 그래서 이미지는 root manifest 없이 잠금 파일·workspace·앱 manifest로 `--filter web...`을 설치하고, 설치된 Next CLI를 node로 직접 실행한다.
   - 저장소 CI는 실제 생성 결과를 돈다. `create-combo`는 마지막에 조합 web 컨테이너를 loopback 3200에 띄워 60초 안에 `GET /`의 200을 확인하고 trap으로 지운다. 생성 프로젝트의 워크플로는 빌드까지만 한다.
   - 실제 api 위의 E2E에서는 저장 직후의 reload·다음 동작이 Server Action 응답보다 앞설 수 있다. 목에서는 드러나지 않던 타이밍 경쟁이라, web의 두 저장 시나리오가 그 POST 응답을 기다린 뒤 진행한다.

## 확인한 사실

검증 브랜치 `feature/create-proto`(`76acb4f..fa988ad`)의 태스크 커밋으로 확인했다. RED·GREEN은 같은 집중 명령을 부모 커밋과 해당 커밋에서 실행한 실제 출력이다. 태스크 보고서의 커밋은 모두 아래 단계 수의 루트 `pnpm check`를 통과했다. 그 뒤 기록을 정리하며 바뀐 것은 문서뿐이고 테스트 출력은 같다.

| Task | 커밋 | 루트 check | 집중 GREEN과 추가 확인 |
| --- | --- | --- | --- |
| 1 | `8cd1d1e` | 9단계 | web 3 files / 32 tests. FastAPI `openapi.json` 입력의 web check 9단계, 템플릿 check·build·목 E2E 20개 |
| 2 | `325aa83` | 9단계 | FastAPI `52 passed`. 인프라 없는 검사와 `test_stack_doc.py`를 더한 `55 passed` |
| 3 | `78b86eb` | 10단계 | scripts 3 files / 29 tests. `pnpm sync`, actionlint 1.7.12, 워크플로 3개. 템플릿 check·build·목 E2E 20개 |
| 4 | `0a84799` | 11단계 | create 3 files / 42 tests. 단독 web·api 생성 smoke |
| 5 | `12eb64b` | 11단계 | web 4 files / 15 tests, create 3 files / 34 tests, Node 5개. 조합 생성 smoke, 템플릿 check·build·목 E2E 20개 |
| 6 | `88a378e` | 11단계 | create 2 files / 10 tests, Node 23개. 네 hook 디스패처와 루트 pre-commit smoke |
| 7 | `cbfa2f0` | 11단계 | create 1 file / 7 tests. 워크플로 4개, 조합 생성과 이미지 입력 smoke. web E2E의 저장 응답 대기는 실행 `37109514454`가 확인했다 |
| 8 | `fa988ad` | 11단계 | 새 테스트 없음. create Vitest 52개·Node 23개, 템플릿 check·build·목 E2E 20개, FastAPI 인프라 없는 검사 |

- CI 실행 `37109514454`(`435ac1c`. `fa988ad`와는 설계 문서만 다르다)의 8개 작업이 모두 성공했다. `create-combo`는 setup, 조합 check 4단계, api E2E 12개, 실제 api 위의 web E2E 20개, 두 이미지 빌드, 조합 web 컨테이너의 `GET /` 200을 통과했다. 프로토타입은 Docker가 필요한 완료 조건(설계 §1.2)까지 끝에서 끝으로 확인됐다.
- 앞선 실행에서 드러난 두 문제는 해당 태스크가 고친다. `37106952072`의 `check` 실패는 Linux에서만 드러난 픽스처 실행 권한이며, Task 4의 `create/test/helpers.ts`가 POSIX에서 작업 파일도 0755로 만든다. `37108142380`의 web E2E 실패 1개는 저장 직후 reload의 경쟁이며, Task 7의 응답 대기가 막는다.
- 문서만 바뀐 `fa988ad`의 재실행 `37110677630`에서도 8개 작업이 모두 성공했다.
- 로컬에서 하지 않은 것: DB·Valkey·스토리지 기반 테스트, 실제 `e2e:serve`, Docker 이미지 빌드와 컨테이너 시작. 모두 위 CI가 확인했다.
- Turborepo의 Linux uv 실행은 `create-combo`의 조합 check가 확인했다. Windows의 uv 실행과 `check`·`test` 캐시 hit(설계 §8.3 #5)는 아직 확인하지 않았다.

---

### Task 1: web: 백엔드 OpenAPI 입력

설계 §5.5·§7.1·§8.3 #1. web `gen`이 선택 설정 `gen.config.json`으로 백엔드 OpenAPI 파일을 읽어 web 타입을 만든다. 조합에서 api 코드 → `openapi.json` → web 타입이 `check`로 이어지게 하는 입력이다.

- 설정은 web 루트의 `gen.config.json`이고 키는 `openapi` 하나다. 값은 web 루트 기준 상대 경로의 JSON 또는 YAML OpenAPI 파일이다. 파일이 없으면 지금처럼 TypeSpec 출력이 모든 입력이다.
- 설정이 있으면 web API 선언(`src/lib/api/schema.d.ts`)·실시간 이벤트·에러 코드만 그 스펙에서 만든다. `contract/openapi.yaml`과 목 타입은 계속 TypeSpec에서 만든다. `gen`·`gen --check`·check의 `generated` 단계가 같은 선택 함수 `readWebOpenapi`를 쓴다.
- 잘못된 JSON, 객체가 아닌 값, 키 누락·추가, 문자열이 아니거나 빈 값, 절대 경로를 한국어 안내로 거절한다. 스펙 파일이 없으면 백엔드에서 `gen`을 먼저 실행하라고 안내한다.
- check의 `generated` 캐시 키에 `gen.config.json`과 선택한 스펙 내용을 넣는다. 외부 스펙만 바뀌어도 이전 성공을 재사용하지 않는다.
- 확인 결과 FastAPI의 커밋된 `openapi.json`으로 만든 타입에서 web check 9단계가 통과했다. FastAPI 스키마와 제품 코드는 고치지 않는다. TypeSpec 출력만 비교하던 생성기 테스트 하나를 선택한 입력을 읽게 고친다. 커밋하는 web 생성물은 TypeSpec 출력 그대로다.
- AGENTS.md의 `gen` 행과 `docs/architecture.md`의 계약 절을 고친다. 조합은 생성기가 이 설정에 백엔드 OpenAPI를 연결한다는 개념으로만 설명하고 템플릿 밖 경로를 쓰지 않는다(독립성).

실패 확인: 부모의 `scripts/generate.ts`에는 `readWebOpenapi`·`generateFiles`가 없다. 새 입력 테스트와 `gen.test.ts`의 재현 테스트가 `is not a function`으로 실패한다. 부모의 `assembleSteps`는 여섯째 인자인 백엔드 스펙을 캐시 키에 넣지 않아 캐시 무효화 테스트 두 개도 실패한다. `gen.config.json`은 기존 `config.` 선택 규칙에 이미 포함되므로 해당 단언은 회귀 방지용이다. 3개 파일에서 `22 failed | 10 passed`이고 GREEN은 `32 passed`다.

**Files:**
- Modify: `templates/nextjs/AGENTS.md`, `templates/nextjs/docs/architecture.md`, `templates/nextjs/scripts/check/cli.ts`, `templates/nextjs/scripts/check/steps.ts`, `templates/nextjs/scripts/gen.ts`, `templates/nextjs/scripts/generate.ts`
- Test: `templates/nextjs/scripts/check/steps.test.ts`, `templates/nextjs/scripts/gen-input.test.ts`, `templates/nextjs/scripts/gen.test.ts`

**Interfaces:**
- Consumes: 기존 `scripts/generate.ts`의 `generateWeb(openapi: string): Promise<Record<string, string>>`·`staleFiles`, `scripts/check/steps.ts`의 `assembleSteps`·`fingerprint`, TypeSpec → `contract/openapi.yaml` 컴파일, FastAPI 템플릿의 커밋된 `openapi.json`(확인 입력)
- Produces:
  - `templates/nextjs/scripts/generate.ts`: `readWebOpenapi(root: string, contractOpenapi: string): string`(설정이 없으면 `contractOpenapi`), `generateFiles(root: string, contractOpenapi: string, mockTypes: string): Promise<Record<string, string>>`
  - `scripts/check/steps.ts`: `assembleSteps(files, fast, related, routeTypes = {}, installedSkills = {}, webOpenapi = ""): Step[]`. `generated` 키가 `gen.config.json`과 `webOpenapi`를 포함한다. `scripts/check/cli.ts`는 설정 오류를 `check 실패: generated — <안내>`로 끝낸다
  - 설정 형식 `{ "openapi": "<web 루트 기준 상대 경로>" }`. Task 5가 조합 web에 `{ "openapi": "../api/openapi.json" }`을 쓰고 `pnpm --filter web run gen`을 실행한다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`templates/nextjs/scripts/check/steps.test.ts`를 고친다.

찾을 부분:

```ts
import { expect, it } from "vitest";
import { assembleSteps } from "./steps";
import { runChecks } from "./runner";

it.each([false, true])("hook과 권한 변경은 테스트 캐시를 무효화한다 (fast=%s)", (fast) => {
  const related = fast ? ["src/lib/env.ts"] : [];
```

바꿀 내용:

```ts
import { expect, it } from "vitest";
import { assembleSteps } from "./steps";
import { runChecks } from "./runner";

it.each([false, true])(
  "백엔드 스펙과 입력 설정 변경은 생성물 캐시를 무효화한다 (fast=%s)",
  (fast) => {
    const key = (files: Record<string, string>, openapi = "before") =>
      assembleSteps(files, fast, [], {}, {}, openapi).find((step) => step.name === "generated")!
        .key;
    expect(key({}, "before")).not.toBe(key({}, "after"));
    expect(key({ "gen.config.json": "before" })).not.toBe(key({ "gen.config.json": "after" }));
    expect(key({ "gen.config.json": "before" })).not.toBe(key({}));
  },
);

it.each([false, true])("hook과 권한 변경은 테스트 캐시를 무효화한다 (fast=%s)", (fast) => {
  const related = fast ? ["src/lib/env.ts"] : [];
```

`templates/nextjs/scripts/gen-input.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { stringify } from "yaml";
import { generateFiles, readWebOpenapi, staleFiles } from "./generate";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-gen-input-"));
});
afterEach(() => {
  // 프로젝트가 아닌 이 테스트의 설정·스펙 픽스처만 정리한다.
  if (dirname(root) === tmpdir() && basename(root).startsWith("aitpl-gen-input-"))
    rmSync(root, { recursive: true, force: true });
});
function configure(value: unknown) {
  writeFileSync(join(root, "gen.config.json"), JSON.stringify(value));
}
function fixture(name: string) {
  return {
    openapi: "3.1.0",
    info: { title: name, version: "1.0.0" },
    paths: {},
    components: {
      schemas: {
        ErrorCode: { type: "string", enum: [`${name}.failed`] },
        [`${name}Payload`]: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    "x-realtime-events": [{ name: `${name}.changed`, payload: `${name}Payload` }],
  };
}
const contract = stringify(fixture("contract"));
const mock = "// TypeSpec 목 타입\n";

describe("web 생성 입력", () => {
  it("설정이 없으면 TypeSpec 입력으로 web과 목을 만든다", async () => {
    const files = await generateFiles(root, contract, mock);
    expect(files["contract/openapi.yaml"]).toBe(contract);
    expect(files["contract/mock/src/generated/api.ts"]).toBe(mock);
    expect(files["src/lib/api/schema.d.ts"]).toContain("contractPayload:");
    expect(files["src/lib/generated/realtime.ts"]).toContain('"contract.changed"');
    expect(files["src/lib/generated/error-codes.ts"]).toContain('"contract.failed"');
    expect(existsSync(join(root, "gen.config.json"))).toBe(false);
  });

  it.each(["json", "yaml"])("%s 입력은 web에만 쓰고 최신 여부에도 반영한다", async (format) => {
    const name = `backend.${format}`;
    configure({ openapi: name });
    writeFileSync(
      join(root, name),
      format === "json" ? JSON.stringify(fixture("backend")) : stringify(fixture("backend")),
    );
    const files = await generateFiles(root, contract, mock);
    expect(files["contract/openapi.yaml"]).toBe(contract);
    expect(files["contract/mock/src/generated/api.ts"]).toBe(mock);
    expect(files["src/lib/api/schema.d.ts"]).toContain("backendPayload:");
    expect(files["src/lib/api/schema.d.ts"]).not.toContain("contractPayload:");
    expect(files["src/lib/generated/realtime.ts"]).toContain('"backend.changed"');
    expect(files["src/lib/generated/error-codes.ts"]).toContain('"backend.failed"');
    expect(staleFiles(await generateFiles(root, contract, mock), files)).toEqual([]);
    writeFileSync(join(root, name), stringify(fixture("changed")));
    expect(staleFiles(await generateFiles(root, contract, mock), files)).toEqual([
      "src/lib/api/schema.d.ts",
      "src/lib/generated/error-codes.ts",
      "src/lib/generated/realtime.ts",
    ]);
    expect(readFileSync(join(root, "gen.config.json"), "utf8")).toBe(
      JSON.stringify({ openapi: name }),
    );
  });

  it("web 루트 기준의 상위 상대 경로를 읽는다", () => {
    configure({ openapi: `../${basename(root)}/backend.json` });
    writeFileSync(join(root, "backend.json"), "스펙 픽스처");
    expect(readWebOpenapi(root, contract)).toBe("스펙 픽스처");
  });

  it.each(
    [
      null,
      [],
      "backend.json",
      {},
      { openapi: "backend.json", unknown: true },
      { openapi: null },
      { openapi: 42 },
      { openapi: [] },
      { openapi: "" },
      { openapi: "   " },
      { openapi: join(tmpdir(), "backend.json") },
      { openapi: "C:\\backend.json" },
      { openapi: "/backend.json" },
    ].map((value) => [value]),
  )("잘못된 설정 %j를 고칠 방법과 함께 거절한다", (value) => {
    configure(value);
    expect(() => readWebOpenapi(root, contract)).toThrow(/gen\.config\.json.*—.*openapi/);
  });

  it("깨진 설정 JSON을 짧은 안내로 거절한다", () => {
    writeFileSync(join(root, "gen.config.json"), "{");
    expect(() => readWebOpenapi(root, contract)).toThrow(/gen\.config\.json.*—.*JSON/);
  });

  it("없는 스펙은 백엔드 gen을 먼저 실행하도록 안내한다", () => {
    configure({ openapi: "missing.json" });
    expect(() => readWebOpenapi(root, contract)).toThrow(/missing\.json.*—.*백엔드.*gen.*먼저/);
  });
});
```

`templates/nextjs/scripts/gen.test.ts`를 고친다.

(1) 찾을 부분:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { generateMetadata, generateWeb, staleFiles } from "./generate";

const spec = {
  components: {
```

바꿀 내용:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateMetadata, generateWeb, readWebOpenapi, staleFiles } from "./generate";

const spec = {
  components: {
```

(2) 찾을 부분:

```ts
};

describe("계약 생성", () => {
  it("실제 계약으로 web 생성물을 모두 재현한다", async () => {
    const files = await generateWeb(readFileSync("contract/openapi.yaml", "utf8"));
    for (const [path, expected] of Object.entries(files)) {
      expect(expected.startsWith("// 직접 수정 금지")).toBe(true);
      expect(readFileSync(path, "utf8")).toBe(expected);
```

바꿀 내용:

```ts
};

describe("계약 생성", () => {
  it("선택한 스펙으로 web 생성물을 모두 재현한다", async () => {
    const files = await generateWeb(
      readWebOpenapi(resolve("."), readFileSync("contract/openapi.yaml", "utf8")),
    );
    for (const [path, expected] of Object.entries(files)) {
      expect(expected.startsWith("// 직접 수정 금지")).toBe(true);
      expect(readFileSync(path, "utf8")).toBe(expected);
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`templates/nextjs`에서): `pnpm test scripts/check/steps.test.ts scripts/gen-input.test.ts scripts/gen.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 백엔드 스펙과 입력 설정 변경은 생성물 캐시를 무효화한다 (fast=false)
× 백엔드 스펙과 입력 설정 변경은 생성물 캐시를 무효화한다 (fast=true)
× 선택한 스펙으로 web 생성물을 모두 재현한다
× 설정이 없으면 TypeSpec 입력으로 web과 목을 만든다
× json 입력은 web에만 쓰고 최신 여부에도 반영한다
× yaml 입력은 web에만 쓰고 최신 여부에도 반영한다
× web 루트 기준의 상위 상대 경로를 읽는다
× 잘못된 설정 null를 고칠 방법과 함께 거절한다
Test Files 3 failed (3)
Tests 22 failed | 10 passed (32)
```

- [ ] **Step 3: web 스크립트를 고친다**

`templates/nextjs/scripts/gen.ts`를 고친다.

(1) 찾을 부분:

```ts
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWeb, staleFiles } from "./generate";
import { pnpm } from "./process.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
```

바꿀 내용:

```ts
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateFiles, staleFiles } from "./generate";
import { pnpm } from "./process.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
```

(2) 찾을 부분:

```ts
  const openapi = readFileSync(join(temporary, "openapi.yaml"), "utf8");
  const mockPath = join(temporary, "mock.ts");
  run(["exec", "openapi-typescript", join(temporary, "openapi.yaml"), "-o", mockPath], root);
  const expected = {
    "contract/openapi.yaml": openapi,
    "contract/mock/src/generated/api.ts": readFileSync(mockPath, "utf8"),
    ...(await generateWeb(openapi)),
  };
  if (check) {
    const actual = Object.fromEntries(
      Object.keys(expected).map((path) => [
```

바꿀 내용:

```ts
  const openapi = readFileSync(join(temporary, "openapi.yaml"), "utf8");
  const mockPath = join(temporary, "mock.ts");
  run(["exec", "openapi-typescript", join(temporary, "openapi.yaml"), "-o", mockPath], root);
  const expected = await generateFiles(root, openapi, readFileSync(mockPath, "utf8"));
  if (check) {
    const actual = Object.fromEntries(
      Object.keys(expected).map((path) => [
```

`templates/nextjs/scripts/generate.ts` 전체를 다음으로 바꾼다.

```ts
import openapiTS, { astToString } from "openapi-typescript";
import { parse } from "yaml";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, win32 } from "node:path";

const header = "// 직접 수정 금지 — pnpm gen으로 생성한다.\n";

interface Contract {
  components: { schemas: Record<string, unknown> & { ErrorCode: { enum: string[] } } };
  "x-realtime-events": { name: string; payload: string }[];
}

export function generateMetadata(spec: Contract): Record<string, string> {
  const events = spec["x-realtime-events"];
  for (const event of events) {
    if (!Object.hasOwn(spec.components.schemas, event.payload))
      throw new Error(`실시간 payload ${event.payload}를 계약 schemas에 정의한다.`);
  }
  return {
    "src/lib/generated/error-codes.ts":
      header +
      `export const errorCodes = ${JSON.stringify(spec.components.schemas.ErrorCode.enum, null, 2)} as const;\nexport type ErrorCode = (typeof errorCodes)[number];\n`,
    "src/lib/generated/realtime.ts":
      header +
      'import type { components } from "../api/schema";\n\n' +
      `export const realtimeEventNames = ${JSON.stringify(
        events.map((event) => event.name),
        null,
        2,
      )} as const;\n` +
      "export interface RealtimeEventPayloads {\n" +
      events
        .map(
          (event) =>
            `  ${JSON.stringify(event.name)}: components["schemas"][${JSON.stringify(event.payload)}];`,
        )
        .join("\n") +
      "\n}\nexport type RealtimeEventName = keyof RealtimeEventPayloads;\n",
  };
}

export async function generateWeb(openapi: string): Promise<Record<string, string>> {
  return {
    "src/lib/api/schema.d.ts": header + astToString(await openapiTS(openapi)),
    ...generateMetadata(parse(openapi) as Contract),
  };
}

export function readWebOpenapi(root: string, contractOpenapi: string): string {
  const configPath = join(root, "gen.config.json");
  if (!existsSync(configPath)) return contractOpenapi;
  let config: unknown;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    throw new Error("gen.config.json을 읽을 수 없다 — 올바른 JSON 파일로 저장한다.");
  }
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    Object.keys(config).length !== 1 ||
    !("openapi" in config) ||
    typeof config.openapi !== "string" ||
    !config.openapi.trim() ||
    isAbsolute(config.openapi) ||
    win32.isAbsolute(config.openapi)
  )
    throw new Error(
      "gen.config.json 설정이 잘못됐다 — openapi 하나에 web 루트 기준 상대 경로 문자열을 넣는다.",
    );
  const specPath = join(root, config.openapi);
  if (!existsSync(specPath))
    throw new Error(`${config.openapi} 스펙 파일이 없다 — 백엔드에서 gen을 먼저 실행한다.`);
  return readFileSync(specPath, "utf8");
}

export async function generateFiles(
  root: string,
  contractOpenapi: string,
  mockTypes: string,
): Promise<Record<string, string>> {
  return {
    "contract/openapi.yaml": contractOpenapi,
    "contract/mock/src/generated/api.ts": mockTypes,
    ...(await generateWeb(readWebOpenapi(root, contractOpenapi))),
  };
}

export function staleFiles(
  expected: Record<string, string>,
  actual: Record<string, string>,
): string[] {
  return Object.keys(expected).filter((path) => expected[path] !== actual[path]);
}
```

- [ ] **Step 4: web check 실행기를 고친다**

`templates/nextjs/scripts/check/cli.ts` 전체를 다음으로 바꾼다.

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { envSchema } from "../../src/lib/env";
import { binary, pnpm } from "../process.mjs";
import { readProjectFiles, readRouteTypes } from "./files";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";
import { errorCodes } from "../../src/lib/generated/error-codes";
import { checkI18n } from "./i18n";
import { checkHarness } from "./harness";
import {
  checkOfficialSkills,
  installedSkillState,
  officialSkills,
  readOfficialSkillCopies,
} from "./skills";
import { runChecks, parseCheckArgs } from "./runner";
import { assembleSteps } from "./steps";
import { readWebOpenapi } from "../generate";

const root = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(root);
const { fast, related } = parseCheckArgs(process.argv.slice(2));
// 공식 폴더는 manifest 밖의 본문을 읽지 않는 전용 열거기로만 연다.
const readFiles = () => ({
  ...readProjectFiles(
    root,
    officialSkills.map((source) => ".claude/skills/" + source.name),
  ),
  ...readOfficialSkillCopies(root),
});
const files = readFiles();
let webOpenapi: string;
try {
  webOpenapi = readWebOpenapi(root, files["contract/openapi.yaml"] ?? "");
} catch (error) {
  console.error(
    `check 실패: generated — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
const cachePath = ".cache/check.json";
let previous: Record<string, string> = {};
try {
  previous = JSON.parse(readFileSync(cachePath, "utf8"));
} catch {
  /* 캐시는 없어도 된다. */
}
const installedSkills = fast ? {} : installedSkillState(root);
const steps = assembleSteps(
  files,
  fast,
  related,
  readRouteTypes(root),
  installedSkills,
  webOpenapi,
);
const result = await runChecks(steps, previous, async (step) => {
  if (step.name === "i18n") {
    const problems = checkI18n({ ko, en }, errorCodes);
    return { ok: !problems.length, output: problems.join("\n") };
  }
  if (step.name === "harness") {
    const problems = [
      ...checkHarness(files, Object.keys(envSchema.shape)),
      ...checkOfficialSkills(root, files),
    ];
    return { ok: !problems.length, output: problems.join("\n") };
  }
  const [command, ...args] = step.args;
  const run = step.name.startsWith("contract-")
    ? pnpm(step.args, { cwd: root, maxBuffer: 16 * 1024 * 1024 })
    : binary(command!, args, { cwd: root });
  return {
    ok: run.status === 0,
    output: `${run.stdout ?? ""}${run.stderr ?? ""}${run.error?.message ?? ""}`,
  };
});
if (!existsSync(".cache")) mkdirSync(".cache");
// typegen이 갱신한 next-env와 route 타입을 성공 캐시에 반영한다.
if (result.cache.types) {
  result.cache.types = assembleSteps(
    readFiles(),
    fast,
    related,
    readRouteTypes(root),
    installedSkills,
    webOpenapi,
  ).find((step) => step.name === "types")!.key;
}
writeFileSync(cachePath, JSON.stringify(result.cache));
console.log(result.output);
process.exitCode = result.ok ? 0 : 1;
```

`templates/nextjs/scripts/check/steps.ts`를 고친다.

(1) 찾을 부분:

```ts
  related: string[],
  routeTypes: Record<string, string> = {},
  installedSkills: Record<string, string> = {},
): Step[] {
  const select = (pattern: RegExp) =>
    Object.fromEntries(
```

바꿀 내용:

```ts
  related: string[],
  routeTypes: Record<string, string> = {},
  installedSkills: Record<string, string> = {},
  webOpenapi = "",
): Step[] {
  const select = (pattern: RegExp) =>
    Object.fromEntries(
```

(2) 찾을 부분:

```ts
    {
      name: "generated",
      args: ["tsx", "scripts/gen.ts", "--check"],
      key: key(/^(src|contract)\//),
    },
  ];
  if (!fast) {
```

바꿀 내용:

```ts
    {
      name: "generated",
      args: ["tsx", "scripts/gen.ts", "--check"],
      key: key(/^(src|contract)\/|^gen\.config\.json$/) + fingerprint({ webOpenapi }),
    },
  ];
  if (!fast) {
```

- [ ] **Step 5: web 문서를 고친다**

`templates/nextjs/AGENTS.md`를 고친다.

찾을 부분:

```markdown
| `pnpm fix`                       | 포맷·자동 수정 가능한 린트                                                            |
| `pnpm test`                      | Vitest 단위·통합 테스트                                                               |
| `pnpm test:e2e`                  | Playwright 인증·기능 E2E. 기본 목(4110) 또는 준비된 FastAPI와 운영 web(3100)          |
| `pnpm gen`                       | TypeSpec 계약, web API·실시간·에러 타입, 목 타입 생성                                 |
| `pnpm gen:feature <이름>`        | 골든 posts와 화면·번역·테스트를 복사하고 보호 경로를 등록                             |
| `pnpm build`, `pnpm start`       | 운영 빌드, 운영 서버(3000)                                                            |

```

바꿀 내용:

```markdown
| `pnpm fix`                       | 포맷·자동 수정 가능한 린트                                                            |
| `pnpm test`                      | Vitest 단위·통합 테스트                                                               |
| `pnpm test:e2e`                  | Playwright 인증·기능 E2E. 기본 목(4110) 또는 준비된 FastAPI와 운영 web(3100)          |
| `pnpm gen`                       | TypeSpec 계약·목 타입과 web 타입 생성. web은 선택한 `gen.config.json` 스펙을 사용     |
| `pnpm gen:feature <이름>`        | 골든 posts와 화면·번역·테스트를 복사하고 보호 경로를 등록                             |
| `pnpm build`, `pnpm start`       | 운영 빌드, 운영 서버(3000)                                                            |

```

`templates/nextjs/docs/architecture.md`를 고친다.

찾을 부분:

```markdown

`contract/*`는 pnpm workspace다. 목의 `@ai-template/contract`는 TypeSpec 사본으로 연결되고 두 패키지는 루트 `tsconfig.base.json`과 고정된 개발 도구를 사용한다. API 규약도 `docs/conventions/`에 함께 복사해 계약 테스트와 AI가 같은 문서를 읽는다.

`pnpm gen`은 TypeSpec을 컴파일하고 API 선언, 실시간 이벤트 이름·payload 매핑, 에러 코드 목록과 목 타입을 다시 만든다. `pnpm check`는 임시 디렉터리의 생성 결과를 비교하고 계약 두 패키지의 자체 검사도 돌린다. 사본은 원본 포맷을 보존하므로 web 포맷·린트에서 제외한다.
web 자체 생성물은 첫 줄에 직접 수정 금지 헤더를 둔다. 계약 생성물은 자체 freshness 검사로 확인한다. [계약 확장](recipes/change-contract.md)의 순서로 이 프로젝트의 TypeSpec과 목 수기 소스를 고치고 `pnpm gen`한다.

`pnpm dev`는 Next 환경 로더로 설정을 준비한다. API 주소가 HTTP loopback(localhost·127.0.0.1·[::1])의 4010 `/api/v1`이면 같은 loopback에 목과 web을 함께 시작하며, 외부 백엔드 주소라면 web만 시작한다. 어느 자식이 종료하거나 Ctrl+C를 받으면 자신이 시작한 프로세스 트리를 함께 내린다. dev·HTTP 통합·E2E는 공통 `scripts/process-tree.mjs`를 쓴다. 목은 `node --import tsx`로 직접 실행하고, POSIX에서는 런처 종료 뒤에도 그룹을 정리한다. Windows는 직접 node가 자식을 소유하며 taskkill로 트리를 끝낸다. 종료 확인을 기다리고 한도를 넘으면 강제 종료한다.
```

바꿀 내용:

```markdown

`contract/*`는 pnpm workspace다. 목의 `@ai-template/contract`는 TypeSpec 사본으로 연결되고 두 패키지는 루트 `tsconfig.base.json`과 고정된 개발 도구를 사용한다. API 규약도 `docs/conventions/`에 함께 복사해 계약 테스트와 AI가 같은 문서를 읽는다.

`pnpm gen`은 TypeSpec을 컴파일하고 API 선언, 실시간 이벤트 이름·payload 매핑, 에러 코드 목록과 목 타입을 다시 만든다. web 루트에 `gen.config.json`이 없으면 모든 타입의 입력은 TypeSpec 계약이다. 조합에서는 생성기가 이 설정에 백엔드의 `gen`이 내보낸 OpenAPI를 연결한다. 조합 루트의 gen이 백엔드 내보내기 뒤 web 생성을 실행한다.

설정은 `openapi` 하나만 받으며 JSON 또는 YAML OpenAPI 파일의 web 루트 기준 상대 경로를 넣는다. 설정이 있으면 web API 선언·실시간 이벤트·에러 코드만 그 스펙에서 만들고, `contract/openapi.yaml`과 목 타입은 TypeSpec에서 계속 만든다. 백엔드 스펙이 없으면 백엔드에서 `gen`을 먼저 실행한다. 목은 프론트 단독 개발과 통합 테스트의 대역이며 백엔드 변경을 자동으로 따라가지 않는다.

`pnpm gen --check`도 같은 입력으로 임시 생성 결과를 비교한다. `pnpm check`의 생성물 캐시는 설정과 외부 스펙 변경을 반영하며 계약 두 패키지의 자체 검사도 돌린다. 사본은 원본 포맷을 보존하므로 web 포맷·린트에서 제외한다.
web 자체 생성물은 첫 줄에 직접 수정 금지 헤더를 둔다. 계약 생성물은 자체 freshness 검사로 확인한다. [계약 확장](recipes/change-contract.md)의 순서로 이 프로젝트의 TypeSpec과 목 수기 소스를 고치고 `pnpm gen`한다.

`pnpm dev`는 Next 환경 로더로 설정을 준비한다. API 주소가 HTTP loopback(localhost·127.0.0.1·[::1])의 4010 `/api/v1`이면 같은 loopback에 목과 web을 함께 시작하며, 외부 백엔드 주소라면 web만 시작한다. 어느 자식이 종료하거나 Ctrl+C를 받으면 자신이 시작한 프로세스 트리를 함께 내린다. dev·HTTP 통합·E2E는 공통 `scripts/process-tree.mjs`를 쓴다. 목은 `node --import tsx`로 직접 실행하고, POSIX에서는 런처 종료 뒤에도 그룹을 정리한다. Windows는 직접 node가 자식을 소유하며 taskkill로 트리를 끝낸다. 종료 확인을 기다리고 한도를 넘으면 강제 종료한다.
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run(`templates/nextjs`에서): `pnpm test scripts/check/steps.test.ts scripts/gen-input.test.ts scripts/gen.test.ts`

Expected: 통과한다.

```text
Test Files 3 passed (3)
Tests 32 passed (32)
```

- [ ] **Step 7: FastAPI OpenAPI 입력으로 web 검사를 확인한다**

설계 §8.3 #1을 로컬에서 다시 확인한다. `templates/nextjs`에서 실행하고, 끝나면 설정을 지워 생성물을 TypeSpec 출력으로 되돌린다.

1. `gen.config.json`에 `{ "openapi": "../fastapi/openapi.json" }` 한 줄을 BOM 없는 UTF-8과 LF로 쓴다. PowerShell의 `Set-Content -Encoding utf8`은 BOM을 붙여 `gen.config.json을 읽을 수 없다`로 실패한다. 쓴 뒤 `pnpm exec prettier --write gen.config.json`을 실행한다.
2. `pnpm gen` → `계약·web·목 타입 생성 완료`. 이어서 `pnpm check` → `check 통과: 9단계`.
3. `gen.config.json`을 지우고 `pnpm gen`, `pnpm gen --check` → `생성물 최신 여부 통과`.
4. `git diff --exit-code -- src/lib/api/schema.d.ts src/lib/generated contract` → 출력 없음. `gen.config.json`은 남지 않는다.

- [ ] **Step 8: 검사를 돌린다**

Run(`templates/nextjs`에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 모든 단계를 다시 돌리려면 `templates/nextjs/.cache/check.json`을 지운다.

Run(`templates/nextjs`에서): `pnpm build`

Expected: `Compiled successfully`.

Run(`templates/nextjs`에서): `pnpm test:e2e`

Expected: `20 passed`(목 대상, 걸린 시간은 다르다).

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄

- [ ] **Step 9: 커밋한다**

```bash
git add \
  templates/nextjs/AGENTS.md \
  templates/nextjs/docs/architecture.md \
  templates/nextjs/scripts/check/cli.ts \
  templates/nextjs/scripts/check/steps.test.ts \
  templates/nextjs/scripts/check/steps.ts \
  templates/nextjs/scripts/gen-input.test.ts \
  templates/nextjs/scripts/gen.test.ts \
  templates/nextjs/scripts/gen.ts \
  templates/nextjs/scripts/generate.ts
git commit -m "feat(web): generate types from backend OpenAPI"
```


### Task 2: FastAPI: compose 이름과 `e2e:serve`

설계 §4.2·§5.7·§7.1. FastAPI `compose.yaml`에 최상위 `name: fastapi`를 두고, 조합 E2E에 쓰는 백엔드 명령 `e2e:serve`를 더한다.

- `name: fastapi`는 지금 폴더 이름으로 정해지는 값과 같다. 템플릿 저장소의 개발 볼륨(`fastapi_*`)과 `pnpm conformance fastapi`의 동작은 그대로다. 생성기가 이 값을 프로젝트 이름으로 바꾼다(Task 4).
- `uv run poe e2e:serve [--web-url <주소>] -- <명령> [인자...]`는 `tools/e2e.py`의 `run_with_server`를 `test:e2e`와 함께 쓴다. preflight, `app_e2e` 마이그레이션과 Valkey DB 14 비우기, 설정 덮어쓰기, api(127.0.0.1:18000)·worker·scheduler 시작, 60초 readiness, 로그와 정리가 한곳에 있다. 시작 도중 실패해도 띄운 프로세스를 내린다.
- E2E 설정은 `isolated_settings(..., "e2e")`에 `RECENT_LOGIN_SECONDS=10`, E2E api의 `API_URL`, web Origin의 `FRONTEND_URL`·`REALTIME_ALLOWED_ORIGINS`, `<web>/oauth/callback`의 `OAUTH_REDIRECT_URIS`를 더한다. `STORAGE_ALLOWED_ORIGINS`는 개발 Origin에 web Origin을 더하고, 버킷 CORS는 readiness 전에 `app.storage_setup.ensure_bucket`으로 적용한다.
- 명령의 환경은 호출자 환경에 `E2E_API_URL`·`E2E_WEB_URL`·`E2E_MAILPIT_URL`·`E2E_OAUTH_URL`·`E2E_RECENT_LOGIN_SECONDS`와 `PYTHONUTF8=1`만 더한다. web 변수로 바꾸는 일은 호출자(조합의 `scripts/web-e2e.mjs`)가 맡는다. 작업 폴더는 poe의 `POE_PWD`, 없으면 현재 폴더다.
- `--web-url`은 기존 `Origins` 검증에 경로·쿼리·조각·계정·공백·빈 포트·0번 포트 거절을 더하고 호스트와 기본 포트를 정규화한다. 잘못된 인자와 빠진 명령은 종료 코드 2, 명령 실행 실패와 readiness 실패는 1(로그 끝부분 출력), Ctrl+C는 130, 그 밖은 명령의 종료 코드다. `--help`는 인프라 확인 전에 끝난다.
- `run_command`는 입출력을 그대로 잇고 0.1초 간격으로 기다린다. Windows의 무기한 `wait()`가 신호 처리를 늦추기 때문이다. 중단 때 명령의 자손을 먼저 내리고 서버 그룹을 정리한다.
- 테스트는 `Settings.model_construct`로 `.env` 없이 설정을 만들고 네트워크·DB·스토리지 경계와 프로세스 실행기만 가짜로 바꾼다. 실제 `e2e:serve`는 로컬에서 실행하지 않으며 PR CI의 `create-combo`가 확인한다.

실패 확인: 부모의 `tools/processes.py`에는 `run_command`가 없다. `test_processes.py`의 import가 수집 단계에서 실패해 pytest가 `1 error`로 중단된다(종료 코드 2). `test_e2e.py`의 입력·설정·환경·수명·종료 코드 assertion까지 가지 않는다. GREEN은 두 파일 `52 passed`다.

**Files:**
- Modify: `templates/fastapi/AGENTS.md`, `templates/fastapi/compose.yaml`, `templates/fastapi/docs/architecture.md`, `templates/fastapi/pyproject.toml`, `templates/fastapi/tools/AGENTS.md`, `templates/fastapi/tools/cli.py`, `templates/fastapi/tools/e2e.py`, `templates/fastapi/tools/processes.py`
- Test: `templates/fastapi/tools/tests/test_e2e.py`, `templates/fastapi/tools/tests/test_processes.py`

**Interfaces:**
- Consumes: 기존 `tools/e2e.py`(`prepare`, `wait_ready`, `run_tests`, `overrides`, `READY_TIMEOUT = 60.0`, `LOG`), `tools.infra`의 `isolated_settings`·`preflight`·`RATE_LIMIT_FIELDS`, `tools.processes.ProcessGroup`(`start()`, `stop()`), `tools.mailpit.MAILPIT_URL`, W4의 `app.storage_setup.ensure_bucket(settings) -> bool`·`Settings.recent_login_seconds`·`Settings.storage_allowed_origins`, `app.core.config.Origins`
- Produces:
  - `templates/fastapi/compose.yaml`의 최상위 `name: fastapi`. 기존 `x-app`의 `image: fastapi-template-app`과 함께 Task 4가 바꾼다
  - poe 작업 `"e2e:serve" = { script = "tools.cli:e2e_serve", ... }`, `tools/cli.py`의 `e2e_serve() -> None`
  - `tools/e2e.py`: `PORT = 18000`, `BASE_URL`, `WEB_URL = "http://localhost:3100"`, `OAUTH_URL = "http://127.0.0.1:28080"`, `RECENT_LOGIN_SECONDS = 10`, `class E2EError(Exception)`, `ServeArgs(web_url: str, command: list[str])`, `web_origin(value: str) -> str`, `parse_serve_args(args: Sequence[str]) -> ServeArgs`, `serve_settings(settings: Settings, web_url: str) -> Settings`, `child_environment(web_url: str, inherited: Mapping[str, str]) -> dict[str, str]`
  - `run_with_server(settings: Settings, action: Callable[[ProcessGroup], int], *, storage: bool = False) -> int`, `main() -> int`(`test:e2e`), `serve_main(args: Sequence[str] | None = None) -> int`
  - `tools/processes.py`: `run_command(args: Sequence[str], *, cwd: Path, env: Mapping[str, str]) -> int`
  - 명령 환경 `E2E_API_URL=http://127.0.0.1:18000`, `E2E_WEB_URL=<web Origin>`, `E2E_MAILPIT_URL=http://127.0.0.1:28025`, `E2E_OAUTH_URL=http://127.0.0.1:28080`, `E2E_RECENT_LOGIN_SECONDS=10`. Task 5의 `web-e2e.mjs`가 읽는다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`templates/fastapi/tools/tests/test_e2e.py`:

```python
"""인프라 없이 e2e:serve의 입력, 격리 설정, 자식 환경과 정리를 검증한다."""

import os
import subprocess
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import TextIO

import pytest
from pydantic import SecretStr

from app.core.config import Settings
from tools import cli, e2e, processes
from tools.infra import RATE_LIMIT_FIELDS
from tools.processes import Command

BASE = Settings.model_construct(
    app_env="development",
    database_url=SecretStr("postgresql+psycopg://127.0.0.1:25432/app"),
    redis_url=SecretStr("redis://127.0.0.1:26379/0"),
    frontend_url="http://localhost:3000",
    realtime_allowed_origins=frozenset({"http://localhost:3000"}),
    oauth_redirect_uris=frozenset({"http://localhost:3000/oauth/callback"}),
    storage_allowed_origins=frozenset({"http://localhost:3000", "http://localhost:3001"}),
)


def test_parse_defaults_and_preserves_command_arguments() -> None:
    options = e2e.parse_serve_args(["--", "node", "runner.mjs", "--web-url", "child-value"])
    assert options.web_url == "http://localhost:3100"
    assert options.command == ["node", "runner.mjs", "--web-url", "child-value"]


@pytest.mark.parametrize(
    ("value", "origin"),
    [
        ("http://localhost:3200", "http://localhost:3200"),
        ("https://WEB.example.com:443", "https://web.example.com"),
        ("http://[::1]:3100", "http://[::1]:3100"),
    ],
)
def test_parse_web_origin(value: str, origin: str) -> None:
    options = e2e.parse_serve_args(["--web-url", value, "--", "node", "test.mjs"])
    assert options.web_url == origin


@pytest.mark.parametrize(
    "value",
    [
        "",
        "ftp://localhost",
        "localhost:3100",
        "http://",
        "http://localhost/",
        "http://localhost/path",
        "http://localhost?",
        "http://localhost?q=1",
        "http://localhost#",
        "http://localhost#part",
        "http://user@localhost",
        "http://localhost:bad",
        "http://localhost:65536",
        "http://localhost:0",
        "http://localhost:",
        "http://localhost\\evil",
        "http://localhost\n",
        "http://127.1",
        "http://*.example.com",
        "http://웹.example.com",
    ],
)
def test_reject_non_origin_web_urls(value: str, capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as caught:
        e2e.parse_serve_args(["--web-url", value, "--", "node"])
    assert caught.value.code == 2
    message = capsys.readouterr().err
    assert "--web-url" in message
    assert "경로 없는 http(s)://호스트[:포트]" in message


@pytest.mark.parametrize(
    "args", [[], ["--"], ["node"], ["--web-url", "--", "node"], ["--unknown", "--", "node"]]
)
def test_command_and_separator_are_required(args: list[str]) -> None:
    with pytest.raises(SystemExit) as caught:
        e2e.parse_serve_args(args)
    assert caught.value.code == 2


def test_serve_overrides_keep_development_settings_intact() -> None:
    settings = e2e.serve_settings(BASE, "https://web.example.com")
    values = e2e.overrides(settings)
    assert values["APP_ENV"] == "test"
    assert values["DATABASE_URL"] == "postgresql+psycopg://127.0.0.1:25432/app_e2e"
    assert values["REDIS_URL"] == "redis://127.0.0.1:26379/14"
    assert {values[name.upper()] for name in RATE_LIMIT_FIELDS} == {"1000000"}
    assert values["RECENT_LOGIN_SECONDS"] == "10"
    assert values["API_URL"] == "http://127.0.0.1:18000"
    assert values["FRONTEND_URL"] == "https://web.example.com"
    assert values["REALTIME_ALLOWED_ORIGINS"] == "https://web.example.com"
    assert values["OAUTH_REDIRECT_URIS"] == "https://web.example.com/oauth/callback"
    assert set(values["STORAGE_ALLOWED_ORIGINS"].split(",")) == {
        "http://localhost:3000",
        "http://localhost:3001",
        "https://web.example.com",
    }
    assert BASE.database_url.get_secret_value().endswith("/app")
    assert BASE.redis_url.get_secret_value().endswith("/0")
    assert "https://web.example.com" not in BASE.storage_allowed_origins


def test_child_environment_only_adds_backend_facts() -> None:
    inherited = {"PATH": "tools", "APP_URL": "caller-value", "DATABASE_URL": "caller-db"}
    env = e2e.child_environment("http://localhost:3200", inherited)
    assert env == {
        **inherited,
        "PYTHONUTF8": "1",
        "E2E_API_URL": "http://127.0.0.1:18000",
        "E2E_WEB_URL": "http://localhost:3200",
        "E2E_MAILPIT_URL": "http://127.0.0.1:28025",
        "E2E_OAUTH_URL": "http://127.0.0.1:28080",
        "E2E_RECENT_LOGIN_SECONDS": "10",
    }
    assert inherited == {"PATH": "tools", "APP_URL": "caller-value", "DATABASE_URL": "caller-db"}


@pytest.fixture
def lifecycle(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> list[str]:
    events: list[str] = []

    class FakeGroup:
        def __init__(
            self, commands: Sequence[Command], *, cwd: Path, out: TextIO, env: Mapping[str, str]
        ) -> None:
            assert [command.name for command in commands] == ["api", "worker", "scheduler"]
            assert cwd == e2e.ROOT
            assert env["DATABASE_URL"].endswith("/app_e2e")
            assert env["REDIS_URL"].endswith("/14")
            out.write("api | 서버 로그\n")

        def start(self) -> None:
            events.append("start")

        def stop(self) -> None:
            events.append("stop")

        def exited(self) -> None:
            return None

    def preflight(settings: Settings) -> None:
        assert settings.database_url.get_secret_value().endswith("/app_e2e")
        events.append("preflight")

    def prepare(settings: Settings) -> None:
        events.append("prepare")

    def cors(settings: Settings) -> bool:
        assert "http://localhost:3100" in settings.storage_allowed_origins
        events.append("cors")
        return False

    def ready(group: processes.ProcessGroup) -> None:
        events.append("ready")

    monkeypatch.setattr(e2e, "load_settings", lambda: BASE)
    monkeypatch.setattr(e2e, "preflight", preflight)
    monkeypatch.setattr(e2e, "prepare", prepare)
    monkeypatch.setattr(e2e, "ensure_bucket", cors)
    monkeypatch.setattr(e2e, "ProcessGroup", FakeGroup)
    monkeypatch.setattr(e2e, "wait_ready", ready)
    monkeypatch.setattr(e2e, "LOG", tmp_path / "processes.log")
    return events


@pytest.mark.parametrize("code", [0, 7])
def test_serve_propagates_command_exit_and_uses_poe_pwd(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    lifecycle: list[str],
    code: int,
) -> None:
    monkeypatch.setenv("POE_PWD", str(tmp_path))

    def command(args: Sequence[str], *, cwd: Path, env: Mapping[str, str]) -> int:
        assert args == ["node", "runner.mjs", "--flag"]
        assert cwd == tmp_path
        assert env["E2E_WEB_URL"] == "http://localhost:3100"
        assert "APP_ENV" not in env  # 서버 설정을 명령에 덮어쓰지 않는다.
        lifecycle.append("command")
        return code

    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.setattr(e2e, "run_command", command)
    assert e2e.serve_main(["--", "node", "runner.mjs", "--flag"]) == code
    assert lifecycle == ["preflight", "prepare", "start", "cors", "ready", "command", "stop"]


def test_readiness_failure_prints_log_tail_and_stops(
    monkeypatch: pytest.MonkeyPatch,
    lifecycle: list[str],
    capsys: pytest.CaptureFixture[str],
) -> None:
    def not_ready(group: processes.ProcessGroup) -> str:
        return "ready 실패"

    monkeypatch.setattr(e2e, "wait_ready", not_ready)
    assert e2e.serve_main(["--", "node"]) == 1
    assert lifecycle == ["preflight", "prepare", "start", "cors", "stop"]
    assert "api | 서버 로그" in capsys.readouterr().out


def test_interruption_stops_backend_and_returns_130(
    monkeypatch: pytest.MonkeyPatch,
    lifecycle: list[str],
) -> None:
    def command(args: Sequence[str], *, cwd: Path, env: Mapping[str, str]) -> int:
        raise KeyboardInterrupt

    monkeypatch.setattr(e2e, "run_command", command)
    assert e2e.serve_main(["--", "node"]) == 130
    assert lifecycle[-1] == "stop"


def test_test_e2e_uses_shared_startup_without_changing_its_settings(
    monkeypatch: pytest.MonkeyPatch,
    lifecycle: list[str],
) -> None:
    def tests(group: processes.ProcessGroup) -> None:
        return None

    monkeypatch.setattr(e2e, "run_tests", tests)
    assert e2e.main() == 0
    assert lifecycle == ["preflight", "prepare", "start", "ready", "stop"]


def test_poe_entry_preserves_exit_code(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(e2e, "serve_main", lambda: 7)
    with pytest.raises(SystemExit) as caught:
        cli.e2e_serve()
    assert caught.value.code == 7


def test_missing_command_executable_stops_backend(
    monkeypatch: pytest.MonkeyPatch,
    lifecycle: list[str],
    capsys: pytest.CaptureFixture[str],
) -> None:
    def command(args: Sequence[str], *, cwd: Path, env: Mapping[str, str]) -> int:
        raise FileNotFoundError

    monkeypatch.setattr(e2e, "run_command", command)
    assert e2e.serve_main(["--", "missing-command"]) == 1
    assert lifecycle[-1] == "stop"
    assert "설치·실행 권한" in capsys.readouterr().out


def test_cors_failure_stops_backend_before_command(
    monkeypatch: pytest.MonkeyPatch,
    lifecycle: list[str],
) -> None:
    def cors(settings: Settings) -> bool:
        raise RuntimeError("CORS 실패")

    monkeypatch.setattr(e2e, "ensure_bucket", cors)
    with pytest.raises(RuntimeError, match="CORS 실패"):
        e2e.serve_main(["--", "node"])
    assert lifecycle == ["preflight", "prepare", "start", "stop"]


def test_partial_start_failure_stops_started_processes(
    monkeypatch: pytest.MonkeyPatch,
    lifecycle: list[str],
) -> None:
    def start(group: processes.ProcessGroup) -> None:
        raise OSError("worker 시작 실패")

    monkeypatch.setattr("tools.e2e.ProcessGroup.start", start)
    with pytest.raises(OSError, match="worker 시작 실패"):
        e2e.serve_main(["--", "node"])
    assert lifecycle == ["preflight", "prepare", "stop"]


def test_preflight_failure_never_starts_or_prepares(
    monkeypatch: pytest.MonkeyPatch,
    lifecycle: list[str],
) -> None:
    def preflight(settings: Settings) -> None:
        raise SystemExit("인프라가 꺼져 있다 — uv run poe setup을 실행한다")

    monkeypatch.setattr(e2e, "preflight", preflight)
    with pytest.raises(SystemExit, match="setup"):
        e2e.serve_main(["--", "node"])
    assert lifecycle == []


def test_command_falls_back_to_current_directory_without_poe_pwd(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    lifecycle: list[str],
) -> None:
    monkeypatch.delenv("POE_PWD", raising=False)
    monkeypatch.chdir(tmp_path)

    def command(args: Sequence[str], *, cwd: Path, env: Mapping[str, str]) -> int:
        assert cwd == tmp_path
        return 0

    monkeypatch.setattr(e2e, "run_command", command)
    assert e2e.serve_main(["--", "node"]) == 0
    assert lifecycle[-1] == "stop"


@pytest.mark.parametrize("interrupted", [False, True])
def test_command_runner_stops_owned_process_tree(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    interrupted: bool,
) -> None:
    events: list[str] = []

    class FakeProcess:
        pid = 123

        def __init__(
            self,
            args: Sequence[str],
            *,
            cwd: Path,
            env: Mapping[str, str],
            creationflags: int,
            start_new_session: bool,
        ) -> None:
            assert args == ["node", "runner.mjs"]
            assert cwd == tmp_path
            assert env["PROBE"] == "value"
            assert start_new_session == (os.name != "nt")

        def wait(self, timeout: float | None = None) -> int:
            events.append("wait")
            if len(events) == 1:
                assert timeout == processes.POLL_INTERVAL  # Windows에서도 신호 처리를 이어 간다.
            if interrupted and len(events) == 1:
                raise KeyboardInterrupt
            return 7

    def stop(process: object, *, force: bool) -> None:
        events.append("stop")

    monkeypatch.setattr(subprocess, "Popen", FakeProcess)
    monkeypatch.setattr(processes, "_signal_tree", stop)
    if interrupted:
        with pytest.raises(KeyboardInterrupt):
            processes.run_command(["node", "runner.mjs"], cwd=tmp_path, env={"PROBE": "value"})
    else:
        assert (
            processes.run_command(
                ["node", "runner.mjs"],
                cwd=tmp_path,
                env={"PROBE": "value"},
            )
            == 7
        )
    assert events == ["wait", "stop", "wait"]
```

`templates/fastapi/tools/tests/test_processes.py`를 고친다.

(1) 찾을 부분:

```python

import pytest

from tools.processes import STOP_SIGNALS, Command, run_all

# 손자: heartbeat.txt에 계속 점을 찍는다.
BEAT = """
```

바꿀 내용:

```python

import pytest

from tools.processes import STOP_SIGNALS, Command, ProcessGroup, run_all, run_command

# 손자: heartbeat.txt에 계속 점을 찍는다.
BEAT = """
```

(2) 찾을 부분:

```python
        "env | 값",
        "끝난 프로세스: env(종료 코드 0). 모두 내렸다.",
    ]
```

바꿀 내용:

```python
        "env | 값",
        "끝난 프로세스: env(종료 코드 0). 모두 내렸다.",
    ]


@pytest.mark.parametrize("number", STOP_SIGNALS, ids=lambda number: signal.Signals(number).name)
def test_external_command_is_stopped_with_its_descendants(tmp_path: Path, number: int) -> None:
    """E2E 서버 그룹이 잡은 신호가 외부 명령과 손자의 정리도 거친다."""

    def send() -> None:
        when_beating(tmp_path)
        signal.raise_signal(number)

    out = io.StringIO()
    started = time.monotonic()
    with ProcessGroup(
        [Command("backend", python("import time; time.sleep(60)"))], cwd=tmp_path, out=out
    ):
        threading.Thread(target=send, daemon=True).start()
        with pytest.raises(KeyboardInterrupt):
            run_command(python(WITH_GRANDCHILD), cwd=tmp_path, env={"PYTHONUTF8": "1"})
    assert time.monotonic() - started < 20
    assert_stopped(tmp_path)
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`templates/fastapi`에서): `uv run pytest -q tools/tests/test_e2e.py tools/tests/test_processes.py`

Expected: 실패한다. `test_processes.py`의 import가 수집 단계에서 실패해 pytest가 중단된다(종료 코드 2). 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
ERROR tools/tests/test_processes.py
1 error
```

- [ ] **Step 3: FastAPI 설정을 고친다**

`templates/fastapi/compose.yaml`를 고친다.

(1) 찾을 부분:

```yaml
# 개발 인프라. `uv run poe setup`이 기본 프로필을 띄운다(docker compose up -d --wait).
# 포트는 모두 127.0.0.1에만 연다. 호스트 포트는 기본 포트에 20000을 더한 번호이고, 컨테이너 안은 기본 포트다.
# 다른 로컬 스택이 흔히 여는 기본 포트와 10000을 더한 포트(예: 5432, 15432)를 피한다.
```

바꿀 내용:

```yaml
# 폴더를 옮겨도 개발 볼륨 이름을 유지한다. 생성할 때 프로젝트 이름으로 바꾼다.
name: fastapi

# 개발 인프라. `uv run poe setup`이 기본 프로필을 띄운다(docker compose up -d --wait).
# 포트는 모두 127.0.0.1에만 연다. 호스트 포트는 기본 포트에 20000을 더한 번호이고, 컨테이너 안은 기본 포트다.
# 다른 로컬 스택이 흔히 여는 기본 포트와 10000을 더한 포트(예: 5432, 15432)를 피한다.
```

(2) 찾을 부분:

```yaml
    ports:
      - "127.0.0.1:28080:8080"
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://localhost:8080/default/.well-known/openid-configuration"]
      interval: 2s
      timeout: 5s
      retries: 60
```

바꿀 내용:

```yaml
    ports:
      - "127.0.0.1:28080:8080"
    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "-q",
          "-O",
          "/dev/null",
          "http://localhost:8080/default/.well-known/openid-configuration",
        ]
      interval: 2s
      timeout: 5s
      retries: 60
```

`templates/fastapi/pyproject.toml`를 고친다.

찾을 부분:

```toml
fix = { script = "tools.cli:fix", help = "린트 자동 수정과 포맷" }
test = { script = "tools.cli:test", help = "테스트(E2E 제외)" }
"test:e2e" = { script = "tools.cli:test_e2e", help = "E2E 테스트" }
gen = { script = "tools.cli:gen", help = "openapi.json을 내보낸다" }
"db:migrate" = { script = "tools.cli:db_migrate", help = "마이그레이션을 적용한다" }
"db:reset" = { script = "tools.cli:db_reset", help = "로컬 DB를 지우고 마이그레이션과 시드를 다시 한다" }
```

바꿀 내용:

```toml
fix = { script = "tools.cli:fix", help = "린트 자동 수정과 포맷" }
test = { script = "tools.cli:test", help = "테스트(E2E 제외)" }
"test:e2e" = { script = "tools.cli:test_e2e", help = "E2E 테스트" }
"e2e:serve" = { script = "tools.cli:e2e_serve", help = "E2E api 준비 뒤 호출한 폴더에서 명령 실행: [--web-url <Origin>] -- <명령> [인자...]" }
gen = { script = "tools.cli:gen", help = "openapi.json을 내보낸다" }
"db:migrate" = { script = "tools.cli:db_migrate", help = "마이그레이션을 적용한다" }
"db:reset" = { script = "tools.cli:db_reset", help = "로컬 DB를 지우고 마이그레이션과 시드를 다시 한다" }
```

- [ ] **Step 4: FastAPI 개발 도구를 고친다**

`templates/fastapi/tools/cli.py`를 고친다.

찾을 부분:

```python
    raise SystemExit(run_e2e())


def gen() -> None:
    """앱을 띄우지 않고 openapi.json을 다시 쓴다."""
    raise SystemExit(_python("tools.openapi_export"))
```

바꿀 내용:

```python
    raise SystemExit(run_e2e())


def e2e_serve() -> None:
    """E2E api가 준비되면 호출한 폴더(POE_PWD)에서 받은 명령을 실행한다."""
    from tools.e2e import serve_main

    raise SystemExit(serve_main())


def gen() -> None:
    """앱을 띄우지 않고 openapi.json을 다시 쓴다."""
    raise SystemExit(_python("tools.openapi_export"))
```

`templates/fastapi/tools/e2e.py` 전체를 다음으로 바꾼다.

```python
"""test:e2e·e2e:serve: api, worker, scheduler를 E2E 설정으로 띄운다.

- 개발 인프라(compose)를 쓰되 DB는 app_e2e, Valkey는 DB 14다(isolated_settings(..., "e2e")).
  개발 데이터를 건드리지 않고, 매번 E2E용 Valkey DB를 비운다.
- api는 127.0.0.1:18000에 뜬다. /health/ready가 200이 되면 pytest tests/e2e를 돌린다.
- 세 프로세스의 출력은 .cache/e2e/processes.log에 모은다. 실패하면 끝부분을 보여 준다.
"""

import argparse
import os
import subprocess
import sys
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

import httpx
import redis
from pydantic import SecretStr, TypeAdapter, ValidationError

from app.core.config import Origins, Settings, load_settings
from app.storage_setup import ensure_bucket
from tools.dev import SCHEDULER, WORKER, api
from tools.infra import RATE_LIMIT_FIELDS, isolated_settings, migrate_disposable, preflight
from tools.mailpit import MAILPIT_URL
from tools.processes import ProcessGroup, run_command

ROOT = Path(__file__).resolve().parent.parent
PORT = 18000
BASE_URL = f"http://127.0.0.1:{PORT}"
READY_TIMEOUT = 60.0  # 초
LOG = ROOT / ".cache" / "e2e" / "processes.log"
TAIL = 40  # 실패했을 때 보여 줄 로그 줄 수
WEB_URL = "http://localhost:3100"
OAUTH_URL = "http://127.0.0.1:28080"
RECENT_LOGIN_SECONDS = 10


class E2EError(Exception):
    """서버나 테스트 실패. 프로세스를 내린 뒤 로그 끝부분과 함께 알린다."""


@dataclass(frozen=True)
class ServeArgs:
    web_url: str
    command: list[str]


def web_origin(value: str) -> str:
    """경로·쿼리·조각·계정이 없는 http(s) Origin만 받는다."""
    problem = "--web-url이 Origin이 아니다 — 경로 없는 http(s)://호스트[:포트]로 적는다"
    try:
        parts = urlsplit(value)
        if (
            any(character.isspace() for character in value)
            or parts.path
            or "?" in value
            or "#" in value
            or "@" in parts.netloc
            or parts.netloc.endswith(":")
            or parts.port == 0
        ):
            raise ValueError(problem)
        origins = TypeAdapter[frozenset[str]](Origins).validate_python(frozenset({value}))
    except ValueError, ValidationError:
        raise argparse.ArgumentTypeError(problem) from None
    return next(iter(origins))


def parse_serve_args(args: Sequence[str]) -> ServeArgs:
    parser = argparse.ArgumentParser(
        prog="uv run poe e2e:serve",
        usage="%(prog)s [--web-url <주소>] -- <명령> [인자...]",
        description="E2E api가 준비되면 POE_PWD(호출한 폴더)에서 명령을 실행한다.",
        allow_abbrev=False,
    )
    parser.add_argument(
        "--web-url", type=web_origin, default=WEB_URL, help="web Origin(기본: %(default)s)"
    )
    values = list(args)
    # 도움말은 인프라 확인 없이 읽을 수 있다.
    options, separator, command = values, -1, []
    if "--" in values:
        separator = values.index("--")
        options, command = values[:separator], values[separator + 1 :]
    parsed = parser.parse_args(options)
    if separator < 0 or not command:
        parser.error("실행할 명령이 없다 — -- 뒤에 명령과 인자를 적는다")
    return ServeArgs(parsed.web_url, command)


def serve_settings(settings: Settings, web_url: str) -> Settings:
    """개발 DB·Valkey를 보존하고 web E2E의 주소와 최근 로그인 창을 맞춘다."""
    origin = web_origin(web_url)
    return isolated_settings(settings, "e2e").model_copy(
        update={
            "recent_login_seconds": RECENT_LOGIN_SECONDS,
            "frontend_url": origin,
            "realtime_allowed_origins": frozenset({origin}),
            "oauth_redirect_uris": frozenset({f"{origin}/oauth/callback"}),
            "storage_allowed_origins": settings.storage_allowed_origins | {origin},
        }
    )


def child_environment(web_url: str, inherited: Mapping[str, str]) -> dict[str, str]:
    """호출자의 환경에 백엔드가 아는 값만 더한다. web 변수로의 변환은 호출자가 맡는다."""
    return {
        **inherited,
        "PYTHONUTF8": "1",
        "E2E_API_URL": BASE_URL,
        "E2E_WEB_URL": web_url,
        "E2E_MAILPIT_URL": MAILPIT_URL,
        "E2E_OAUTH_URL": OAUTH_URL,
        "E2E_RECENT_LOGIN_SECONDS": str(RECENT_LOGIN_SECONDS),
    }


def overrides(settings: Settings) -> dict[str, str]:
    """E2E 설정을 자식 프로세스에 넘기는 환경 변수. 환경 변수는 .env보다 앞선다.

    isolated_settings가 바꾸는 필드(환경, DB, Valkey 번호, 레이트 리밋)를 넘긴다. 소셜 로그인
    제공자가 돌아올 주소(API_URL)는 E2E api의 주소다.
    """
    names = (
        "app_env",
        "database_url",
        "redis_url",
        *RATE_LIMIT_FIELDS,
        "recent_login_seconds",
        "frontend_url",
        "realtime_allowed_origins",
        "oauth_redirect_uris",
        "storage_allowed_origins",
    )
    return {name.upper(): _plain(getattr(settings, name)) for name in names} | {"API_URL": BASE_URL}


def _plain(value: object) -> str:
    """환경 변수로 넘길 값. SecretStr은 str()이 가린 값(**********)이므로 원래 값을 꺼낸다."""
    if isinstance(value, SecretStr):
        return value.get_secret_value()
    if isinstance(value, frozenset):
        return ",".join(sorted(str(item) for item in value))
    return str(value)


def prepare(settings: Settings) -> None:
    """E2E DB를 head까지 마이그레이션하고 시드를 넣는다. E2E용 Valkey DB를 비운다.

    E2E DB가 지금 없는 리비전에 있으면 스키마를 비우고 다시 한다(migrate_disposable).
    """
    migrate_disposable(settings)
    env = {**os.environ, "PYTHONUTF8": "1", **overrides(settings)}
    done = subprocess.run([sys.executable, "-m", "app.seed"], cwd=ROOT, env=env, check=False)
    if done.returncode != 0:
        raise SystemExit("E2E DB를 준비하지 못했다: python -m app.seed")
    client = redis.Redis.from_url(settings.redis_url.get_secret_value())  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다
    try:
        client.flushdb()  # pyright: ignore[reportUnknownMemberType]  # 사유: redis-py의 **kwargs에 타입이 없다
    finally:
        client.close()


def wait_ready(group: ProcessGroup) -> str | None:
    """api의 /health/ready가 200이 될 때까지 기다린다. 안 되면 까닭을 돌려준다."""
    deadline = time.monotonic() + READY_TIMEOUT
    while time.monotonic() < deadline:
        exited = group.exited()
        if exited is not None:
            return f"먼저 끝난 프로세스: {exited[0]}(종료 코드 {exited[1]})"
        try:
            if httpx.get(f"{BASE_URL}/health/ready", timeout=2).status_code == 200:
                return None
        except httpx.HTTPError:
            pass  # 아직 뜨는 중이다
        time.sleep(0.3)
    return f"api가 {READY_TIMEOUT:.0f}초 안에 ready가 되지 않았다"


def run_tests(group: ProcessGroup) -> str | None:
    """pytest tests/e2e를 돌린다. 실패하면 까닭을 돌려준다."""
    tests = subprocess.run([sys.executable, "-m", "pytest", "tests/e2e"], cwd=ROOT, check=False)
    exited = group.exited()
    if exited is not None:
        return f"테스트 중에 끝난 프로세스: {exited[0]}(종료 코드 {exited[1]})"
    return None if tests.returncode == 0 else "tests/e2e가 실패했다"


def show_failure(problem: str) -> int:
    where = LOG.relative_to(ROOT).as_posix() if LOG.is_relative_to(ROOT) else str(LOG)
    tail = LOG.read_text(encoding="utf-8").splitlines()[-TAIL:]
    print("\n".join([*tail, f"E2E 실패: {problem} — 프로세스 출력 {where}를 확인한다."]))
    return 1


def run_with_server(
    settings: Settings,
    action: Callable[[ProcessGroup], int],
    *,
    storage: bool = False,
) -> int:
    """두 E2E 명령이 준비·로그·프로세스 그룹·readiness·정리를 함께 쓴다."""
    preflight(settings)
    prepare(settings)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    commands = [api("--port", str(PORT)), WORKER, SCHEDULER]
    try:
        with LOG.open("w", encoding="utf-8") as log:
            group = ProcessGroup(commands, cwd=ROOT, out=log, env=overrides(settings))
            try:
                group.start()
                if storage:
                    ensure_bucket(settings)
                sys.stdout.flush()
                problem = wait_ready(group)
                if problem is not None:
                    raise E2EError(problem)
                code = action(group)
            finally:
                group.stop()  # 시작 도중 실패해도 이미 띄운 프로세스를 내린다.
    except KeyboardInterrupt:
        print("E2E를 멈췄다. 띄운 프로세스를 모두 내렸다.")
        return 130
    except E2EError as error:
        return show_failure(str(error))
    return code


def main() -> int:
    def tests(group: ProcessGroup) -> int:
        problem = run_tests(group)
        if problem is not None:
            raise E2EError(problem)
        return 0

    return run_with_server(isolated_settings(load_settings(), "e2e"), tests)


def serve_main(args: Sequence[str] | None = None) -> int:
    options = parse_serve_args(sys.argv[1:] if args is None else args)
    settings = serve_settings(load_settings(), options.web_url)
    cwd = Path(os.environ.get("POE_PWD") or os.getcwd())

    def command(group: ProcessGroup) -> int:
        try:
            return run_command(
                options.command,
                cwd=cwd,
                env=child_environment(options.web_url, os.environ),
            )
        except OSError:
            print("E2E 명령을 실행하지 못했다 — 명령 이름과 설치·실행 권한을 확인한다.")
            return 1

    return run_with_server(settings, command, storage=True)
```

`templates/fastapi/tools/processes.py`를 고친다.

찾을 부분:

```python
        group.stop()
    group.say(summary)
    return code
```

바꿀 내용:

```python
        group.stop()
    group.say(summary)
    return code


def run_command(args: Sequence[str], *, cwd: Path, env: Mapping[str, str]) -> int:
    """명령의 입출력을 유지하고 종료 코드로 끝난다. 중단 때 자손까지 내린다.

    바깥 ProcessGroup이 신호를 KeyboardInterrupt로 바꾼다. 명령은 새 그룹으로 띄워
    백엔드와 같은 방식으로 정리한다.
    """
    process = subprocess.Popen(
        args,
        cwd=cwd,
        env=env,
        creationflags=NEW_PROCESS_GROUP,
        start_new_session=not WINDOWS,
    )
    try:
        while True:
            try:
                return process.wait(timeout=POLL_INTERVAL)
            except subprocess.TimeoutExpired:
                pass  # Windows의 무기한 wait는 Python 신호 처리를 늦춘다.
    finally:
        _signal_tree(process, force=False)
        try:
            process.wait(timeout=STOP_TIMEOUT)
        except subprocess.TimeoutExpired:
            _signal_tree(process, force=True)
            process.wait()
```

- [ ] **Step 5: FastAPI 문서를 고친다**

`templates/fastapi/AGENTS.md`를 고친다.

찾을 부분:

```markdown

## 명령

| 명령                                 | 하는 일                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `uv run poe setup`                   | `.env`, Betterleaks, git hook, 인프라(compose), 버킷, DB(개발·테스트·E2E), 마이그레이션, 시드, FastAPI skill 사본을 준비한다 |
| `uv run poe dev`                     | api(`http://127.0.0.1:8000`, 코드가 바뀌면 다시 시작), worker, scheduler를 함께 띄운다                                       |
| `uv run poe check`                   | 완료 기준. 모든 검사를 차례로 돈다                                                                                           |
| `uv run poe fix`                     | 포맷과 린트 자동 수정                                                                                                        |
| `uv run poe test`                    | 테스트(`src`와 `tools`의 `tests/`, E2E 제외)                                                                                 |
| `uv run poe test:e2e`                | api, worker, scheduler를 따로 띄우고 `tests/e2e`를 돌린 뒤 내린다                                                            |
| `uv run poe gen`                     | 앱을 띄우지 않고 `openapi.json`을 다시 쓴다                                                                                  |
| `uv run poe gen:module <이름>`       | 골든 모듈 posts를 복사해 새 모듈과 마이그레이션 초안을 만들고 등록한다. 이름은 영어 복수형 kebab-case다(예: `comments`)      |
| `uv run poe db:migrate`              | 개발 DB에 마이그레이션을 적용한다                                                                                            |
| `uv run poe db:revision "<message>"` | 모델과 개발 DB를 비교해 마이그레이션 초안을 만든다                                                                           |
| `uv run poe db:reset`                | 로컬 개발 DB를 지우고 다시 만든 뒤 마이그레이션과 시드를 한다                                                                |

- `setup`은 여러 번 돌려도 안전하다. Docker가 켜져 있어야 한다. git hook은 이 폴더가 git 저장소의 최상위일 때만 건다.
- `.env`가 있으면 적힌 값은 그대로 두고, 설정에 새로 생긴 키만 `.env.example`의 값으로 더한다. 설정 오류로 멈추면 `uv run poe setup`을 다시 돌린다.
- 테스트가 "인프라가 꺼져 있다"로 멈추면 `uv run poe setup`을 돌린다.
- `dev`는 출력 앞에 프로세스 이름을 붙이고, 하나가 끝나거나 Ctrl+C를 누르면 모두 내린다.
- `test:e2e`는 개발 인프라에 DB `app_e2e`, Valkey DB 14, api 포트 18000으로 띄운다. 실패하면 프로세스 출력(`.cache/e2e/processes.log`)의 끝부분을 보여 준다.

## 완료 기준

```

바꿀 내용:

```markdown

## 명령

| 명령                                                          | 하는 일                                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `uv run poe setup`                                            | `.env`, Betterleaks, git hook, 인프라(compose), 버킷, DB(개발·테스트·E2E), 마이그레이션, 시드, FastAPI skill 사본을 준비한다 |
| `uv run poe dev`                                              | api(`http://127.0.0.1:8000`, 코드가 바뀌면 다시 시작), worker, scheduler를 함께 띄운다                                       |
| `uv run poe check`                                            | 완료 기준. 모든 검사를 차례로 돈다                                                                                           |
| `uv run poe fix`                                              | 포맷과 린트 자동 수정                                                                                                        |
| `uv run poe test`                                             | 테스트(`src`와 `tools`의 `tests/`, E2E 제외)                                                                                 |
| `uv run poe test:e2e`                                         | api, worker, scheduler를 따로 띄우고 `tests/e2e`를 돌린 뒤 내린다                                                            |
| `uv run poe e2e:serve [--web-url <주소>] -- <명령> [인자...]` | E2E api가 준비되면 호출한 폴더에서 명령을 실행하고 서버를 내린다                                                             |
| `uv run poe gen`                                              | 앱을 띄우지 않고 `openapi.json`을 다시 쓴다                                                                                  |
| `uv run poe gen:module <이름>`                                | 골든 모듈 posts를 복사해 새 모듈과 마이그레이션 초안을 만들고 등록한다. 이름은 영어 복수형 kebab-case다(예: `comments`)      |
| `uv run poe db:migrate`                                       | 개발 DB에 마이그레이션을 적용한다                                                                                            |
| `uv run poe db:revision "<message>"`                          | 모델과 개발 DB를 비교해 마이그레이션 초안을 만든다                                                                           |
| `uv run poe db:reset`                                         | 로컬 개발 DB를 지우고 다시 만든 뒤 마이그레이션과 시드를 한다                                                                |

- `setup`은 여러 번 돌려도 안전하다. Docker가 켜져 있어야 한다. git hook은 이 폴더가 git 저장소의 최상위일 때만 건다.
- `.env`가 있으면 적힌 값은 그대로 두고, 설정에 새로 생긴 키만 `.env.example`의 값으로 더한다. 설정 오류로 멈추면 `uv run poe setup`을 다시 돌린다.
- 테스트가 "인프라가 꺼져 있다"로 멈추면 `uv run poe setup`을 돌린다.
- `dev`는 출력 앞에 프로세스 이름을 붙이고, 하나가 끝나거나 Ctrl+C를 누르면 모두 내린다.
- `test:e2e`는 개발 인프라에 DB `app_e2e`, Valkey DB 14, api 포트 18000으로 띄운다. 실패하면 프로세스 출력(`.cache/e2e/processes.log`)의 끝부분을 보여 준다.
- `e2e:serve`는 같은 격리로 외부 E2E를 실행한다. web 기본 주소는 `http://localhost:3100`이며 경로 없는 http(s) Origin만 받는다. 명령은 poe가 넘긴 `POE_PWD`(호출한 폴더)에서 실행하고 그 종료 코드로 끝난다. [E2E](docs/architecture.md#e2e)를 따른다.

## 완료 기준

```

`templates/fastapi/docs/architecture.md`를 고친다.

(1) 찾을 부분:

```markdown

## 플랫폼 모듈

| 모듈         | 하는 일                                                                                    | 쓰는 모듈    |
| ------------ | ------------------------------------------------------------------------------------------ | ------------ |
| `roles`      | 역할과 권한 API, 실제 권한 계산, 권한 상승 판정(`within`)                                  | 없음         |
| `users`      | 내 정보, 탈퇴, 사용자 관리, 다른 리소스에 넣을 공개 사용자(`public_users`)                 | roles, files |
| `auth`       | 가입, 이메일 인증, 세션, 비밀번호, 소셜 로그인(제공자는 `auth/providers/`), 인증기(`authenticate`) | users, roles |
| `audit_logs` | 감사 로그 읽기. 기록은 각 모듈이 `app.core.audit.record_audit`로 한다                      | users        |
| `files`      | 업로드(presigned PUT), 완료 확인, 다운로드 URL, 읽기 규칙과 참조 확인의 등록 지점, 정리 잡 | 없음         |
| `realtime`   | 실시간 티켓, Socket.IO 연결(티켓 → 사용자 룸)과 구독(채널 권한)                            | auth         |
| `posts`      | 골든 모듈. 글 목록·조회·쓰기, 전이 표, 공개 목록 캐시, 커버 이미지, 실시간 이벤트          | users, files |

- 의존은 한쪽으로만 흐른다. 반대 방향이 필요하면 등록으로 뒤집는다. 계정을 닫을 때(비활성화, 탈퇴) users가 부를 처리를 auth가 `users.on_account_closed`로, 역할의 권한이 바뀌거나 역할이 지워질 때 그 멤버에게 알릴 처리를 users가 `roles.on_members_changed`로 등록한다(등록은 `registry.py`).
- files는 다른 모듈을 모른다. 소유자가 아닌 사람이 파일을 읽게 할 규칙(`files.add_read_rule`)과, 탈퇴 때 남길 파일을 가리는 참조 확인(`files.add_reference_check`)을 users와 posts가 등록한다.
```

바꿀 내용:

```markdown

## 플랫폼 모듈

| 모듈         | 하는 일                                                                                            | 쓰는 모듈    |
| ------------ | -------------------------------------------------------------------------------------------------- | ------------ |
| `roles`      | 역할과 권한 API, 실제 권한 계산, 권한 상승 판정(`within`)                                          | 없음         |
| `users`      | 내 정보, 탈퇴, 사용자 관리, 다른 리소스에 넣을 공개 사용자(`public_users`)                         | roles, files |
| `auth`       | 가입, 이메일 인증, 세션, 비밀번호, 소셜 로그인(제공자는 `auth/providers/`), 인증기(`authenticate`) | users, roles |
| `audit_logs` | 감사 로그 읽기. 기록은 각 모듈이 `app.core.audit.record_audit`로 한다                              | users        |
| `files`      | 업로드(presigned PUT), 완료 확인, 다운로드 URL, 읽기 규칙과 참조 확인의 등록 지점, 정리 잡         | 없음         |
| `realtime`   | 실시간 티켓, Socket.IO 연결(티켓 → 사용자 룸)과 구독(채널 권한)                                    | auth         |
| `posts`      | 골든 모듈. 글 목록·조회·쓰기, 전이 표, 공개 목록 캐시, 커버 이미지, 실시간 이벤트                  | users, files |

- 의존은 한쪽으로만 흐른다. 반대 방향이 필요하면 등록으로 뒤집는다. 계정을 닫을 때(비활성화, 탈퇴) users가 부를 처리를 auth가 `users.on_account_closed`로, 역할의 권한이 바뀌거나 역할이 지워질 때 그 멤버에게 알릴 처리를 users가 `roles.on_members_changed`로 등록한다(등록은 `registry.py`).
- files는 다른 모듈을 모른다. 소유자가 아닌 사람이 파일을 읽게 할 규칙(`files.add_read_rule`)과, 탈퇴 때 남길 파일을 가리는 참조 확인(`files.add_reference_check`)을 users와 posts가 등록한다.
```

(2) 찾을 부분:

```markdown
- 인스턴스 사이: api의 발행기는 이 인스턴스의 연결에 보내고 Valkey pub/sub으로 다른 인스턴스에 알린다. python-socketio 매니저는 발행이 실패하거나 수신을 다시 시작할 때마다 Valkey 클라이언트를 새로 만든다. `TrackedRedisManager`는 클라이언트를 하나만 만들어 다시 쓰고(redis-py가 다시 연결한다) 닫을 때 닫는다. worker와 scheduler는 소켓 서버가 아니라 쓰기 전용 발행기(`JobContext.realtime`)로 보낸다. pub/sub 채널 이름에는 Valkey DB 번호를 넣어 개발, 테스트, E2E를 나눈다.
- 계약: 채널, 이벤트, 메시지는 계약의 `x-realtime-channels`, `x-realtime-events`, `x-realtime-messages`와 같다. 앱이 `openapi.json`에 이 확장과 페이로드 스키마를 내고(`realtime_openapi`), 저장소의 구조 비교(`pnpm spec-compare`)가 계약과 같은지 본다.

## 소셜 로그인

auth 모듈의 `service/oauth.py`와 `providers/`다. 제공자는 파일 하나씩이고(`google.py`, `kakao.py`, `naver.py`) 인가 주소와 코드 교환은 httpx-oauth가, 신원 조회는 설정의 프로필 주소를 GET으로 읽는다. 로그인은 BFF가 쥔 PKCE 쌍에 묶어 로그인 CSRF를 막는다.
```

바꿀 내용:

````markdown
- 인스턴스 사이: api의 발행기는 이 인스턴스의 연결에 보내고 Valkey pub/sub으로 다른 인스턴스에 알린다. python-socketio 매니저는 발행이 실패하거나 수신을 다시 시작할 때마다 Valkey 클라이언트를 새로 만든다. `TrackedRedisManager`는 클라이언트를 하나만 만들어 다시 쓰고(redis-py가 다시 연결한다) 닫을 때 닫는다. worker와 scheduler는 소켓 서버가 아니라 쓰기 전용 발행기(`JobContext.realtime`)로 보낸다. pub/sub 채널 이름에는 Valkey DB 번호를 넣어 개발, 테스트, E2E를 나눈다.
- 계약: 채널, 이벤트, 메시지는 계약의 `x-realtime-channels`, `x-realtime-events`, `x-realtime-messages`와 같다. 앱이 `openapi.json`에 이 확장과 페이로드 스키마를 내고(`realtime_openapi`), 저장소의 구조 비교(`pnpm spec-compare`)가 계약과 같은지 본다.

## E2E

`uv run poe test:e2e`는 api, worker, scheduler를 E2E 설정으로 띄우고 `tests/e2e`를 돌린다.
외부 web E2E 등은 같은 서버 준비 경로를 쓰는 다음 명령으로 실행한다.

```text
uv run poe e2e:serve [--web-url <주소>] -- <명령> [인자...]
```

- 인프라가 꺼져 있으면 `uv run poe setup`을 안내하고 실패한다. 인프라를 직접 띄우지 않는다.
- DB `app_e2e`를 마이그레이션·시드하고 Valkey DB 14만 비운다. 개발 DB와 Valkey DB 0, Mailpit 메일은 보존한다.
- api는 `http://127.0.0.1:18000`, 레이트 리밋은 테스트 한도, 최근 로그인 창은 10초다.
- web 기본 주소는 `http://localhost:3100`이다. `--web-url`은 경로·쿼리·조각·계정 없는 http(s) Origin만 받는다.
  메일의 `FRONTEND_URL`, 실시간 Origin, OAuth의 `<web 주소>/oauth/callback`을 맞춘다.
  스토리지 Origin은 기존 개발 Origin과 web Origin의 합집합이며, `app.storage_setup.ensure_bucket`으로 버킷 CORS를 적용한 뒤 readiness를 기다린다. 기존 객체는 보존한다.
- `/health/ready`가 200이면 명령을 실행한다. 명령의 작업 폴더는 poe의 `POE_PWD`(명령을 호출한 폴더)다.
  호출자의 환경에 아래 값만 더하며, web 전용 변수로 바꾸는 일은 호출자가 맡는다.

| 변수                       | 값                                       |
| -------------------------- | ---------------------------------------- |
| `E2E_API_URL`              | `http://127.0.0.1:18000`                 |
| `E2E_WEB_URL`              | web Origin(기본 `http://localhost:3100`) |
| `E2E_MAILPIT_URL`          | `http://127.0.0.1:28025`(Mailpit API)    |
| `E2E_OAUTH_URL`            | `http://127.0.0.1:28080`(모의 OAuth)     |
| `E2E_RECENT_LOGIN_SECONDS` | `10`                                     |

명령의 입출력을 그대로 연결하고 종료 코드로 끝난다. Ctrl+C·종료 신호도 명령과 세 서버의 자손까지 내린다.
준비가 60초 안에 끝나지 않으면 로그(`.cache/e2e/processes.log`)의 끝부분을 보여 주고 종료 코드 1로 끝난다.
`test:e2e`와 `e2e:serve`는 같은 포트·격리 DB를 쓰므로 차례로 실행한다.

## 소셜 로그인

auth 모듈의 `service/oauth.py`와 `providers/`다. 제공자는 파일 하나씩이고(`google.py`, `kakao.py`, `naver.py`) 인가 주소와 코드 교환은 httpx-oauth가, 신원 조회는 설정의 프로필 주소를 GET으로 읽는다. 로그인은 BFF가 쥔 PKCE 쌍에 묶어 로그인 CSRF를 막는다.
````

(3) 찾을 부분:

```markdown

web의 재인증·브라우저 업로드를 맞출 때는 다음 두 설정을 명시한다. 이름·공개 기본값은 `.env.example`, 검증은 `app.core.config.Settings`를 따른다.

| 변수 | 생략할 때 | web E2E 예시 | 적용 |
| --- | --- | --- | --- |
| `RECENT_LOGIN_SECONDS` | `600`초 | `10` | 탈퇴 검사와 `WWW-Authenticate`의 `max_age`. web 어댑터의 `E2E_RECENT_LOGIN_SECONDS`도 같은 초로 둔다 |
| `STORAGE_ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:3001` | `http://localhost:3100` | 스토리지 준비 뒤 `python -m app.storage_setup`으로 버킷 CORS를 적용한다 |

최근 로그인 창은 1 이상의 정수만 받으며 refresh로 늘어나지 않는다. 스토리지 Origin은 쉼표 목록을 정규화하고 빈 목록·wildcard·잘못된 주소를 거절한다.
Origin을 바꾸면 초기화 명령을 다시 실행해 CORS를 맞춘다. 반복해도 기존 객체는 보존하며 버킷 생성·CORS 오류는 실패로 끝난다.
```

바꿀 내용:

```markdown

web의 재인증·브라우저 업로드를 맞출 때는 다음 두 설정을 명시한다. 이름·공개 기본값은 `.env.example`, 검증은 `app.core.config.Settings`를 따른다.

| 변수                      | 생략할 때                                     | web E2E 예시            | 적용                                                                                                 |
| ------------------------- | --------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `RECENT_LOGIN_SECONDS`    | `600`초                                       | `10`                    | 탈퇴 검사와 `WWW-Authenticate`의 `max_age`. web 어댑터의 `E2E_RECENT_LOGIN_SECONDS`도 같은 초로 둔다 |
| `STORAGE_ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:3001` | `http://localhost:3100` | 스토리지 준비 뒤 `python -m app.storage_setup`으로 버킷 CORS를 적용한다                              |

최근 로그인 창은 1 이상의 정수만 받으며 refresh로 늘어나지 않는다. 스토리지 Origin은 쉼표 목록을 정규화하고 빈 목록·wildcard·잘못된 주소를 거절한다.
Origin을 바꾸면 초기화 명령을 다시 실행해 CORS를 맞춘다. 반복해도 기존 객체는 보존하며 버킷 생성·CORS 오류는 실패로 끝난다.
```

`templates/fastapi/tools/AGENTS.md`를 고친다.

찾을 부분:

```markdown
- `checks/`: 하네스 검사. check의 architecture, harness, skills 단계가 `python -m tools.checks <그룹>`으로 돌린다.
- `hooks/`: Claude Code hook(`.claude/settings.json`이 부른다).
- `infra.py`: compose 기동, DB와 버킷 준비, 테스트 전 사전 확인.
- `processes.py`, `dev.py`, `e2e.py`: 여러 프로세스를 함께 띄우고 내린다(`dev`, `test:e2e`).
- `genmodule/`: 모듈 생성기(`gen:module`). 이름 규칙은 `names.py`, 소스 바꾸기와 골든 모듈의 표시는 `transform.py`, 검사·쓰기·등록은 `generate.py`.
- `binaries.py`: 외부 바이너리(Betterleaks) 설치기. `githooks.py`: lefthook 설치. `openapi_export.py`: `openapi.json` 내보내기.

```

바꿀 내용:

```markdown
- `checks/`: 하네스 검사. check의 architecture, harness, skills 단계가 `python -m tools.checks <그룹>`으로 돌린다.
- `hooks/`: Claude Code hook(`.claude/settings.json`이 부른다).
- `infra.py`: compose 기동, DB와 버킷 준비, 테스트 전 사전 확인.
- `processes.py`, `dev.py`, `e2e.py`: 여러 프로세스를 함께 띄우고 내린다(`dev`, `test:e2e`, `e2e:serve`). `e2e:serve`의 받은 명령만 `POE_PWD`(호출한 폴더)에서 실행한다.
- `genmodule/`: 모듈 생성기(`gen:module`). 이름 규칙은 `names.py`, 소스 바꾸기와 골든 모듈의 표시는 `transform.py`, 검사·쓰기·등록은 `generate.py`.
- `binaries.py`: 외부 바이너리(Betterleaks) 설치기. `githooks.py`: lefthook 설치. `openapi_export.py`: `openapi.json` 내보내기.

```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run(`templates/fastapi`에서): `uv run pytest -q tools/tests/test_e2e.py tools/tests/test_processes.py`

Expected: 통과한다.

```text
52 passed
```

- [ ] **Step 7: 검사를 돌린다**

Run(`templates/fastapi`에서): `uv sync --frozen && uv run ruff check . && uv run ruff format --check . && uv run basedpyright && uv run python -m tools.checks architecture && uv run python -m tools.checks harness`

Expected: 오류 없이 끝난다. 개발 인프라(DB·Valkey)가 필요한 FastAPI 테스트와 `poe check`는 CI가 돌린다. 로컬에서 `uv run poe setup|check|test|test:e2e|e2e:serve`나 `templates/fastapi`의 compose를 쓰지 않는다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄

- [ ] **Step 8: 커밋한다**

```bash
git add \
  templates/fastapi/AGENTS.md \
  templates/fastapi/compose.yaml \
  templates/fastapi/docs/architecture.md \
  templates/fastapi/pyproject.toml \
  templates/fastapi/tools/AGENTS.md \
  templates/fastapi/tools/cli.py \
  templates/fastapi/tools/e2e.py \
  templates/fastapi/tools/processes.py \
  templates/fastapi/tools/tests/test_e2e.py \
  templates/fastapi/tools/tests/test_processes.py
git commit -m "feat(fastapi): add isolated E2E command runner"
```


### Task 3: 저장소: 공유 자산, 템플릿 CI, actionlint, verify-templates

설계 §4.2·§5.9·§7.1·§7.2. 루트 `.gitattributes`·`.editorconfig`를 공유 자산으로 두 템플릿에 넣고 템플릿마다 CI 워크플로를 둔다. 고정 actionlint와 verify-templates가 이 파일을 검사한다.

- `scripts/shared-assets.json`에 두 파일의 원본과 사본을 더하고 `pnpm sync`로 사본을 만든다. 템플릿을 폴더째 가져간 프로젝트를 Windows에서 clone해도 LF를 유지한다(설계 C16).
- 두 템플릿의 `.github/workflows/ci.yml`은 템플릿 저장소에서는 실행되지 않고 복사한 프로젝트에서 동작한다. 루트 CI의 Action SHA·버전 주석, main push·PR 트리거, `contents: read`를 쓰고 registry push는 없다.
- fastapi(30분)는 `uv sync --locked` → `uv run poe setup` → `check` → `test:e2e` → `docker build .`이다. nextjs(45분)는 frozen 설치 → Chromium과 Linux 의존성 → `pnpm check` → 목 E2E → `docker build --tag web:ci .`이다.
- `pnpm tool actionlint`는 기존 설치기에 1.7.12와 다섯 플랫폼의 sha256을 더한다. 루트 `check:workflows`는 `.github/workflows/*.yml`, `templates/*/.github/workflows/*.yml`, `create/assets/combo/.github/workflows/*.yml` 가운데 있는 파일만 검사한다. 성공은 `워크플로 검사 통과: <개수>개` 한 줄, 실패는 actionlint 진단만이다.
- 설치 여부에 따라 결과가 달라지는 shellcheck·pyflakes는 `-shellcheck=`·`-pyflakes=`로 끈다. 모든 OS에서 같은 고정 바이너리 하나로 검사한다.
- verify-templates는 uv·pnpm 백엔드 모두에 `e2e:serve`를 요구한다. 모든 템플릿에 일반 파일 `.github/workflows/ci.yml`과 `.gitattributes`가 있어야 하고 같은 이름의 폴더는 거절한다. 하네스 표준의 명령 어휘·최종 안전망·검사 목록과 루트 AGENTS.md의 `pnpm tool` 행을 맞춘다.
- 루트 check에 `workflows` 단계가 더해져 10단계가 된다. 조합 워크플로는 Task 7이 더하면 자동으로 포함된다.

실패 확인: 부모에는 `src/workflows/check.ts`가 없어 새 suite가 수집되지 않는다. verify 테스트는 백엔드의 `e2e:serve` 누락 3개와 CI·`.gitattributes` 누락 픽스처 2개를 통과시켜 실패한다. 설치 테스트는 actionlint가 없어 1개 실패한다. 3개 파일에서 `6 failed | 21 passed`이고 GREEN은 새 탐색 테스트 2개를 더한 `29 passed`다.

**Files:**
- Create: `scripts/src/workflows/check.ts`, `scripts/src/workflows/cli.ts`, `templates/fastapi/.github/workflows/ci.yml`, `templates/nextjs/.github/workflows/ci.yml`
- Modify: `AGENTS.md`, `docs/harness/standard.md`, `package.json`, `scripts/shared-assets.json`, `scripts/src/tools/manifest.ts`, `scripts/src/verify-templates/manifest.ts`, `scripts/src/verify-templates/verify.ts`
- Test: `scripts/test/tools/install.test.ts`, `scripts/test/verify-templates/verify.test.ts`, `scripts/test/workflows/check.test.ts`
- Generated(직접 고치지 않는다): `templates/fastapi/.editorconfig`, `templates/fastapi/.gitattributes`, `templates/nextjs/.editorconfig`, `templates/nextjs/.gitattributes`

**Interfaces:**
- Consumes: Task 2의 poe `e2e:serve`(템플릿이 새 백엔드 규칙을 통과한다), 기존 `scripts/src/tools/install.ts`의 `ensureTool`과 `manifest.ts`의 `TOOLS`·`ToolSpec`, verify-templates의 `requiredCommands`, `scripts/shared-assets.json`과 `pnpm sync`
- Produces:
  - `TOOLS.actionlint`(version `1.7.12`, tag `v1.7.12`, repo `rhysd/actionlint`, 플랫폼별 자산과 sha256)와 `pnpm tool actionlint`
  - `scripts/src/workflows/check.ts`: `workflowFiles(root: string): string[]`(일반 파일만, `/` 구분, 정렬). `scripts/src/workflows/cli.ts`와 루트 스크립트 `check:workflows`
  - `BACKEND_COMMANDS = ["db:migrate", "db:reset", "e2e:serve"]`와 필수 파일 안내 `<파일>이 없다 — 템플릿 루트에 파일을 만든다.`
  - 두 템플릿의 `.gitattributes`·`.editorconfig` 사본과 `.github/workflows/ci.yml`. Task 4가 단독 생성에 그대로 복사하고 Task 5는 조합에서 앱의 `.github/`를 지운다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`scripts/test/tools/install.test.ts` 전체를 다음으로 바꾼다.

```ts
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  currentPlatform,
  downloadUrl,
  ensureTool,
  type InstallDeps,
} from "../../src/tools/install.ts";
import { isToolName, PLATFORMS, TOOLS, type ToolSpec } from "../../src/tools/manifest.ts";

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
  it("actionlint을 지원 플랫폼의 릴리스 자산으로 설치한다", async () => {
    expect(isToolName("actionlint")).toBe(true);
    const tool: ToolSpec | undefined = Object.values(TOOLS).find(
      ({ name }) => name === "actionlint",
    );
    expect(tool).toBeDefined();
    if (tool === undefined) return;
    const cacheDir = mkdtempSync(join(tmpdir(), "actionlint-test-"));
    try {
      for (const platform of PLATFORMS) {
        const asset = tool.assets[platform];
        expect(asset).toBeDefined();
        if (asset === undefined) continue;
        const fixture = { ...tool, assets: { [platform]: { ...asset, sha256: payloadSha } } };
        const installed = await ensureTool(
          fixture,
          cacheDir,
          {
            download(url) {
              expect(url).toBe(
                `https://github.com/rhysd/actionlint/releases/download/v1.7.12/${asset.file}`,
              );
              return Promise.resolve(payload);
            },
            extract(_archive, destination) {
              writeFileSync(
                join(destination, platform === "win32-x64" ? "actionlint.exe" : "actionlint"),
                "binary",
              );
            },
          },
          platform,
        );
        expect(existsSync(installed)).toBe(true);
      }
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

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

`scripts/test/verify-templates/verify.test.ts`를 고친다.

(1) 찾을 부분:

```ts
  });
  writeHooks(repo);
  write(repo, `${WEB}/.env.example`, "API_BASE_URL=\n");
  write(repo, `${WEB}/docs/recipes/add-feature.md`, "# 기능 추가\n");
  write(repo, `${WEB}/src/features/posts/index.ts`, "export {};\n");
  write(repo, "contract/openapi.yaml", "openapi: 3.1.0\n");
```

바꿀 내용:

```ts
  });
  writeHooks(repo);
  write(repo, `${WEB}/.env.example`, "API_BASE_URL=\n");
  write(repo, `${WEB}/.gitattributes`, "* text=auto eol=lf\n");
  write(repo, `${WEB}/.github/workflows/ci.yml`, "name: ci\n");
  write(repo, `${WEB}/docs/recipes/add-feature.md`, "# 기능 추가\n");
  write(repo, `${WEB}/src/features/posts/index.ts`, "export {};\n");
  write(repo, "contract/openapi.yaml", "openapi: 3.1.0\n");
```

(2) 찾을 부분:

```ts
    const problems = verify(repo);
    expect(problems).toContain('명령 "db:migrate"가 없다(docs/harness/standard.md의 명령 어휘).');
    expect(problems).toContain('명령 "db:reset"가 없다(docs/harness/standard.md의 명령 어휘).');
  });

  it("uv runner는 pyproject.toml의 [tool.poe.tasks]로 명령 어휘를 검사한다", () => {
```

바꿀 내용:

```ts
    const problems = verify(repo);
    expect(problems).toContain('명령 "db:migrate"가 없다(docs/harness/standard.md의 명령 어휘).');
    expect(problems).toContain('명령 "db:reset"가 없다(docs/harness/standard.md의 명령 어휘).');
    expect(problems).toContain('명령 "e2e:serve"가 없다(docs/harness/standard.md의 명령 어휘).');
  });

  it.each(["pnpm", "uv"])("%s 백엔드는 e2e:serve가 있어야 통과한다", (runner) => {
    const repo = makeRepo();
    try {
      writeJson(repo, `${WEB}/template.json`, manifest({ kind: "backend", runner }));
      const commands = [...COMMANDS, "db:migrate", "db:reset"];
      const declare = (names: string[]) => {
        if (runner === "pnpm") {
          writeJson(repo, `${WEB}/package.json`, {
            scripts: Object.fromEntries(names.map((name) => [name, "echo"])),
          });
        } else {
          write(
            repo,
            `${WEB}/pyproject.toml`,
            `[tool.poe.tasks]\n${names.map((name) => `"${name}" = "python -V"`).join("\n")}\n`,
          );
        }
      };
      declare(commands);
      expect(verify(repo)).toEqual([
        '명령 "e2e:serve"가 없다(docs/harness/standard.md의 명령 어휘).',
      ]);
      declare([...commands, "e2e:serve"]);
      expect(verify(repo)).toEqual([]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it.each(["frontend", "backend"])("%s의 CI와 줄바꿈 설정이 없거나 폴더면 거부한다", (kind) => {
    const repo = makeRepo();
    try {
      writeJson(repo, `${WEB}/template.json`, manifest({ kind }));
      writeJson(repo, `${WEB}/package.json`, {
        scripts: Object.fromEntries(
          [...COMMANDS, "db:migrate", "db:reset", "e2e:serve"].map((name) => [name, "echo"]),
        ),
      });
      for (const file of [".github/workflows/ci.yml", ".gitattributes"]) {
        rmSync(join(repo, WEB, file));
        expect(verify(repo)).toEqual([`${file}이 없다 — 템플릿 루트에 파일을 만든다.`]);
        mkdirSync(join(repo, WEB, file));
        expect(verify(repo)).toEqual([`${file}이 없다 — 템플릿 루트에 파일을 만든다.`]);
        rmSync(join(repo, WEB, file), { recursive: true });
        write(repo, `${WEB}/${file}`, "# fixture\n");
        expect(verify(repo)).toEqual([]);
      }
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("uv runner는 pyproject.toml의 [tool.poe.tasks]로 명령 어휘를 검사한다", () => {
```

`scripts/test/workflows/check.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { workflowFiles } from "../../src/workflows/check.ts";

const repos: string[] = [];

function makeRepo(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "workflows-test-"));
  repos.push(root);
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "name: ci\n");
  }
  return root;
}

afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
});

describe("workflowFiles", () => {
  it("루트, 각 템플릿, 조합의 yml 워크플로만 정렬해서 고른다", () => {
    const files = [
      "templates/nextjs/.github/workflows/ci.yml",
      ".github/workflows/release.yml",
      "create/assets/combo/.github/workflows/ci.yml",
      "templates/fastapi/.github/workflows/ci.yml",
      ".github/workflows/ci.yml",
    ];
    const repo = makeRepo([
      ...files,
      ".github/workflows/ignored.yaml",
      "create/assets/other/.github/workflows/ci.yml",
      "templates/nested/web/.github/workflows/ci.yml",
      "docs/example.yml",
    ]);
    mkdirSync(join(repo, ".github/workflows/folder.yml"));
    expect(workflowFiles(repo)).toEqual([
      ".github/workflows/ci.yml",
      ".github/workflows/release.yml",
      "create/assets/combo/.github/workflows/ci.yml",
      "templates/fastapi/.github/workflows/ci.yml",
      "templates/nextjs/.github/workflows/ci.yml",
    ]);
  });

  it("아직 없는 템플릿과 조합 폴더는 건너뛴다", () => {
    expect(workflowFiles(makeRepo([".github/workflows/ci.yml"]))).toEqual([
      ".github/workflows/ci.yml",
    ]);
    expect(workflowFiles(makeRepo([]))).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`scripts`에서): `pnpm exec vitest run test/tools/install.test.ts test/verify-templates/verify.test.ts test/workflows/check.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× actionlint을 지원 플랫폼의 릴리스 자산으로 설치한다
× 빠진 명령을 잡고, 백엔드는 db 명령도 요구한다
× pnpm 백엔드는 e2e:serve가 있어야 통과한다
× uv 백엔드는 e2e:serve가 있어야 통과한다
× frontend의 CI와 줄바꿈 설정이 없거나 폴더면 거부한다
× backend의 CI와 줄바꿈 설정이 없거나 폴더면 거부한다
FAIL  test/workflows/check.test.ts [ test/workflows/check.test.ts ]
Error: Cannot find module '../../src/workflows/check.ts' imported from scripts/test/workflows/check.test.ts
Test Files 3 failed (3)
Tests 6 failed | 21 passed (27)
```

- [ ] **Step 3: 저장소 설정을 고친다**

`package.json`를 고친다.

찾을 부분:

```json
    "check:lint": "eslint .",
    "check:agents-md": "tsx scripts/src/agents-md/cli.ts .",
    "check:templates": "tsx scripts/src/verify-templates/cli.ts",
    "fix": "prettier --write . && eslint --fix .",
    "test": "pnpm -r run test",
    "gen": "pnpm -r run gen",
```

바꿀 내용:

```json
    "check:lint": "eslint .",
    "check:agents-md": "tsx scripts/src/agents-md/cli.ts .",
    "check:templates": "tsx scripts/src/verify-templates/cli.ts",
    "check:workflows": "tsx scripts/src/workflows/cli.ts",
    "fix": "prettier --write . && eslint --fix .",
    "test": "pnpm -r run test",
    "gen": "pnpm -r run gen",
```

`scripts/shared-assets.json` 전체를 다음으로 바꾼다.

```json
{
  "assets": [
    {
      "source": ".gitattributes",
      "targets": [
        { "template": "fastapi", "path": ".gitattributes" },
        { "template": "nextjs", "path": ".gitattributes" }
      ]
    },
    {
      "source": ".editorconfig",
      "targets": [
        { "template": "fastapi", "path": ".editorconfig" },
        { "template": "nextjs", "path": ".editorconfig" }
      ]
    },
    {
      "source": "contract/api-style/dist/lint.mjs",
      "targets": [{ "template": "fastapi", "path": "api-style/lint.mjs" }]
    },
    { "source": "contract/mock", "targets": [{ "template": "nextjs", "path": "contract/mock" }] },
    {
      "source": "contract/typespec",
      "targets": [{ "template": "nextjs", "path": "contract/typespec" }]
    },
    {
      "source": "contract/openapi.yaml",
      "targets": [{ "template": "nextjs", "path": "contract/openapi.yaml" }]
    },
    {
      "source": "docs/conventions/jsonapi.md",
      "targets": [{ "template": "nextjs", "path": "docs/conventions/jsonapi.md" }]
    },
    {
      "source": "docs/conventions/error-codes.md",
      "targets": [{ "template": "nextjs", "path": "docs/conventions/error-codes.md" }]
    }
  ]
}
```

- [ ] **Step 4: 저장소 스크립트를 만들고 고친다**

`scripts/src/tools/manifest.ts`를 고친다.

찾을 부분:

```ts
      },
    },
  },
} as const satisfies Record<string, ToolSpec>;

export type ToolName = keyof typeof TOOLS;
```

바꿀 내용:

```ts
      },
    },
  },
  actionlint: {
    name: "actionlint",
    version: "1.7.12",
    repo: "rhysd/actionlint",
    tag: "v1.7.12",
    binary: "actionlint",
    assets: {
      "win32-x64": {
        file: "actionlint_1.7.12_windows_amd64.zip",
        sha256: "6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9",
      },
      "linux-x64": {
        file: "actionlint_1.7.12_linux_amd64.tar.gz",
        sha256: "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
      },
      "linux-arm64": {
        file: "actionlint_1.7.12_linux_arm64.tar.gz",
        sha256: "325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6",
      },
      "darwin-x64": {
        file: "actionlint_1.7.12_darwin_amd64.tar.gz",
        sha256: "5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644",
      },
      "darwin-arm64": {
        file: "actionlint_1.7.12_darwin_arm64.tar.gz",
        sha256: "aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f",
      },
    },
  },
} as const satisfies Record<string, ToolSpec>;

export type ToolName = keyof typeof TOOLS;
```

`scripts/src/verify-templates/manifest.ts`를 고친다.

찾을 부분:

```ts
}

export const BASE_COMMANDS = ["setup", "dev", "check", "fix", "test", "test:e2e", "gen"];
export const BACKEND_COMMANDS = ["db:migrate", "db:reset"];

export function requiredCommands(manifest: TemplateManifest): string[] {
  return manifest.kind === "backend" ? [...BASE_COMMANDS, ...BACKEND_COMMANDS] : BASE_COMMANDS;
```

바꿀 내용:

```ts
}

export const BASE_COMMANDS = ["setup", "dev", "check", "fix", "test", "test:e2e", "gen"];
export const BACKEND_COMMANDS = ["db:migrate", "db:reset", "e2e:serve"];

export function requiredCommands(manifest: TemplateManifest): string[] {
  return manifest.kind === "backend" ? [...BASE_COMMANDS, ...BACKEND_COMMANDS] : BASE_COMMANDS;
```

`scripts/src/verify-templates/verify.ts`를 고친다.

찾을 부분:

```ts

function requiredFileProblems(dir: string, manifest: TemplateManifest): string[] {
  const problems: string[] = [];
  if (!existsSync(join(dir, ".env.example"))) problems.push(".env.example이 없다.");
  const recipes = listFiles(join(dir, "docs", "recipes")).filter((file) => file.endsWith(".md"));
  if (recipes.length === 0) problems.push("docs/recipes/에 레시피(.md)가 하나도 없다.");
```

바꿀 내용:

```ts

function requiredFileProblems(dir: string, manifest: TemplateManifest): string[] {
  const problems: string[] = [];
  for (const file of [".github/workflows/ci.yml", ".gitattributes"]) {
    const path = join(dir, file);
    if (!existsSync(path) || !statSync(path).isFile()) {
      problems.push(`${file}이 없다 — 템플릿 루트에 파일을 만든다.`);
    }
  }
  if (!existsSync(join(dir, ".env.example"))) problems.push(".env.example이 없다.");
  const recipes = listFiles(join(dir, "docs", "recipes")).filter((file) => file.endsWith(".md"));
  if (recipes.length === 0) problems.push("docs/recipes/에 레시피(.md)가 하나도 없다.");
```

`scripts/src/workflows/check.ts`:

```ts
import { globSync, statSync } from "node:fs";
import { join } from "node:path";

/** 저장소와 생성 프로젝트의 워크플로 원본만 고른다. 아직 없는 폴더는 건너뛴다. */
export function workflowFiles(root: string): string[] {
  return globSync(
    [
      ".github/workflows/*.yml",
      "templates/*/.github/workflows/*.yml",
      "create/assets/combo/.github/workflows/*.yml",
    ],
    { cwd: root },
  )
    .filter((file) => statSync(join(root, file)).isFile())
    .map((file) => file.replaceAll("\\", "/"))
    .sort();
}
```

`scripts/src/workflows/cli.ts`:

```ts
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ensureTool } from "../tools/install.ts";
import { TOOLS } from "../tools/manifest.ts";
import { workflowFiles } from "./check.ts";

const root = process.cwd();
try {
  const files = workflowFiles(root);
  if (files.length > 0) {
    const binary = await ensureTool(
      TOOLS.actionlint,
      join(root, "node_modules/.cache/ai-template-tools"),
    );
    // 별도 설치가 필요한 shellcheck·pyflakes는 끈다. 모든 OS에서 같은 actionlint 검사를 한다.
    const result = spawnSync(binary, ["-shellcheck=", "-pyflakes=", ...files], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) {
      const output = `${result.stdout}${result.stderr}`.trim();
      console.error(output || "워크플로 검사 실패 — pnpm tool actionlint로 파일을 검사한다.");
      process.exit(1);
    }
  }
  console.log(`워크플로 검사 통과: ${String(files.length)}개`);
} catch (error) {
  console.error(
    `워크플로 검사 실행 실패: ${error instanceof Error ? error.message : String(error)} — 도구 설치와 워크플로 파일을 확인한다.`,
  );
  process.exitCode = 1;
}
```

- [ ] **Step 5: FastAPI 템플릿 CI를 만든다**

`templates/fastapi/.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: astral-sh/setup-uv@c18668ad3cf93ea998bef934396af7bb5c839dc7 # v10.2.0
        with:
          version: "0.12.19"
      - run: uv sync --locked
      - run: uv run poe setup
      - run: uv run poe check
      - run: uv run poe test:e2e
      - run: docker build .
```

- [ ] **Step 6: web 템플릿 CI를 만든다**

`templates/nextjs/.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
        with:
          version: "12.6.0"
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm check
      - run: pnpm test:e2e
        env:
          E2E_TARGET: mock
      - run: docker build --tag web:ci .
```

- [ ] **Step 7: 저장소 문서를 고친다**

`AGENTS.md`를 고친다.

찾을 부분:

```markdown
| `pnpm web-e2e fastapi`                            | 전용 `ai-template-web-e2e-<ID>` 스택과 web(3100)에서 같은 E2E 20개를 실행한 뒤 그 스택·볼륨과 실행 이미지 `ai-template-web-e2e-fastapi:<ID>`를 정리한다. `--smoke`, `--print`, `--keep`, `--run-id <ID>`, `--down`은 [실행기 문서](scripts/src/web-e2e/README.md)를 따른다                        |
| `pnpm --dir templates/nextjs gen:feature <이름>`  | 골든 posts와 화면·번역·테스트를 복사하고 로그인 보호 경로를 등록한다                                                                                                                                                                                                                              |
| `pnpm --dir templates/nextjs gen`                 | web 사본의 TypeSpec 계약과 API·실시간·에러·목 타입 생성                                                                                                                                                                                                                                           |
| `pnpm tool <oasdiff\|betterleaks>`                | 버전을 고정한 바이너리를 받아 실행한다                                                                                                                                                                                                                                                            |
| `pnpm spec-compare [--subset] <계약> <구현>`      | 백엔드 스펙이 계약과 이름·경로·operation별 응답 상태·실시간 선언이 같고 계약을 깨지 않는지 본다. `--subset`은 구현 도중에 구현한 operation만 비교한다                                                                                                                                             |
| `pnpm conformance <대상> [--keep] [흐름 파일...]` | 대상을 띄우고 적합성 흐름 테스트를 돌린 뒤 내린다. `fastapi`는 compose로 띄우고(Docker 필요) 템플릿의 개발 인프라와 같은 compose 프로젝트를 써서 개발 DB에 마이그레이션과 시드를 실행한다(끝나면 개발 인프라도 내려간다). `mock`은 목 서버를 로컬 프로세스로 띄운다. 흐름 파일을 주면 그것만 돈다 |

```

바꿀 내용:

```markdown
| `pnpm web-e2e fastapi`                            | 전용 `ai-template-web-e2e-<ID>` 스택과 web(3100)에서 같은 E2E 20개를 실행한 뒤 그 스택·볼륨과 실행 이미지 `ai-template-web-e2e-fastapi:<ID>`를 정리한다. `--smoke`, `--print`, `--keep`, `--run-id <ID>`, `--down`은 [실행기 문서](scripts/src/web-e2e/README.md)를 따른다                        |
| `pnpm --dir templates/nextjs gen:feature <이름>`  | 골든 posts와 화면·번역·테스트를 복사하고 로그인 보호 경로를 등록한다                                                                                                                                                                                                                              |
| `pnpm --dir templates/nextjs gen`                 | web 사본의 TypeSpec 계약과 API·실시간·에러·목 타입 생성                                                                                                                                                                                                                                           |
| `pnpm tool <oasdiff\|betterleaks\|actionlint>`    | 버전을 고정한 바이너리를 받아 실행한다                                                                                                                                                                                                                                                            |
| `pnpm spec-compare [--subset] <계약> <구현>`      | 백엔드 스펙이 계약과 이름·경로·operation별 응답 상태·실시간 선언이 같고 계약을 깨지 않는지 본다. `--subset`은 구현 도중에 구현한 operation만 비교한다                                                                                                                                             |
| `pnpm conformance <대상> [--keep] [흐름 파일...]` | 대상을 띄우고 적합성 흐름 테스트를 돌린 뒤 내린다. `fastapi`는 compose로 띄우고(Docker 필요) 템플릿의 개발 인프라와 같은 compose 프로젝트를 써서 개발 DB에 마이그레이션과 시드를 실행한다(끝나면 개발 인프라도 내려간다). `mock`은 목 서버를 로컬 프로세스로 띄운다. 흐름 파일을 주면 그것만 돈다 |

```

`docs/harness/standard.md`를 고친다.

(1) 찾을 부분:

```markdown
| `fix`        | 포맷과 자동 수정 가능한 린트                                                 | 모두   |
| `test`       | 테스트(E2E 제외)                                                             | 모두   |
| `test:e2e`   | E2E                                                                          | 모두   |
| `gen`        | 코드 생성(OpenAPI 내보내기, 클라이언트·타입, ORM 클라이언트)                 | 모두   |
| `db:migrate` | 마이그레이션 적용                                                            | 백엔드 |
| `db:reset`   | 로컬 DB를 마이그레이션과 시드 상태로 되돌린다                                | 백엔드 |
```

바꿀 내용:

```markdown
| `fix`        | 포맷과 자동 수정 가능한 린트                                                 | 모두   |
| `test`       | 테스트(E2E 제외)                                                             | 모두   |
| `test:e2e`   | E2E                                                                          | 모두   |
| `e2e:serve`  | E2E 백엔드를 띄우고 받은 명령을 실행한 뒤 내린다. 조합 프로젝트의 web E2E용  | 백엔드 |
| `gen`        | 코드 생성(OpenAPI 내보내기, 클라이언트·타입, ORM 클라이언트)                 | 모두   |
| `db:migrate` | 마이그레이션 적용                                                            | 백엔드 |
| `db:reset`   | 로컬 DB를 마이그레이션과 시드 상태로 되돌린다                                | 백엔드 |
```

(2) 찾을 부분:

```markdown
## 최종 안전망

- lefthook: pre-commit에서 스테이징된 파일을 포맷·린트하고 Betterleaks로 비밀을 스캔한다. pre-push에서 `check`를 돌린다.
- CI: `check`, `test:e2e`, Docker 이미지 빌드.

## 공유 자산

```

바꿀 내용:

```markdown
## 최종 안전망

- lefthook: pre-commit에서 스테이징된 파일을 포맷·린트하고 Betterleaks로 비밀을 스캔한다. pre-push에서 `check`를 돌린다.
- CI: `check`, `test:e2e`, Docker 이미지 빌드. 생성 프로젝트도 자기 CI에서 같은 검사를 돈다.

## 공유 자산

```

(3) 찾을 부분:

```markdown

1. `template.json`이 있고 형식이 맞다.
2. 지침 파일 짝, CLAUDE.md 내용, 루트 AGENTS.md 길이.
3. 템플릿 종류에 맞는 명령 어휘가 모두 있다.
4. `.claude/settings.json`에 `PostToolUse`, `Stop`, `PreToolUse`, `SessionStart` hook이 exec form으로 있다.
5. `.env.example`, `docs/recipes/*.md`, 골든 모듈 폴더가 있다.
6. 공유 자산 사본이 원본과 같다.
```

바꿀 내용:

```markdown

1. `template.json`이 있고 형식이 맞다.
2. 지침 파일 짝, CLAUDE.md 내용, 루트 AGENTS.md 길이.
3. 템플릿 종류에 맞는 명령 어휘가 모두 있다. 백엔드는 `e2e:serve`도 요구한다.
4. `.claude/settings.json`에 `PostToolUse`, `Stop`, `PreToolUse`, `SessionStart` hook이 exec form으로 있다.
5. `.env.example`, `.github/workflows/ci.yml`, `.gitattributes`, `docs/recipes/*.md`, 골든 모듈 폴더가 있다.
6. 공유 자산 사본이 원본과 같다.
```

- [ ] **Step 8: 사본을 맞춘다**

공유 자산 사본을 만든다. 템플릿의 사본은 이 명령이 만든다(직접 고치지 않는다).

Run(저장소 루트에서): `pnpm sync`

Expected: 복사한 항목마다 `원본 → 사본` 한 줄.

- [ ] **Step 9: 테스트가 통과하는지 확인한다**

Run(`scripts`에서): `pnpm exec vitest run test/tools/install.test.ts test/verify-templates/verify.test.ts test/workflows/check.test.ts`

Expected: 통과한다.

```text
Test Files 3 passed (3)
Tests 29 passed (29)
```

- [ ] **Step 10: actionlint와 워크플로 검사를 확인한다**

Run(저장소 루트에서): `pnpm tool actionlint -version`

Expected: 첫 줄이 `1.7.12`다. 처음 실행하면 릴리스 자산을 받아 sha256을 확인한다.

Run(저장소 루트에서): `pnpm run -s check:workflows`

Expected: `워크플로 검사 통과: 3개`(루트와 두 템플릿). 조합 워크플로가 생기는 Task 7부터는 4개다.

- [ ] **Step 11: 검사를 돌린다**

Run(`templates/nextjs`에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 모든 단계를 다시 돌리려면 `templates/nextjs/.cache/check.json`을 지운다.

Run(`templates/nextjs`에서): `pnpm build`

Expected: `Compiled successfully`.

Run(`templates/nextjs`에서): `pnpm test:e2e`

Expected: `20 passed`(목 대상, 걸린 시간은 다르다).

Run(`templates/fastapi`에서): `uv sync --frozen && uv run ruff check . && uv run ruff format --check . && uv run basedpyright && uv run python -m tools.checks architecture && uv run python -m tools.checks harness`

Expected: 오류 없이 끝난다. 개발 인프라(DB·Valkey)가 필요한 FastAPI 테스트와 `poe check`는 CI가 돌린다. 로컬에서 `uv run poe setup|check|test|test:e2e|e2e:serve`나 `templates/fastapi`의 compose를 쓰지 않는다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 10단계`로 시작하는 한 줄

- [ ] **Step 12: 커밋한다**

```bash
git add \
  AGENTS.md \
  docs/harness/standard.md \
  package.json \
  scripts/shared-assets.json \
  scripts/src/tools/manifest.ts \
  scripts/src/verify-templates/manifest.ts \
  scripts/src/verify-templates/verify.ts \
  scripts/src/workflows/check.ts \
  scripts/src/workflows/cli.ts \
  scripts/test/tools/install.test.ts \
  scripts/test/verify-templates/verify.test.ts \
  scripts/test/workflows/check.test.ts \
  templates/fastapi/.editorconfig \
  templates/fastapi/.gitattributes \
  templates/fastapi/.github/workflows/ci.yml \
  templates/nextjs/.editorconfig \
  templates/nextjs/.gitattributes \
  templates/nextjs/.github/workflows/ci.yml
git commit -m "feat(harness): validate standalone template workflows"
```


### Task 4: create CLI: 단독 생성

설계 §3·§4·§8.1. 새 workspace 패키지 `create/`(`@ai-template/create`)가 `pnpm new <대상> --template <fastapi|nextjs>`로 단독 프로젝트를 만든다. 조합 플래그는 형식만 검사하고 생성은 Task 5에서 한다.

- 패키지는 `scripts/`처럼 공통 strict tsconfig를 확장하고 `src`·`test`를 포함해 루트 ESLint의 project service가 모든 파일을 찾는다. `typecheck`·`test`·`check` 스크립트와 Vitest를 쓴다. 루트 workspace에 `create`를, 루트 package.json에 `"new": "tsx create/src/cli.ts"`를 더한다. 잠금 파일은 create importer의 `yaml: 2.9.1`만 바뀌고, 루트 check가 패키지를 자동으로 포함해 11단계가 된다.
- 입력은 `node:util`의 `parseArgs`다. 상대 대상은 `INIT_CWD`, 없으면 현재 폴더 기준이다. 이름은 `--name` 또는 대상 폴더 이름이며 `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`에 50자 이하다. 중복 옵션·대상 개수·틀린 플래그도 거절한다. 사용법 오류는 2, 나머지는 1이고 출력은 `pnpm new: <문제> — <고치는 방법>`이다.
- 저장소는 CLI 위치에서 찾고 `git rev-parse --show-toplevel`과 같은지 확인한다. 파일은 `git ls-files -z -- templates/<이름>`에서 `template.json`을 뺀 것이다. 추적 파일의 커밋하지 않은 변경만 거절하고 무추적 파일은 복사하지 않는다. index mode 100755로 POSIX 실행 비트를 보존한다.
- 대상의 경로나 기존 부모의 실제 경로(심볼릭 링크를 따라간 경로)가 저장소 안이면 거절한다. 비어 있지 않거나 일반 폴더가 아닌 대상도 거절하고, 빈 일반 폴더는 허용한다.
- 대상의 형제 임시 폴더 `aitpl-<이름>-XXXXXX`에서 복사하고 이름을 바꾼 뒤 옮긴다. 옮기기 직전에 대상을 다시 검사한다. 실패하면 임시 폴더나 옮긴 대상을 지운다.
- 이름은 README 첫 줄, nextjs `package.json`의 `name`, fastapi `compose.yaml`의 최상위 `name`과 `x-app` 이미지(`<이름>-app`)만 바꾼다. YAML은 파서가 준 값의 범위만 바꿔 주석·앵커·나머지 바이트를 보존한다.
- git은 `init -b main` 뒤 `chore: create <이름> from ai-template <short SHA>` 커밋이다. `git config --get`으로 설정된 `user.name`·`user.email`을 먼저 확인한다. `git var`만 보면 환경의 `EMAIL`로 추측한 신원으로 커밋하기 때문이다. 신원이 없으면 init만 하고 설정·커밋 방법을 안내한다. 서명 설정은 그대로 따르고 `--no-git`은 둘 다 건너뛴다.
- 픽스처는 POSIX에서 실행 파일의 작업 파일도 0755로 만든 뒤 `git add`하고, Windows용 `update-index --chmod=+x`를 유지한다. Linux git은 파일 모드를 비교하므로 작업 파일이 0644면 CLI가 커밋하지 않은 변경으로 거절한다. Windows는 모드를 무시해 PR CI에서야 드러났다.
- 실제 두 템플릿을 OS 임시 폴더에 만들어 `git ls-files`와 같은 파일 목록, 이름 바꾼 곳 밖의 바이트, 깨끗한 git 상태를 비교하는 테스트도 둔다.

실패 확인: 테스트가 쓰는 `src/arguments.ts`·`src/create.ts`가 없어 세 파일 모두 수집에서 실패한다(`Cannot find module`, `Tests no tests`). Vitest를 돌리려면 Step 3·4의 패키지 설정을 먼저 만들고 `pnpm install`로 잠금 파일을 갱신한다. `pnpm-lock.yaml`은 손으로 쓰지 않는다. GREEN은 `42 passed`다.

**Files:**
- Create: `create/package.json`, `create/src/arguments.ts`, `create/src/cli.ts`, `create/src/create.ts`, `create/src/errors.ts`, `create/src/git.ts`, `create/src/repository.ts`, `create/src/standalone.ts`, `create/tsconfig.json`, `create/vitest.config.ts`
- Modify: `AGENTS.md`, `package.json`, `pnpm-workspace.yaml`
- Test: `create/test/arguments.test.ts`, `create/test/helpers.ts`, `create/test/real-templates.test.ts`, `create/test/standalone.test.ts`
- Generated(직접 고치지 않는다): `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `scripts/src/files/git-environment.ts`의 `gitEnvironment(environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv`, Task 2의 `compose.yaml` 최상위 `name: fastapi`와 `x-app`의 `image: fastapi-template-app`, Task 3의 템플릿 CI·줄바꿈 파일, 루트 `tsconfig.base.json`·Vitest·tsx
- Produces:
  - 패키지 `@ai-template/create`(`typecheck`, `test`, `check`)와 루트 `pnpm new`
  - `errors.ts`: `class CreateError extends Error`(`readonly exitCode: 1 | 2`), `new CreateError(problem: string, remedy: string, exitCode: 1 | 2 = 1)`. 메시지는 `pnpm new: <problem> — <remedy>`
  - `arguments.ts`: `type Template = "fastapi" | "nextjs"`, `interface CreateOptions { readonly target: string; readonly name: string; readonly template: Template; readonly git: boolean }`, `usage`, `parseArguments(args: string[], environment?: NodeJS.ProcessEnv): CreateOptions | "help"`
  - `git.ts`: `runGit(cwd: string, args: string[]): string`, `initializeGit(target: string, name: string, sha: string): boolean`. `repository.ts`: `findRepository(cliLocation?: string): string`, `interface TemplateFile { readonly path: string; readonly executable: boolean }`, `templateFiles(repository: string, template: Template): TemplateFile[]`
  - `standalone.ts`: `renameStandalone(root: string, template: Template, name: string): void`. `create.ts`: `interface CreateResult { readonly target: string; readonly committed: boolean }`, `createProject(options: CreateOptions, repository: string): CreateResult`
  - `cli.ts`의 성공 출력 `생성 완료: <대상>`, `다음 명령: cd "<대상>"`, `uv run poe setup` 또는 `pnpm setup`
  - 테스트 도우미 `create/test/helpers.ts`: `temporaryFolder(): string`(OS 임시 폴더의 `aitpl-create-test-*`, 테스트 뒤 삭제), `write(root, file, content)`, `git(root, ...args)`, `fixtureRepository(): string`. 테스트마다 임시 `GIT_CONFIG_GLOBAL`의 신원을 쓴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`create/test/arguments.test.ts`:

```ts
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArguments } from "../src/arguments.ts";
import { CreateError } from "../src/errors.ts";

describe("CLI 입력", () => {
  it("상대 대상은 INIT_CWD에서 풀고 이름은 폴더에서 고른다", () => {
    expect(parseArguments(["my-web", "--template", "nextjs"], { INIT_CWD: "/caller" })).toEqual({
      target: resolve("/caller", "my-web"),
      name: "my-web",
      template: "nextjs",
      git: true,
    });
  });

  it("INIT_CWD가 없으면 현재 폴더를 쓰고 이름과 git 생략을 받는다", () => {
    expect(
      parseArguments(["Some Folder", "--template=fastapi", "--name", "my-api", "--no-git"], {}),
    ).toEqual({
      target: resolve("Some Folder"),
      name: "my-api",
      template: "fastapi",
      git: false,
    });
  });

  it("도움말은 대상이나 도구 없이 읽는다", () => {
    expect(parseArguments(["--help"], {})).toBe("help");
  });

  it.each(
    [
      [],
      ["my-app"],
      ["my-app", "--template", "nestjs"],
      ["my-app", "extra", "--template", "nextjs"],
      ["my-app", "--unknown"],
      ["my-app", "--template"],
      ["my-app", "--template", "nextjs", "--api", "fastapi", "--web"],
      ["my-app", "--api", "fastapi"],
      ["my-app", "--web"],
      ["my-app", "--api", "nestjs", "--web"],
      ["my-app", "--api", "fastapi", "--web"],
      ["my-app", "--template", "nextjs", "--template", "fastapi"],
      ["my-app", "--template", "nextjs", "--no-git=false"],
    ].map((args) => [args]),
  )("틀린 인자는 사용법 오류 2다: %j", (args) => {
    try {
      parseArguments(args, {});
      expect.fail("잘못된 인자는 거절해야 한다");
    } catch (error) {
      expect(error).toBeInstanceOf(CreateError);
      expect(error).toMatchObject({ exitCode: 2 });
      expect((error as Error).message).toMatch(/^pnpm new: .+ — .+$/);
    }
  });

  it.each(["Upper", "1app", "two_words", "two--words", "끝", "", "a".repeat(51), "app-"])(
    "사용할 수 없는 이름은 거절한다: %j",
    (name) => {
      expect(() => parseArguments(["target", "--template", "nextjs", "--name", name], {})).toThrow(
        CreateError,
      );
    },
  );

  it("50자 이름은 사용할 수 있다", () => {
    expect(
      parseArguments(["target", "--template", "fastapi", "--name", "a".repeat(50)], {}),
    ).toMatchObject({ name: "a".repeat(50) });
  });
});
```

`create/test/helpers.ts`:

```ts
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";

const folders: string[] = [];

export function temporaryFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "aitpl-create-test-"));
  folders.push(folder);
  return folder;
}

export function write(root: string, file: string, content: string): void {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    env: gitEnvironment(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

beforeEach(() => {
  const config = join(temporaryFolder(), "gitconfig");
  writeFileSync(
    config,
    "[user]\n\tname = Fixture\n\temail = fixture@example.com\n[commit]\n\tgpgsign = false\n",
  );
  vi.stubEnv("GIT_CONFIG_GLOBAL", config);
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  vi.stubEnv("GIT_CEILING_DIRECTORIES", tmpdir());
  // 호출한 hook의 신원 덮어쓰기를 빼고 임시 설정의 신원을 쓴다.
  for (const key of Object.keys(process.env)) {
    if (
      /^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$/.test(key) ||
      /^GIT_(AUTHOR|COMMITTER)_/.test(key)
    ) {
      vi.stubEnv(key, undefined);
    }
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

export function fixtureRepository(): string {
  const root = temporaryFolder();
  write(root, "templates/nextjs/README.md", "# Next.js web\n\n내용\n");
  write(
    root,
    "templates/nextjs/package.json",
    '{\n  "name": "nextjs-template",\n  "private": true\n}\n',
  );
  write(root, "templates/nextjs/pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  write(root, "templates/nextjs/template.json", "{}\n");
  write(root, "templates/nextjs/.gitattributes", "* text=auto eol=lf\n");
  write(root, "templates/nextjs/docs/공백 문서.md", "한국어\r\n바이트 보존\r\n");
  write(root, "templates/nextjs/bin/start.sh", "#!/bin/sh\necho ok\n");
  write(root, "templates/fastapi/README.md", "# FastAPI 템플릿\n\n내용\n");
  write(
    root,
    "templates/fastapi/compose.yaml",
    "# 프로젝트 이름\nname: fastapi\nx-app: &app\n  image: fastapi-template-app # 이미지\nservices:\n  api:\n    <<: *app\n  postgres:\n    image: postgres:18\n",
  );
  write(root, "templates/fastapi/pyproject.toml", '[project]\nname = "app"\n');
  write(root, "templates/fastapi/uv.lock", "version = 1\n");
  write(root, "templates/fastapi/template.json", "{}\n");
  // POSIX에서는 작업 파일도 인덱스와 같은 실행 권한을 갖게 한다.
  if (process.platform !== "win32") chmodSync(join(root, "templates/nextjs/bin/start.sh"), 0o755);
  git(root, "init", "-b", "main");
  git(root, "add", "--", "templates");
  git(root, "update-index", "--chmod=+x", "templates/nextjs/bin/start.sh");
  git(root, "-c", "commit.gpgsign=false", "commit", "-m", "chore: fixture");
  write(root, "templates/nextjs/untracked.txt", "복사하지 않는다\n");
  return root;
}
```

`create/test/real-templates.test.ts`:

```ts
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";
import { createProject } from "../src/create.ts";
import { git, temporaryFolder } from "./helpers.ts";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);

it("두 실제 템플릿의 파일 목록·이름·나머지 바이트와 git 상태를 확인한다", () => {
  const parent = temporaryFolder();
  for (const template of ["fastapi", "nextjs"] as const) {
    const name = `aitpl-real-${template}`;
    const target = join(parent, name);
    createProject({ target, name, template, git: true }, root);
    const expected = git(root, "ls-files", "-z", "--", `templates/${template}`)
      .split("\0")
      .filter(Boolean)
      .map((file) => file.slice(`templates/${template}/`.length))
      .filter((file) => file !== "template.json")
      .sort();
    expect(git(target, "ls-files", "-z").split("\0").filter(Boolean).sort()).toEqual(expected);
    expect(git(target, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(target, "README.md"), "utf8").split("\n")[0]).toBe(`# ${name}`);
    const renamed = template === "nextjs" ? "package.json" : "compose.yaml";
    for (const file of expected.filter((file) => !["README.md", renamed].includes(file))) {
      expect(readFileSync(join(target, file)), file).toEqual(
        readFileSync(join(root, "templates", template, file)),
      );
    }
    if (template === "nextjs") {
      expect(JSON.parse(readFileSync(join(target, "package.json"), "utf8"))).toMatchObject({
        name,
      });
    } else {
      const compose = readFileSync(join(target, "compose.yaml"), "utf8");
      expect(compose).toContain(`name: ${name}\n`);
      expect(compose).toContain(`image: ${name}-app\n`);
    }
  }
});

it("실제 CLI의 도움말·사용법 오류·실행 오류는 서로 다른 종료 코드다", () => {
  const parent = temporaryFolder();
  const run = (args: string[], env: NodeJS.ProcessEnv = process.env) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(require.resolve("tsx")).href,
        join(root, "create/src/cli.ts"),
        ...args,
      ],
      { cwd: parent, env: gitEnvironment(env), encoding: "utf8" },
    );
  const help = run(["--help"], { ...process.env, PATH: "" });
  expect(help.status, help.stderr).toBe(0);
  expect(help.stdout).toContain("사용법");
  const usage = run(["--template", "bad"]);
  expect(usage.status).toBe(2);
  expect(usage.stderr).toMatch(/pnpm new: .+ — .+/);
  const failure = run([root, "--template", "nextjs", "--name", "my-web"]);
  expect(failure.status).toBe(1);
  expect(failure.stderr).toMatch(/pnpm new: .*저장소.* — .+/);
  const success = run(["aitpl-cli", "--template", "nextjs", "--no-git"], {
    ...process.env,
    INIT_CWD: parent,
  });
  expect(success.status, success.stderr).toBe(0);
  expect(success.stdout).toContain(join(parent, "aitpl-cli"));
  expect(success.stdout).toContain("pnpm setup");
  expect(readdirSync(join(parent, "aitpl-cli"))).not.toContain(".git");
});
```

`create/test/standalone.test.ts`:

```ts
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createProject } from "../src/create.ts";
import { findRepository, templateFiles } from "../src/repository.ts";
import { fixtureRepository, git, temporaryFolder, write } from "./helpers.ts";

function request(target: string, template: "nextjs" | "fastapi" = "nextjs", initialize = true) {
  return { target, template, name: "my-project", git: initialize };
}

describe("단독 프로젝트", () => {
  it.each(["nextjs", "fastapi"] as const)(
    "%s의 파일만 만들고 main 첫 커밋을 남긴다",
    (template) => {
      const root = fixtureRepository();
      expect(git(root, "status", "--porcelain", "--untracked-files=no")).toBe("");
      if (template === "nextjs") {
        expect(templateFiles(root, template).find((file) => file.path === "bin/start.sh")).toEqual({
          path: "bin/start.sh",
          executable: true,
        });
      }
      const target = join(temporaryFolder(), "aitpl-app");
      const result = createProject(request(target, template), root);
      expect(result.committed).toBe(true);
      expect(git(target, "status", "--porcelain")).toBe("");
      expect(git(target, "branch", "--show-current").trim()).toBe("main");
      expect(git(target, "rev-list", "--count", "HEAD").trim()).toBe("1");
      expect(git(target, "log", "-1", "--format=%s").trim()).toBe(
        `chore: create my-project from ai-template ${git(root, "rev-parse", "--short", "HEAD").trim()}`,
      );
      expect(readFileSync(join(target, "README.md"), "utf8")).toBe("# my-project\n\n내용\n");
      expect(existsSync(join(target, "template.json"))).toBe(false);
      expect(existsSync(join(target, "untracked.txt"))).toBe(false);
      if (template === "nextjs") {
        expect(JSON.parse(readFileSync(join(target, "package.json"), "utf8"))).toEqual({
          name: "my-project",
          private: true,
        });
        expect(readFileSync(join(target, "docs/공백 문서.md"))).toEqual(
          readFileSync(join(root, "templates/nextjs/docs/공백 문서.md")),
        );
        expect(readFileSync(join(target, "pnpm-lock.yaml"))).toEqual(
          readFileSync(join(root, "templates/nextjs/pnpm-lock.yaml")),
        );
        if (process.platform !== "win32")
          expect(statSync(join(target, "bin/start.sh")).mode & 0o111).toBe(0o111);
      } else {
        expect(readFileSync(join(target, "compose.yaml"), "utf8")).toBe(
          "# 프로젝트 이름\nname: my-project\nx-app: &app\n  image: my-project-app # 이미지\nservices:\n  api:\n    <<: *app\n  postgres:\n    image: postgres:18\n",
        );
        expect(readFileSync(join(target, "pyproject.toml"), "utf8")).toBe(
          '[project]\nname = "app"\n',
        );
        expect(readFileSync(join(target, "uv.lock"))).toEqual(
          readFileSync(join(root, "templates/fastapi/uv.lock")),
        );
      }
    },
  );

  it("기존 빈 폴더에 git 없이 생성한다", () => {
    const root = fixtureRepository();
    const target = temporaryFolder();
    createProject(request(target, "nextjs", false), root);
    expect(existsSync(join(target, "package.json"))).toBe(true);
    expect(existsSync(join(target, ".git"))).toBe(false);
  });

  it("git 사용자 정보가 없으면 init만 남긴다", () => {
    const root = fixtureRepository();
    const config = join(temporaryFolder(), "empty-config");
    writeFileSync(config, "");
    vi.stubEnv("GIT_CONFIG_GLOBAL", config);
    vi.stubEnv("EMAIL", "implicit@example.com");
    const target = join(temporaryFolder(), "aitpl-app");
    expect(createProject(request(target), root).committed).toBe(false);
    expect(existsSync(join(target, ".git"))).toBe(true);
    expect(git(target, "status", "--porcelain")).toContain("?? README.md");
  });

  it("hook의 git 환경이 원본과 생성 대상의 저장소를 바꾸지 않는다", () => {
    const root = fixtureRepository();
    const before = readFileSync(join(root, ".git/config"));
    for (const key of [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_COMMON_DIR",
      "GIT_NAMESPACE",
      "GIT_PREFIX",
    ]) {
      vi.stubEnv(key, join(root, "wrong"));
    }
    const target = join(temporaryFolder(), "aitpl-app");
    createProject(request(target), root);
    expect(git(target, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(root, ".git/config"))).toEqual(before);
    expect(findRepository(pathToFileURL(join(root, "create/src/cli.ts")).href)).toBe(root);
  });

  it("CLI 위치에서 계산한 루트가 git 루트와 다르면 거절한다", () => {
    const root = fixtureRepository();
    write(root, "nested/create/src/cli.ts", "");
    expect(() =>
      findRepository(pathToFileURL(join(root, "nested/create/src/cli.ts")).href),
    ).toThrow(/배치/);
  });

  it.each(["unstaged", "staged", "deleted"])("추적 파일 변경을 거절한다: %s", (change) => {
    const root = fixtureRepository();
    write(root, "templates/nextjs/README.md", "# changed\n");
    if (change === "staged") git(root, "add", "templates/nextjs/README.md");
    if (change === "deleted") git(root, "rm", "-f", "templates/nextjs/README.md");
    const target = join(temporaryFolder(), "aitpl-app");
    expect(() => createProject(request(target), root)).toThrow(/커밋/);
    expect(existsSync(target)).toBe(false);
  });

  it("선택하지 않은 템플릿의 변경은 허용한다", () => {
    const root = fixtureRepository();
    write(root, "templates/fastapi/README.md", "# changed\n");
    expect(templateFiles(root, "nextjs").map((file) => file.path)).toContain("docs/공백 문서.md");
  });

  it("비어 있지 않은 대상과 파일을 보존하며 거절한다", () => {
    const root = fixtureRepository();
    const target = temporaryFolder();
    write(target, "keep.txt", "keep\n");
    expect(() => createProject(request(target), root)).toThrow(/비어|대상/);
    expect(readdirSync(target)).toEqual(["keep.txt"]);
    expect(() => createProject(request(join(target, "keep.txt")), root)).toThrow(/대상/);
  });

  it("저장소 안이나 링크를 거쳐 저장소 안에 생성하는 것을 거절한다", () => {
    const root = fixtureRepository();
    expect(() => createProject(request(join(root, "aitpl-nested")), root)).toThrow(/저장소/);
    const outside = temporaryFolder();
    symlinkSync(root, join(outside, "link"), process.platform === "win32" ? "junction" : "dir");
    expect(() => createProject(request(join(outside, "link/aitpl-nested")), root)).toThrow(
      /저장소/,
    );
    expect(existsSync(join(root, "aitpl-nested"))).toBe(false);
  });

  it("복사 뒤 이름 변경 실패도 임시 폴더를 정리한다", () => {
    const root = fixtureRepository();
    write(root, "templates/nextjs/package.json", "invalid json\n");
    git(root, "add", "templates");
    git(root, "-c", "commit.gpgsign=false", "commit", "-m", "chore: invalid fixture");
    const parent = temporaryFolder();
    expect(() => createProject(request(join(parent, "aitpl-app")), root)).toThrow();
    expect(readdirSync(parent)).toEqual([]);
  });

  it("서명 설정을 따르고 커밋 실패 시 생성 대상을 정리한다", () => {
    const root = fixtureRepository();
    const config = process.env.GIT_CONFIG_GLOBAL;
    if (!config) throw new Error("fixture 설정이 없다");
    writeFileSync(
      config,
      "[user]\nname = Fixture\nemail = fixture@example.com\n[commit]\ngpgsign = true\n[gpg]\nprogram = aitpl-missing-signing-program\n",
    );
    const parent = temporaryFolder();
    expect(() => createProject(request(join(parent, "aitpl-app")), root)).toThrow(/git/);
    expect(readdirSync(parent)).toEqual([]);
  });

  it("git이 없으면 대상도 만들지 않는다", () => {
    const root = fixtureRepository();
    vi.stubEnv("PATH", "");
    const parent = temporaryFolder();
    expect(() => createProject(request(join(parent, "aitpl-app")), root)).toThrow(/git.*설치/);
    expect(readdirSync(parent)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

새 패키지의 설정(`create/package.json`, `create/tsconfig.json`, `create/vitest.config.ts`, `package.json`, `pnpm-workspace.yaml`)을 아래 단계의 내용으로 먼저 만들고 `pnpm install`을 돌린 뒤 실행한다. `pnpm-lock.yaml`은 `pnpm install`이 갱신한다(손으로 쓰지 않는다). 구현 모듈은 아직 없다.

Run(`create`에서): `pnpm exec vitest run test/arguments.test.ts test/real-templates.test.ts test/standalone.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
FAIL  test/arguments.test.ts [ test/arguments.test.ts ]
Error: Cannot find module '../src/arguments.ts' imported from create/test/arguments.test.ts
FAIL  test/real-templates.test.ts [ test/real-templates.test.ts ]
Error: Cannot find module '../src/create.ts' imported from create/test/real-templates.test.ts
FAIL  test/standalone.test.ts [ test/standalone.test.ts ]
Error: Cannot find module '../src/create.ts' imported from create/test/standalone.test.ts
Test Files 3 failed (3)
Tests no tests
```

- [ ] **Step 3: 저장소 설정을 고친다**

`package.json`를 고친다.

찾을 부분:

```json
  },
  "scripts": {
    "prepare": "lefthook install",
    "check": "tsx scripts/src/check/cli.ts",
    "check:format": "prettier --check .",
    "check:lint": "eslint .",
```

바꿀 내용:

```json
  },
  "scripts": {
    "prepare": "lefthook install",
    "new": "tsx create/src/cli.ts",
    "check": "tsx scripts/src/check/cli.ts",
    "check:format": "prettier --check .",
    "check:lint": "eslint .",
```

`pnpm-workspace.yaml` 전체를 다음으로 바꾼다.

```yaml
packages:
  - contract/*
  - scripts
  - create
allowBuilds:
  esbuild: true
  lefthook: false
```

- [ ] **Step 4: create 패키지 설정을 만든다**

`create/package.json`:

```json
{
  "name": "@ai-template/create",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "check": "pnpm run typecheck && pnpm run test"
  },
  "dependencies": {
    "yaml": "2.9.1"
  }
}
```

`create/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`create/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 5: create CLI 코드를 만든다**

`create/src/arguments.ts`:

```ts
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CreateError } from "./errors.ts";

export type Template = "fastapi" | "nextjs";

export interface CreateOptions {
  readonly target: string;
  readonly name: string;
  readonly template: Template;
  readonly git: boolean;
}

export const usage = `사용법:
  pnpm new <대상 폴더> --template <fastapi|nextjs> [--name <이름>] [--no-git]
  pnpm new --help

이름은 소문자로 시작하는 kebab-case이며 50자 이하다.
상대 경로는 명령을 실행한 폴더 기준이다.
`;

export function parseArguments(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): CreateOptions | "help" {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      tokens: true,
      options: {
        help: { type: "boolean" },
        template: { type: "string" },
        name: { type: "string" },
        "no-git": { type: "boolean" },
        api: { type: "string" },
        web: { type: "boolean" },
      },
    });
  } catch {
    throw new CreateError("인자가 올바르지 않다", "pnpm new --help로 사용법을 확인한다.", 2);
  }
  const seen = new Set<string>();
  for (const token of parsed.tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) {
      throw new CreateError(`--${token.name}을 여러 번 지정했다`, "각 옵션은 한 번만 지정한다.", 2);
    }
    seen.add(token.name);
  }
  const { values, positionals } = parsed;
  if (values.help) return "help";
  if (values.template !== undefined && (values.api !== undefined || values.web)) {
    throw new CreateError(
      "단독과 조합 옵션을 함께 지정했다",
      "--template 또는 --api와 --web을 고른다.",
      2,
    );
  }
  if (values.api !== undefined || values.web) {
    if (values.api !== "fastapi" || !values.web) {
      throw new CreateError(
        "조합 옵션이 올바르지 않다",
        "--api fastapi와 --web을 함께 지정한다.",
        2,
      );
    }
    throw new CreateError(
      "조합 생성은 아직 준비되지 않았다",
      "단독 생성에는 --template을 지정한다.",
      2,
    );
  }
  if (positionals.length !== 1 || !positionals[0]) {
    throw new CreateError(
      "대상 폴더 하나가 필요하다",
      "pnpm new <대상 폴더> --template <fastapi|nextjs>로 실행한다.",
      2,
    );
  }
  if (values.template !== "fastapi" && values.template !== "nextjs") {
    throw new CreateError(
      "템플릿이 올바르지 않다",
      "--template fastapi 또는 --template nextjs를 지정한다.",
      2,
    );
  }
  const target = resolve(environment.INIT_CWD ?? process.cwd(), positionals[0]);
  const name = values.name ?? basename(target);
  if (name.length > 50 || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    throw new CreateError(
      "이름이 올바르지 않다",
      "--name에 소문자로 시작하는 50자 이하 kebab-case 이름을 지정한다.",
      2,
    );
  }
  return { target, name, template: values.template, git: !values["no-git"] };
}
```

`create/src/cli.ts`:

```ts
import { parseArguments, usage } from "./arguments.ts";
import { createProject } from "./create.ts";
import { CreateError } from "./errors.ts";
import { findRepository } from "./repository.ts";

try {
  const options = parseArguments(process.argv.slice(2));
  if (options === "help") {
    console.log(usage);
  } else {
    const result = createProject(options, findRepository(import.meta.url));
    console.log(`생성 완료: ${result.target}`);
    if (options.git && !result.committed) {
      console.log(
        "git 사용자 정보가 없다 — git config user.name과 git config user.email을 설정한 뒤 git add .과 git commit을 실행한다.",
      );
    }
    console.log(`다음 명령: cd "${result.target}"`);
    console.log(options.template === "fastapi" ? "uv run poe setup" : "pnpm setup");
  }
} catch (error) {
  const failure =
    error instanceof CreateError
      ? error
      : new CreateError(
          "프로젝트 생성에 실패했다",
          "템플릿 파일 형식과 대상 폴더의 쓰기 권한을 확인한다.",
        );
  console.error(failure.message);
  process.exitCode = failure.exitCode;
}
```

`create/src/create.ts`:

```ts
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
```

`create/src/errors.ts`:

```ts
export class CreateError extends Error {
  readonly exitCode: 1 | 2;

  constructor(problem: string, remedy: string, exitCode: 1 | 2 = 1) {
    super(`pnpm new: ${problem} — ${remedy}`);
    this.name = "CreateError";
    this.exitCode = exitCode;
  }
}
```

`create/src/git.ts`:

```ts
import { spawnSync } from "node:child_process";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";
import { CreateError } from "./errors.ts";

export function runGit(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    env: gitEnvironment(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error && "code" in result.error && result.error.code === "ENOENT") {
    throw new CreateError("git을 찾을 수 없다", "git을 설치하고 PATH에 추가한다.");
  }
  if (result.error || result.status !== 0) {
    throw new CreateError(
      `git ${args[0] ?? ""} 실행에 실패했다`,
      "git 저장소·사용자 설정·서명 설정과 쓰기 권한을 확인한다.",
    );
  }
  return result.stdout;
}

export function initializeGit(target: string, name: string, sha: string): boolean {
  runGit(target, ["init", "-b", "main"]);
  // 자동 추측한 신원으로 커밋하지 않고 사용자가 설정한 신원을 확인한다.
  try {
    if (!runGit(target, ["config", "--get", "user.name"]).trim()) return false;
    if (!runGit(target, ["config", "--get", "user.email"]).trim()) return false;
    runGit(target, ["var", "GIT_AUTHOR_IDENT"]);
    runGit(target, ["var", "GIT_COMMITTER_IDENT"]);
  } catch {
    return false;
  }
  runGit(target, ["add", "--all"]);
  runGit(target, ["commit", "-m", `chore: create ${name} from ai-template ${sha}`]);
  return true;
}
```

`create/src/repository.ts`:

```ts
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Template } from "./arguments.ts";
import { CreateError } from "./errors.ts";
import { runGit } from "./git.ts";

export function findRepository(cliLocation: string = import.meta.url): string {
  const expected = realpathSync(resolve(dirname(fileURLToPath(cliLocation)), "../.."));
  const actual = realpathSync(runGit(expected, ["rev-parse", "--show-toplevel"]).trim());
  if (actual !== expected) {
    throw new CreateError(
      "CLI의 저장소 배치가 올바르지 않다",
      "ai-template 저장소의 create/src에서 실행한다.",
    );
  }
  return actual;
}

export interface TemplateFile {
  readonly path: string;
  readonly executable: boolean;
}

export function templateFiles(repository: string, template: Template): TemplateFile[] {
  const prefix = `templates/${template}/`;
  if (
    runGit(repository, [
      "status",
      "--porcelain",
      "--untracked-files=no",
      "--",
      `templates/${template}`,
    ]).trim()
  ) {
    throw new CreateError(
      `${template} 템플릿에 커밋하지 않은 변경이 있다`,
      "템플릿 변경을 커밋하거나 되돌린 뒤 실행한다.",
    );
  }
  const files = runGit(repository, ["ls-files", "-z", "--", `templates/${template}`])
    .split("\0")
    .filter(Boolean)
    .filter((file) => file !== `${prefix}template.json`);
  const modes = new Map(
    runGit(repository, ["ls-files", "--stage", "-z", "--", `templates/${template}`])
      .split("\0")
      .filter(Boolean)
      .map((entry) => {
        const tab = entry.indexOf("\t");
        return [entry.slice(tab + 1), entry.slice(0, 6)];
      }),
  );
  if (files.length === 0) {
    throw new CreateError(
      `${template} 템플릿의 추적 파일이 없다`,
      "템플릿이 포함된 저장소에서 실행한다.",
    );
  }
  return files.map((file) => {
    const mode = modes.get(file);
    if (mode !== "100644" && mode !== "100755") {
      throw new CreateError(`${file}은 일반 파일이 아니다`, "템플릿에는 일반 파일만 커밋한다.");
    }
    return { path: file.slice(prefix.length), executable: mode === "100755" };
  });
}
```

`create/src/standalone.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMap, isScalar, parseDocument } from "yaml";
import type { Template } from "./arguments.ts";
import { CreateError } from "./errors.ts";

export function renameStandalone(root: string, template: Template, name: string): void {
  const readme = join(root, "README.md");
  const content = readFileSync(readme, "utf8");
  writeFileSync(readme, content.replace(/^[^\r\n]*/, `# ${name}`));
  if (template === "nextjs") {
    const path = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    pkg.name = name;
    writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  } else {
    const path = join(root, "compose.yaml");
    const source = readFileSync(path, "utf8");
    const doc = parseDocument(source);
    if (doc.errors.length)
      throw new CreateError("compose.yaml이 올바르지 않다", "템플릿의 YAML 문법을 고친다.");
    const project = doc.get("name", true);
    const app = doc.get("x-app", true);
    const image = isMap(app) ? app.get("image", true) : undefined;
    if (!isScalar(project) || !isScalar(image) || !project.range || !image.range) {
      throw new CreateError(
        "compose.yaml에 프로젝트·앱 이미지 이름이 없다",
        "최상위 name과 x-app의 image를 지정한다.",
      );
    }
    // 노드 값의 범위만 바꿔 주석, 앵커와 나머지 바이트를 보존한다.
    const edits = [
      { range: project.range, value: name },
      { range: image.range, value: `${name}-app` },
    ].sort((a, b) => b.range[0] - a.range[0]);
    let output = source;
    for (const edit of edits)
      output = output.slice(0, edit.range[0]) + edit.value + output.slice(edit.range[1]);
    writeFileSync(path, output);
  }
}
```

- [ ] **Step 6: 저장소 문서를 고친다**

`AGENTS.md`를 고친다.

(1) 찾을 부분:

```markdown
| `templates/`            | 템플릿. 각 폴더는 그대로 복사하면 동작하는 독립 프로젝트다                                |
| `templates/fastapi/`    | FastAPI 백엔드 템플릿                                                                     |
| `templates/nextjs/`     | Next.js BFF web. 자체 workspace의 계약·목과 인증·글·내 정보·세션·업로드·실시간 기능       |
| `scripts/`              | check 실행기, 도구 설치기, 구조 비교, 지침·템플릿 검사, 동기화                            |
| `docs/`                 | 하네스 표준, API 규약, 스펙과 계획                                                        |

```

바꿀 내용:

```markdown
| `templates/`            | 템플릿. 각 폴더는 그대로 복사하면 동작하는 독립 프로젝트다                                |
| `templates/fastapi/`    | FastAPI 백엔드 템플릿                                                                     |
| `templates/nextjs/`     | Next.js BFF web. 자체 workspace의 계약·목과 인증·글·내 정보·세션·업로드·실시간 기능       |
| `create/`               | git 추적 템플릿 파일로 독립 프로젝트를 만드는 CLI                                         |
| `scripts/`              | check 실행기, 도구 설치기, 구조 비교, 지침·템플릿 검사, 동기화                            |
| `docs/`                 | 하네스 표준, API 규약, 스펙과 계획                                                        |

```

(2) 찾을 부분:

```markdown
| `pnpm fix`                                        | 포맷과 자동 수정 가능한 린트                                                                                                                                                                                                                                                                      |
| `pnpm gen`                                        | 계약을 컴파일하고 적합성 테스트와 목 서버의 타입을 다시 만든다                                                                                                                                                                                                                                    |
| `pnpm sync`                                       | 공유 자산 원본을 템플릿 사본 위치로 복사한다                                                                                                                                                                                                                                                      |
| `pnpm --dir templates/nextjs setup`               | web의 고정 의존성·Chromium 설치와 환경 준비                                                                                                                                                                                                                                                       |
| `pnpm --dir templates/nextjs dev`                 | 단독 모드의 web(3000)·목(4010), 백엔드 모드의 web                                                                                                                                                                                                                                                 |
| `pnpm --dir templates/nextjs check`               | web 자체 검사. 루트 check의 템플릿 구조·사본 검사와 함께 통과해야 한다                                                                                                                                                                                                                            |
```

바꿀 내용:

```markdown
| `pnpm fix`                                        | 포맷과 자동 수정 가능한 린트                                                                                                                                                                                                                                                                      |
| `pnpm gen`                                        | 계약을 컴파일하고 적합성 테스트와 목 서버의 타입을 다시 만든다                                                                                                                                                                                                                                    |
| `pnpm sync`                                       | 공유 자산 원본을 템플릿 사본 위치로 복사한다                                                                                                                                                                                                                                                      |
| `pnpm new <대상> --template <fastapi\|nextjs>`    | 저장소 밖에 단독 프로젝트를 만든다. `--name <이름>`, `--no-git`, `--help`를 지원한다                                                                                                                                                                                                              |
| `pnpm --dir templates/nextjs setup`               | web의 고정 의존성·Chromium 설치와 환경 준비                                                                                                                                                                                                                                                       |
| `pnpm --dir templates/nextjs dev`                 | 단독 모드의 web(3000)·목(4010), 백엔드 모드의 web                                                                                                                                                                                                                                                 |
| `pnpm --dir templates/nextjs check`               | web 자체 검사. 루트 check의 템플릿 구조·사본 검사와 함께 통과해야 한다                                                                                                                                                                                                                            |
```

- [ ] **Step 7: 의존성을 설치한다**

저장소 루트의 의존성을 설치한다. `pnpm-lock.yaml`은 이 명령이 고친다(직접 고치지 않는다).

Run(저장소 루트에서): `pnpm install`

Expected: 오류 없이 끝난다. 버전은 정확히 고정돼 있어 같은 잠금 파일이 만들어진다.

- [ ] **Step 8: 테스트가 통과하는지 확인한다**

Run(`create`에서): `pnpm exec vitest run test/arguments.test.ts test/real-templates.test.ts test/standalone.test.ts`

Expected: 통과한다.

```text
Test Files 3 passed (3)
Tests 42 passed (42)
```

- [ ] **Step 9: 단독 생성 smoke를 돌린다**

저장소 밖 OS 임시 폴더에 두 템플릿을 만든다. 임시 폴더는 `node -p "require('node:os').tmpdir()"`로 확인하고 아래에서 `<임시 폴더>`로 적는다. 같은 이름의 폴더가 있으면 다른 접미사를 붙인다. Docker를 쓰지 않으며, CLI가 안내하는 `pnpm setup`·`uv run poe setup`은 실행하지 않는다. git 사용자 정보가 설정돼 있어야 첫 커밋이 생긴다.

Run(저장소 루트에서): `pnpm new <임시 폴더>/aitpl-t4-web --template nextjs`

Expected: CLI 출력의 마지막 세 줄이 `생성 완료: <경로>`, `다음 명령: cd "<경로>"`, `pnpm setup`이다(pnpm이 앞에 실행 명령 줄을 붙인다).

`<임시 폴더>/aitpl-t4-web`에서:

- `git status --short` → 출력 없음. `git log -1 --format=%s` → `chore: create aitpl-t4-web from ai-template <저장소 HEAD의 short SHA>`
- README 첫 줄이 `# aitpl-t4-web`, `package.json`의 `name`이 `aitpl-t4-web`이다
- `pnpm install --frozen-lockfile` → 오류 없이 끝난다
- `pnpm check` → `check 통과: 9단계`. 목 프로세스만 쓰고 끝나면 내린다(설계 §8.2)

Run(저장소 루트에서): `pnpm new <임시 폴더>/aitpl-t4-api --template fastapi`

Expected: 마지막 줄이 `uv run poe setup`이다.

`<임시 폴더>/aitpl-t4-api`에서:

- git 상태와 첫 커밋 메시지를 위와 같이 확인한다. `compose.yaml`의 최상위 `name`은 `aitpl-t4-api`, `x-app` 이미지는 `aitpl-t4-api-app`이다
- 인프라 없는 검사만 돌린다: `uv sync --frozen`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run basedpyright`, `uv run python -m tools.checks architecture`, `uv run python -m tools.checks harness`, `uv run pytest -q tools/tests/test_e2e.py tools/tests/test_processes.py tools/tests/test_stack_doc.py`(`55 passed`). `uv run poe` 명령은 실행하지 않는다

끝나면 `aitpl-t4-web`과 `aitpl-t4-api`를 지운다. 셸이 재귀 삭제를 거부하면 지우지 말고 경로를 보고한다.

- [ ] **Step 10: 검사를 돌린다**

Run(저장소 루트에서): `pnpm --filter @ai-template/create check`

Expected: 타입 검사와 Vitest·Node 테스트가 모두 통과한다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 11단계`로 시작하는 한 줄

- [ ] **Step 11: 커밋한다**

```bash
git add \
  AGENTS.md \
  create/package.json \
  create/src/arguments.ts \
  create/src/cli.ts \
  create/src/create.ts \
  create/src/errors.ts \
  create/src/git.ts \
  create/src/repository.ts \
  create/src/standalone.ts \
  create/test/arguments.test.ts \
  create/test/helpers.ts \
  create/test/real-templates.test.ts \
  create/test/standalone.test.ts \
  create/tsconfig.json \
  create/vitest.config.ts \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml
git commit -m "feat(create): generate standalone template projects"
```


### Task 5: create CLI: 조합 생성

설계 §5.1~§5.7·§8.3 #2~#5. `pnpm new <대상> --api fastapi --web`으로 FastAPI+web 조합 모노레포를 만든다. 루트 잠금 파일을 web 잠금 파일에서 만들고, web 생성물을 api `openapi.json`에 맞춘 뒤 첫 커밋을 한다.

- `apps/api`에 FastAPI, `apps/web`에 web을 복사한다. api는 compose 이름 `<이름>`·이미지 `<이름>-api`·README `# <이름> api`이고, web은 package 이름 `web`·README `# <이름> web`이다. 두 앱의 `.github/`만 지우고 앱의 지침·Claude 설정·skill·lefthook·MCP는 남긴다.
- api 래퍼 `package.json`(`name: api`)은 명령 어휘와 `e2e:serve`를 `uv run poe <명령>`으로 넘긴다. web에는 `gen.config.json`(`{ "openapi": "../api/openapi.json" }`)을 만든다. `.env.example`은 `API_BASE_URL`·`NEXT_PUBLIC_REALTIME_URL` 값만 제자리에서 백엔드 모드로 바꾸고 주석을 보존한다.
- 루트 파일 원본은 `create/assets/combo/`다. `{{NAME}}`·`{{NODE}}`·`{{LEFTHOOK}}`·`{{PRETTIER}}`를 이름과 web package 값으로 채운다. `.gitattributes`·`.editorconfig`는 저장소 루트, `.prettierrc.json`은 web에서 복사한다. 루트 AGENTS.md는 구조·명령·code-first 생성 순서·목의 역할·E2E·포트와 동시 실행 제한을 담는다.
- workspace는 web 설정(`minimumReleaseAge`, `allowBuilds`)을 보존하고 패키지를 `apps/api`, `apps/web`, `apps/web/contract/*`로 둔다. pnpm 12 잠금 파일은 도구 설치·의존성의 두 YAML 문서다. 의존성 문서의 importer만 `apps/web` 아래로 옮긴 뒤 `pnpm install --lockfile-only` → 보존 검사 → `pnpm install --frozen-lockfile` → `pnpm --filter web run gen` 순서로 실행한다.
- 보존 검사는 모든 web importer, 기존 패키지의 버전 키·resolution, snapshot을 비교한다. workspace를 옮기면 목의 openapi-typescript가 TypeScript peer로 5.9.3을 골랐다. 루트 devDependencies에 TypeScript를 넣지 않고 `overrides.typescript`를 web의 6.0.3으로 둔다. override가 바꾼 peer 선언 문구는 허용하고 실제 해석 변화는 거절한다.
- turbo는 2.11.6으로 고정한다(2.11.7은 공개 후 24시간 전이었다). `dev`는 persistent·uncached, `check`·`test`는 캐시, `gen`·`web#gen`은 `cache: false`다. web의 `check`·`gen` 입력에 `$TURBO_ROOT$/apps/api/openapi.json`을 더하고 `web#gen`은 `api#gen`에 의존한다. 루트 스크립트는 `--filter=api --filter=web`과 동시 실행 수 1로 web 내부 계약 작업을 중복 실행하지 않는다.
- 승인본 설계 §5.4는 `gen`도 캐시한다고 적었다. api 내보내기와 web의 TypeSpec·목 생성물 전체의 복원 범위를 검증하지 않아 캐시 hit로 생성을 건너뛰지 않게 끄고, Task 8이 설계에 적는다.
- 루트 실행기는 Node 내장 모듈만 쓰는 ESM이며 첫 실패의 종료 코드를 돌려준다. `setup`은 Node 24·pnpm·uv·Docker 확인 → frozen 설치 → api·web `setup`이다. `check`는 루트 포맷 → Node 테스트 → 지침 짝·200줄 → `turbo run check`(두 앱을 한 번에 하나씩, 순서는 고정하지 않는다)이고 성공 출력은 `check 통과: 4단계`다. `test:e2e`는 api `test:e2e` → api `e2e:serve -- node <절대 경로>/scripts/web-e2e.mjs`이고, `web-e2e.mjs`가 `E2E_*`를 web의 fastapi 대상 변수로 바꿔 web `test:e2e`를 돈다. `db:migrate`·`db:reset`은 루트 package.json이 `pnpm --filter api run <명령>`으로 넘긴다.
- web 템플릿의 `next.config.ts`는 `findWorkspaceRoot`로 Turbopack 루트와 `outputFileTracingRoot`를 가장 가까운 `pnpm-workspace.yaml` 폴더로 정한다. 기존 lint·types 테스트는 `linkDependencies`로 패키지마다 실제 위치를 잇는다. gen-feature 테스트는 조합에서 web의 workspace·importer를 뽑아 독립 사본을 만든다. 테스트의 위치와 정리 방식은 그대로다.
- CLI는 폴더를 만들기 전에 `pnpm --version`을 확인하고 pnpm 단계도 git 변수를 지운 환경에서 인자 배열로 실행한다. 실제 템플릿 테스트는 작업 중인 파일을 독립 git 스냅샷에 커밋해 CLI의 변경 거절과 함께 쓴다.

실패 확인: 세 명령 모두 실패한다. web은 `./workspace-root`가 없어 gen-feature·workspace-root 두 suite가 수집되지 않는다. 함께 바뀐 lint·types 테스트 2개는 단독 배치인 부모에서도 통과하며 조합 배치를 지키는 회귀 검사다. create는 `src/lockfile.ts`가 없어 조합 suite가 수집되지 않고, 조합 인자 테스트가 `조합 생성은 아직 준비되지 않았다`로 실패한다(`1 failed | 26 passed`). Node 테스트는 `setup.mjs`가 없어 `ERR_MODULE_NOT_FOUND`다. GREEN은 web `15 passed`, create `34 passed`, Node `pass 5`다.

**Files:**
- Create: `create/assets/combo/.gitignore`, `create/assets/combo/AGENTS.md`, `create/assets/combo/CLAUDE.md`, `create/assets/combo/README.md`, `create/assets/combo/package.json`, `create/assets/combo/scripts/check.mjs`, `create/assets/combo/scripts/format.mjs`, `create/assets/combo/scripts/process.mjs`, `create/assets/combo/scripts/setup.mjs`, `create/assets/combo/scripts/test-e2e.mjs`, `create/assets/combo/scripts/web-e2e.mjs`, `create/assets/combo/turbo.json`, `create/src/combo.ts`, `create/src/lockfile.ts`, `create/src/pnpm.ts`, `templates/nextjs/scripts/workspace-root.ts`
- Modify: `AGENTS.md`, `create/package.json`, `create/src/arguments.ts`, `create/src/create.ts`, `create/src/standalone.ts`, `templates/nextjs/next.config.ts`
- Test: `create/assets/combo/scripts/runners.test.mjs`, `create/test/arguments.test.ts`, `create/test/combo.test.ts`, `create/test/real-templates.test.ts`, `templates/nextjs/scripts/check/types.test.ts`, `templates/nextjs/scripts/gen-feature.test.ts`, `templates/nextjs/scripts/lint/config.test.ts`, `templates/nextjs/scripts/test/dependency-links.ts`, `templates/nextjs/scripts/workspace-root.test.ts`

**Interfaces:**
- Consumes: Task 1의 `gen.config.json` 입력, Task 2의 `e2e:serve`와 `E2E_*` 환경, Task 4의 `createProject`·`templateFiles`·`renameStandalone`·`initializeGit`·`CreateError`와 테스트 도우미, web 템플릿의 `pnpm-lock.yaml`(두 YAML 문서)·`pnpm-workspace.yaml`·`package.json`(`engines.node`, devDependencies의 lefthook·prettier·typescript)·`.env.example`
- Produces:
  - `arguments.ts`: `CreateOptions.template: Template | "combo"`와 조합 사용법 줄. `create.ts`: `createProject(options: CreateOptions, repository: string, tools: ComboTools = {}): CreateResult`
  - `combo.ts`: `interface ComboTools { readonly assets?: string; readonly pnpm?: PnpmRunner }`, `writeCombo(root: string, repository: string, name: string, assets: string, pnpm: PnpmRunner): void`
  - `pnpm.ts`: `type PnpmRunner = (cwd: string, args: string[]) => void`, `runPnpm: PnpmRunner`(`npm_execpath`의 pnpm을 실행). `lockfile.ts`: `rewriteImporters(source: string): string`, `verifyWebResolutions(original: string, combined: string): void`
  - `standalone.ts`: `renameStandalone(root: string, template: Template, name: string, imageName?: string): void`(기본 이미지 `<이름>-app`, 조합 api는 `<이름>-api`)
  - `create/assets/combo/`의 `package.json`·`turbo.json`·`AGENTS.md`·`CLAUDE.md`·`README.md`·`.gitignore`
  - `scripts/process.mjs`: `run(command, args, options)`, `exitCode(result)`, `isMain(url)`. `setup.mjs`: `setup(root, { run, nodeVersion, output })`. `check.mjs`: `instructionErrors(root)`, `check(root, { run, output })`. `format.mjs`: `rootFiles(root)`, `format(root, write, execute)`. `test-e2e.mjs`: `testE2e(root, execute)`. `web-e2e.mjs`: `webEnvironment(source)`, `webE2e(root, source, execute)`
  - `templates/nextjs/scripts/workspace-root.ts`: `findWorkspaceRoot(web: string): string`. 테스트 도우미 `scripts/test/dependency-links.ts`: `linkDependencies(source: string, target: string): void`
  - create `test` 스크립트의 `node --test assets/combo/scripts/*.test.mjs`. Task 6이 자산·실행기·`writeCombo`를 넓힌다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`create/assets/combo/scripts/runners.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup } from "./setup.mjs";
import { check, instructionErrors } from "./check.mjs";
import { testE2e } from "./test-e2e.mjs";
import { webEnvironment, webE2e } from "./web-e2e.mjs";

test("setup은 도구 확인·설치·api·web 순서이며 첫 실패에서 멈춘다", () => {
  const calls = [];
  const run = (command, args, options) => {
    calls.push([command, args, options.cwd]);
    return { status: args.includes("setup") ? 7 : 0, stdout: "", stderr: "" };
  };
  assert.equal(setup("/combo", { run, nodeVersion: "24.19.0", output: () => undefined }), 7);
  assert.deepEqual(
    calls.map(([, args]) => args),
    [
      ["--version"],
      ["--version"],
      ["--version"],
      ["install", "--frozen-lockfile"],
      ["--filter", "api", "run", "setup"],
    ],
  );
  assert.equal(setup("/combo", { run, nodeVersion: "22.0.0", output: () => undefined }), 1);
});

test("setup은 도구별 설치 안내를 쓰고 준비되면 web까지 실행한다", () => {
  for (const tool of ["pnpm", "uv", "docker"]) {
    const messages = [];
    assert.equal(
      setup("/combo", {
        nodeVersion: "24.19.0",
        output: (text) => messages.push(text),
        run: (command) => ({ status: command === tool ? 1 : 0 }),
      }),
      1,
    );
    assert.match(messages[0], /설치하고 PATH/);
    assert.match(messages[0], new RegExp(tool, "i"));
  }
  const args = [];
  assert.equal(
    setup("/combo", {
      nodeVersion: "24.19.0",
      run: (_command, values) => {
        args.push(values);
        return { status: 0 };
      },
    }),
    0,
  );
  assert.deepEqual(args.at(-1), ["--filter", "web", "run", "setup"]);
});

test("E2E 실행기는 첫 실패를 전파하고 web 실행기의 절대 경로를 넘긴다", () => {
  const calls = [];
  const run = (_command, args, options) => {
    calls.push([args, options.cwd]);
    return { status: 0 };
  };
  assert.equal(testE2e(import.meta.dirname, run), 0);
  assert.deepEqual(calls[0][0], ["--filter", "api", "run", "test:e2e"]);
  assert.deepEqual(calls[1][0], [
    "--filter",
    "api",
    "run",
    "e2e:serve",
    "--",
    "node",
    join(import.meta.dirname, "scripts/web-e2e.mjs"),
  ]);
  assert.equal(
    testE2e(import.meta.dirname, () => ({ status: 9 })),
    9,
  );
});

test("백엔드 E2E 값만 web 대상 변수로 바꾸며 누락은 실행 전에 실패한다", () => {
  const source = {
    KEEP: "yes",
    E2E_API_URL: "http://127.0.0.1:18000",
    E2E_WEB_URL: "http://localhost:3100",
    E2E_MAILPIT_URL: "http://127.0.0.1:28025",
    E2E_OAUTH_URL: "http://127.0.0.1:28080",
    E2E_RECENT_LOGIN_SECONDS: "10",
  };
  const env = webEnvironment(source);
  assert.equal(env.E2E_TARGET, "fastapi");
  assert.equal(env.APP_URL, source.E2E_WEB_URL);
  assert.equal(env.API_BASE_URL, `${source.E2E_API_URL}/api/v1`);
  assert.equal(env.NEXT_PUBLIC_REALTIME_URL, source.E2E_API_URL);
  assert.equal(env.KEEP, "yes");
  for (const key of Object.keys(source).filter((key) => key.startsWith("E2E_"))) {
    assert.throws(() => webEnvironment({ ...source, [key]: "" }), /설정/);
  }
  assert.equal(
    webE2e("/combo", source, (_command, args, options) => {
      assert.deepEqual(args, ["--filter", "web", "run", "test:e2e"]);
      assert.deepEqual(options.env, env);
      return { status: 6 };
    }),
    6,
  );
});

test("check는 성공 한 줄 또는 실패한 단계만 출력하고 앱을 필터링한다", () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-root-check-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "# 규칙\n");
    writeFileSync(join(root, "CLAUDE.md"), "@AGENTS.md\n");
    const output = [];
    const calls = [];
    const run = (_command, args) => {
      calls.push(args);
      return { status: 0, stdout: "숨김", stderr: "" };
    };
    assert.equal(check(root, { run, output: (text) => output.push(text) }), 0);
    assert.deepEqual(output, ["check 통과: 4단계"]);
    assert.deepEqual(calls.at(-1), [
      "exec",
      "turbo",
      "run",
      "check",
      "--filter=api",
      "--filter=web",
      "--concurrency=1",
    ]);
    output.length = 0;
    assert.equal(
      check(root, {
        run: () => ({ status: 3, stdout: "형식 오류", stderr: "" }),
        output: (text) => output.push(text),
      }),
      3,
    );
    assert.deepEqual(output, ["형식 오류"]);
    writeFileSync(join(root, "AGENTS.md"), Array(202).fill("규칙").join("\n"));
    mkdirSync(join(root, "apps/api"), { recursive: true });
    writeFileSync(join(root, "apps/api/AGENTS.md"), "# api\n");
    assert.equal(instructionErrors(root).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

`create/test/arguments.test.ts`를 고친다.

(1) 찾을 부분:

```ts
      ["my-app", "--api", "fastapi"],
      ["my-app", "--web"],
      ["my-app", "--api", "nestjs", "--web"],
      ["my-app", "--api", "fastapi", "--web"],
      ["my-app", "--template", "nextjs", "--template", "fastapi"],
      ["my-app", "--template", "nextjs", "--no-git=false"],
    ].map((args) => [args]),
```

바꿀 내용:

```ts
      ["my-app", "--api", "fastapi"],
      ["my-app", "--web"],
      ["my-app", "--api", "nestjs", "--web"],
      ["my-app", "--template", "nextjs", "--template", "fastapi"],
      ["my-app", "--template", "nextjs", "--no-git=false"],
    ].map((args) => [args]),
```

(2) 찾을 부분:

```ts
      parseArguments(["target", "--template", "fastapi", "--name", "a".repeat(50)], {}),
    ).toMatchObject({ name: "a".repeat(50) });
  });
});
```

바꿀 내용:

```ts
      parseArguments(["target", "--template", "fastapi", "--name", "a".repeat(50)], {}),
    ).toMatchObject({ name: "a".repeat(50) });
  });

  it("FastAPI와 web 조합을 받는다", () => {
    expect(parseArguments(["my-app", "--api", "fastapi", "--web"], {})).toEqual({
      target: resolve("my-app"),
      name: "my-app",
      template: "combo",
      git: true,
    });
  });
});
```

`create/test/combo.test.ts`:

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { parseAllDocuments, parse } from "yaml";
import { createProject } from "../src/create.ts";
import { rewriteImporters, verifyWebResolutions } from "../src/lockfile.ts";
import { fixtureRepository, git, temporaryFolder, write } from "./helpers.ts";
import { runPnpm } from "../src/pnpm.ts";

const lock =
  "---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    packageManagerDependencies: {}\n---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      react: {specifier: 19.3.0, version: 19.3.0}\n  contract/mock:\n    dependencies:\n      hono: {specifier: 4.0.0, version: 4.0.0}\npackages:\n  react@19.3.0: {resolution: {integrity: fixture}}\nsnapshots:\n  react@19.3.0: {}\n";

it("없는 pnpm 실행 파일은 설치 안내로 거절한다", () => {
  vi.stubEnv("npm_execpath", join(temporaryFolder(), "missing-pnpm"));
  expect(() => {
    runPnpm(temporaryFolder(), ["--version"]);
  }).toThrow(/pnpm을 찾을 수 없다/);
});

it("pnpm 12의 두 문서 중 web importer만 옮기고 버전 변경을 거절한다", () => {
  const rewritten = rewriteImporters(lock);
  const docs = parseAllDocuments(rewritten);
  expect(docs[0]?.getIn(["importers", "."])).toBeDefined();
  expect(docs[1]?.getIn(["importers", "apps/web", "dependencies", "react", "version"])).toBe(
    "19.3.0",
  );
  expect(docs[1]?.getIn(["importers", "apps/web/contract/mock"])).toBeDefined();
  expect(() => {
    verifyWebResolutions(lock, rewritten);
  }).not.toThrow();
  expect(() => {
    verifyWebResolutions(lock, rewritten.replace("version: 19.3.0", "version: 19.3.1"));
  }).toThrow(/해석/);
  expect(() => {
    verifyWebResolutions(
      lock,
      rewritten.replace("react@19.3.0: {}", "react@19.3.0: {dependencies: {other: 1.0.0}}"),
    );
  }).toThrow(/해석/);
});

it("고정 override가 바꾼 peer 선언은 허용하고 패키지 무결성 변경은 거절한다", () => {
  const original = lock.replace(
    "{resolution: {integrity: fixture}}",
    "{resolution: {integrity: fixture}, peerDependencies: {typescript: '^5.x'}}",
  );
  const rewritten = rewriteImporters(original);
  expect(() => {
    verifyWebResolutions(original, rewritten.replace("^5.x", "6.0.3"));
  }).not.toThrow();
  expect(() => {
    verifyWebResolutions(original, rewritten.replace("integrity: fixture", "integrity: changed"));
  }).toThrow(/해석/);
});

function comboFixture() {
  const root = fixtureRepository();
  write(root, "templates/nextjs/pnpm-lock.yaml", lock);
  write(
    root,
    "templates/nextjs/pnpm-workspace.yaml",
    "packages:\n  - contract/*\nminimumReleaseAge: 1440\nallowBuilds:\n  lefthook: false\n",
  );
  write(
    root,
    "templates/nextjs/package.json",
    JSON.stringify({
      name: "nextjs-template",
      engines: { node: ">=24 <25" },
      devDependencies: { lefthook: "2.1.14", prettier: "3.9.9", typescript: "6.0.3" },
    }),
  );
  write(
    root,
    "templates/nextjs/.env.example",
    "# 주소\nAPI_BASE_URL=http://localhost:4010/api/v1 # API\nNEXT_PUBLIC_REALTIME_URL=http://localhost:4010\n",
  );
  write(root, "templates/nextjs/.prettierrc.json", "{}\n");
  write(root, "templates/nextjs/.github/workflows/ci.yml", "name: web\n");
  write(root, "templates/fastapi/.github/workflows/ci.yml", "name: api\n");
  write(root, "templates/fastapi/openapi.json", "{}\n");
  write(root, ".gitattributes", "* text=auto eol=lf\n");
  write(root, ".editorconfig", "root = true\n");
  git(root, "add", ".");
  git(root, "-c", "commit.gpgsign=false", "commit", "-m", "chore: combo fixture");
  return root;
}

it("네트워크 없는 fixture 조합의 배치·workspace·실행 순서와 첫 커밋을 확인한다", () => {
  const root = comboFixture();
  const target = join(temporaryFolder(), "aitpl-combo");
  const commands: string[][] = [];
  const result = createProject({ target, name: "my-app", template: "combo", git: true }, root, {
    assets: resolve(import.meta.dirname, "../assets/combo"),
    pnpm: (cwd, args) => {
      commands.push(args);
      if (args.includes("gen")) write(cwd, "apps/web/generated.txt", "API 타입\n");
    },
  });
  expect(result.committed).toBe(true);
  expect(commands).toEqual([
    ["--version"],
    ["install", "--lockfile-only"],
    ["install", "--frozen-lockfile"],
    ["--filter", "web", "run", "gen"],
  ]);
  expect(git(target, "status", "--porcelain")).toBe("");
  for (const app of ["api", "web"]) {
    expect(readFileSync(join(target, `apps/${app}/README.md`), "utf8").split("\n")[0]).toBe(
      `# my-app ${app}`,
    );
    expect(existsSync(join(target, `apps/${app}/.github`))).toBe(false);
  }
  expect(readFileSync(join(target, "apps/api/compose.yaml"), "utf8")).toContain(
    "image: my-app-api # 이미지",
  );
  expect(JSON.parse(readFileSync(join(target, "apps/api/package.json"), "utf8"))).toMatchObject({
    name: "api",
    scripts: { "e2e:serve": "uv run poe e2e:serve" },
  });
  expect(JSON.parse(readFileSync(join(target, "apps/web/package.json"), "utf8"))).toMatchObject({
    name: "web",
  });
  expect(readFileSync(join(target, "apps/web/.env.example"), "utf8")).toBe(
    "# 주소\nAPI_BASE_URL=http://127.0.0.1:8000/api/v1 # API\nNEXT_PUBLIC_REALTIME_URL=http://127.0.0.1:8000\n",
  );
  expect(existsSync(join(target, "apps/web/pnpm-lock.yaml"))).toBe(false);
  expect(existsSync(join(target, "apps/web/pnpm-workspace.yaml"))).toBe(false);
  expect(parse(readFileSync(join(target, "pnpm-workspace.yaml"), "utf8"))).toMatchObject({
    packages: ["apps/api", "apps/web", "apps/web/contract/*"],
    minimumReleaseAge: 1440,
    allowBuilds: { lefthook: false },
  });
  const turbo = JSON.parse(readFileSync(join(target, "turbo.json"), "utf8")) as {
    tasks: Record<string, { dependsOn?: string[]; inputs?: string[]; cache?: boolean }>;
  };
  expect(turbo.tasks["web#gen"]?.dependsOn).toContain("api#gen");
  expect(turbo.tasks["web#check"]?.inputs).toContain("$TURBO_ROOT$/apps/api/openapi.json");
  expect(turbo.tasks.gen?.cache).toBe(false);
  expect(JSON.parse(readFileSync(join(target, "package.json"), "utf8"))).toMatchObject({
    name: "my-app",
    devDependencies: { turbo: "2.11.6", prettier: "3.9.9", lefthook: "2.1.14" },
  });
});

it.each(["install", "gen", "--version"])(
  "pnpm %s 실패는 대상·임시 형제를 남기지 않는다",
  (failure) => {
    const root = comboFixture();
    const parent = temporaryFolder();
    const target = join(parent, "aitpl-failure");
    expect(() =>
      createProject({ target, name: "my-app", template: "combo", git: false }, root, {
        pnpm: (_cwd, args) => {
          if (args.includes(failure)) throw new Error("실패");
        },
      }),
    ).toThrow();
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(parent)).toEqual([]);
  },
);
```

`create/test/real-templates.test.ts` 전체를 다음으로 바꾼다.

```ts
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { beforeEach, expect, it } from "vitest";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";
import { createProject } from "../src/create.ts";
import { git, temporaryFolder } from "./helpers.ts";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
let source: string;

beforeEach(() => {
  // 수정 중인 실제 파일을 독립 git 스냅샷으로 검증한다. CLI의 변경 거절은 유지한다.
  source = temporaryFolder();
  const files = git(
    root,
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "templates",
    "create/src",
    "create/assets",
    "scripts/src/files/git-environment.ts",
    ".gitattributes",
    ".editorconfig",
  )
    .split("\0")
    .filter(Boolean);
  for (const file of new Set(files)) {
    const target = join(source, file);
    mkdirSync(resolve(target, ".."), { recursive: true });
    copyFileSync(join(root, file), target);
  }
  git(source, "init", "-b", "main");
  git(source, "add", ".");
  git(source, "-c", "commit.gpgsign=false", "commit", "-m", "chore: real template snapshot");
  symlinkSync(
    join(root, "node_modules"),
    join(source, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
});

it("두 실제 템플릿의 파일 목록·이름·나머지 바이트와 git 상태를 확인한다", () => {
  const parent = temporaryFolder();
  for (const template of ["fastapi", "nextjs"] as const) {
    const name = `aitpl-real-${template}`;
    const target = join(parent, name);
    createProject({ target, name, template, git: true }, source);
    const expected = git(source, "ls-files", "-z", "--", `templates/${template}`)
      .split("\0")
      .filter(Boolean)
      .map((file) => file.slice(`templates/${template}/`.length))
      .filter((file) => file !== "template.json")
      .sort();
    expect(git(target, "ls-files", "-z").split("\0").filter(Boolean).sort()).toEqual(expected);
    expect(git(target, "status", "--porcelain")).toBe("");
    expect(readFileSync(join(target, "README.md"), "utf8").split("\n")[0]).toBe(`# ${name}`);
    const renamed = template === "nextjs" ? "package.json" : "compose.yaml";
    for (const file of expected.filter((file) => !["README.md", renamed].includes(file))) {
      expect(
        readFileSync(join(target, file)).equals(
          readFileSync(join(source, "templates", template, file)),
        ),
        file,
      ).toBe(true);
    }
    if (template === "nextjs") {
      expect(JSON.parse(readFileSync(join(target, "package.json"), "utf8"))).toMatchObject({
        name,
      });
    } else {
      const compose = readFileSync(join(target, "compose.yaml"), "utf8");
      expect(compose).toContain(`name: ${name}\n`);
      expect(compose).toContain(`image: ${name}-app\n`);
    }
  }
});

it("실제 CLI의 도움말·사용법 오류·실행 오류는 서로 다른 종료 코드다", () => {
  const parent = temporaryFolder();
  const run = (args: string[], env: NodeJS.ProcessEnv = process.env) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(require.resolve("tsx")).href,
        join(source, "create/src/cli.ts"),
        ...args,
      ],
      { cwd: parent, env: gitEnvironment(env), encoding: "utf8" },
    );
  const help = run(["--help"], { ...process.env, PATH: "" });
  expect(help.status, help.stderr).toBe(0);
  expect(help.stdout).toContain("사용법");
  const usage = run(["--template", "bad"]);
  expect(usage.status).toBe(2);
  expect(usage.stderr).toMatch(/pnpm new: .+ — .+/);
  const failure = run([source, "--template", "nextjs", "--name", "my-web"]);
  expect(failure.status).toBe(1);
  expect(failure.stderr).toMatch(/pnpm new: .*저장소.* — .+/);
  const success = run(["aitpl-cli", "--template", "nextjs", "--no-git"], {
    ...process.env,
    INIT_CWD: parent,
  });
  expect(success.status, success.stderr).toBe(0);
  expect(success.stdout).toContain(join(parent, "aitpl-cli"));
  expect(success.stdout).toContain("pnpm setup");
  expect(readdirSync(join(parent, "aitpl-cli"))).not.toContain(".git");
});
```

`templates/nextjs/scripts/check/types.test.ts`를 고친다.

찾을 부분:

```ts
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { binary } from "../process.mjs";
import { assembleSteps } from "./steps";

it("이전 타입 생성 뒤 route를 옮겨도 현재 route를 검증하며 dev 산출물을 보존한다", () => {
  const root = mkdtempSync(join(tmpdir(), "nextjs-route-types-"));
  try {
    symlinkSync(resolve("node_modules"), join(root, "node_modules"), "junction");
    mkdirSync(join(root, "src/app/old"), { recursive: true });
    writeFileSync(
      join(root, "src/app/old/page.tsx"),
```

바꿀 내용:

```ts
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { binary } from "../process.mjs";
import { assembleSteps } from "./steps";
import { linkDependencies } from "../test/dependency-links";

it("이전 타입 생성 뒤 route를 옮겨도 현재 route를 검증하며 dev 산출물을 보존한다", () => {
  const root = mkdtempSync(join(tmpdir(), "nextjs-route-types-"));
  try {
    linkDependencies(resolve("."), root);
    mkdirSync(join(root, "src/app/old"), { recursive: true });
    writeFileSync(
      join(root, "src/app/old/page.tsx"),
```

`templates/nextjs/scripts/gen-feature.test.ts`를 고친다.

(1) 찾을 부분:

```ts
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { pnpm } from "./process.mjs";
import { pathToFileURL } from "node:url";

```

바꿀 내용:

```ts
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseAllDocuments, parseDocument } from "yaml";
import { findWorkspaceRoot } from "./workspace-root";
import { pnpm } from "./process.mjs";
import { pathToFileURL } from "node:url";

```

(2) 찾을 부분:

```ts
      });
    }
  }
  // 잠금 파일의 설치된 버전만 오프라인 재사용한다. 프로젝트 밖 의존성 링크는 만들지 않는다.
  const installed = pnpm(["install", "--offline", "--frozen-lockfile", "--ignore-scripts"], {
    cwd: project,
  });
  expect(installed.status, installed.stdout + installed.stderr).toBe(0);
  copiedTools = await import(pathToFileURL(join(project, "scripts/process.mjs")).href);
  // 이 사본의 CLI가 실행됐는지 결과로 확인한다.
```

바꿀 내용:

```ts
      });
    }
  }
  // 조합에서도 이 사본은 web의 독립 workspace다. 위치와 정리 방식은 그대로 둔다.
  const workspaceRoot = findWorkspaceRoot(root);
  const prefix = relative(workspaceRoot, root).replaceAll("\\", "/");
  if (prefix) {
    const workspace = parseDocument(
      readFileSync(join(workspaceRoot, "pnpm-workspace.yaml"), "utf8"),
    );
    workspace.set("packages", ["contract/*"]);
    writeFileSync(join(project, "pnpm-workspace.yaml"), workspace.toString());
    const docs = parseAllDocuments(readFileSync(join(workspaceRoot, "pnpm-lock.yaml"), "utf8"));
    const dependencies = docs.at(-1)!;
    const { importers } = dependencies.toJS() as { importers: Record<string, unknown> };
    dependencies.set(
      "importers",
      Object.fromEntries(
        Object.entries(importers)
          .filter(([path]) => path === prefix || path.startsWith(`${prefix}/`))
          .map(([path, value]) => [path === prefix ? "." : path.slice(prefix.length + 1), value]),
      ),
    );
    writeFileSync(
      join(project, "pnpm-lock.yaml"),
      docs
        .map((doc) => {
          doc.directives.docStart = true;
          return doc.toString({ lineWidth: 0 });
        })
        .join("\n"),
    );
  }
  // 단독 잠금은 오프라인 재사용한다. 조합에서 추출한 잠금은 새 정책 검증에 레지스트리가 필요하다.
  // 버전은 frozen으로 고정하며 프로젝트 밖 의존성 링크는 만들지 않는다.
  const installed = pnpm(
    ["install", ...(prefix ? [] : ["--offline"]), "--frozen-lockfile", "--ignore-scripts"],
    {
      cwd: project,
    },
  );
  expect(installed.status, installed.stdout + installed.stderr).toBe(0);
  copiedTools = await import(pathToFileURL(join(project, "scripts/process.mjs")).href);
  // 이 사본의 CLI가 실행됐는지 결과로 확인한다.
```

`templates/nextjs/scripts/lint/config.test.ts` 전체를 다음으로 바꾼다.

```ts
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { binary } from "../process.mjs";
import { linkDependencies } from "../test/dependency-links";

it("App Router의 린트는 프로젝트와 상위 디렉터리에서 Pages 안내 없이 실행된다", () => {
  const root = mkdtempSync(join(tmpdir(), "nextjs-lint-config-"));
  const project = join(root, "web");
  try {
    mkdirSync(join(project, "scripts/lint"), { recursive: true });
    mkdirSync(join(project, "src/app"), { recursive: true });
    linkDependencies(resolve("."), project);
    cpSync("eslint.config.mjs", join(project, "eslint.config.mjs"));
    cpSync("scripts/lint/boundaries.mjs", join(project, "scripts/lint/boundaries.mjs"));
    writeFileSync(join(project, "package.json"), '{"type":"module"}');
    writeFileSync(join(project, "tsconfig.json"), '{"compilerOptions":{}}');
    const file = join(project, "src/app/page.tsx");
    writeFileSync(file, "export default function Page() { return null; }");
    for (const cwd of [project, root]) {
      const result = binary("eslint", ["--no-warn-ignored", file], { cwd });
      expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
      expect(`${result.stdout}${result.stderr}`).not.toMatch(/Pages directory cannot be found/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);
```

`templates/nextjs/scripts/test/dependency-links.ts`:

```ts
import { mkdirSync, readdirSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";

/** 각 패키지의 실제 위치를 연결해 workspace의 상대 링크가 사본 기준으로 바뀌지 않게 한다. */
export function linkDependencies(source: string, target: string): void {
  const destination = join(target, "node_modules");
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(join(source, "node_modules"))) {
    if (entry.startsWith(".")) continue;
    const packages = entry.startsWith("@")
      ? readdirSync(join(source, "node_modules", entry)).map((name) => join(entry, name))
      : [entry];
    for (const name of packages) {
      const path = join(destination, name);
      mkdirSync(join(path, ".."), { recursive: true });
      symlinkSync(realpathSync(join(source, "node_modules", name)), path, "junction");
    }
  }
}
```

`templates/nextjs/scripts/workspace-root.test.ts`:

```ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { findWorkspaceRoot } from "./workspace-root";

it("가장 가까운 workspace를 찾고 파일이 없으면 web 폴더를 쓴다", () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-workspace-test-"));
  const web = join(root, "apps/web");
  mkdirSync(web, { recursive: true });
  try {
    expect(findWorkspaceRoot(web)).toBe(web);
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
    expect(findWorkspaceRoot(web)).toBe(root);
    writeFileSync(join(web, "pnpm-workspace.yaml"), "packages: []\n");
    expect(findWorkspaceRoot(web)).toBe(web);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`templates/nextjs`에서): `pnpm test scripts/check/types.test.ts scripts/gen-feature.test.ts scripts/lint/config.test.ts scripts/workspace-root.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
FAIL  |gen-feature| scripts/gen-feature.test.ts [ scripts/gen-feature.test.ts ]
Error: Cannot find module './workspace-root' imported from templates/nextjs/scripts/gen-feature.test.ts
FAIL  |web| scripts/workspace-root.test.ts [ scripts/workspace-root.test.ts ]
Error: Cannot find module './workspace-root' imported from templates/nextjs/scripts/workspace-root.test.ts
Test Files 2 failed | 2 passed (4)
Tests 2 passed (2)
```

Run(`create`에서): `pnpm exec vitest run test/arguments.test.ts test/combo.test.ts test/real-templates.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× FastAPI와 web 조합을 받는다
FAIL  test/combo.test.ts [ test/combo.test.ts ]
Error: Cannot find module '../src/lockfile.ts' imported from create/test/combo.test.ts
FAIL  test/arguments.test.ts > CLI 입력 > FastAPI와 web 조합을 받는다
CreateError: pnpm new: 조합 생성은 아직 준비되지 않았다 — 단독 생성에는 --template을 지정한다.
Test Files 2 failed | 1 passed (3)
Tests 1 failed | 26 passed (27)
```

Run(`create`에서): `node --test assets/combo/scripts/runners.test.mjs`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
throw new ERR_MODULE_NOT_FOUND(
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'create/assets/combo/scripts/setup.mjs' imported from create/assets/combo/scripts/runners.test.mjs
code: 'ERR_MODULE_NOT_FOUND',
✖ assets/combo/scripts/runners.test.mjs
✖ failing tests:
✖ assets/combo/scripts/runners.test.mjs
throw new ERR_MODULE_NOT_FOUND(
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'create/assets/combo/scripts/setup.mjs' imported from create/assets/combo/scripts/runners.test.mjs
tests 1
pass 0
fail 1
```

- [ ] **Step 3: web 설정 파일을 고친다**

`templates/nextjs/next.config.ts` 전체를 다음으로 바꾼다.

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_SERVER } from "next/constants";
import { exitOnInvalidEnv } from "./src/lib/env/startup";
import { findWorkspaceRoot } from "./scripts/workspace-root";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_SERVER) {
    exitOnInvalidEnv(process.env);
  }
  return withNextIntl({
    agentRules: false,
    ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" } : {}),
    turbopack: { root: findWorkspaceRoot(import.meta.dirname) },
    outputFileTracingRoot: findWorkspaceRoot(import.meta.dirname),
  });
}
```

- [ ] **Step 4: web 스크립트를 만든다**

`templates/nextjs/scripts/workspace-root.ts`:

```ts
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function findWorkspaceRoot(web: string): string {
  const start = resolve(web);
  let folder = start;
  while (true) {
    if (statSync(join(folder, "pnpm-workspace.yaml"), { throwIfNoEntry: false })?.isFile())
      return folder;
    const parent = dirname(folder);
    if (parent === folder) return start;
    folder = parent;
  }
}
```

- [ ] **Step 5: create 패키지 설정을 고친다**

`create/package.json` 전체를 다음으로 바꾼다.

```json
{
  "name": "@ai-template/create",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run && node --test assets/combo/scripts/*.test.mjs",
    "check": "pnpm run typecheck && pnpm run test"
  },
  "dependencies": {
    "yaml": "2.9.1"
  }
}
```

- [ ] **Step 6: create CLI 코드를 만들고 고친다**

`create/src/arguments.ts`를 고친다.

(1) 찾을 부분:

```ts
export interface CreateOptions {
  readonly target: string;
  readonly name: string;
  readonly template: Template;
  readonly git: boolean;
}

export const usage = `사용법:
  pnpm new <대상 폴더> --template <fastapi|nextjs> [--name <이름>] [--no-git]
  pnpm new --help

이름은 소문자로 시작하는 kebab-case이며 50자 이하다.
```

바꿀 내용:

```ts
export interface CreateOptions {
  readonly target: string;
  readonly name: string;
  readonly template: Template | "combo";
  readonly git: boolean;
}

export const usage = `사용법:
  pnpm new <대상 폴더> --template <fastapi|nextjs> [--name <이름>] [--no-git]
  pnpm new <대상 폴더> --api fastapi --web [--name <이름>] [--no-git]
  pnpm new --help

이름은 소문자로 시작하는 kebab-case이며 50자 이하다.
```

(2) 찾을 부분:

```ts
        2,
      );
    }
    throw new CreateError(
      "조합 생성은 아직 준비되지 않았다",
      "단독 생성에는 --template을 지정한다.",
      2,
    );
  }
  if (positionals.length !== 1 || !positionals[0]) {
    throw new CreateError(
```

바꿀 내용:

```ts
        2,
      );
    }
  }
  if (positionals.length !== 1 || !positionals[0]) {
    throw new CreateError(
```

(3) 찾을 부분:

```ts
      2,
    );
  }
  if (values.template !== "fastapi" && values.template !== "nextjs") {
    throw new CreateError(
      "템플릿이 올바르지 않다",
      "--template fastapi 또는 --template nextjs를 지정한다.",
```

바꿀 내용:

```ts
      2,
    );
  }
  if (values.api === undefined && values.template !== "fastapi" && values.template !== "nextjs") {
    throw new CreateError(
      "템플릿이 올바르지 않다",
      "--template fastapi 또는 --template nextjs를 지정한다.",
```

(4) 찾을 부분:

```ts
      2,
    );
  }
  return { target, name, template: values.template, git: !values["no-git"] };
}
```

바꿀 내용:

```ts
      2,
    );
  }
  return {
    target,
    name,
    template: values.api ? "combo" : (values.template as Template),
    git: !values["no-git"],
  };
}
```

`create/src/combo.ts`:

```ts
import { copyFileSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseDocument } from "yaml";
import { rewriteImporters, verifyWebResolutions } from "./lockfile.ts";
import { renameStandalone } from "./standalone.ts";
import type { PnpmRunner } from "./pnpm.ts";

export interface ComboTools {
  readonly assets?: string;
  readonly pnpm?: PnpmRunner;
}

const commands = [
  "setup",
  "dev",
  "check",
  "fix",
  "test",
  "test:e2e",
  "gen",
  "db:migrate",
  "db:reset",
  "e2e:serve",
];

export function writeCombo(
  root: string,
  repository: string,
  name: string,
  assets: string,
  pnpm: PnpmRunner,
): void {
  const api = join(root, "apps/api");
  const web = join(root, "apps/web");
  renameStandalone(api, "fastapi", name, `${name}-api`);
  renameStandalone(web, "nextjs", "web");
  for (const [folder, app] of [
    [api, "api"],
    [web, "web"],
  ] as const) {
    const path = join(folder, "README.md");
    writeFileSync(path, readFileSync(path, "utf8").replace(/^[^\r\n]*/, `# ${name} ${app}`));
    rmSync(join(folder, ".github"), { recursive: true, force: true });
  }
  const json = (path: string, value: unknown) => {
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  };
  json(join(api, "package.json"), {
    name: "api",
    private: true,
    scripts: Object.fromEntries(commands.map((command) => [command, `uv run poe ${command}`])),
  });
  writeFileSync(join(web, "gen.config.json"), '{ "openapi": "../api/openapi.json" }\n');
  const env = join(web, ".env.example");
  writeFileSync(
    env,
    readFileSync(env, "utf8")
      .replace(/^API_BASE_URL=\S+/m, "API_BASE_URL=http://127.0.0.1:8000/api/v1")
      .replace(/^NEXT_PUBLIC_REALTIME_URL=\S+/m, "NEXT_PUBLIC_REALTIME_URL=http://127.0.0.1:8000"),
  );
  const pkg = JSON.parse(readFileSync(join(web, "package.json"), "utf8")) as {
    engines: { node: string };
    devDependencies: { lefthook: string; prettier: string; typescript: string };
  };
  const variables: Record<string, string> = {
    NAME: name,
    NODE: pkg.engines.node,
    LEFTHOOK: pkg.devDependencies.lefthook,
    PRETTIER: pkg.devDependencies.prettier,
  };
  for (const entry of readdirSync(assets, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const destination = join(root, entry.parentPath.slice(assets.length), entry.name);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      readFileSync(join(entry.parentPath, entry.name), "utf8").replace(
        /\{\{(\w+)\}\}/g,
        (whole: string, key: string) => variables[key] ?? whole,
      ),
    );
  }
  for (const file of [".gitattributes", ".editorconfig"])
    copyFileSync(join(repository, file), join(root, file));
  copyFileSync(join(web, ".prettierrc.json"), join(root, ".prettierrc.json"));
  const workspace = parseDocument(readFileSync(join(web, "pnpm-workspace.yaml"), "utf8"));
  workspace.set("packages", ["apps/api", "apps/web", "apps/web/contract/*"]);
  // workspace 이동 뒤에도 계약 패키지의 TypeScript peer를 템플릿 버전으로 유지한다.
  workspace.setIn(["overrides", "typescript"], pkg.devDependencies.typescript);
  writeFileSync(join(root, "pnpm-workspace.yaml"), workspace.toString());
  const lock = readFileSync(join(web, "pnpm-lock.yaml"), "utf8");
  writeFileSync(join(root, "pnpm-lock.yaml"), rewriteImporters(lock));
  for (const file of ["pnpm-lock.yaml", "pnpm-workspace.yaml"]) rmSync(join(web, file));
  pnpm(root, ["install", "--lockfile-only"]);
  verifyWebResolutions(lock, readFileSync(join(root, "pnpm-lock.yaml"), "utf8"));
  pnpm(root, ["install", "--frozen-lockfile"]);
  pnpm(root, ["--filter", "web", "run", "gen"]);
}
```

`create/src/create.ts` 전체를 다음으로 바꾼다.

```ts
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
import { writeCombo, type ComboTools } from "./combo.ts";
import { runPnpm } from "./pnpm.ts";

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

export function createProject(
  options: CreateOptions,
  repository: string,
  tools: ComboTools = {},
): CreateResult {
  const root = realpathSync(repository);
  validateTarget(options.target, root);
  const templates =
    options.template === "combo" ? (["fastapi", "nextjs"] as const) : [options.template];
  const plans = templates.map((template) => ({ template, files: templateFiles(root, template) }));
  const pnpm = tools.pnpm ?? runPnpm;
  if (options.template === "combo") pnpm(root, ["--version"]);
  const sha = runGit(root, ["rev-parse", "--short", "HEAD"]).trim();
  const parent = dirname(options.target);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(join(parent, `aitpl-${options.name}-`));
  let moved = false;
  try {
    for (const { template, files } of plans)
      for (const file of files) {
        const destination = join(
          staging,
          options.template === "combo" ? `apps/${template === "fastapi" ? "api" : "web"}` : "",
          file.path,
        );
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(join(root, "templates", template, file.path), destination);
        if (process.platform !== "win32") chmodSync(destination, file.executable ? 0o755 : 0o644);
      }
    if (options.template === "combo")
      writeCombo(
        staging,
        root,
        options.name,
        tools.assets ?? join(import.meta.dirname, "../assets/combo"),
        pnpm,
      );
    else renameStandalone(staging, options.template, options.name);
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
```

`create/src/lockfile.ts`:

```ts
import { isDeepStrictEqual } from "node:util";
import { isMap, parseAllDocuments } from "yaml";
import { CreateError } from "./errors.ts";

function documents(source: string) {
  const docs = parseAllDocuments(source);
  if (docs.some((doc) => doc.errors.length > 0))
    throw new CreateError("잠금 파일이 올바르지 않다", "web 잠금 파일을 pnpm으로 다시 만든다.");
  return docs;
}

function dependencyDocument(source: string) {
  const docs = documents(source);
  // pnpm 12는 도구 설치 잠금과 프로젝트 의존성을 별도 YAML 문서로 저장한다.
  const doc = docs.at(-1);
  if (!doc || !isMap(doc.get("importers", true)))
    throw new CreateError(
      "잠금 파일에 importer가 없다",
      "web에서 pnpm install로 잠금 파일을 만든다.",
    );
  return doc;
}

export function rewriteImporters(source: string): string {
  const docs = documents(source);
  const doc = dependencyDocument(source);
  const importers = doc.get("importers", true);
  if (!isMap(importers)) throw new Error("importer가 없다");
  for (const pair of importers.items) {
    const path = String(pair.key);
    if (path !== "." && !path.startsWith("contract/"))
      throw new CreateError(
        "web importer 경로가 올바르지 않다",
        "web workspace의 contract 패키지를 확인한다.",
      );
    pair.key = doc.createNode(path === "." ? "apps/web" : `apps/web/${path}`);
  }
  docs[docs.length - 1] = doc;
  return docs
    .map((item) => {
      item.directives.docStart = true;
      return item.toString({ lineWidth: 0 });
    })
    .join("\n");
}

export function verifyWebResolutions(original: string, combined: string): void {
  const before = dependencyDocument(original).toJS() as Record<string, Record<string, unknown>>;
  const after = dependencyDocument(combined).toJS() as Record<string, Record<string, unknown>>;
  for (const [path, importer] of Object.entries(before.importers ?? {})) {
    const moved = path === "." ? "apps/web" : `apps/web/${path}`;
    if (!isDeepStrictEqual(importer, after.importers?.[moved]))
      throw new CreateError(
        `${path} importer의 해석 결과가 바뀌었다`,
        "web 잠금 파일의 버전을 보존해 다시 생성한다.",
      );
  }
  for (const section of ["packages", "snapshots"]) {
    for (const [key, value] of Object.entries(before[section] ?? {})) {
      const resolved =
        section === "packages" ? (value as Record<string, unknown>).resolution : value;
      const actual =
        section === "packages"
          ? (after[section]?.[key] as Record<string, unknown> | undefined)?.resolution
          : after[section]?.[key];
      if (!isDeepStrictEqual(resolved, actual))
        throw new CreateError(
          `${key}의 해석 결과가 바뀌었다`,
          "web 잠금 파일의 의존성 해석을 보존한다.",
        );
    }
  }
}
```

`create/src/pnpm.ts`:

```ts
import { spawnSync } from "node:child_process";
import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";
import { CreateError } from "./errors.ts";

export type PnpmRunner = (cwd: string, args: string[]) => void;

export const runPnpm: PnpmRunner = (cwd, args) => {
  const entry = process.env.npm_execpath;
  if (!entry) throw new CreateError("pnpm을 찾을 수 없다", "pnpm 12.6.0으로 pnpm new를 실행한다.");
  const javascript = /\.[cm]?js$/.test(entry);
  const result = spawnSync(
    javascript ? process.execPath : entry,
    javascript ? [entry, ...args] : args,
    {
      cwd,
      env: gitEnvironment(),
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error && "code" in result.error && result.error.code === "ENOENT")
    throw new CreateError("pnpm을 찾을 수 없다", "pnpm 12.6.0을 설치하고 pnpm new로 실행한다.");
  if (result.error || result.status !== 0)
    throw new CreateError(
      `pnpm ${args.join(" ")} 실행에 실패했다`,
      result.error
        ? "pnpm 설치·의존성과 생성 입력을 확인한다."
        : (result.stdout + result.stderr).trim() || "pnpm 설치·의존성과 생성 입력을 확인한다.",
    );
};
```

`create/src/standalone.ts`를 고친다.

(1) 찾을 부분:

```ts
import type { Template } from "./arguments.ts";
import { CreateError } from "./errors.ts";

export function renameStandalone(root: string, template: Template, name: string): void {
  const readme = join(root, "README.md");
  const content = readFileSync(readme, "utf8");
  writeFileSync(readme, content.replace(/^[^\r\n]*/, `# ${name}`));
```

바꿀 내용:

```ts
import type { Template } from "./arguments.ts";
import { CreateError } from "./errors.ts";

export function renameStandalone(
  root: string,
  template: Template,
  name: string,
  imageName = `${name}-app`,
): void {
  const readme = join(root, "README.md");
  const content = readFileSync(readme, "utf8");
  writeFileSync(readme, content.replace(/^[^\r\n]*/, `# ${name}`));
```

(2) 찾을 부분:

```ts
    // 노드 값의 범위만 바꿔 주석, 앵커와 나머지 바이트를 보존한다.
    const edits = [
      { range: project.range, value: name },
      { range: image.range, value: `${name}-app` },
    ].sort((a, b) => b.range[0] - a.range[0]);
    let output = source;
    for (const edit of edits)
```

바꿀 내용:

```ts
    // 노드 값의 범위만 바꿔 주석, 앵커와 나머지 바이트를 보존한다.
    const edits = [
      { range: project.range, value: name },
      { range: image.range, value: imageName },
    ].sort((a, b) => b.range[0] - a.range[0]);
    let output = source;
    for (const edit of edits)
```

- [ ] **Step 7: 조합 루트 파일 원본을 만든다**

`create/assets/combo/.gitignore`:

```text
node_modules/
.turbo/
```

`create/assets/combo/AGENTS.md`:

```markdown
# {{NAME}}

FastAPI와 Next.js BFF를 함께 개발하는 프로젝트다. Node 24, pnpm 12.6.0과 uv를 쓴다.

## 구조

| 경로                                    | 내용                                                        |
| --------------------------------------- | ----------------------------------------------------------- |
| `apps/api/`                             | FastAPI api·worker·scheduler, Python 잠금 파일, 개발 인프라 |
| `apps/web/`                             | Next.js BFF, 화면, TypeSpec·목 사본, HTTP 통합과 E2E        |
| `scripts/`                              | 루트 명령 실행기와 Node 내장 테스트                         |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | 두 앱과 web 계약 패키지의 workspace·잠금 파일               |
| `turbo.json`                            | 앱 실행 순서와 캐시                                         |

앱 규칙은 [api 지침](apps/api/AGENTS.md)과 [web 지침](apps/web/AGENTS.md)을 따른다.
루트 compose는 없다. 인프라는 `apps/api/compose.yaml`이 맡고 compose 프로젝트 이름은 `{{NAME}}`이다.

## 명령

| 명령                               | 하는 일                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `pnpm setup`                       | 도구 확인·frozen 설치 → api setup → web setup        |
| `pnpm dev`                         | api·worker·scheduler와 백엔드 모드 web을 함께 실행   |
| `pnpm check`                       | 루트 포맷·실행기 테스트·지침 → api check → web check |
| `pnpm fix`                         | 앱 자동 수정과 루트 파일 포맷                        |
| `pnpm test`                        | api와 web 테스트를 차례로 실행                       |
| `pnpm test:e2e`                    | api E2E → api e2e:serve 위에서 web FastAPI E2E       |
| `pnpm gen`                         | api OpenAPI 내보내기 → web 타입 생성                 |
| `pnpm db:migrate`, `pnpm db:reset` | api 마이그레이션·개발 DB 재설정                      |

setup·E2E·DB 명령은 캐시하지 않는다. gen도 생성물 누락을 피하도록 캐시하지 않는다.
dev 이외 앱 명령은 동시 실행 수 1로 돌린다. check 성공은 한 줄, 실패는 실패한 단계 출력만 보여 준다.

## 앱 사이 흐름

- 계약은 code-first다. api 코드를 바꾸면 `pnpm gen`으로 `apps/api/openapi.json`을 내보낸 다음 web 타입을 다시 만든다.
- web의 `gen.config.json`이 api OpenAPI를 선택한다. 생성물은 직접 고치지 않는다. check가 최신 여부를 확인한다.
- web의 TypeSpec·목 사본은 프론트 개발과 HTTP 통합 테스트의 대역이다. api 변경을 자동으로 따라가지 않는다. 실제 연결은 FastAPI E2E가 확인한다.
- web은 Server Component가 읽고 Server Action이 쓰는 BFF다. 브라우저 직접 연결은 실시간과 presigned PUT이다.
- 각 앱의 setup은 `.env.example`로 환경 키를 준비한다. `.env`는 읽거나 출력하지 않는다.
- api e2e:serve는 E2E DB `app_e2e`와 Valkey DB 14를 사용하고 받은 명령의 종료 코드로 끝난다. 개발 DB·Valkey DB 0을 사용하지 않는다.
- Mailpit과 스토리지 버킷은 개발 인프라를 함께 쓰며 Mailpit 전체를 비우지 않는다. web E2E Origin만 CORS에 더한다.

## 포트

| 용도                          | 포트                       |
| ----------------------------- | -------------------------- |
| web dev, api dev              | 3000, 8000                 |
| 목 dev, admin 예약            | 4010, 3001                 |
| PostgreSQL, Valkey, S3, SMTP  | 25432, 26379, 28333, 21025 |
| Mailpit 화면·API, 모의 OAuth  | 28025, 28080               |
| Grafana, OTLP gRPC·HTTP(선택) | 23000, 24317, 24318        |
| api E2E, web E2E, 목 E2E      | 18000, 3100, 4110          |

프로젝트 여러 개를 동시에 실행하면 고정 포트가 겹친다. 동시 실행은 지원하지 않는다.
compose 이름이 프로젝트마다 달라 볼륨은 섞이지 않는다.

## 완료 기준

`pnpm check` 통과가 완료 기준이다. 앱 내부 변경은 해당 앱의 지침과 문서를 읽고 검증한다.
web check·build·E2E는 산출물을 공유하므로 차례로 실행한다. 의존성은 정확한 버전으로 고정하고 minimumReleaseAge 1440을 유지한다.
로딩 상태는 스피너나 스켈레톤만 쓴다. 지침은 AGENTS.md에 두고 CLAUDE.md는 `@AGENTS.md` 한 줄이다.
루트 포맷은 루트 소유 파일·scripts·루트 hook만 검사한다. 앱은 자기 check로 검사한다.
```

`create/assets/combo/CLAUDE.md`:

```markdown
@AGENTS.md
```

`create/assets/combo/README.md`:

````markdown
# {{NAME}}

FastAPI와 Next.js BFF 조합 프로젝트다. Node 24, pnpm 12.6.0, uv와 Docker가 필요하다.

```sh
pnpm setup
pnpm dev
```

web은 http://localhost:3000, api는 http://127.0.0.1:8000에서 열린다.
인프라는 `apps/api/compose.yaml`에 있고 루트 compose는 없다.

- `pnpm check`: 루트와 두 앱 검사.
- `pnpm gen`: api OpenAPI → web 타입. TypeSpec·목은 프론트 테스트의 대역이다.
- `pnpm test:e2e`: api E2E 후 실제 api 위에서 web E2E. api 18000, web 3100을 쓴다.
- `pnpm fix`, `pnpm test`, `pnpm db:migrate`, `pnpm db:reset`: [루트 지침](AGENTS.md)의 명령 표를 따른다.

구조는 `apps/api/`, `apps/web/`, `scripts/`다. 자세한 규칙과 인프라 포트는 [AGENTS.md](AGENTS.md), 앱별 절차는 [api](apps/api/AGENTS.md)와 [web](apps/web/AGENTS.md)을 따른다.
각 앱 setup이 환경 키를 준비한다. 고정 포트를 사용하므로 여러 프로젝트의 동시 실행은 지원하지 않는다.
````

`create/assets/combo/package.json`:

```json
{
  "name": "{{NAME}}",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "engines": {
    "node": "{{NODE}}"
  },
  "scripts": {
    "setup": "node scripts/setup.mjs",
    "dev": "turbo run dev --filter=api --filter=web",
    "check": "node scripts/check.mjs",
    "fix": "turbo run fix --filter=api --filter=web --concurrency=1 && node scripts/format.mjs --write",
    "test": "turbo run test --filter=api --filter=web --concurrency=1",
    "test:e2e": "node scripts/test-e2e.mjs",
    "gen": "turbo run gen --filter=api --filter=web --concurrency=1",
    "db:migrate": "pnpm --filter api run db:migrate",
    "db:reset": "pnpm --filter api run db:reset"
  },
  "devDependencies": {
    "turbo": "2.11.6",
    "lefthook": "{{LEFTHOOK}}",
    "prettier": "{{PRETTIER}}"
  }
}
```

`create/assets/combo/turbo.json`:

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "dev": { "persistent": true, "cache": false },
    "check": { "outputs": [] },
    "web#check": {
      "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/apps/api/openapi.json"],
      "outputs": []
    },
    "test": { "outputs": [] },
    "gen": { "cache": false },
    "web#gen": {
      "dependsOn": ["api#gen"],
      "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/apps/api/openapi.json"],
      "cache": false
    },
    "fix": { "cache": false }
  }
}
```

- [ ] **Step 8: 조합 루트 실행기를 만든다**

`create/assets/combo/scripts/check.mjs`:

```js
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { format } from "./format.mjs";
import { exitCode, isMain, run } from "./process.mjs";

export function instructionErrors(root) {
  const errors = [];
  function visit(folder) {
    const entries = readdirSync(folder, { withFileTypes: true });
    for (const name of ["AGENTS.md", "CLAUDE.md"]) {
      if (!entries.some((entry) => entry.isFile() && entry.name === name)) continue;
      const other = name === "AGENTS.md" ? "CLAUDE.md" : "AGENTS.md";
      if (!existsSync(join(folder, other)))
        errors.push(`${relative(root, join(folder, name))}:1 지침 짝 — ${other}를 추가한다.`);
    }
    const claude = join(folder, "CLAUDE.md");
    if (existsSync(claude) && readFileSync(claude, "utf8").trim() !== "@AGENTS.md")
      errors.push(`${relative(root, claude)}:1 지침 import — @AGENTS.md 한 줄로 저장한다.`);
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        ![
          "node_modules",
          ".git",
          ".venv",
          ".next",
          ".cache",
          ".turbo",
          "__pycache__",
          ".pytest_cache",
          ".ruff_cache",
        ].includes(entry.name)
      )
        visit(join(folder, entry.name));
    }
  }
  visit(root);
  const agents = join(root, "AGENTS.md");
  if (!existsSync(agents)) errors.push("AGENTS.md:1 지침 — 루트 지침을 추가한다.");
  else if (readFileSync(agents, "utf8").trimEnd().split(/\r?\n/).length > 200)
    errors.push("AGENTS.md:1 지침 길이 — 200줄 이하로 줄인다.");
  return errors;
}

export function check(root, { run: execute = run, output = console.log } = {}) {
  const steps = [
    () => format(root, false, execute),
    () => execute(process.execPath, ["--test", "scripts/*.test.mjs"], { cwd: root }),
    () => {
      const errors = instructionErrors(root);
      return { status: errors.length ? 1 : 0, stdout: errors.join("\n") };
    },
    () =>
      execute(
        "pnpm",
        ["exec", "turbo", "run", "check", "--filter=api", "--filter=web", "--concurrency=1"],
        { cwd: root },
      ),
  ];
  for (const step of steps) {
    const result = step();
    if (exitCode(result) !== 0) {
      output(
        [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n").trim() ||
          "검사를 실행할 수 없다 — pnpm setup으로 도구를 준비한다.",
      );
      return exitCode(result);
    }
  }
  output(`check 통과: ${steps.length}단계`);
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = check(resolve(import.meta.dirname, ".."));
```

`create/assets/combo/scripts/format.mjs`:

```js
import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { exitCode, isMain, run } from "./process.mjs";

export function rootFiles(root) {
  const files = readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && entry.name !== "pnpm-lock.yaml" && !entry.name.startsWith(".env"),
    )
    .map((entry) => entry.name);
  for (const folder of ["scripts", ".claude", ".github"]) {
    const base = join(root, folder);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
      if (entry.isFile()) files.push(relative(root, join(entry.parentPath, entry.name)));
    }
  }
  return files.sort();
}

export function format(root, write = false, execute = run) {
  return execute(
    "pnpm",
    ["exec", "prettier", write ? "--write" : "--check", "--ignore-unknown", ...rootFiles(root)],
    { cwd: root },
  );
}

if (isMain(import.meta.url)) {
  const result = format(resolve(import.meta.dirname, ".."), process.argv.includes("--write"));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = exitCode(result);
}
```

`create/assets/combo/scripts/process.mjs`:

```js
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function run(command, args, options = {}) {
  if (command === "pnpm") {
    const entry = process.env.npm_execpath;
    if (!entry) throw new Error("pnpm 실행 경로가 없다 — pnpm으로 명령을 실행한다.");
    const javascript = /\.[cm]?js$/.test(entry);
    return spawnSync(javascript ? process.execPath : entry, javascript ? [entry, ...args] : args, {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      ...options,
    });
  }
  return spawnSync(command, args, { encoding: "utf8", windowsHide: true, ...options });
}

export function exitCode(result) {
  return result.status ?? 1;
}

export function isMain(url) {
  return process.argv[1] !== undefined && url === pathToFileURL(process.argv[1]).href;
}
```

`create/assets/combo/scripts/setup.mjs`:

```js
import { resolve } from "node:path";
import { exitCode, isMain, run } from "./process.mjs";

export function setup(
  root,
  { run: execute = run, nodeVersion = process.versions.node, output = console.error } = {},
) {
  if (nodeVersion.split(".")[0] !== "24") {
    output("Node 24가 필요하다 — Node 24를 설치한다.");
    return 1;
  }
  for (const [tool, hint] of [
    ["pnpm", "pnpm 12.6.0"],
    ["uv", "uv"],
    ["docker", "Docker"],
  ]) {
    const result = execute(tool, ["--version"], { cwd: root });
    if (exitCode(result) !== 0) {
      output(`${hint}를 찾을 수 없다 — ${hint}를 설치하고 PATH에 추가한다.`);
      return 1;
    }
  }
  for (const args of [
    ["install", "--frozen-lockfile"],
    ["--filter", "api", "run", "setup"],
    ["--filter", "web", "run", "setup"],
  ]) {
    const result = execute("pnpm", args, { cwd: root, stdio: "inherit" });
    if (exitCode(result) !== 0) return exitCode(result);
  }
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = setup(resolve(import.meta.dirname, ".."));
```

`create/assets/combo/scripts/test-e2e.mjs`:

```js
import { join, resolve } from "node:path";
import { exitCode, isMain, run } from "./process.mjs";

export function testE2e(root, execute = run) {
  for (const args of [
    ["--filter", "api", "run", "test:e2e"],
    ["--filter", "api", "run", "e2e:serve", "--", "node", join(root, "scripts/web-e2e.mjs")],
  ]) {
    const result = execute("pnpm", args, { cwd: root, stdio: "inherit" });
    if (exitCode(result) !== 0) return exitCode(result);
  }
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = testE2e(resolve(import.meta.dirname, ".."));
```

`create/assets/combo/scripts/web-e2e.mjs`:

```js
import { resolve } from "node:path";
import { exitCode, isMain, run } from "./process.mjs";

export function webEnvironment(source) {
  for (const key of [
    "E2E_API_URL",
    "E2E_WEB_URL",
    "E2E_MAILPIT_URL",
    "E2E_OAUTH_URL",
    "E2E_RECENT_LOGIN_SECONDS",
  ]) {
    if (!source[key]) throw new Error(`${key} 설정이 없다 — api e2e:serve로 실행한다.`);
  }
  return {
    ...source,
    E2E_TARGET: "fastapi",
    APP_URL: source.E2E_WEB_URL,
    API_BASE_URL: `${source.E2E_API_URL.replace(/\/$/, "")}/api/v1`,
    NEXT_PUBLIC_REALTIME_URL: source.E2E_API_URL,
  };
}

export function webE2e(root, source = process.env, execute = run) {
  return exitCode(
    execute("pnpm", ["--filter", "web", "run", "test:e2e"], {
      cwd: root,
      env: webEnvironment(source),
      stdio: "inherit",
    }),
  );
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = webE2e(resolve(import.meta.dirname, ".."));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 9: 저장소 문서를 고친다**

`AGENTS.md`를 고친다.

(1) 찾을 부분:

```markdown
| `templates/`            | 템플릿. 각 폴더는 그대로 복사하면 동작하는 독립 프로젝트다                                |
| `templates/fastapi/`    | FastAPI 백엔드 템플릿                                                                     |
| `templates/nextjs/`     | Next.js BFF web. 자체 workspace의 계약·목과 인증·글·내 정보·세션·업로드·실시간 기능       |
| `create/`               | git 추적 템플릿 파일로 독립 프로젝트를 만드는 CLI                                         |
| `scripts/`              | check 실행기, 도구 설치기, 구조 비교, 지침·템플릿 검사, 동기화                            |
| `docs/`                 | 하네스 표준, API 규약, 스펙과 계획                                                        |

```

바꿀 내용:

```markdown
| `templates/`            | 템플릿. 각 폴더는 그대로 복사하면 동작하는 독립 프로젝트다                                |
| `templates/fastapi/`    | FastAPI 백엔드 템플릿                                                                     |
| `templates/nextjs/`     | Next.js BFF web. 자체 workspace의 계약·목과 인증·글·내 정보·세션·업로드·실시간 기능       |
| `create/`               | git 추적 템플릿 파일로 단독·FastAPI+web 조합 프로젝트를 만드는 CLI                        |
| `scripts/`              | check 실행기, 도구 설치기, 구조 비교, 지침·템플릿 검사, 동기화                            |
| `docs/`                 | 하네스 표준, API 규약, 스펙과 계획                                                        |

```

(2) 찾을 부분:

```markdown
| `pnpm gen`                                        | 계약을 컴파일하고 적합성 테스트와 목 서버의 타입을 다시 만든다                                                                                                                                                                                                                                    |
| `pnpm sync`                                       | 공유 자산 원본을 템플릿 사본 위치로 복사한다                                                                                                                                                                                                                                                      |
| `pnpm new <대상> --template <fastapi\|nextjs>`    | 저장소 밖에 단독 프로젝트를 만든다. `--name <이름>`, `--no-git`, `--help`를 지원한다                                                                                                                                                                                                              |
| `pnpm --dir templates/nextjs setup`               | web의 고정 의존성·Chromium 설치와 환경 준비                                                                                                                                                                                                                                                       |
| `pnpm --dir templates/nextjs dev`                 | 단독 모드의 web(3000)·목(4010), 백엔드 모드의 web                                                                                                                                                                                                                                                 |
| `pnpm --dir templates/nextjs check`               | web 자체 검사. 루트 check의 템플릿 구조·사본 검사와 함께 통과해야 한다                                                                                                                                                                                                                            |
```

바꿀 내용:

```markdown
| `pnpm gen`                                        | 계약을 컴파일하고 적합성 테스트와 목 서버의 타입을 다시 만든다                                                                                                                                                                                                                                    |
| `pnpm sync`                                       | 공유 자산 원본을 템플릿 사본 위치로 복사한다                                                                                                                                                                                                                                                      |
| `pnpm new <대상> --template <fastapi\|nextjs>`    | 저장소 밖에 단독 프로젝트를 만든다. `--name <이름>`, `--no-git`, `--help`를 지원한다                                                                                                                                                                                                              |
| `pnpm new <대상> --api fastapi --web`             | 저장소 밖에 apps/api·apps/web 조합을 만든다. web 의존성 버전을 보존하고 api OpenAPI로 web 타입을 생성한다. `--name`, `--no-git`를 지원한다                                                                                                                                                        |
| `pnpm --dir templates/nextjs setup`               | web의 고정 의존성·Chromium 설치와 환경 준비                                                                                                                                                                                                                                                       |
| `pnpm --dir templates/nextjs dev`                 | 단독 모드의 web(3000)·목(4010), 백엔드 모드의 web                                                                                                                                                                                                                                                 |
| `pnpm --dir templates/nextjs check`               | web 자체 검사. 루트 check의 템플릿 구조·사본 검사와 함께 통과해야 한다                                                                                                                                                                                                                            |
```

- [ ] **Step 10: 테스트가 통과하는지 확인한다**

Run(`templates/nextjs`에서): `pnpm test scripts/check/types.test.ts scripts/gen-feature.test.ts scripts/lint/config.test.ts scripts/workspace-root.test.ts`

Expected: 통과한다.

```text
Test Files 4 passed (4)
Tests 15 passed (15)
```

Run(`create`에서): `pnpm exec vitest run test/arguments.test.ts test/combo.test.ts test/real-templates.test.ts`

Expected: 통과한다.

```text
Test Files 3 passed (3)
Tests 34 passed (34)
```

Run(`create`에서): `node --test assets/combo/scripts/runners.test.mjs`

Expected: 통과한다.

```text
tests 5
pass 5
fail 0
```

- [ ] **Step 11: 검사를 돌린다**

Run(`templates/nextjs`에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 모든 단계를 다시 돌리려면 `templates/nextjs/.cache/check.json`을 지운다.

Run(`templates/nextjs`에서): `pnpm build`

Expected: `Compiled successfully`.

Run(`templates/nextjs`에서): `pnpm test:e2e`

Expected: `20 passed`(목 대상, 걸린 시간은 다르다).

Run(저장소 루트에서): `pnpm --filter @ai-template/create check`

Expected: 타입 검사와 Vitest·Node 테스트가 모두 통과한다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 11단계`로 시작하는 한 줄

- [ ] **Step 12: 커밋한다**

```bash
git add \
  AGENTS.md \
  create/assets/combo/.gitignore \
  create/assets/combo/AGENTS.md \
  create/assets/combo/CLAUDE.md \
  create/assets/combo/README.md \
  create/assets/combo/package.json \
  create/assets/combo/scripts/check.mjs \
  create/assets/combo/scripts/format.mjs \
  create/assets/combo/scripts/process.mjs \
  create/assets/combo/scripts/runners.test.mjs \
  create/assets/combo/scripts/setup.mjs \
  create/assets/combo/scripts/test-e2e.mjs \
  create/assets/combo/scripts/web-e2e.mjs \
  create/assets/combo/turbo.json \
  create/package.json \
  create/src/arguments.ts \
  create/src/combo.ts \
  create/src/create.ts \
  create/src/lockfile.ts \
  create/src/pnpm.ts \
  create/src/standalone.ts \
  create/test/arguments.test.ts \
  create/test/combo.test.ts \
  create/test/real-templates.test.ts \
  templates/nextjs/next.config.ts \
  templates/nextjs/scripts/check/types.test.ts \
  templates/nextjs/scripts/gen-feature.test.ts \
  templates/nextjs/scripts/lint/config.test.ts \
  templates/nextjs/scripts/test/dependency-links.ts \
  templates/nextjs/scripts/workspace-root.test.ts \
  templates/nextjs/scripts/workspace-root.ts
git commit -m "feat(create): generate FastAPI and web workspaces"
```

- [ ] **Step 13: 조합 생성 smoke를 돌린다**

CLI는 커밋하지 않은 템플릿 변경을 거절한다. 이 태스크는 `templates/nextjs`를 고치므로 이 smoke는 커밋 뒤에 실행한다.

Docker를 쓰지 않으며 조합 루트의 `pnpm setup`·`pnpm check`·`pnpm test:e2e`는 실행하지 않는다. 생성 중 `pnpm install`이 npm 레지스트리에 접속한다. `<임시 폴더>`는 `node -p "require('node:os').tmpdir()"`가 출력하는 OS 임시 폴더다.

Run(저장소 루트에서): `pnpm new <임시 폴더>/aitpl-t5-combo --api fastapi --web`

Expected: CLI 출력의 마지막 세 줄이 `생성 완료: <경로>`, `다음 명령: cd "<경로>"`, `pnpm setup`이다. 잠금 파일 생성·보존 검사·frozen 설치·web `gen`·이동·첫 커밋은 CLI 안에서 끝난다.

`<임시 폴더>/aitpl-t5-combo`에서 차례로:

- `git status --short` → 출력 없음. `git log -1 --format=%s` → `chore: create aitpl-t5-combo from ai-template <이 태스크 커밋의 short SHA>`
- `node --test scripts/*.test.mjs` → `tests 5`, `pass 5`
- `pnpm exec prettier --check --ignore-unknown AGENTS.md CLAUDE.md README.md package.json pnpm-workspace.yaml turbo.json .gitignore .gitattributes .editorconfig .prettierrc.json scripts` → `All matched files use Prettier code style!`
- `node -e "import('./scripts/check.mjs').then((m) => console.log(JSON.stringify(m.instructionErrors(process.cwd()))))"` → `[]`. import만 하므로 `check.mjs`의 본 실행(api check를 부르는 루트 `check`)은 돌지 않는다
- `pnpm --filter web run check` → `check 통과: 9단계`. `pnpm --filter web run build` → `Compiled successfully`(설계 §8.3 #3)
- `pnpm --filter web run gen` 뒤 `git status --short` → 출력 없음. 첫 커밋의 web 생성물이 api `openapi.json`과 맞다
- `pnpm exec turbo run gen --filter=api --filter=web --concurrency=1 --dry=json` → 작업은 `api#gen`·`web#gen` 둘뿐이고 `web#gen`이 `api#gen`에 의존하며 둘 다 cache false다. 실행하지 않는 dry run이다
- `apps/api`에서 인프라 없는 검사만 돌린다: `uv sync --frozen`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run basedpyright`, `uv run python -m tools.checks architecture`, `uv run python -m tools.checks harness`, `uv run pytest -q tools/tests/test_e2e.py tools/tests/test_processes.py tools/tests/test_stack_doc.py`(`55 passed`). `uv run poe` 명령은 실행하지 않는다. 래퍼 `package.json`과 `node_modules`가 하네스 검사를 깨지 않는다(설계 §8.3 #4)

끝나면 `aitpl-t5-combo`를 지운다. 셸이 재귀 삭제를 거부하면 지우지 말고 경로를 보고한다.


### Task 6: create CLI: 조합 하네스

설계 §5.8. 조합 루트의 Claude Code 설정·hook 디스패처·lefthook·Betterleaks·MCP 설정을 두 앱 설정에서 만든다. 앱 설정이 hook의 단일 원본으로 남고, 루트에서 Claude Code를 열어도 앱 폴더와 같은 검사가 돈다.

- `create/src/harness.ts`가 루트 `.claude/settings.json`을 만든다. 두 앱의 허용·차단 규칙을 합치고 파일 규칙의 `./`를 `./apps/<앱>/`으로 옮기며 중복을 뺀다. Bash·PowerShell에 루트 명령 어휘와 읽기 전용 git(`status`·`log`·`diff`·`show`)을 더한다.
- hook 4종은 exec form `node ${CLAUDE_PROJECT_DIR}/.claude/hooks/<이름>.mjs`다. PostToolUse(`Edit|Write|MultiEdit`, 120초), Stop(1800초), PreToolUse(`Bash|PowerShell|Edit|Write|MultiEdit`, 90초), SessionStart(180초)다. 승인본 설계는 PostToolUse를 `Edit`·`Write`, PreToolUse를 `Bash`·`PowerShell`만 적었다. PostToolUse는 두 앱 설정처럼 `MultiEdit`도 받고, PreToolUse는 편집 도구를 더해 api의 커밋된 마이그레이션 편집 보호를 루트에서도 유지한다. Task 8이 두 matcher를 설계 표에 적는다.
- 디스패처는 앱의 `.claude/settings.json`을 매번 읽고 matcher에 맞는 hook을 셸 없이 인자 배열과 timeout으로 실행한다. 작업 폴더와 `CLAUDE_PROJECT_DIR`은 앱 폴더이고 stdin JSON은 그대로 넘긴다.
- PostToolUse는 고친 파일이 속한 앱의 hook만 돌리고, 루트 소유 파일은 그 파일만 포맷한다. Stop은 `stop_hook_active`면 통과한다. git의 staged·unstaged·untracked 변경과 rename의 양쪽 경로로 바뀐 앱을 고르고, 루트 변경에는 포맷·Node 테스트·지침 3단계(`checkRoot`)만 돈다.
- 결과 합치기: exit 2나 JSON deny·block이 허용보다 우선하고 이유를 앱 이름과 함께 모은다. PreToolUse의 JSON 결정은 deny → defer → ask → allow 순서다. SessionStart는 한 앱의 진단이 실패해도 다른 앱 요약을 보존하고 종료 코드 0이다. 일반 exit 1은 막지 않는 오류로 알린다.
- Claude가 node로 직접 시작한 hook에는 `npm_execpath`가 없다. `pnpmEntry`가 PATH에서 pnpm 실행 파일이나 실제 JS 진입점을 찾아 앱 hook에도 넘긴다. Windows의 `.cmd`를 셸로 실행하지 않는다.
- 루트 `lefthook.yml`은 두 앱의 pre-commit 작업에서 `secrets`를 빼고 `root: apps/<앱>/`, 앱 이름 접두사, 저장소 기준 glob을 붙인다. 여기에 `root-format`(스테이징한 루트 파일만 포맷하고 다시 스테이징)과 Betterleaks 한 번을 더하고, pre-push는 `pnpm check`다. 루트 `.betterleaks.toml`은 두 앱의 생성물 예외를 `^apps/<앱>/` 안으로 제한해 합친다.
- Betterleaks는 web 작업 폴더에서 돌므로 루트 저장소 `git ../..`와 설정 `--config ../../.betterleaks.toml`을 함께 준다. 설정만 주면 저장소가 web으로 좁아져 스테이징한 루트 파일을 읽지 않는다.
- `.mcp.json`은 web 파일 그대로다. CLI는 frozen 설치 뒤 동적으로 만든 `.claude/settings.json`·`lefthook.yml`·`.mcp.json`을 고정 Prettier로 포맷하고 web `gen`을 돈다. 그래서 첫 커밋부터 루트 포맷 검사가 통과한다. 조합 `setup`은 frozen 설치 다음에 `pnpm exec lefthook install`을 한다.
- create는 `smol-toml` 1.9.0을 정확한 버전으로 선언한다. 잠금 파일은 create importer의 세 줄만 바뀐다.

실패 확인: 부모에는 `src/harness.ts`가 없어 하네스 suite가 수집되지 않는다. 픽스처 조합 테스트는 루트 `.mcp.json`을 읽다가 ENOENT로 실패한다(`1 failed | 6 passed`). Node 테스트는 `dispatch.mjs`와 `staged-format.mjs`가 없어 두 파일 모두 `ERR_MODULE_NOT_FOUND`다(`tests 2`, `fail 2`). GREEN은 Vitest `10 passed`와 Node `pass 23`이다.

**Files:**
- Create: `create/assets/combo/.claude/hooks/dispatch.mjs`, `create/assets/combo/.claude/hooks/post-tool-use.mjs`, `create/assets/combo/.claude/hooks/pre-tool-use.mjs`, `create/assets/combo/.claude/hooks/session-start.mjs`, `create/assets/combo/.claude/hooks/stop-check.mjs`, `create/assets/combo/scripts/staged-format.mjs`, `create/src/harness.ts`
- Modify: `create/assets/combo/AGENTS.md`, `create/assets/combo/scripts/check.mjs`, `create/assets/combo/scripts/process.mjs`, `create/assets/combo/scripts/setup.mjs`, `create/package.json`, `create/src/combo.ts`
- Test: `create/assets/combo/.claude/hooks/dispatch.test.mjs`, `create/assets/combo/scripts/runners.test.mjs`, `create/test/combo.test.ts`, `create/test/harness.test.ts`
- Generated(직접 고치지 않는다): `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Task 5의 `writeCombo`·`ComboTools`·`PnpmRunner`와 자산 복사, `scripts/process.mjs`의 `run`·`exitCode`·`isMain`, `scripts/check.mjs`의 `check`·`instructionErrors`, `scripts/format.mjs`, 두 앱의 `.claude/settings.json`·`lefthook.yml`·`.betterleaks.toml`, web의 `.mcp.json`과 `pnpm run tool betterleaks`(Betterleaks 1.8.1)
- Produces:
  - `create/src/harness.ts`: `mergeSettings(api: AppSettings, web: AppSettings)`(permissions·hooks), `mergeLefthook(api: string, web: string): string`, `mergeBetterleaks(api: string, web: string): string`, `writeHarness(root: string): void`. `writeCombo`가 workspace를 만들기 전에 부른다
  - `create/assets/combo/.claude/hooks/dispatch.mjs`: `dispatch(event, raw, { root, run, rootCheck, rootFormat })`는 `{ code, json?, stderr? }`를 돌려준다. `main(event)`. 진입점은 `post-tool-use.mjs`·`pre-tool-use.mjs`·`session-start.mjs`·`stop-check.mjs`다
  - `scripts/process.mjs`: `gitEnvironment(environment = process.env)`, `pnpmEntry(environment = process.env)`. `scripts/check.mjs`: `check(root, { run, output, apps = true })`, `checkRoot(root)`. `scripts/staged-format.mjs`: `formatFile(root, path, execute)`, `stagedFormat(root, execute)`
  - 조합 `setup`의 `pnpm exec lefthook install`, create `test` 스크립트의 `node --test assets/combo/scripts/*.test.mjs assets/combo/.claude/hooks/*.test.mjs`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`create/assets/combo/.claude/hooks/dispatch.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, delimiter } from "node:path";
import { dispatch } from "./dispatch.mjs";
import { gitEnvironment } from "../../scripts/process.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "aitpl-hooks space-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(
    "gitconfig",
    "[user]\nname = Fixture\nemail = fixture@example.com\n[commit]\ngpgsign = false\n",
  );
  const env = {
    ...gitEnvironment(),
    GIT_CONFIG_GLOBAL: join(root, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
  };
  for (const key of Object.keys(env))
    if (/^GIT_(AUTHOR|COMMITTER)_|^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$/.test(key))
      Reflect.deleteProperty(env, key);
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  write(".gitignore", ".cache/\ngitconfig\n");
  write("README.md", "# 루트\n");
  for (const app of ["api", "web"]) {
    write(`apps/${app}/file.ts`, "export const value = 1;\n");
    const hooks = Object.fromEntries(
      ["PostToolUse", "Stop", "PreToolUse", "SessionStart"].map((event) => [
        event,
        [
          {
            matcher: event === "PreToolUse" ? "Bash|PowerShell" : undefined,
            hooks: [
              {
                type: "command",
                command: process.execPath,
                args: ["${CLAUDE_PROJECT_DIR}/.claude/fake.mjs"],
                timeout: 5,
              },
            ],
          },
        ],
      ]),
    );
    write(`apps/${app}/.claude/settings.json`, JSON.stringify({ hooks }));
    write(
      `apps/${app}/.claude/fake.mjs`,
      `
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
const raw = readFileSync(0, 'utf8');
const input = JSON.parse(raw);
mkdirSync('.cache', { recursive: true });
appendFileSync(join('.cache', 'calls'), JSON.stringify({ raw, cwd: process.cwd(), project: process.env.CLAUDE_PROJECT_DIR, npmEntry: process.env.npm_execpath }) + '\\n');
const result = input.results?.${app} ?? {};
if (result.json) console.log(JSON.stringify(result.json));
if (result.text) console.log(result.text);
if (result.stderr) console.error(result.stderr);
process.exitCode = result.code ?? 0;
`,
    );
  }
  git("init", "-b", "main");
  git("add", ".");
  git("-c", "commit.gpgsign=false", "commit", "-m", "chore: fixture");
  const calls = (app) => {
    try {
      return readFileSync(join(root, `apps/${app}/.cache/calls`), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  };
  const invoke = (event, input = {}, options = {}) =>
    dispatch(event, JSON.stringify({ cwd: root, ...input }), { root, ...options });
  return { root, write, git, calls, invoke };
}

test("PostToolUse는 고친 앱만 골라 같은 입력과 앱 cwd·환경을 넘긴다", (t) => {
  const f = fixture(t);
  const input = {
    cwd: f.root,
    tool_name: "Write",
    tool_input: { file_path: join(f.root, "apps/web/file.ts") },
    results: {
      web: {
        json: {
          hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "남은 린트" },
        },
      },
    },
  };
  const raw = JSON.stringify(input);
  const result = dispatch("PostToolUse", raw, { root: f.root });
  assert.equal(result.json.hookSpecificOutput.additionalContext, "[web]\n남은 린트");
  assert.equal(f.calls("api").length, 0);
  assert.deepEqual(
    f.calls("web").map(({ raw, cwd, project }) => ({ raw, cwd, project })),
    [{ raw, cwd: join(f.root, "apps/web"), project: join(f.root, "apps/web") }],
  );
});

test("앱 hook에도 pnpm 진입점을 넘겨 직접 node 세션의 생성물 검사를 지원한다", (t) => {
  const f = fixture(t);
  const bin = join(f.root, ".cache/bin");
  const entry = join(bin, "node_modules/pnpm/bin/pnpm.cjs");
  f.write(".cache/bin/node_modules/pnpm/bin/pnpm.cjs", "// fixture\n");
  const previous = { path: process.env.PATH, npm: process.env.npm_execpath };
  process.env.PATH = `${bin}${delimiter}${process.env.PATH}`;
  delete process.env.npm_execpath;
  try {
    f.invoke("SessionStart");
    assert.equal(f.calls("web")[0].npmEntry, entry);
  } finally {
    if (previous.path === undefined) delete process.env.PATH;
    else process.env.PATH = previous.path;
    if (previous.npm === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = previous.npm;
  }
});

test("PostToolUse 루트 파일은 루트 포맷만 돌리고 밖의 경로는 건너뛴다", (t) => {
  const f = fixture(t);
  const paths = [];
  const rootFormat = (_root, path) => {
    paths.push(path);
    return { status: 0 };
  };
  f.invoke(
    "PostToolUse",
    { tool_name: "Edit", tool_input: { file_path: "README.md" } },
    { rootFormat },
  );
  f.invoke(
    "PostToolUse",
    { tool_name: "Edit", tool_input: { file_path: "../outside.ts" } },
    { rootFormat },
  );
  assert.deepEqual(paths, ["README.md"]);
  assert.equal(f.calls("api").length + f.calls("web").length, 0);
});

test("PostToolUse 앱의 block과 exit 2 오류는 도구 결과 문맥에 합친다", (t) => {
  const f = fixture(t);
  const input = { tool_name: "Edit", tool_input: { file_path: "apps/api/file.ts" } };
  const blocked = f.invoke("PostToolUse", {
    ...input,
    results: { api: { json: { decision: "block", reason: "린트 오류" } } },
  });
  assert.equal(blocked.json.decision, "block");
  assert.match(blocked.json.reason, /api.*\n린트 오류/);
  const failed = f.invoke("PostToolUse", {
    ...input,
    results: { api: { code: 2, stderr: "포맷 오류" } },
  });
  assert.equal(failed.json.decision, "block");
  assert.match(failed.json.reason, /포맷 오류/);
});

test("PreToolUse는 deny·exit 2를 합치고 allow가 거부를 덮지 않는다", (t) => {
  const f = fixture(t);
  const denied = f.invoke("PreToolUse", {
    tool_name: "Bash",
    tool_input: { command: "git push --force" },
    results: {
      api: {
        json: { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } },
      },
      web: {
        json: {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "강제 push",
          },
        },
      },
    },
  });
  assert.equal(denied.json.hookSpecificOutput.permissionDecision, "deny");
  assert.match(denied.json.hookSpecificOutput.permissionDecisionReason, /\[web\].*\n강제 push/);
  assert.equal(f.calls("api").length, 1);
  assert.equal(f.calls("web").length, 1);
  const both = f.invoke("PreToolUse", {
    tool_name: "PowerShell",
    results: {
      api: { code: 2, stderr: "DB 거부" },
      web: {
        json: {
          hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "hook 거부" },
        },
      },
    },
  });
  assert.match(both.json.hookSpecificOutput.permissionDecisionReason, /DB 거부[\s\S]*hook 거부/);
});

test("PreToolUse의 ask는 보존하며 빈 결과는 권한을 추가하지 않는다", (t) => {
  const f = fixture(t);
  assert.equal(f.invoke("PreToolUse", { tool_name: "Bash" }).json, undefined);
  const result = f.invoke("PreToolUse", {
    tool_name: "Bash",
    results: {
      web: {
        json: {
          hookSpecificOutput: { permissionDecision: "ask", permissionDecisionReason: "확인 필요" },
        },
      },
    },
  });
  assert.equal(result.json.hookSpecificOutput.permissionDecision, "ask");
});

test("exit 2는 JSON allow보다 먼저 거부하고 JSON deny 이유를 stderr보다 먼저 쓴다", (t) => {
  const f = fixture(t);
  const result = f.invoke("PreToolUse", {
    tool_name: "Bash",
    results: {
      api: {
        code: 2,
        stderr: "exit 2 거부",
        json: { hookSpecificOutput: { permissionDecision: "allow" } },
      },
      web: {
        code: 2,
        stderr: "낮은 우선순위",
        json: {
          hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "JSON 거부" },
        },
      },
    },
  });
  assert.equal(result.json.hookSpecificOutput.permissionDecision, "deny");
  assert.match(
    result.json.hookSpecificOutput.permissionDecisionReason,
    /exit 2 거부[\s\S]*JSON 거부/,
  );
  assert.doesNotMatch(result.json.hookSpecificOutput.permissionDecisionReason, /낮은 우선순위/);
});

test("SessionStart는 한 앱이 실패해도 다른 앱 요약을 보존하고 성공으로 끝난다", (t) => {
  const f = fixture(t);
  const result = f.invoke("SessionStart", {
    results: { api: { code: 2, stderr: "설정 확인 필요" }, web: { text: "web 상태" } },
  });
  assert.equal(result.code, 0);
  assert.match(result.json.hookSpecificOutput.additionalContext, /설정 확인 필요/);
  assert.match(result.json.hookSpecificOutput.additionalContext, /web 상태/);
});

test("Stop은 새 파일이 있는 두 앱의 block·exit 2 이유를 모두 모은다", (t) => {
  const f = fixture(t);
  f.write("apps/api/new.py", "새 api\n");
  f.write("apps/web/new.ts", "새 web\n");
  const result = f.invoke("Stop", {
    results: {
      api: { code: 2, stderr: "api 실패" },
      web: { json: { decision: "block", reason: "web 실패" } },
    },
  });
  assert.equal(result.json.decision, "block");
  assert.match(result.json.reason, /api 실패[\s\S]*web 실패/);
});

test("SessionStart는 앱 JSON·일반 stdout을 이름과 함께 이어 붙인다", (t) => {
  const f = fixture(t);
  const result = f.invoke("SessionStart", {
    results: {
      api: {
        json: {
          hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "인프라 꺼짐" },
        },
      },
      web: { text: "생성물 최신" },
    },
  });
  assert.equal(
    result.json.hookSpecificOutput.additionalContext,
    "[api]\n인프라 꺼짐\n\n[web]\n생성물 최신",
  );
});

test("Stop은 깨끗한 저장소와 재진입을 검사 없이 통과시킨다", (t) => {
  const f = fixture(t);
  const rootCheck = () => {
    throw new Error("검사하면 안 됨");
  };
  assert.equal(f.invoke("Stop", {}, { rootCheck }).json, undefined);
  f.write("apps/api/file.ts", "바뀜\n");
  assert.equal(f.invoke("Stop", { stop_hook_active: true }, { rootCheck }).json, undefined);
  assert.equal(f.calls("api").length + f.calls("web").length, 0);
});

test("Stop은 바뀐 앱의 이유와 루트 검사 실패만 합친다", (t) => {
  const f = fixture(t);
  f.write("apps/api/file.ts", "api 변경\n");
  f.write("README.md", "루트 변경\n");
  const result = f.invoke(
    "Stop",
    { results: { api: { json: { decision: "block", reason: "api 타입 오류" } } } },
    { rootCheck: () => ({ status: 1, stdout: "루트 포맷 오류" }) },
  );
  assert.equal(result.json.decision, "block");
  assert.match(result.json.reason, /api 타입 오류/);
  assert.match(result.json.reason, /루트 포맷 오류/);
  assert.equal(f.calls("web").length, 0);
});

test("Stop은 rename의 양쪽 앱과 새 파일을 보고 git 환경을 격리한다", (t) => {
  const f = fixture(t);
  f.git("mv", "apps/api/file.ts", "apps/web/renamed.ts");
  const previous = process.env.GIT_DIR;
  process.env.GIT_DIR = join(f.root, "missing-git");
  try {
    assert.equal(f.invoke("Stop").json, undefined);
    assert.equal(f.calls("api").length, 1);
    assert.equal(f.calls("web").length, 1);
  } finally {
    if (previous === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previous;
  }
});

test("앱 설정을 매번 읽고 matcher가 다른 hook은 실행하지 않는다", (t) => {
  const f = fixture(t);
  f.write(
    "apps/api/.claude/settings.json",
    JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: "Edit|Write", hooks: [{ type: "command", command: "없는-명령" }] }],
      },
    }),
  );
  assert.equal(f.invoke("PreToolUse", { tool_name: "Bash" }).json, undefined);
  assert.equal(f.calls("api").length, 0);
  const result = f.invoke("PreToolUse", { tool_name: "Edit" });
  assert.equal(result.json.hookSpecificOutput.permissionDecision, "deny");
  assert.match(result.json.hookSpecificOutput.permissionDecisionReason, /api/);
});

test("앱의 일반 오류는 비차단 오류로 알리고 깨진 설정은 Stop을 막는다", (t) => {
  const f = fixture(t);
  f.write("apps/web/file.ts", "변경\n");
  const result = f.invoke("Stop", { results: { web: { code: 1, stderr: "실행 실패" } } });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /실행 실패/);
  f.write("apps/web/.claude/settings.json", "{잘못된 설정");
  assert.equal(f.invoke("Stop").json.decision, "block");
});

test("exec 진입점은 표준 입력을 받아 JSON 한 줄로 응답한다", (t) => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, [join(import.meta.dirname, "pre-tool-use.mjs")], {
    input: JSON.stringify({
      cwd: f.root,
      tool_name: "Bash",
      results: { web: { code: 2, stderr: "거부" } },
    }),
    env: { ...gitEnvironment(), CLAUDE_PROJECT_DIR: f.root },
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(result.stdout.trim().split("\n").length, 1);
});
```

`create/assets/combo/scripts/runners.test.mjs` 전체를 다음으로 바꾼다.

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup } from "./setup.mjs";
import { check, instructionErrors } from "./check.mjs";
import { testE2e } from "./test-e2e.mjs";
import { webEnvironment, webE2e } from "./web-e2e.mjs";
import { stagedFormat } from "./staged-format.mjs";
import { run as runProcess } from "./process.mjs";

test("setup은 도구 확인·설치·api·web 순서이며 첫 실패에서 멈춘다", () => {
  const calls = [];
  const run = (command, args, options) => {
    calls.push([command, args, options.cwd]);
    return { status: args.includes("setup") ? 7 : 0, stdout: "", stderr: "" };
  };
  assert.equal(setup("/combo", { run, nodeVersion: "24.19.0", output: () => undefined }), 7);
  assert.deepEqual(
    calls.map(([, args]) => args),
    [
      ["--version"],
      ["--version"],
      ["--version"],
      ["install", "--frozen-lockfile"],
      ["exec", "lefthook", "install"],
      ["--filter", "api", "run", "setup"],
    ],
  );
  assert.equal(setup("/combo", { run, nodeVersion: "22.0.0", output: () => undefined }), 1);
});

test("setup은 도구별 설치 안내를 쓰고 준비되면 web까지 실행한다", () => {
  for (const tool of ["pnpm", "uv", "docker"]) {
    const messages = [];
    assert.equal(
      setup("/combo", {
        nodeVersion: "24.19.0",
        output: (text) => messages.push(text),
        run: (command) => ({ status: command === tool ? 1 : 0 }),
      }),
      1,
    );
    assert.match(messages[0], /설치하고 PATH/);
    assert.match(messages[0], new RegExp(tool, "i"));
  }
  const args = [];
  assert.equal(
    setup("/combo", {
      nodeVersion: "24.19.0",
      run: (_command, values) => {
        args.push(values);
        return { status: 0 };
      },
    }),
    0,
  );
  assert.deepEqual(args.at(-1), ["--filter", "web", "run", "setup"]);
});

test("E2E 실행기는 첫 실패를 전파하고 web 실행기의 절대 경로를 넘긴다", () => {
  const calls = [];
  const run = (_command, args, options) => {
    calls.push([args, options.cwd]);
    return { status: 0 };
  };
  assert.equal(testE2e(import.meta.dirname, run), 0);
  assert.deepEqual(calls[0][0], ["--filter", "api", "run", "test:e2e"]);
  assert.deepEqual(calls[1][0], [
    "--filter",
    "api",
    "run",
    "e2e:serve",
    "--",
    "node",
    join(import.meta.dirname, "scripts/web-e2e.mjs"),
  ]);
  assert.equal(
    testE2e(import.meta.dirname, () => ({ status: 9 })),
    9,
  );
});

test("백엔드 E2E 값만 web 대상 변수로 바꾸며 누락은 실행 전에 실패한다", () => {
  const source = {
    KEEP: "yes",
    E2E_API_URL: "http://127.0.0.1:18000",
    E2E_WEB_URL: "http://localhost:3100",
    E2E_MAILPIT_URL: "http://127.0.0.1:28025",
    E2E_OAUTH_URL: "http://127.0.0.1:28080",
    E2E_RECENT_LOGIN_SECONDS: "10",
  };
  const env = webEnvironment(source);
  assert.equal(env.E2E_TARGET, "fastapi");
  assert.equal(env.APP_URL, source.E2E_WEB_URL);
  assert.equal(env.API_BASE_URL, `${source.E2E_API_URL}/api/v1`);
  assert.equal(env.NEXT_PUBLIC_REALTIME_URL, source.E2E_API_URL);
  assert.equal(env.KEEP, "yes");
  for (const key of Object.keys(source).filter((key) => key.startsWith("E2E_"))) {
    assert.throws(() => webEnvironment({ ...source, [key]: "" }), /설정/);
  }
  assert.equal(
    webE2e("/combo", source, (_command, args, options) => {
      assert.deepEqual(args, ["--filter", "web", "run", "test:e2e"]);
      assert.deepEqual(options.env, env);
      return { status: 6 };
    }),
    6,
  );
});

test("check는 성공 한 줄 또는 실패한 단계만 출력하고 앱을 필터링한다", () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-root-check-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "# 규칙\n");
    writeFileSync(join(root, "CLAUDE.md"), "@AGENTS.md\n");
    const output = [];
    const calls = [];
    const run = (_command, args) => {
      calls.push(args);
      return { status: 0, stdout: "숨김", stderr: "" };
    };
    assert.equal(check(root, { run, output: (text) => output.push(text) }), 0);
    assert.deepEqual(output, ["check 통과: 4단계"]);
    assert.deepEqual(calls.at(-1), [
      "exec",
      "turbo",
      "run",
      "check",
      "--filter=api",
      "--filter=web",
      "--concurrency=1",
    ]);
    output.length = 0;
    assert.equal(
      check(root, {
        run: () => ({ status: 3, stdout: "형식 오류", stderr: "" }),
        output: (text) => output.push(text),
      }),
      3,
    );
    assert.deepEqual(output, ["형식 오류"]);
    const rootCalls = [];
    assert.equal(
      check(root, {
        apps: false,
        run: (_command, args) => {
          rootCalls.push(args);
          return { status: 0 };
        },
        output: () => undefined,
      }),
      0,
    );
    assert.equal(
      rootCalls.some((args) => args.includes("turbo")),
      false,
    );
    assert.deepEqual(rootCalls.at(-1), [
      "--test",
      "scripts/*.test.mjs",
      ".claude/hooks/*.test.mjs",
    ]);
    writeFileSync(join(root, "AGENTS.md"), Array(202).fill("규칙").join("\n"));
    mkdirSync(join(root, "apps/api"), { recursive: true });
    writeFileSync(join(root, "apps/api/AGENTS.md"), "# api\n");
    assert.equal(instructionErrors(root).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("루트 staged 포맷은 앱·잠금 파일을 빼고 고친 루트 파일만 다시 스테이징한다", () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-root-format-"));
  try {
    writeFileSync(join(root, "README.md"), "# 루트\n");
    writeFileSync(join(root, "pnpm-lock.yaml"), "잠금\n");
    const calls = [];
    const result = stagedFormat(root, (command, args) => {
      calls.push([command, args]);
      return {
        status: 0,
        stdout:
          command === "git" && args[0] === "diff"
            ? "README.md\0apps/web/file.ts\0pnpm-lock.yaml\0"
            : "",
      };
    });
    assert.equal(result.status, 0);
    assert.deepEqual(calls[1], [
      "pnpm",
      ["exec", "prettier", "--write", "--ignore-unknown", "README.md"],
    ]);
    assert.deepEqual(calls[2], ["git", ["add", "--", "README.md"]]);
    assert.equal(stagedFormat(root, () => ({ status: 3 })).status, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("node로 직접 실행한 hook도 npm_execpath 없이 PATH의 pnpm JS를 돌린다", () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-pnpm-entry-"));
  try {
    mkdirSync(join(root, "node_modules/pnpm/bin"), { recursive: true });
    writeFileSync(
      join(root, "node_modules/pnpm/bin/pnpm.cjs"),
      "console.log(JSON.stringify(process.argv.slice(2)));\n",
    );
    const result = runProcess("pnpm", ["exec", "prettier", "파일 이름.md"], {
      env: { PATH: root },
    });
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), ["exec", "prettier", "파일 이름.md"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

`create/test/combo.test.ts`를 고친다.

(1) 찾을 부분:

```ts
  write(root, "templates/nextjs/.github/workflows/ci.yml", "name: web\n");
  write(root, "templates/fastapi/.github/workflows/ci.yml", "name: api\n");
  write(root, "templates/fastapi/openapi.json", "{}\n");
  write(root, ".gitattributes", "* text=auto eol=lf\n");
  write(root, ".editorconfig", "root = true\n");
  git(root, "add", ".");
```

바꿀 내용:

```ts
  write(root, "templates/nextjs/.github/workflows/ci.yml", "name: web\n");
  write(root, "templates/fastapi/.github/workflows/ci.yml", "name: api\n");
  write(root, "templates/fastapi/openapi.json", "{}\n");
  for (const template of ["fastapi", "nextjs"]) {
    write(
      root,
      `templates/${template}/.claude/settings.json`,
      '{"permissions":{"allow":[],"deny":[]}}\n',
    );
    write(root, `templates/${template}/lefthook.yml`, "pre-commit:\n  jobs: []\n");
    write(root, `templates/${template}/.betterleaks.toml`, "[extend]\nuseDefault = true\n");
  }
  write(
    root,
    "templates/nextjs/.mcp.json",
    '{"mcpServers":{"next-devtools":{"command":"npx","args":["--yes","next-devtools-mcp@0.4.0"]}}}\n',
  );
  write(root, ".gitattributes", "* text=auto eol=lf\n");
  write(root, ".editorconfig", "root = true\n");
  git(root, "add", ".");
```

(2) 찾을 부분:

```ts
    },
  });
  expect(result.committed).toBe(true);
  expect(commands).toEqual([
    ["--version"],
    ["install", "--lockfile-only"],
    ["install", "--frozen-lockfile"],
    ["--filter", "web", "run", "gen"],
  ]);
  expect(git(target, "status", "--porcelain")).toBe("");
```

바꿀 내용:

```ts
    },
  });
  expect(result.committed).toBe(true);
  expect(JSON.parse(readFileSync(join(target, ".mcp.json"), "utf8"))).toMatchObject({
    mcpServers: { "next-devtools": { command: "npx" } },
  });
  expect(existsSync(join(target, ".claude/hooks/stop-check.mjs"))).toBe(true);
  expect(commands).toEqual([
    ["--version"],
    ["install", "--lockfile-only"],
    ["install", "--frozen-lockfile"],
    ["exec", "prettier", "--write", ".claude/settings.json", "lefthook.yml", ".mcp.json"],
    ["--filter", "web", "run", "gen"],
  ]);
  expect(git(target, "status", "--porcelain")).toBe("");
```

`create/test/harness.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { it, expect } from "vitest";
import { parse as yaml } from "yaml";
import { parse as toml } from "smol-toml";
import { mergeSettings, mergeLefthook, mergeBetterleaks } from "../src/harness.ts";

const template = (app: string, file: string) =>
  readFileSync(resolve(import.meta.dirname, `../../templates/${app}/${file}`), "utf8");

it("앱 경로 권한은 범위를 옮기고 명령 합집합에 루트 어휘를 더한다", () => {
  const settings = mergeSettings(
    JSON.parse(template("fastapi", ".claude/settings.json")) as Parameters<typeof mergeSettings>[0],
    JSON.parse(template("nextjs", ".claude/settings.json")) as Parameters<typeof mergeSettings>[1],
  );
  expect(settings.permissions.deny).toContain("Read(./apps/api/.env)");
  expect(settings.permissions.deny).toContain("Edit(./apps/web/src/lib/api/schema.d.ts)");
  expect(settings.permissions.allow).toContain("Read(./apps/web/.env.example)");
  for (const shell of ["Bash", "PowerShell"]) {
    expect(settings.permissions.allow).toContain(`${shell}(pnpm db:migrate *)`);
    expect(settings.permissions.allow).toContain(`${shell}(pnpm db:reset *)`);
    expect(
      settings.permissions.allow.filter((rule) => rule === `${shell}(git status *)`),
    ).toHaveLength(1);
  }
  expect(settings.permissions.deny).not.toContain("Read(./.env)");
  expect(settings.hooks.PreToolUse[0]?.matcher).toBe("Bash|PowerShell|Edit|Write|MultiEdit");
  for (const groups of Object.values(settings.hooks)) {
    expect(groups[0]?.hooks[0]).toMatchObject({ type: "command", command: "node" });
    expect(groups[0]?.hooks[0]?.args[0]).toMatch(
      /^\$\{CLAUDE_PROJECT_DIR\}\/\.claude\/hooks\/.+\.mjs$/,
    );
  }
});

it("앱 hook 작업의 옵션과 glob 범위를 보존하고 비밀 스캔은 한 번만 둔다", () => {
  const merged = yaml(
    mergeLefthook(template("fastapi", "lefthook.yml"), template("nextjs", "lefthook.yml")),
  ) as {
    "pre-commit": {
      jobs: { name: string; root?: string; glob?: string; run: string; stage_fixed?: boolean }[];
    };
    "pre-push": { jobs: { run: string }[] };
  };
  const jobs = merged["pre-commit"].jobs;
  expect(jobs.find((job) => job.name === "api-format")).toMatchObject({
    root: "apps/api/",
    glob: "apps/api/*.py",
    stage_fixed: true,
  });
  expect(jobs.find((job) => job.name === "web-lint")).toMatchObject({
    root: "apps/web/",
    glob: "apps/web/*.{ts,tsx,js,mjs}",
  });
  expect(jobs.filter((job) => job.run.includes("betterleaks"))).toHaveLength(1);
  expect(jobs.find((job) => job.name === "secrets")?.run).toContain(
    "pnpm --filter web run -s tool betterleaks",
  );
  expect(jobs.find((job) => job.name === "secrets")?.run).toContain("betterleaks git ../.. ");
  expect(merged["pre-push"].jobs).toEqual([{ name: "check", run: "pnpm check" }]);
});

it("비밀 스캔 예외를 앱 안으로 제한하며 수기 코드와 루트는 계속 검사한다", () => {
  const merged = toml(
    mergeBetterleaks(
      template("fastapi", ".betterleaks.toml"),
      template("nextjs", ".betterleaks.toml"),
    ),
  ) as { extend: { useDefault: boolean }; allowlists: { paths: string[] }[] };
  expect(merged.extend.useDefault).toBe(true);
  const ignored = (path: string) =>
    merged.allowlists.some((list) => list.paths.some((pattern) => new RegExp(pattern).test(path)));
  for (const path of [
    "apps/api/uv.lock",
    "apps/api/openapi.json",
    "apps/api/api-style/lint.mjs",
    "apps/web/contract/mock/src/server.ts",
    "apps/web/src/lib/generated/errors.ts",
    "apps/web/generated/api.ts",
    "apps/web/src/lib/api/schema.d.ts",
  ])
    expect(ignored(path)).toBe(true);
  for (const path of [
    "src/generated/secrets.ts",
    "apps/api/src/generated/secrets.py",
    "apps/web/src/features/posts/actions.ts",
    "apps/api/src/app/core/config.py",
    "apps/api/contract/source.ts",
    "apps/web/openapi.json",
  ])
    expect(ignored(path)).toBe(false);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`create`에서): `pnpm exec vitest run test/combo.test.ts test/harness.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 네트워크 없는 fixture 조합의 배치·workspace·실행 순서와 첫 커밋을 확인한다
FAIL  test/harness.test.ts [ test/harness.test.ts ]
Error: Cannot find module '../src/harness.ts' imported from create/test/harness.test.ts
FAIL  test/combo.test.ts > 네트워크 없는 fixture 조합의 배치·workspace·실행 순서와 첫 커밋을 확인한다
Error: ENOENT: no such file or directory, open '<임시 폴더>/aitpl-create-test-2VX9fH/aitpl-combo/.mcp.json'
Test Files 2 failed (2)
Tests 1 failed | 6 passed (7)
```

Run(`create`에서): `node --test assets/combo/.claude/hooks/dispatch.test.mjs assets/combo/scripts/runners.test.mjs`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
throw new ERR_MODULE_NOT_FOUND(
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'create/assets/combo/.claude/hooks/dispatch.mjs' imported from create/assets/combo/.claude/hooks/dispatch.test.mjs
code: 'ERR_MODULE_NOT_FOUND',
✖ assets/combo/.claude/hooks/dispatch.test.mjs
throw new ERR_MODULE_NOT_FOUND(
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'create/assets/combo/scripts/staged-format.mjs' imported from create/assets/combo/scripts/runners.test.mjs
code: 'ERR_MODULE_NOT_FOUND',
✖ assets/combo/scripts/runners.test.mjs
tests 2
pass 0
fail 2
```

- [ ] **Step 3: create 패키지 설정을 고친다**

`create/package.json` 전체를 다음으로 바꾼다.

```json
{
  "name": "@ai-template/create",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run && node --test assets/combo/scripts/*.test.mjs assets/combo/.claude/hooks/*.test.mjs",
    "check": "pnpm run typecheck && pnpm run test"
  },
  "dependencies": {
    "smol-toml": "1.9.0",
    "yaml": "2.9.1"
  }
}
```

- [ ] **Step 4: create CLI 코드를 만들고 고친다**

`create/src/combo.ts`를 고친다.

(1) 찾을 부분:

```ts
import { rewriteImporters, verifyWebResolutions } from "./lockfile.ts";
import { renameStandalone } from "./standalone.ts";
import type { PnpmRunner } from "./pnpm.ts";

export interface ComboTools {
  readonly assets?: string;
```

바꿀 내용:

```ts
import { rewriteImporters, verifyWebResolutions } from "./lockfile.ts";
import { renameStandalone } from "./standalone.ts";
import type { PnpmRunner } from "./pnpm.ts";
import { writeHarness } from "./harness.ts";

export interface ComboTools {
  readonly assets?: string;
```

(2) 찾을 부분:

```ts
  for (const file of [".gitattributes", ".editorconfig"])
    copyFileSync(join(repository, file), join(root, file));
  copyFileSync(join(web, ".prettierrc.json"), join(root, ".prettierrc.json"));
  const workspace = parseDocument(readFileSync(join(web, "pnpm-workspace.yaml"), "utf8"));
  workspace.set("packages", ["apps/api", "apps/web", "apps/web/contract/*"]);
  // workspace 이동 뒤에도 계약 패키지의 TypeScript peer를 템플릿 버전으로 유지한다.
```

바꿀 내용:

```ts
  for (const file of [".gitattributes", ".editorconfig"])
    copyFileSync(join(repository, file), join(root, file));
  copyFileSync(join(web, ".prettierrc.json"), join(root, ".prettierrc.json"));
  writeHarness(root);
  const workspace = parseDocument(readFileSync(join(web, "pnpm-workspace.yaml"), "utf8"));
  workspace.set("packages", ["apps/api", "apps/web", "apps/web/contract/*"]);
  // workspace 이동 뒤에도 계약 패키지의 TypeScript peer를 템플릿 버전으로 유지한다.
```

(3) 찾을 부분:

```ts
  pnpm(root, ["install", "--lockfile-only"]);
  verifyWebResolutions(lock, readFileSync(join(root, "pnpm-lock.yaml"), "utf8"));
  pnpm(root, ["install", "--frozen-lockfile"]);
  pnpm(root, ["--filter", "web", "run", "gen"]);
}
```

바꿀 내용:

```ts
  pnpm(root, ["install", "--lockfile-only"]);
  verifyWebResolutions(lock, readFileSync(join(root, "pnpm-lock.yaml"), "utf8"));
  pnpm(root, ["install", "--frozen-lockfile"]);
  pnpm(root, ["exec", "prettier", "--write", ".claude/settings.json", "lefthook.yml", ".mcp.json"]);
  pnpm(root, ["--filter", "web", "run", "gen"]);
}
```

`create/src/harness.ts`:

```ts
import { readFileSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

interface AppSettings {
  permissions: { allow: string[]; deny: string[] };
}

const vocabulary = [
  "setup",
  "dev",
  "check",
  "fix",
  "test",
  "test:e2e",
  "gen",
  "db:migrate",
  "db:reset",
];

export function mergeSettings(api: AppSettings, web: AppSettings) {
  const rules = (kind: "allow" | "deny") =>
    [api, web].flatMap((settings, index) =>
      settings.permissions[kind].map((rule) =>
        rule.replace(
          /^(Read|Edit|Write|Glob|Grep)\(\.\//,
          `$1(./apps/${index === 0 ? "api" : "web"}/`,
        ),
      ),
    );
  const allow = rules("allow");
  for (const shell of ["Bash", "PowerShell"]) {
    for (const command of vocabulary) allow.push(`${shell}(pnpm ${command} *)`);
    for (const command of ["status", "log", "diff", "show"])
      allow.push(`${shell}(git ${command} *)`);
  }
  const hook = (file: string, timeout: number, matcher?: string) => [
    {
      ...(matcher ? { matcher } : {}),
      hooks: [
        {
          type: "command",
          command: "node",
          args: [`\${CLAUDE_PROJECT_DIR}/.claude/hooks/${file}.mjs`],
          timeout,
        },
      ],
    },
  ];
  return {
    permissions: { allow: [...new Set(allow)], deny: [...new Set(rules("deny"))] },
    hooks: {
      PostToolUse: hook("post-tool-use", 120, "Edit|Write|MultiEdit"),
      Stop: hook("stop-check", 1800),
      // api의 커밋된 마이그레이션 편집 검사도 루트에서 유지한다.
      PreToolUse: hook("pre-tool-use", 90, "Bash|PowerShell|Edit|Write|MultiEdit"),
      SessionStart: hook("session-start", 180),
    },
  };
}

interface Job {
  name: string;
  glob?: string;
  run: string;
  [key: string]: unknown;
}

export function mergeLefthook(api: string, web: string): string {
  const jobs = [api, web].flatMap((source, index) => {
    const app = index === 0 ? "api" : "web";
    const config = parse(source) as { "pre-commit": { jobs: Job[] } };
    return config["pre-commit"].jobs
      .filter((job) => job.name !== "secrets")
      .map((job) => ({
        ...job,
        name: `${app}-${job.name}`,
        root: `apps/${app}/`,
        ...(job.glob ? { glob: `apps/${app}/${job.glob}` } : {}),
      }));
  });
  return stringify({
    "pre-commit": {
      jobs: [
        ...jobs,
        { name: "root-format", run: "node scripts/staged-format.mjs" },
        {
          name: "secrets",
          run: "pnpm --filter web run -s tool betterleaks git ../.. --pre-commit --staged --no-banner --redact --config ../../.betterleaks.toml",
        },
      ],
    },
    "pre-push": { jobs: [{ name: "check", run: "pnpm check" }] },
  });
}

export function mergeBetterleaks(api: string, web: string): string {
  const paths = [api, web].flatMap((source, index) => {
    const app = index === 0 ? "api" : "web";
    const config = parseToml(source) as { prefilter?: string; allowlists?: { paths: string[] }[] };
    const patterns = [
      ...[...(config.prefilter ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? ""),
      ...(config.allowlists ?? []).flatMap((list) => list.paths),
    ];
    return patterns.map((pattern) => {
      // 루트 앵커와 경로 경계를 앱의 상대 경로 기준으로 옮긴다.
      const local = pattern.replace(/^\^/, "").replace(/\(\^\|\/\)/g, "(?:|.*/)");
      return `^apps/${app}/${pattern.startsWith("^") ? "" : ".*"}(?:${local})`;
    });
  });
  return (
    "# 앱의 생성물 예외만 합친다. 루트와 수기 코드는 계속 검사한다.\n" +
    stringifyToml({ extend: { useDefault: true }, allowlists: [{ paths: [...new Set(paths)] }] })
  );
}

export function writeHarness(root: string): void {
  const source = (app: string, file: string) =>
    readFileSync(join(root, `apps/${app}`, file), "utf8");
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(
    join(root, ".claude/settings.json"),
    JSON.stringify(
      mergeSettings(
        JSON.parse(source("api", ".claude/settings.json")) as AppSettings,
        JSON.parse(source("web", ".claude/settings.json")) as AppSettings,
      ),
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(root, "lefthook.yml"),
    mergeLefthook(source("api", "lefthook.yml"), source("web", "lefthook.yml")),
  );
  writeFileSync(
    join(root, ".betterleaks.toml"),
    mergeBetterleaks(source("api", ".betterleaks.toml"), source("web", ".betterleaks.toml")),
  );
  copyFileSync(join(root, "apps/web/.mcp.json"), join(root, ".mcp.json"));
}
```

- [ ] **Step 5: 조합 루트 파일 원본을 고친다**

`create/assets/combo/AGENTS.md`를 고친다.

(1) 찾을 부분:

```markdown

## 명령

| 명령                               | 하는 일                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `pnpm setup`                       | 도구 확인·frozen 설치 → api setup → web setup        |
| `pnpm dev`                         | api·worker·scheduler와 백엔드 모드 web을 함께 실행   |
| `pnpm check`                       | 루트 포맷·실행기 테스트·지침 → api check → web check |
| `pnpm fix`                         | 앱 자동 수정과 루트 파일 포맷                        |
| `pnpm test`                        | api와 web 테스트를 차례로 실행                       |
| `pnpm test:e2e`                    | api E2E → api e2e:serve 위에서 web FastAPI E2E       |
| `pnpm gen`                         | api OpenAPI 내보내기 → web 타입 생성                 |
| `pnpm db:migrate`, `pnpm db:reset` | api 마이그레이션·개발 DB 재설정                      |

setup·E2E·DB 명령은 캐시하지 않는다. gen도 생성물 누락을 피하도록 캐시하지 않는다.
dev 이외 앱 명령은 동시 실행 수 1로 돌린다. check 성공은 한 줄, 실패는 실패한 단계 출력만 보여 준다.
```

바꿀 내용:

```markdown

## 명령

| 명령                               | 하는 일                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `pnpm setup`                       | 도구 확인·frozen 설치 → 루트 hook 설치 → api setup → web setup |
| `pnpm dev`                         | api·worker·scheduler와 백엔드 모드 web을 함께 실행             |
| `pnpm check`                       | 루트 포맷·실행기 테스트·지침 → api check → web check           |
| `pnpm fix`                         | 앱 자동 수정과 루트 파일 포맷                                  |
| `pnpm test`                        | api와 web 테스트를 차례로 실행                                 |
| `pnpm test:e2e`                    | api E2E → api e2e:serve 위에서 web FastAPI E2E                 |
| `pnpm gen`                         | api OpenAPI 내보내기 → web 타입 생성                           |
| `pnpm db:migrate`, `pnpm db:reset` | api 마이그레이션·개발 DB 재설정                                |

setup·E2E·DB 명령은 캐시하지 않는다. gen도 생성물 누락을 피하도록 캐시하지 않는다.
dev 이외 앱 명령은 동시 실행 수 1로 돌린다. check 성공은 한 줄, 실패는 실패한 단계 출력만 보여 준다.
```

(2) 찾을 부분:

```markdown
프로젝트 여러 개를 동시에 실행하면 고정 포트가 겹친다. 동시 실행은 지원하지 않는다.
compose 이름이 프로젝트마다 달라 볼륨은 섞이지 않는다.

## 완료 기준

`pnpm check` 통과가 완료 기준이다. 앱 내부 변경은 해당 앱의 지침과 문서를 읽고 검증한다.
```

바꿀 내용:

```markdown
프로젝트 여러 개를 동시에 실행하면 고정 포트가 겹친다. 동시 실행은 지원하지 않는다.
compose 이름이 프로젝트마다 달라 볼륨은 섞이지 않는다.

## 하네스

- Claude Code를 루트에서 열면 두 앱의 권한과 hook을 합친 루트 설정을 쓴다. 앱 폴더에서 열면 그 앱의 설정을 쓴다.
- skill은 각 앱의 `.claude/skills/`에 둔다. 루트 세션도 앱 파일을 처음 읽거나 고칠 때 그 아래 skill을 불러온다.
- 루트 hook은 앱의 `.claude/settings.json`에서 명령을 매번 읽고 앱 폴더에서 실행한다. 앱 hook 설정만 고친다.
- 편집 hook은 고친 앱만, Stop은 바뀐 앱과 루트 검사만 돈다. 위험 명령은 두 앱이 검사하고 하나라도 거부하면 막는다. SessionStart는 앱별 상태를 함께 보여 준다.
- 루트 `lefthook.yml`이 커밋 전 앱 포맷·린트와 루트 포맷을 돌리고, 합친 `.betterleaks.toml`로 비밀을 한 번 스캔한다. 푸시 전에는 `pnpm check`를 돌린다.
- 앱 setup은 git 최상위가 아니면 hook을 설치하지 않는다. 루트 setup이 설치한 hook과 다투지 않는다. 루트 `.mcp.json`은 web의 고정 MCP 서버를 쓴다.

## 완료 기준

`pnpm check` 통과가 완료 기준이다. 앱 내부 변경은 해당 앱의 지침과 문서를 읽고 검증한다.
```

- [ ] **Step 6: 조합 루트 실행기를 만들고 고친다**

`create/assets/combo/scripts/check.mjs`를 고친다.

(1) 찾을 부분:

```js
  return errors;
}

export function check(root, { run: execute = run, output = console.log } = {}) {
  const steps = [
    () => format(root, false, execute),
    () => execute(process.execPath, ["--test", "scripts/*.test.mjs"], { cwd: root }),
    () => {
      const errors = instructionErrors(root);
      return { status: errors.length ? 1 : 0, stdout: errors.join("\n") };
    },
    () =>
      execute(
        "pnpm",
        ["exec", "turbo", "run", "check", "--filter=api", "--filter=web", "--concurrency=1"],
        { cwd: root },
      ),
  ];
  for (const step of steps) {
    const result = step();
    if (exitCode(result) !== 0) {
```

바꿀 내용:

```js
  return errors;
}

export function check(root, { run: execute = run, output = console.log, apps = true } = {}) {
  const steps = [
    () => format(root, false, execute),
    () =>
      execute(process.execPath, ["--test", "scripts/*.test.mjs", ".claude/hooks/*.test.mjs"], {
        cwd: root,
      }),
    () => {
      const errors = instructionErrors(root);
      return { status: errors.length ? 1 : 0, stdout: errors.join("\n") };
    },
  ];
  if (apps)
    steps.push(() =>
      execute(
        "pnpm",
        ["exec", "turbo", "run", "check", "--filter=api", "--filter=web", "--concurrency=1"],
        { cwd: root },
      ),
    );
  for (const step of steps) {
    const result = step();
    if (exitCode(result) !== 0) {
```

(2) 찾을 부분:

```js
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = check(resolve(import.meta.dirname, ".."));
```

바꿀 내용:

```js
  return 0;
}

export function checkRoot(root) {
  const messages = [];
  const status = check(root, { apps: false, output: (text) => messages.push(text) });
  return { status, stdout: messages.join("\n") };
}

if (isMain(import.meta.url)) process.exitCode = check(resolve(import.meta.dirname, ".."));
```

`create/assets/combo/scripts/process.mjs` 전체를 다음으로 바꾼다.

```js
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export function gitEnvironment(environment = process.env) {
  const env = { ...environment };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
    "GIT_PREFIX",
  ])
    Reflect.deleteProperty(env, key);
  return env;
}

export function pnpmEntry(environment = process.env) {
  if (environment.npm_execpath) return environment.npm_execpath;
  for (const folder of (environment.PATH ?? environment.Path ?? "").split(delimiter)) {
    for (const file of [
      "pnpm.exe",
      "node_modules/pnpm/bin/pnpm.cjs",
      "node_modules/corepack/dist/pnpm.js",
      "pnpm",
    ]) {
      const path = join(folder, file);
      if (existsSync(path) && (process.platform !== "win32" || file !== "pnpm")) return path;
    }
  }
  throw new Error("pnpm을 찾을 수 없다 — pnpm 12.6.0을 설치하고 PATH에 추가한다.");
}

export function run(command, args, options = {}) {
  if (command === "pnpm") {
    const entry = pnpmEntry(options.env ?? process.env);
    const javascript = /\.[cm]?js$/.test(entry);
    return spawnSync(javascript ? process.execPath : entry, javascript ? [entry, ...args] : args, {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      ...options,
    });
  }
  return spawnSync(command, args, { encoding: "utf8", windowsHide: true, ...options });
}

export function exitCode(result) {
  return result.status ?? 1;
}

export function isMain(url) {
  return process.argv[1] !== undefined && url === pathToFileURL(process.argv[1]).href;
}
```

`create/assets/combo/scripts/setup.mjs`를 고친다.

찾을 부분:

```js
  }
  for (const args of [
    ["install", "--frozen-lockfile"],
    ["--filter", "api", "run", "setup"],
    ["--filter", "web", "run", "setup"],
  ]) {
```

바꿀 내용:

```js
  }
  for (const args of [
    ["install", "--frozen-lockfile"],
    ["exec", "lefthook", "install"],
    ["--filter", "api", "run", "setup"],
    ["--filter", "web", "run", "setup"],
  ]) {
```

`create/assets/combo/scripts/staged-format.mjs`:

```js
import { resolve } from "node:path";
import { rootFiles } from "./format.mjs";
import { exitCode, gitEnvironment, isMain, run } from "./process.mjs";

export function formatFile(root, path, execute = run) {
  if (!rootFiles(root).includes(path)) return { status: 0 };
  return execute("pnpm", ["exec", "prettier", "--write", "--ignore-unknown", path], { cwd: root });
}

export function stagedFormat(root, execute = run) {
  const options = { cwd: root, env: gitEnvironment() };
  const staged = execute(
    "git",
    ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"],
    options,
  );
  if (exitCode(staged)) return staged;
  const owned = new Set(rootFiles(root));
  const files = staged.stdout.split("\0").filter((path) => owned.has(path));
  if (!files.length) return { status: 0 };
  const result = execute(
    "pnpm",
    ["exec", "prettier", "--write", "--ignore-unknown", ...files],
    options,
  );
  if (exitCode(result)) return result;
  // 고친 루트 파일만 다시 스테이징한다. 앱 파일은 앱 작업이 맡는다.
  return execute("git", ["add", "--", ...files], options);
}

if (isMain(import.meta.url)) {
  const result = stagedFormat(resolve(import.meta.dirname, ".."));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(result.error.message);
  process.exitCode = exitCode(result);
}
```

- [ ] **Step 7: 조합 루트의 Claude Code hook 디스패처를 만든다**

`create/assets/combo/.claude/hooks/dispatch.mjs`:

```js
import { readFileSync } from "node:fs";
import { relative, resolve, join, sep } from "node:path";
import { run, exitCode, gitEnvironment, pnpmEntry } from "../../scripts/process.mjs";
import { checkRoot } from "../../scripts/check.mjs";
import { formatFile } from "../../scripts/staged-format.mjs";

const apps = ["api", "web"];
const label = (app, text) => `[${app}]\n${text}`;
const details = (result) =>
  [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n").trim();
const context = (event, text) => ({
  hookSpecificOutput: { hookEventName: event, additionalContext: text },
});

function localPath(root, path, cwd = root) {
  if (typeof path !== "string") return undefined;
  const local = relative(root, resolve(cwd, path)).split(sep).join("/");
  return !local || local === ".." || local.startsWith("../") || /^[A-Za-z]:/.test(local)
    ? undefined
    : local;
}

function changedFiles(root, execute) {
  const result = execute("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: root,
    env: gitEnvironment(),
  });
  if (exitCode(result))
    throw new Error(details(result) || "변경 파일을 확인할 수 없다 — git 저장소에서 실행한다.");
  const fields = result.stdout.split("\0");
  const files = [];
  for (let i = 0; i < fields.length; i++) {
    const record = fields[i];
    if (!record) continue;
    files.push(record.slice(3));
    if (/[RC]/.test(record.slice(0, 2))) files.push(fields[++i]);
  }
  return files.filter(Boolean);
}

function appHooks(root, app, event, input, raw, execute) {
  const cwd = join(root, "apps", app);
  const settings = JSON.parse(readFileSync(join(cwd, ".claude/settings.json"), "utf8"));
  const match = event === "SessionStart" ? input.source : input.tool_name;
  const results = [];
  const env = { ...gitEnvironment(), CLAUDE_PROJECT_DIR: cwd, PYTHONUTF8: "1" };
  try {
    env.npm_execpath = pnpmEntry(env);
  } catch {
    // pnpm이 없어도 순수 정책 hook은 돈다. 필요한 앱 hook이 설치 안내를 맡는다.
  }
  for (const group of settings.hooks?.[event] ?? []) {
    if (
      group.matcher &&
      group.matcher !== "*" &&
      !new RegExp(`^(?:${group.matcher})$`).test(match ?? "")
    )
      continue;
    for (const hook of group.hooks) {
      if (hook.type !== "command" || !Array.isArray(hook.args))
        throw new Error("앱 hook 형식이 틀렸다 — command와 args의 exec form으로 저장한다.");
      const expand = (value) => value.replaceAll("${CLAUDE_PROJECT_DIR}", cwd);
      results.push({
        app,
        ...execute(expand(hook.command), hook.args.map(expand), {
          cwd,
          env,
          input: raw,
          timeout: (hook.timeout ?? 600) * 1000,
          maxBuffer: 16 * 1024 * 1024,
        }),
      });
    }
  }
  return results;
}

function merge(event, results) {
  const blocks = [];
  const contexts = [];
  const errors = [];
  const decisions = [];
  for (const result of results) {
    let json;
    const stdout = String(result.stdout ?? "").trim();
    if (stdout.startsWith("{") && stdout.endsWith("}")) {
      try {
        json = JSON.parse(stdout);
      } catch {
        errors.push(label(result.app, "hook JSON을 읽을 수 없다 — JSON 객체 하나를 출력한다."));
      }
    }
    const specific = json?.hookSpecificOutput;
    const denied = specific?.permissionDecision === "deny" || json?.decision === "block";
    const reason = specific?.permissionDecisionReason ?? json?.reason;
    if (exitCode(result) === 2 || denied || result.error) {
      blocks.push(
        label(
          result.app,
          (denied && reason) ||
            result.stderr?.trim() ||
            result.error?.message ||
            "hook이 실패했다 — 앱의 hook 출력을 확인한다.",
        ),
      );
    } else if (
      event === "PreToolUse" &&
      ["defer", "ask", "allow"].includes(specific?.permissionDecision)
    ) {
      decisions.push({
        decision: specific.permissionDecision,
        reason: label(result.app, reason ?? ""),
      });
    }
    if (specific?.additionalContext) contexts.push(label(result.app, specific.additionalContext));
    else if (!json && stdout && event === "SessionStart") contexts.push(label(result.app, stdout));
    if (exitCode(result) !== 0 && exitCode(result) !== 2 && !json)
      errors.push(label(result.app, details(result)));
  }
  if (event === "SessionStart")
    return { code: 0, json: context(event, [...contexts, ...blocks, ...errors].join("\n\n")) };
  if (event === "PreToolUse") {
    const decision = blocks.length
      ? "deny"
      : ["defer", "ask", "allow"].find((value) =>
          decisions.some((item) => item.decision === value),
        );
    if (decision || contexts.length)
      return {
        code: 0,
        json: {
          hookSpecificOutput: {
            hookEventName: event,
            ...(decision
              ? {
                  permissionDecision: decision,
                  permissionDecisionReason: blocks.length
                    ? blocks.join("\n\n")
                    : decisions
                        .filter((item) => item.decision === decision)
                        .map((item) => item.reason)
                        .join("\n\n"),
                }
              : {}),
            ...(contexts.length ? { additionalContext: contexts.join("\n\n") } : {}),
          },
        },
      };
  }
  if (blocks.length)
    return {
      code: 0,
      json: {
        decision: "block",
        reason: blocks.join("\n\n"),
        ...(contexts.length ? context(event, contexts.join("\n\n")) : {}),
      },
    };
  if (contexts.length) return { code: 0, json: context(event, contexts.join("\n\n")) };
  return { code: errors.length ? 1 : 0, stderr: errors.join("\n\n") || undefined };
}

export function dispatch(
  event,
  raw,
  { root, run: execute = run, rootCheck = checkRoot, rootFormat = formatFile } = {},
) {
  try {
    const input = JSON.parse(raw);
    root = resolve(root ?? process.env.CLAUDE_PROJECT_DIR ?? input.cwd);
    if (event === "Stop" && input.stop_hook_active === true) return { code: 0 };
    let selected = apps;
    const results = [];
    if (event === "PostToolUse") {
      const path = localPath(root, input.tool_input?.file_path, input.cwd ?? root);
      selected = apps.filter((app) => path?.startsWith(`apps/${app}/`));
      if (path && !selected.length) results.push({ app: "root", ...rootFormat(root, path) });
    } else if (event === "Stop") {
      const files = changedFiles(root, execute);
      selected = apps.filter((app) => files.some((path) => path.startsWith(`apps/${app}/`)));
      if (files.some((path) => !path.startsWith("apps/"))) {
        const result = rootCheck(root);
        results.push({
          app: "root",
          ...result,
          ...(exitCode(result) ? { status: 2, stderr: details(result) } : {}),
        });
      }
    }
    for (const app of selected) {
      try {
        results.push(...appHooks(root, app, event, input, raw, execute));
      } catch (error) {
        results.push({
          app,
          status: 2,
          stderr: `${error.message} — 앱 hook 설정과 도구 설치를 확인한다.`,
        });
      }
    }
    return merge(event, results);
  } catch (error) {
    return merge(event, [
      { app: "root", status: 2, stderr: `${error.message} — hook 입력과 git 상태를 확인한다.` },
    ]);
  }
}

export function main(event) {
  const result = dispatch(event, readFileSync(0, "utf8"));
  if (result.json) console.log(JSON.stringify(result.json));
  if (result.stderr) console.error(result.stderr);
  process.exitCode = result.code;
}
```

`create/assets/combo/.claude/hooks/post-tool-use.mjs`:

```js
import { main } from "./dispatch.mjs";
main("PostToolUse");
```

`create/assets/combo/.claude/hooks/pre-tool-use.mjs`:

```js
import { main } from "./dispatch.mjs";
main("PreToolUse");
```

`create/assets/combo/.claude/hooks/session-start.mjs`:

```js
import { main } from "./dispatch.mjs";
main("SessionStart");
```

`create/assets/combo/.claude/hooks/stop-check.mjs`:

```js
import { main } from "./dispatch.mjs";
main("Stop");
```

- [ ] **Step 8: 의존성을 설치한다**

저장소 루트의 의존성을 설치한다. `pnpm-lock.yaml`은 이 명령이 고친다(직접 고치지 않는다).

Run(저장소 루트에서): `pnpm install`

Expected: 오류 없이 끝난다. 버전은 정확히 고정돼 있어 같은 잠금 파일이 만들어진다.

- [ ] **Step 9: 테스트가 통과하는지 확인한다**

Run(`create`에서): `pnpm exec vitest run test/combo.test.ts test/harness.test.ts`

Expected: 통과한다.

```text
Test Files 2 passed (2)
Tests 10 passed (10)
```

Run(`create`에서): `node --test assets/combo/.claude/hooks/dispatch.test.mjs assets/combo/scripts/runners.test.mjs`

Expected: 통과한다.

```text
tests 23
pass 23
fail 0
```

- [ ] **Step 10: 조합 하네스 smoke를 돌린다**

Task 6은 `create/`만 고치므로 커밋 전에 실행해도 된다. Docker를 시작하지 않고 `.env`를 만들지 않으며 `.env.example` 값을 환경에 넣지도 않는다. `<임시 폴더>`는 `node -p "require('node:os').tmpdir()"`가 출력하는 OS 임시 폴더다.

Run(저장소 루트에서): `pnpm new <임시 폴더>/aitpl-t6-combo --api fastapi --web`

`<임시 폴더>/aitpl-t6-combo`에서:

- `git status --short` → 출력 없음. 첫 커밋이 있어야 Stop 확인이 맞다
- `node --test scripts/*.test.mjs .claude/hooks/*.test.mjs` → `tests 23`, `pass 23`
- `pnpm exec prettier --check --ignore-unknown AGENTS.md CLAUDE.md README.md package.json pnpm-workspace.yaml turbo.json lefthook.yml .mcp.json .claude scripts` → `All matched files use Prettier code style!`
- api hook이 쓸 환경을 위해 `apps/api`에서 `uv sync --frozen`만 실행한다

입력 JSON은 조합 밖 `<임시 폴더>/aitpl-t6-inputs/`에 파일로 두고 stdin으로 넣는다. 조합 안에 두면 Stop이 변경으로 본다. 조합 루트에서 `CLAUDE_PROJECT_DIR=<조합 루트>`를 주고 `node .claude/hooks/<진입점>.mjs < <입력 파일>`로 실행한다. PowerShell에서는 `$env:CLAUDE_PROJECT_DIR = '<조합 루트>'`를 먼저 두고 `Get-Content -Raw <입력 파일> | node .claude/hooks/<진입점>.mjs`로 실행한다. `npm_execpath`는 주지 않는다. 모든 입력에 `"session_id": "smoke"`와 `"cwd": "<조합 루트>"`를 넣는다.

| 진입점 | 입력의 나머지 필드 | 기대 |
| --- | --- | --- |
| `post-tool-use` | `"hook_event_name": "PostToolUse"`, `"tool_name": "Edit"`, `"tool_input": { "file_path": "<조합 루트>/apps/web/scripts/workspace-root.ts" }` | 종료 코드 0, 출력 없음. 파일은 바뀌지 않는다 |
| `pre-tool-use` | `"hook_event_name": "PreToolUse"`, `"tool_name": "Bash"`, `"tool_input": { "command": "git push --force" }` | 종료 코드 0. stdout JSON의 `hookSpecificOutput.permissionDecision`이 `deny`이고 이유에 `[api]`와 `[web]`이 모두 있다 |
| `session-start` | `"hook_event_name": "SessionStart"`, `"source": "startup"` | 종료 코드 0, stderr 없음. `additionalContext`에 `[api]`와 `[web]` 요약이 있다. api는 설정을 읽지 못해 `uv run poe setup`을 안내하며 DB에 접속하지 않는다. api 요약에 `인프라:` 줄이 나오면 환경에서 설정을 읽어 개발 DB 포트에 접속을 시도한 것이므로 멈추고 보고한다 |
| `stop-check` | `"hook_event_name": "Stop"`, `"stop_hook_active": false` | 변경이 없으므로 종료 코드 0, 출력 없음 |

루트 pre-commit: `README.md` 끝에 빈 줄 하나를 더해 `git add README.md`하고 `pnpm exec lefthook run pre-commit`을 실행한다. 앱 작업은 skip, `root-format`과 `secrets`(`no leaks found`)가 통과하고 종료 코드 0이다. Betterleaks를 처음 받을 때 네트워크를 쓴다. 확인한 뒤 `git restore --staged --worktree README.md`로 되돌리고 `git status --short`가 비었는지 본다.

끝나면 `aitpl-t6-combo`와 `aitpl-t6-inputs`를 지운다. 셸이 재귀 삭제를 거부하면 지우지 말고 경로를 보고한다.

- [ ] **Step 11: 검사를 돌린다**

Run(저장소 루트에서): `pnpm --filter @ai-template/create check`

Expected: 타입 검사와 Vitest·Node 테스트가 모두 통과한다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 11단계`로 시작하는 한 줄

- [ ] **Step 12: 커밋한다**

```bash
git add \
  create/assets/combo/.claude/hooks/dispatch.mjs \
  create/assets/combo/.claude/hooks/dispatch.test.mjs \
  create/assets/combo/.claude/hooks/post-tool-use.mjs \
  create/assets/combo/.claude/hooks/pre-tool-use.mjs \
  create/assets/combo/.claude/hooks/session-start.mjs \
  create/assets/combo/.claude/hooks/stop-check.mjs \
  create/assets/combo/AGENTS.md \
  create/assets/combo/scripts/check.mjs \
  create/assets/combo/scripts/process.mjs \
  create/assets/combo/scripts/runners.test.mjs \
  create/assets/combo/scripts/setup.mjs \
  create/assets/combo/scripts/staged-format.mjs \
  create/package.json \
  create/src/combo.ts \
  create/src/harness.ts \
  create/test/combo.test.ts \
  create/test/harness.test.ts \
  pnpm-lock.yaml
git commit -m "feat(create): compose project harness"
```


### Task 7: CI: 조합 워크플로와 저장소 작업

설계 §5.1·§5.9·§7.3·§8.3 #6. 조합 CI 워크플로와 조합용 web 이미지의 원본을 더하고, 저장소 CI에 실제 생성 결과를 검사하는 `create-combo`·`create-standalone`을 둔다.

- 조합 워크플로(`create/assets/combo/.github/workflows/ci.yml`)는 main push·PR, `contents: read`, ubuntu 90분 작업 하나다. 저장소 CI와 같은 Action SHA를 쓰고 uv의 working-directory는 `apps/api`다. 단계는 `pnpm setup` → Chromium Linux 의존성 → `pnpm check` → `pnpm test:e2e` → `docker build apps/api` → 루트 문맥의 `docker build -f apps/web/Dockerfile .`이다. 기존 자산 복사기가 중첩 경로를 그대로 쓰므로 CLI 코드는 바뀌지 않는다.
- 단독 web의 Dockerfile은 web 폴더의 잠금 파일·workspace를 쓰는데 조합에서는 둘이 루트에 있다. 조합 web Dockerfile은 조합 루트를 문맥으로 쓰고 `pnpm-lock.yaml`·`pnpm-workspace.yaml`·앱 manifest·web 계약 사본만 복사해 `pnpm --filter web... install --frozen-lockfile`을 실행한다.
- root manifest는 복사하지 않는다. pnpm 12.6.0은 root manifest가 있으면 filtered 설치에도 turbo·lefthook·prettier를 설치했고 `--no-include-workspace-root`도 막지 못했다. workspace의 TypeScript override와 release-age 설정은 그대로 적용된다.
- 빌드는 web 작업 폴더에서 `NEXT_OUTPUT=standalone node node_modules/next/dist/bin/next build`다. `pnpm run`은 설치하지 않은 workspace 패키지를 자동 설치하기 때문이다. 실행 단계는 standalone의 workspace 배치를 보존하고 정적 자산을 `apps/web/` 아래에 두어 `node apps/web/server.js`로 시작한다. Node 24.19.0 slim, UID/GID 10001, HTTP health check, 실행 시 환경 설정은 단독 이미지와 같다. 인접 `Dockerfile.dockerignore`가 환경 파일·git·설치물·캐시·빌드 결과·Python 가상환경을 뺀다.
- 저장소 CI의 `create-combo`(90분)는 루트 설치와 CI git 신원 뒤 `pnpm new "$RUNNER_TEMP/aitpl-combo" --api fastapi --web --name ci-combo`로 만들고 조합 워크플로와 같은 단계를 돈다.
- 마지막 단계는 web 이미지를 `ci-combo-web:ci`로 태그해 `aitpl-combo-web-<실행 ID>-<시도>` 컨테이너를 `127.0.0.1:3200`에 띄운다. loopback URL·`TIME_ZONE`과 단계 안에서 만든 32바이트 난수 `SESSION_SECRET`을 주고, 60초 안에 `GET /`의 200을 기다린다. trap이 실패하면 로그를 먼저 출력하고 성공·실패 모두 컨테이너를 지운다. 생성 프로젝트의 워크플로는 빌드까지만 한다.
- `create-standalone`(60분)은 `aitpl-fastapi`(`--name ci-api`)에서 `uv run poe setup` → `uv run poe check`, `aitpl-nextjs`(`--name ci-web`)에서 `pnpm setup` → Chromium Linux 의존성 → `pnpm check`를 돈다. 생성 프로젝트의 워크플로 파일은 actionlint로만 검사하고 실행하지 않는다.
- 실제 api 위의 web E2E(`create-combo`)에서 저장 직후 reload가 Server Action 응답보다 먼저 일어나 1개가 실패했다(CI 실행 `37108142380`, `cover-upload.spec.ts`). web 템플릿의 `cover-upload.spec.ts`와 `posts.spec.ts`는 저장 버튼을 누르기 전에 `next-action` 헤더가 있는 POST 응답을 기다리기 시작하고, 그 응답 뒤에 다음 동작을 한다. 제품 코드와 E2E 개수(20개)는 그대로다.
- CI 작업과 컨테이너 확인은 GitHub Actions에서만 돈다. 로컬에서는 actionlint(워크플로 4개)·create 검사·생성 smoke와 Docker 없는 이미지 입력 재현, 템플릿의 check·build·목 E2E까지 확인한다.

실패 확인: 부모의 조합 자산에는 워크플로가 없다. 픽스처 조합 테스트의 새 assertion(`.github/workflows/ci.yml`이 있다)이 `expected false to be true`로 실패하고, 뒤의 Dockerfile·ignore 파일 바이트 비교까지 가지 않는다. `1 failed | 6 passed`이고 GREEN은 `7 passed`다. E2E 두 파일의 응답 대기는 실제 api의 타이밍 경쟁이라 집중 명령에 넣지 않는다. 목 E2E는 부모에서도 통과하므로 새 RED로 주장하지 않는다. CI 실행 `37109514454`의 `create-combo`에서 실제 api 위의 web E2E 20개가 통과했다.

**Files:**
- Create: `create/assets/combo/.github/workflows/ci.yml`, `create/assets/combo/apps/web/Dockerfile`, `create/assets/combo/apps/web/Dockerfile.dockerignore`
- Modify: `.github/workflows/ci.yml`
- Test: `create/test/combo.test.ts`, `templates/nextjs/e2e/cover-upload.spec.ts`, `templates/nextjs/e2e/posts.spec.ts`

**Interfaces:**
- Consumes: Task 5의 자산 복사(`writeCombo`가 `create/assets/combo/` 아래 파일을 같은 상대 경로로 쓴다), Task 6의 조합 하네스, Task 3의 `check:workflows`(조합 워크플로를 자동으로 찾는다), 단독 web Dockerfile의 실행 규칙(UID/GID 10001, health check, 실행 시 환경), web 템플릿의 기존 E2E 저장 시나리오
- Produces:
  - `create/assets/combo/.github/workflows/ci.yml`(작업 `check`, 90분)
  - `create/assets/combo/apps/web/Dockerfile`·`Dockerfile.dockerignore`. 생성 조합의 `apps/web/Dockerfile`을 덮어쓰며 조합 루트에서 `docker build -f apps/web/Dockerfile .`로 빌드한다
  - 루트 `.github/workflows/ci.yml`의 `create-combo`(90분, 마지막 단계 `조합 web 컨테이너 시작 확인`)와 `create-standalone`(60분). 새 Action 버전·registry push·CLI 인터페이스는 없다
  - `templates/nextjs/e2e/cover-upload.spec.ts`·`posts.spec.ts`의 저장 응답 대기. 시나리오 이름과 개수는 그대로다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`create/test/combo.test.ts`를 고친다.

(1) 찾을 부분:

```ts
    "# 주소\nAPI_BASE_URL=http://localhost:4010/api/v1 # API\nNEXT_PUBLIC_REALTIME_URL=http://localhost:4010\n",
  );
  write(root, "templates/nextjs/.prettierrc.json", "{}\n");
  write(root, "templates/nextjs/.github/workflows/ci.yml", "name: web\n");
  write(root, "templates/fastapi/.github/workflows/ci.yml", "name: api\n");
  write(root, "templates/fastapi/openapi.json", "{}\n");
```

바꿀 내용:

```ts
    "# 주소\nAPI_BASE_URL=http://localhost:4010/api/v1 # API\nNEXT_PUBLIC_REALTIME_URL=http://localhost:4010\n",
  );
  write(root, "templates/nextjs/.prettierrc.json", "{}\n");
  write(root, "templates/nextjs/Dockerfile", "# 단독 web 이미지\nCOPY pnpm-lock.yaml ./\n");
  write(root, "templates/nextjs/.github/workflows/ci.yml", "name: web\n");
  write(root, "templates/fastapi/.github/workflows/ci.yml", "name: api\n");
  write(root, "templates/fastapi/openapi.json", "{}\n");
```

(2) 찾을 부분:

```ts
    mcpServers: { "next-devtools": { command: "npx" } },
  });
  expect(existsSync(join(target, ".claude/hooks/stop-check.mjs"))).toBe(true);
  expect(commands).toEqual([
    ["--version"],
    ["install", "--lockfile-only"],
```

바꿀 내용:

```ts
    mcpServers: { "next-devtools": { command: "npx" } },
  });
  expect(existsSync(join(target, ".claude/hooks/stop-check.mjs"))).toBe(true);
  expect(existsSync(join(target, ".github/workflows/ci.yml"))).toBe(true);
  for (const file of ["Dockerfile", "Dockerfile.dockerignore"]) {
    expect(readFileSync(join(target, "apps/web", file))).toEqual(
      readFileSync(resolve(import.meta.dirname, "../assets/combo/apps/web", file)),
    );
  }
  expect(readFileSync(join(target, ".github/workflows/ci.yml"))).toEqual(
    readFileSync(resolve(import.meta.dirname, "../assets/combo/.github/workflows/ci.yml")),
  );
  expect(commands).toEqual([
    ["--version"],
    ["install", "--lockfile-only"],
```

`templates/nextjs/e2e/cover-upload.spec.ts`를 고친다.

찾을 부분:

```ts
    )
    .toBe(1);
  await page.getByRole("button", { name: "Clear image", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator('input[name="coverImage"]')).toHaveValue("");
  await page.reload();
  await expect(page.getByRole("img", { name: "Cover image", exact: true })).toHaveCount(0);
```

바꿀 내용:

```ts
    )
    .toBe(1);
  await page.getByRole("button", { name: "Clear image", exact: true }).click();
  const updateResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await updateResponse;
  await expect(page.locator('input[name="coverImage"]')).toHaveValue("");
  await page.reload();
  await expect(page.getByRole("img", { name: "Cover image", exact: true })).toHaveCount(0);
```

`templates/nextjs/e2e/posts.spec.ts`를 고친다.

찾을 부분:

```ts
    const id = editPath.split("/").at(-2)!;
    const editedTitle = `${title} edited`;
    await page.getByLabel(t.posts.titleLabel, { exact: true }).fill(editedTitle);
    await page.getByRole("button", { name: t.posts.save, exact: true }).click();
    await page.getByRole("button", { name: t.posts.publish, exact: true }).click();
    await expect(page.getByRole("button", { name: t.posts.unpublish, exact: true })).toBeVisible();
    await page.getByRole("link", { name: t.posts.viewPublic, exact: true }).click();
```

바꿀 내용:

```ts
    const id = editPath.split("/").at(-2)!;
    const editedTitle = `${title} edited`;
    await page.getByLabel(t.posts.titleLabel, { exact: true }).fill(editedTitle);
    const updateResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] !== undefined,
    );
    await page.getByRole("button", { name: t.posts.save, exact: true }).click();
    await updateResponse;
    await page.getByRole("button", { name: t.posts.publish, exact: true }).click();
    await expect(page.getByRole("button", { name: t.posts.unpublish, exact: true })).toBeVisible();
    await page.getByRole("link", { name: t.posts.viewPublic, exact: true }).click();
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`create`에서): `pnpm exec vitest run test/combo.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 네트워크 없는 fixture 조합의 배치·workspace·실행 순서와 첫 커밋을 확인한다
FAIL  test/combo.test.ts > 네트워크 없는 fixture 조합의 배치·workspace·실행 순서와 첫 커밋을 확인한다
AssertionError: expected false to be true // Object.is equality
Test Files 1 failed (1)
Tests 1 failed | 6 passed (7)
```

- [ ] **Step 3: 조합 CI 워크플로를 만든다**

`create/assets/combo/.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
        with:
          version: "12.6.0"
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: pnpm
      - uses: astral-sh/setup-uv@c18668ad3cf93ea998bef934396af7bb5c839dc7 # v10.2.0
        with:
          version: "0.12.19"
          working-directory: apps/api
      - run: pnpm setup
      - run: pnpm --filter web exec playwright install-deps chromium
      - run: pnpm check
      - run: pnpm test:e2e
      - run: docker build apps/api
      - run: docker build -f apps/web/Dockerfile .
```

- [ ] **Step 4: 조합 앱 교체 파일을 만든다**

`create/assets/combo/apps/web/Dockerfile`:

```dockerfile
# 조합 루트를 빌드 문맥으로 쓴다. 서버 설정과 비밀은 실행할 때 전달한다.
FROM node:24.19.0-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
RUN npm install --global pnpm@12.6.0
# pnpm install은 루트 manifest가 있으면 필터 밖의 루트 도구도 설치하므로 뺀다.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/web/contract ./apps/web/contract
# 루트 도구와 api 대신 web과 그 workspace 의존성만 설치한다.
RUN pnpm --filter web... install --frozen-lockfile

FROM dependencies AS build
COPY apps/web ./apps/web
# 빌드에 URL을 전달해도 실행 단계의 환경에는 물려주지 않는다.
ARG API_BASE_URL
ARG NEXT_PUBLIC_REALTIME_URL
# pnpm run의 workspace 자동 설치를 피하고 설치된 Next만 실행한다.
WORKDIR /app/apps/web
RUN NEXT_OUTPUT=standalone node node_modules/next/dist/bin/next build

FROM base AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid 10001 --no-create-home app
# 추적 루트의 workspace 배치를 보존하고 web의 정적 자산을 같은 위치에 둔다.
COPY --from=build --chown=10001:10001 /app/apps/web/.next/standalone ./
COPY --from=build --chown=10001:10001 /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=10001:10001 /app/apps/web/public ./apps/web/public
RUN mkdir -p apps/web/.next/cache && chown 10001:10001 apps/web/.next/cache
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/', {signal: AbortSignal.timeout(4000)}).then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
```

`create/assets/combo/apps/web/Dockerfile.dockerignore`:

```text
**/.env*
**/node_modules
**/.next
**/.cache
**/.git
**/.pnpm-store
**/.turbo
**/.eslintcache
**/coverage
**/test-results
**/playwright-report
**/playwright/.cache
**/blob-report
**/out
**/dist
**/*.log
**/*.tsbuildinfo
**/.DS_Store
**/Thumbs.db
**/.idea
**/.vscode
**/.venv
**/__pycache__
**/.claude
**/.agents
**/docs
```

- [ ] **Step 5: 저장소 CI를 고친다**

`.github/workflows/ci.yml` 전체를 다음으로 바꾼다.

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Cache pinned tools
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
        with:
          path: node_modules/.cache/ai-template-tools
          key: tools-${{ runner.os }}-${{ hashFiles('scripts/src/tools/manifest.ts') }}
      - run: pnpm check
      - name: Compare the FastAPI spec with the contract (implemented operations)
        run: pnpm run -s spec-compare contract/openapi.yaml templates/fastapi/openapi.json
      - name: Scan git history for secrets
        run: pnpm run -s tool betterleaks git . --no-banner --redact

  fastapi:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    defaults:
      run:
        working-directory: templates/fastapi
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: astral-sh/setup-uv@c18668ad3cf93ea998bef934396af7bb5c839dc7 # v10.2.0
        with:
          version: "0.12.19"
      - run: uv sync --locked
      - run: uv run poe setup
      - run: uv run poe check
      - run: uv run poe test:e2e
      - run: docker build .

  nextjs:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    defaults:
      run:
        working-directory: templates/nextjs
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
        with:
          version: "12.6.0"
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: templates/nextjs/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm check
      - run: pnpm test:e2e
        env:
          E2E_TARGET: mock
      - name: Build the web image
        run: docker build --tag ai-template-nextjs:ci .

  nextjs-e2e-fastapi:
    runs-on: ubuntu-latest
    # 2 CPU·8 GB에서 FastAPI 이미지·web 빌드와 E2E, 실패 뒤 정리 시간을 둔다.
    timeout-minutes: 60
    env:
      WEB_E2E_RUN_ID: ci-${{ github.run_id }}-${{ github.run_attempt }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
        with:
          version: "12.6.0"
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: |
            pnpm-lock.yaml
            templates/nextjs/pnpm-lock.yaml
      - id: install-root
        run: pnpm install --frozen-lockfile
      - run: pnpm --dir templates/nextjs install --frozen-lockfile
      - run: pnpm --dir templates/nextjs exec playwright install --with-deps chromium
      - name: Run the shared web E2E against FastAPI
        timeout-minutes: 45
        run: pnpm web-e2e fastapi --run-id "$WEB_E2E_RUN_ID"
      - name: Clean up the dedicated FastAPI stack
        if: ${{ always() && steps.install-root.outcome == 'success' }}
        timeout-minutes: 5
        run: pnpm web-e2e fastapi --run-id "$WEB_E2E_RUN_ID" --down

  conformance-fastapi:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm conformance fastapi

  # 목 서버는 로컬 프로세스로 뜬다. Docker가 필요 없다.
  conformance-mock:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm conformance mock

  create-combo:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
        with:
          version: "12.6.0"
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: 생성 프로젝트의 git 신원 설정
        run: |
          git config --global user.name "CI"
          git config --global user.email "ci@example.com"
      - run: pnpm new "$RUNNER_TEMP/aitpl-combo" --api fastapi --web --name ci-combo
      - uses: astral-sh/setup-uv@c18668ad3cf93ea998bef934396af7bb5c839dc7 # v10.2.0
        with:
          version: "0.12.19"
          working-directory: ${{ runner.temp }}/aitpl-combo/apps/api
      - run: pnpm setup
        working-directory: ${{ runner.temp }}/aitpl-combo
      - run: pnpm --filter web exec playwright install-deps chromium
        working-directory: ${{ runner.temp }}/aitpl-combo
      - run: pnpm check
        working-directory: ${{ runner.temp }}/aitpl-combo
      - run: pnpm test:e2e
        working-directory: ${{ runner.temp }}/aitpl-combo
      - run: docker build apps/api
        working-directory: ${{ runner.temp }}/aitpl-combo
      - run: docker build --tag ci-combo-web:ci -f apps/web/Dockerfile .
        working-directory: ${{ runner.temp }}/aitpl-combo
      - name: 조합 web 컨테이너 시작 확인
        shell: bash
        run: |
          container="aitpl-combo-web-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
          cleanup() {
            status=$?
            if [ "$status" -ne 0 ]; then
              docker logs "$container" || true
            fi
            docker rm -f "$container" >/dev/null 2>&1 || true
          }
          trap cleanup EXIT
          session_secret=$(openssl rand -hex 32)
          docker run --detach --name "$container" \
            --publish 127.0.0.1:3200:3000 \
            --env API_BASE_URL=http://127.0.0.1:8000/api/v1 \
            --env APP_URL=http://127.0.0.1:3200 \
            --env NEXT_PUBLIC_REALTIME_URL=http://127.0.0.1:8000 \
            --env TIME_ZONE=Asia/Seoul \
            --env SESSION_SECRET="$session_secret" \
            ci-combo-web:ci
          timeout 60s bash -c '
            until [ "$(curl --silent --output /dev/null --write-out "%{http_code}" --max-time 2 http://127.0.0.1:3200/)" = 200 ]; do
              sleep 1
            done
          '

  create-standalone:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0
        with:
          version: "12.6.0"
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: 생성 프로젝트의 git 신원 설정
        run: |
          git config --global user.name "CI"
          git config --global user.email "ci@example.com"
      - run: pnpm new "$RUNNER_TEMP/aitpl-fastapi" --template fastapi --name ci-api
      - uses: astral-sh/setup-uv@c18668ad3cf93ea998bef934396af7bb5c839dc7 # v10.2.0
        with:
          version: "0.12.19"
          working-directory: ${{ runner.temp }}/aitpl-fastapi
      - run: uv run poe setup
        working-directory: ${{ runner.temp }}/aitpl-fastapi
      - run: uv run poe check
        working-directory: ${{ runner.temp }}/aitpl-fastapi
      - run: pnpm new "$RUNNER_TEMP/aitpl-nextjs" --template nextjs --name ci-web
      - run: pnpm setup
        working-directory: ${{ runner.temp }}/aitpl-nextjs
      - run: pnpm exec playwright install-deps chromium
        working-directory: ${{ runner.temp }}/aitpl-nextjs
      - run: pnpm check
        working-directory: ${{ runner.temp }}/aitpl-nextjs
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run(`create`에서): `pnpm exec vitest run test/combo.test.ts`

Expected: 통과한다.

```text
Test Files 1 passed (1)
Tests 7 passed (7)
```

- [ ] **Step 7: 검사를 돌린다**

Run(`templates/nextjs`에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 모든 단계를 다시 돌리려면 `templates/nextjs/.cache/check.json`을 지운다.

Run(`templates/nextjs`에서): `pnpm build`

Expected: `Compiled successfully`.

Run(`templates/nextjs`에서): `pnpm test:e2e`

Expected: `20 passed`(목 대상, 걸린 시간은 다르다).

Run(저장소 루트에서): `pnpm --filter @ai-template/create check`

Expected: 타입 검사와 Vitest·Node 테스트가 모두 통과한다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 11단계`로 시작하는 한 줄

- [ ] **Step 8: 커밋한다**

```bash
git add \
  .github/workflows/ci.yml \
  create/assets/combo/.github/workflows/ci.yml \
  create/assets/combo/apps/web/Dockerfile \
  create/assets/combo/apps/web/Dockerfile.dockerignore \
  create/test/combo.test.ts \
  templates/nextjs/e2e/cover-upload.spec.ts \
  templates/nextjs/e2e/posts.spec.ts
git commit -m "ci(create): validate generated projects and images"
```

- [ ] **Step 9: 조합 CI 자산과 이미지 입력 smoke를 돌린다**

CLI는 커밋하지 않은 템플릿 변경을 거절한다. 이 태스크는 `templates/nextjs/e2e`를 고치므로 이 smoke는 커밋 뒤에 실행한다. Docker로 이미지를 빌드하거나 컨테이너를 띄우지 않는다. `<임시 폴더>`는 `node -p "require('node:os').tmpdir()"`가 출력하는 OS 임시 폴더다.

Run(저장소 루트에서): `pnpm new <임시 폴더>/aitpl-t7-combo --api fastapi --web --name t7-combo`

`<임시 폴더>/aitpl-t7-combo`에서:

- `git status --short` → 출력 없음. `git log -1 --format=%s` → `chore: create t7-combo from ai-template <이 태스크 커밋의 short SHA>`
- `node --test scripts/*.test.mjs .claude/hooks/*.test.mjs` → `tests 23`, `pass 23`
- `pnpm exec prettier --check --ignore-unknown AGENTS.md CLAUDE.md README.md package.json pnpm-workspace.yaml turbo.json lefthook.yml .mcp.json .claude .github scripts` → 통과
- `pnpm --filter web run check` → `check 통과: 9단계`
- `.github/workflows/ci.yml`, `apps/web/Dockerfile`, `apps/web/Dockerfile.dockerignore`가 `create/assets/combo/`의 원본과 바이트가 같고 `apps/api/.github`·`apps/web/.github`가 없다

Run(저장소 루트에서): `pnpm tool actionlint -shellcheck= -pyflakes= <임시 폴더>/aitpl-t7-combo/.github/workflows/ci.yml`

Expected: 진단 없이 종료 코드 0.

이미지 입력 재현(설계 §8.3 #6의 로컬 확인). Dockerfile의 설치와 빌드를 새 폴더 `<임시 폴더>/aitpl-t7-image`에서 Docker 없이 따라 한다.

1. 조합의 `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `apps/api/package.json`, `apps/web/package.json`, `apps/web/contract/`(`node_modules` 제외)를 같은 상대 경로로 복사한다. 루트 `package.json`은 복사하지 않는다.
2. 그 폴더에서 `corepack pnpm@12.6.0 --filter web... install --frozen-lockfile`을 실행한다. root manifest가 없어 다른 전역 pnpm이 잡힐 수 있으므로 버전을 명시한다.
3. 조합의 `apps/web` 나머지 파일을 `Dockerfile.dockerignore`가 빼는 것(`.env*`, `node_modules`, `.next`, `.cache` 등) 없이 복사한다. `apps/web`에서 `NEXT_OUTPUT=standalone`을 설정하고 `node node_modules/next/dist/bin/next build` → `Compiled successfully`.
4. `apps/web/.next/standalone/apps/web/server.js`와 `apps/web/.next/static`이 있다. 폴더 루트의 `node_modules`에 `turbo`·`lefthook`·`prettier`가 없고, 목 의존성(`apps/web/contract/mock/node_modules/hono`)도 설치되지 않았다.

끝나면 `aitpl-t7-combo`와 `aitpl-t7-image`를 지운다. 셸이 재귀 삭제를 거부하면 지우지 말고 경로를 보고한다.

CI 확인: `create-combo`, `create-standalone`과 조합 web 컨테이너의 `GET /` 확인은 GitHub Actions에서만 돌고 로컬에서는 확인할 수 없다. 프로토타입은 CI 실행 `37109514454`에서 모두 통과했다. push와 PR은 코디네이터가 맡는다. 구현자는 그 PR의 CI 결과(`gh pr checks <PR 번호>` 또는 `gh run view <실행 ID>`)에서 두 작업이 성공하고 `create-combo`의 마지막 단계 `조합 web 컨테이너 시작 확인`이 통과했는지 확인한다. 결과가 나오기 전에는 Docker 단계를 통과했다고 보고하지 않는다.


### Task 8: 문서

설계 §7.2·§8. 기반 설계·create 설계·지침과 템플릿 문서를 구현과 실제 검증 범위에 맞춘다. 문서만 바꾸며 코드·자산·버전은 그대로다.

- 기반 설계: 상태와 다음 단계, §3.3의 조합 구조(apps 배치, api가 소유하는 compose, 루트 compose 없음)와 create 설계 링크, §6.2의 백엔드 명령 `e2e:serve`, §6.8·§6.9·§7.1·§7.5의 생성 CI·검사·인프라 위치, §10의 사이클 3 결정과 create 설계 §9에서 옮긴 미룬 항목을 맞춘다.
- create 설계: 구현에서 정한 결정을 해당 본문에 넣는다. §5.4와 C9의 `gen` 캐시 끔과 이유, §5.3의 `overrides.typescript`·두 YAML 문서·보존 검사, §5.2의 turbo 2.11.6과 선정 이유다. §3.2·§3.3의 실제 경로 검사·git 신원·실패 정리·동적 설정 포맷, §5.6~§5.9·§7.3의 환경 예시·`POE_PWD`·hook 합치기·Betterleaks 인자·조합 web 이미지·CI 경로와 컨테이너 확인도 적는다.
- create 설계의 표기를 구현에 맞춘다. §5.4는 두 앱의 `check`를 한 번에 하나씩 순서 없이 돌리고 `db:migrate`·`db:reset`을 루트 package.json이 api로 넘긴다고 적는다. §5.8 PostToolUse에 `MultiEdit`, §6에 web dev의 Next.js 기본 바인딩(0.0.0.0), §7.3 `create-standalone`에 Chromium Linux 의존성 단계를 적는다.
- §8.3을 검증 항목으로 바꾸고 §8.4 구현 기록에 로컬 검증과 CI가 맡는 범위를 나눠 적는다. 프로토타입 과정이 아니라 구현을 기술한다. 확인하지 않은 Docker 단계와 Windows의 turbo 실행·캐시 hit를 완료로 쓰지 않는다.
- 루트 AGENTS.md는 구조의 `create/assets/combo/`, `pnpm new --help`, `gen` 설명과 생성 규칙(대상·이름·추적 파일·git 환경·조합 설치·첫 커밋·smoke와 개발 데이터 보호·`.env`)을 담는다. 64줄로 200줄 이하다.
- 템플릿 문서: web README의 현재 기능·E2E 20개·단독/조합 계약·CI, web AGENTS·architecture의 단독/조합 Dockerfile 설명, FastAPI README의 compose 소유·고정 포트·`e2e:serve`·CI와 FastAPI AGENTS의 룰셋 사본 설명을 맞춘다. 조합은 개념으로만 설명하고 템플릿 밖의 경로나 명령을 새로 요구하지 않는다.

실패 확인: 문서 작업이라 새 테스트가 없다. RED·GREEN 집중 명령도 없다(각 0개). 루트 check 11단계, create 검사(Vitest 52개·Node 23개), 템플릿 check·build·목 E2E 20개, FastAPI 인프라 없는 검사와 `pnpm new --help`·문서 링크 검토가 근거다.

**Files:**
- Modify: `AGENTS.md`, `docs/superpowers/specs/2026-09-26-ai-template-foundation-design.md`, `docs/superpowers/specs/2026-10-03-create-cli-design.md`, `templates/fastapi/AGENTS.md`, `templates/fastapi/README.md`, `templates/nextjs/AGENTS.md`, `templates/nextjs/README.md`, `templates/nextjs/docs/architecture.md`

**Interfaces:**
- Consumes: Task 1~7의 구현·명령·고정 버전·검증 결과, CI 실행 `37106952072`의 결과
- Produces:
  - `docs/superpowers/specs/2026-10-03-create-cli-design.md`: 상태, C9, §3.2·§3.3·§5.2~§5.9·§6·§7.3의 구현 결정과 표기, §8.3 검증 항목, §8.4 구현 기록
  - `docs/superpowers/specs/2026-09-26-ai-template-foundation-design.md`: 상태·다음 단계, §3.3·§6.2·§6.8·§6.9·§7.1·§7.5·§10
  - 루트 `AGENTS.md`의 구조·명령·생성 규칙, `templates/{fastapi,nextjs}/{README.md,AGENTS.md}`와 `templates/nextjs/docs/architecture.md`. 새 코드·명령·런타임 인터페이스는 없다

- [ ] **Step 1: FastAPI 문서를 고친다**

`templates/fastapi/AGENTS.md`를 고친다.

찾을 부분:

```markdown

### 생성물

- 직접 고치지 않는다: `openapi.json`(`uv run poe gen`), `uv.lock`(`uv add`, `uv lock`), `api-style/lint.mjs`(저장소의 `pnpm sync`), FastAPI skill 사본(`uv run poe setup`).
- 라우트나 문서 모델을 바꾸면 `uv run poe gen`을 돌린다.

### 억제 주석
```

바꿀 내용:

```markdown

### 생성물

- 직접 고치지 않는다: `openapi.json`(`uv run poe gen`), `uv.lock`(`uv add`, `uv lock`), `api-style/lint.mjs`(템플릿에 포함된 룰셋 사본), FastAPI skill 사본(`uv run poe setup`).
- 라우트나 문서 모델을 바꾸면 `uv run poe gen`을 돌린다.

### 억제 주석
```

`templates/fastapi/README.md`를 고친다.

찾을 부분:

````markdown
```

`setup`은 여러 번 돌려도 된다. 명령 전체와 규칙은 [AGENTS.md](AGENTS.md)에 있다.

## 로컬 포트

````

바꿀 내용:

````markdown
```

`setup`은 여러 번 돌려도 된다. 명령 전체와 규칙은 [AGENTS.md](AGENTS.md)에 있다.

조합 프로젝트에서도 이 앱이 자기 compose 인프라를 맡는다. 프로젝트 이름별로 compose 볼륨을 나누지만 포트는 고정이므로 여러 프로젝트의 동시 실행은 지원하지 않는다. 외부 web E2E는 `uv run poe e2e:serve [--web-url <주소>] -- <명령> [인자...]`으로 실행한다. 호출한 폴더에서 명령을 실행하고 E2E 서버를 정리한 뒤 명령의 종료 코드로 끝난다([E2E](docs/architecture.md#e2e)).

단독 프로젝트의 `.github/workflows/ci.yml`은 의존성 설치 뒤 setup·check·E2E·이미지 빌드를 실행한다. 조합에서는 루트 CI가 두 앱을 함께 검사한다.

## 로컬 포트

````

- [ ] **Step 2: web 문서를 고친다**

`templates/nextjs/AGENTS.md`를 고친다.

찾을 부분:

```markdown
- `.env`를 읽거나 출력하지 않는다. 키는 `.env.example`과 `src/lib/env.ts`에서 확인한다. 운영에는 예시 `SESSION_SECRET`을 쓸 수 없다.
- `pnpm setup`은 의존성 → 환경 키 보충 → 독립 저장소 hook → Chromium 순서다. 브라우저 설치가 실패해도 앞의 준비를 보존하고 실패 코드로 끝난다. 다시 실행하면 기존 환경 값을 유지한다.
- 환경 검증은 `src/lib/env/startup.ts`의 `exitOnInvalidEnv`가 같은 `src/lib/env.ts` 스키마로 한다. `next.config.ts`의 개발·운영 서버 phase와 `src/instrumentation.ts`의 Node 런타임이 호출하며 운영 빌드에서는 호출하지 않는다. 빌드에는 서버 비밀이 필요 없다. 잘못된 설정·운영 예시 비밀은 값·스택 없이 변수별 안내를 쓰고 종료 코드 1로 멈춘다. Next의 Ready 배너가 먼저 나올 수 있지만 요청은 처리하지 않는다.
- [Docker 이미지](docs/architecture.md#docker-이미지)는 Node 24.19.0 slim·pnpm 12.6.0으로 `NEXT_OUTPUT=standalone`을 설정해 빌드하고 `node server.js`로 시작한다. 일반 `pnpm build`·`pnpm start`와 E2E는 이 변수 없이 일반 빌드·`next start`를 쓴다. UID/GID 10001로 실행하며 API·실시간 URL과 비밀은 실행 때 전달한다. standalone도 instrumentation의 `exitOnInvalidEnv` 호출로 시작 설정을 검사한다.
- 의존성 버전은 정확히 고정한다. pnpm의 `minimumReleaseAge: 1440`을 유지한다.
- `.claude/skills/add-*/`는 아래 레시피의 얇은 포장이다. 절차가 다르면 레시피를 따른다.
- 공식 `next-dev-loop`·shadcn·Playwright CLI skill의 [고정 출처](docs/stack.md#공식-skill)는 check의 harness가 오프라인 검사한다. 캐시 키에 설치 패키지 버전·설치 skill 해시도 포함한다. 전용 열거기가 공식 사본·설치 원본 skill 폴더의 예상 밖 항목(숨김 파일·빈 폴더·링크 포함)을 모두 거절한다. 전체 check는 기존 9단계다. 사본은 직접 고치지 않고 `pnpm skills:sync`으로 복원한다. shadcn의 latest 예시는 `pnpm exec shadcn`, Playwright CLI는 `pnpm exec playwright-cli`로 실행한다. 세션의 브라우저 도구 규칙이 우선한다.
```

바꿀 내용:

```markdown
- `.env`를 읽거나 출력하지 않는다. 키는 `.env.example`과 `src/lib/env.ts`에서 확인한다. 운영에는 예시 `SESSION_SECRET`을 쓸 수 없다.
- `pnpm setup`은 의존성 → 환경 키 보충 → 독립 저장소 hook → Chromium 순서다. 브라우저 설치가 실패해도 앞의 준비를 보존하고 실패 코드로 끝난다. 다시 실행하면 기존 환경 값을 유지한다.
- 환경 검증은 `src/lib/env/startup.ts`의 `exitOnInvalidEnv`가 같은 `src/lib/env.ts` 스키마로 한다. `next.config.ts`의 개발·운영 서버 phase와 `src/instrumentation.ts`의 Node 런타임이 호출하며 운영 빌드에서는 호출하지 않는다. 빌드에는 서버 비밀이 필요 없다. 잘못된 설정·운영 예시 비밀은 값·스택 없이 변수별 안내를 쓰고 종료 코드 1로 멈춘다. Next의 Ready 배너가 먼저 나올 수 있지만 요청은 처리하지 않는다.
- 단독 [Docker 이미지](docs/architecture.md#docker-이미지)는 Node 24.19.0 slim·pnpm 12.6.0으로 `NEXT_OUTPUT=standalone`을 설정해 빌드하고 `node server.js`로 시작한다. 조합은 생성기가 넣은 Dockerfile로 workspace 서버를 실행하며 조합 프로젝트의 지침을 따른다. 일반 `pnpm build`·`pnpm start`와 E2E는 이 변수 없이 일반 빌드·`next start`를 쓴다. UID/GID 10001로 실행하며 API·실시간 URL과 비밀은 실행 때 전달한다. standalone도 instrumentation의 `exitOnInvalidEnv` 호출로 시작 설정을 검사한다.
- 의존성 버전은 정확히 고정한다. pnpm의 `minimumReleaseAge: 1440`을 유지한다.
- `.claude/skills/add-*/`는 아래 레시피의 얇은 포장이다. 절차가 다르면 레시피를 따른다.
- 공식 `next-dev-loop`·shadcn·Playwright CLI skill의 [고정 출처](docs/stack.md#공식-skill)는 check의 harness가 오프라인 검사한다. 캐시 키에 설치 패키지 버전·설치 skill 해시도 포함한다. 전용 열거기가 공식 사본·설치 원본 skill 폴더의 예상 밖 항목(숨김 파일·빈 폴더·링크 포함)을 모두 거절한다. 전체 check는 기존 9단계다. 사본은 직접 고치지 않고 `pnpm skills:sync`으로 복원한다. shadcn의 latest 예시는 `pnpm exec shadcn`, Playwright CLI는 `pnpm exec playwright-cli`로 실행한다. 세션의 브라우저 도구 규칙이 우선한다.
```

`templates/nextjs/README.md` 전체를 다음으로 바꾼다.

````markdown
# Next.js web 템플릿

Node 24와 pnpm 12.6.0을 설치한 뒤 이 폴더를 독립 프로젝트로 복사한다.

```sh
pnpm setup
pnpm dev
```

http://localhost:3000 에서 홈 화면을 연다. `setup`은 여러 번 실행해도 기존 환경 값을 보존한다.
기본 API 주소에서는 목 서버도 4010에 함께 뜬다. `API_BASE_URL`을 백엔드 주소로 설정하면 web만 시작한다. Ctrl+C로 함께 내린다.

ko/en 화면, BFF 세션·proxy 갱신, 가입·메일 인증·로그인·비밀번호 재설정·소셜 로그인, 글·내 글·커버 업로드, 내 정보·아바타·세션·탈퇴와 실시간 갱신을 제공한다. 하네스가 타입·모듈 경계·생성물·번역을 검사하며 실제 목과 Next에 붙는 HTTP 통합 검사와 Chromium E2E 20개를 포함한다.

단독 프로젝트는 자체 TypeSpec·목 workspace를 쓴다. 조합에서는 생성기가 백엔드 OpenAPI 입력과 백엔드 모드 API 주소를 설정하며, 백엔드 gen 뒤 web gen 순서로 타입을 맞춘다. 목은 개발·통합 테스트의 대역으로 남고 실제 백엔드 연결은 E2E로 확인한다.

```sh
pnpm check
pnpm fix
pnpm test
pnpm test:e2e
```

빌드는 예시 환경으로도 가능하다. 운영 서버 시작 전에 `SESSION_SECRET`을 32바이트 이상의 새 비밀로 설정한다. 예시 비밀로는 운영 서버를 시작할 수 없다.
단독 프로젝트의 `.github/workflows/ci.yml`은 고정 의존성·Chromium 설치 뒤 check·mock E2E·이미지 빌드를 실행한다. 조합 프로젝트는 루트 CI가 두 앱을 함께 검사한다.

- [작업 지침](AGENTS.md)
- [아키텍처](docs/architecture.md)
- [버전과 문서](docs/stack.md)
````

`templates/nextjs/docs/architecture.md`를 고친다.

찾을 부분:

```markdown

### Docker 이미지

`Dockerfile`은 이 프로젝트만 문맥으로 쓰는 다단계 빌드다. Node `24.19.0-bookworm-slim`과 pnpm `12.6.0`으로 frozen 설치하고 빌드 단계의 `NEXT_OUTPUT=standalone`으로 Next `output: "standalone"`을 만든다. 일반 `pnpm build`·`pnpm start`와 E2E는 이 변수 없이 일반 빌드·`next start`를 쓴다.
실행 이미지에는 `server.js`·추적 의존성·서버 산출물·`.next/static`·`public`을 복사한다. UID/GID `10001:10001`로 실행하며 `.next/cache`는 해당 사용자가 쓸 수 있다.
기본 명령은 `node server.js`, `HOSTNAME=0.0.0.0`, `PORT=3000`이다. 헬스체크는 실제 PORT의 `/`가 HTTP 200인지 확인한다.
`.dockerignore`는 `.env*`·의존성·빌드·캐시·git·테스트 출력 등 로컬 파일을 제외한다.

빌드에는 서버 비밀이 필요 없다. API·실시간 URL의 빌드 ARG는 실행 단계에 전달하지 않는다.
실행할 때 `API_BASE_URL`, `APP_URL`, `NEXT_PUBLIC_REALTIME_URL`, `SESSION_SECRET`을 주고 `TIME_ZONE`은 필요하면 바꾼다.
```

바꿀 내용:

```markdown

### Docker 이미지

단독 프로젝트의 `Dockerfile`은 이 폴더를 문맥으로 쓰는 다단계 빌드다. Node `24.19.0-bookworm-slim`과 pnpm `12.6.0`으로 frozen 설치하고 빌드 단계의 `NEXT_OUTPUT=standalone`으로 Next `output: "standalone"`을 만든다. 일반 `pnpm build`·`pnpm start`와 E2E는 이 변수 없이 일반 빌드·`next start`를 쓴다.
실행 이미지에는 `server.js`·추적 의존성·서버 산출물·`.next/static`·`public`을 복사한다. UID/GID `10001:10001`로 실행하며 `.next/cache`는 해당 사용자가 쓸 수 있다.
기본 명령은 `node server.js`, `HOSTNAME=0.0.0.0`, `PORT=3000`이다. 헬스체크는 실제 PORT의 `/`가 HTTP 200인지 확인한다.
`.dockerignore`는 `.env*`·의존성·빌드·캐시·git·테스트 출력 등 로컬 파일을 제외한다.

조합에서는 생성기가 조합용 Dockerfile과 인접 `Dockerfile.dockerignore`를 넣는다. 조합 루트가 빌드 문맥이며, web 의존성만 설치하고 standalone의 workspace 서버 배치를 보존한다. 빌드·실행 명령은 생성된 조합 프로젝트의 지침을 따른다. 아래 명령은 단독 프로젝트용이다.

빌드에는 서버 비밀이 필요 없다. API·실시간 URL의 빌드 ARG는 실행 단계에 전달하지 않는다.
실행할 때 `API_BASE_URL`, `APP_URL`, `NEXT_PUBLIC_REALTIME_URL`, `SESSION_SECRET`을 주고 `TIME_ZONE`은 필요하면 바꾼다.
```

- [ ] **Step 3: 저장소 문서를 고친다**

`AGENTS.md` 전체를 다음으로 바꾼다.

```markdown
# ai-template

AI 바이브코딩에 최적화한 프로젝트 템플릿(FastAPI, NestJS, Next.js, Next.js admin)을 만드는 저장소다.
설계는 `docs/superpowers/specs/2026-09-26-ai-template-foundation-design.md`를 따른다.
생성 CLI와 조합 구조는 `docs/superpowers/specs/2026-10-03-create-cli-design.md`를 따른다.

## 구조

| 경로                    | 내용                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `contract/typespec/`    | 플랫폼 API 계약 원본(TypeSpec)                                                            |
| `contract/openapi.yaml` | 계약 컴파일 결과. 생성물이라 직접 고치지 않는다                                           |
| `contract/api-style/`   | JSON:API 룰셋(Redocly). 백엔드 템플릿이 사본으로 쓴다                                     |
| `contract/conformance/` | 두 백엔드와 목에 똑같이 돌리는 적합성 테스트 틀                                           |
| `contract/mock/`        | 플랫폼 API를 메모리로 구현한 목 서버(Hono). 단독 web의 개발 백엔드이자 적합성 `mock` 대상 |
| `templates/`            | 템플릿. 각 폴더는 그대로 복사하면 동작하는 독립 프로젝트다                                |
| `templates/fastapi/`    | FastAPI 백엔드 템플릿                                                                     |
| `templates/nextjs/`     | Next.js BFF web. 자체 workspace의 계약·목과 인증·글·내 정보·세션·업로드·실시간 기능       |
| `create/`               | git 추적 템플릿 파일로 단독·FastAPI+web 조합 프로젝트를 만드는 CLI                        |
| `create/assets/combo/`  | 조합 루트 실행기·하네스·CI와 조합용 web 이미지의 원본                                     |
| `scripts/`              | check 실행기, 도구 설치기, 구조 비교, 지침·템플릿 검사, 동기화                            |
| `docs/`                 | 하네스 표준, API 규약, 스펙과 계획                                                        |

## 명령

| 명령                                              | 하는 일                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                      | 완료 기준. 성공하면 한 줄, 실패하면 실패한 단계의 출력만 보여 준다                                                                                                                                                                                                                                |
| `pnpm fix`                                        | 포맷과 자동 수정 가능한 린트                                                                                                                                                                                                                                                                      |
| `pnpm gen`                                        | 계약을 컴파일하고 적합성 테스트와 목 서버의 타입을 다시 만든다                                                                                                                                                                                                                                    |
| `pnpm sync`                                       | 공유 자산 원본을 템플릿 사본 위치로 복사한다                                                                                                                                                                                                                                                      |
| `pnpm new <대상> --template <fastapi\|nextjs>`    | 저장소 밖에 단독 프로젝트를 만든다. `--name <이름>`, `--no-git`, `--help`를 지원한다                                                                                                                                                                                                              |
| `pnpm new <대상> --api fastapi --web`             | 저장소 밖에 apps/api·apps/web 조합을 만든다. web 의존성 버전을 보존하고 api OpenAPI로 web 타입을 생성한다. `--name`, `--no-git`를 지원한다                                                                                                                                                        |
| `pnpm new --help`                                 | 단독·조합 생성의 사용법과 이름 규칙을 보여 준다                                                                                                                                                                                                                                                   |
| `pnpm --dir templates/nextjs setup`               | web의 고정 의존성·Chromium 설치와 환경 준비                                                                                                                                                                                                                                                       |
| `pnpm --dir templates/nextjs dev`                 | 단독 모드의 web(3000)·목(4010), 백엔드 모드의 web                                                                                                                                                                                                                                                 |
| `pnpm --dir templates/nextjs check`               | web 자체 검사. 루트 check의 템플릿 구조·사본 검사와 함께 통과해야 한다                                                                                                                                                                                                                            |
| `pnpm --dir templates/nextjs test:e2e`            | 목(4110)과 운영 web(3100)에 붙는 Chromium E2E 20개. 기본 대상은 mock이며 FastAPI는 준비된 외부 주소·설정을 받는다                                                                                                                                                                                 |
| `pnpm web-e2e fastapi`                            | 전용 `ai-template-web-e2e-<ID>` 스택과 web(3100)에서 같은 E2E 20개를 실행한 뒤 그 스택·볼륨과 실행 이미지 `ai-template-web-e2e-fastapi:<ID>`를 정리한다. `--smoke`, `--print`, `--keep`, `--run-id <ID>`, `--down`은 [실행기 문서](scripts/src/web-e2e/README.md)를 따른다                        |
| `pnpm --dir templates/nextjs gen:feature <이름>`  | 골든 posts와 화면·번역·테스트를 복사하고 로그인 보호 경로를 등록한다                                                                                                                                                                                                                              |
| `pnpm --dir templates/nextjs gen`                 | TypeSpec 계약·목 타입과 web API·실시간·에러 타입 생성. web 타입은 선택한 `gen.config.json` 스펙을 사용한다                                                                                                                                                                                        |
| `pnpm tool <oasdiff\|betterleaks\|actionlint>`    | 버전을 고정한 바이너리를 받아 실행한다                                                                                                                                                                                                                                                            |
| `pnpm spec-compare [--subset] <계약> <구현>`      | 백엔드 스펙이 계약과 이름·경로·operation별 응답 상태·실시간 선언이 같고 계약을 깨지 않는지 본다. `--subset`은 구현 도중에 구현한 operation만 비교한다                                                                                                                                             |
| `pnpm conformance <대상> [--keep] [흐름 파일...]` | 대상을 띄우고 적합성 흐름 테스트를 돌린 뒤 내린다. `fastapi`는 compose로 띄우고(Docker 필요) 템플릿의 개발 인프라와 같은 compose 프로젝트를 써서 개발 DB에 마이그레이션과 시드를 실행한다(끝나면 개발 인프라도 내려간다). `mock`은 목 서버를 로컬 프로세스로 띄운다. 흐름 파일을 주면 그것만 돈다 |

## 규칙

- 작업을 끝내기 전에 `pnpm check`를 통과시킨다.
- `pnpm new`는 저장소 밖의 새 폴더 또는 비어 있는 폴더에 만든다. 상대 대상은 명령을 실행한 폴더 기준이다. 이름은 대상 폴더 이름 또는 `--name`이며 소문자로 시작하는 kebab-case, 50자 이하다.
- 생성할 템플릿의 git 추적 변경은 먼저 커밋한다. CLI는 추적 파일만 복사하고 `template.json`, 무추적 환경 파일·설치물·캐시는 제외한다. CLI와 테스트의 git 호출은 `scripts/src/files/git-environment.ts`로 상속된 저장소 지정 변수를 제거한다.
- 조합 생성은 레지스트리에 접속해 잠금 파일을 합치고 frozen 설치·web gen을 실행한다. TypeScript override와 web 버전 해석을 보존한다. 루트 compose는 없고 인프라는 apps/api가 맡는다. gen은 캐시하지 않는다.
- 기본 생성은 main 브랜치와 출처를 적은 첫 커밋을 만든다. git 신원이 없으면 init만 하고 안내하며 사용자 서명 설정을 따른다. `--no-git`은 둘 다 생략한다.
- 생성 smoke는 OS 임시 폴더의 `aitpl-` 이름을 쓴다. Docker가 필요한 생성 프로젝트 setup·FastAPI check·조합 E2E·이미지 빌드는 PR CI의 `create-combo`·`create-standalone`에서 확인한다. 개발 스택 `fastapi`·`joon`과 볼륨은 쓰거나 내리지 않는다.
- `.env`를 읽거나 출력하지 않는다. 키와 공개 기본값은 `.env.example`에서 확인한다.
- 계약은 `contract/typespec/src/`만 고치고 `pnpm gen`으로 생성물을 만든다. `contract/openapi.yaml`과 `**/generated/**`는 직접 고치지 않는다.
- API 규약은 `docs/conventions/jsonapi.md`, 에러 코드는 `docs/conventions/error-codes.md`를 따른다.
- 템플릿은 저장소의 다른 폴더를 참조하지 않는다. 공유 자산은 원본을 고친 뒤 `pnpm sync`한다.
- web 계약의 원본·사본 편집 순서는 [web 계약 동기화](docs/conventions/web-contract.md)를 따른다. 템플릿 레시피는 독립 프로젝트의 절차다.
- 템플릿은 `docs/harness/standard.md`를 지킨다. `pnpm check`가 `templates/`를 검사한다.
- web 규칙은 `templates/nextjs/AGENTS.md`, W1~W4 구현·검증 기록은 `docs/superpowers/specs/2026-09-30-nextjs-web-design.md`를 읽는다. web의 check·build·mock E2E·FastAPI E2E는 빌드 산출물을 함께 쓰므로 순서대로 실행한다. W4의 CI는 PR CI에서 확인한다.
- web의 FastAPI E2E는 루트 `pnpm web-e2e fastapi`로 실행한다. 포트를 먼저 검사하고 전용 compose·새 볼륨만 쓴다. 같은 실행 ID의 컨테이너나 볼륨이 있으면 기동·정리를 거부한다. 성공 뒤와 `--down`은 해당 스택·볼륨·정확한 실행 이미지 태그를 정리하며 없는 프로젝트·이미지도 성공이다. 개발 프로젝트 `fastapi`·`joon`은 건드리지 않는다. `pnpm conformance fastapi`는 개발 스택을 사용하므로 이 검증의 대체 명령이 아니다.
- 실행기의 `ps`·로그 진단은 실패·중단 때만 출력한다. FastAPI access log는 모든 환경에서 쿼리 문자열을 뺀다. POSIX 중단은 소유한 프로세스 그룹에 SIGINT를 보내고 30초 안에 끝나지 않으면 SIGKILL로 종료한다. 정리 중 신호도 종료 코드에 반영한다.
- 검사를 더하려면 루트 package.json에 `check:<이름>` 스크립트를 추가한다. 워크스페이스 패키지는 자기 `check` 스크립트만 두면 자동으로 포함된다.
- 커밋 전 hook이 포맷·린트·비밀 스캔을 돌린다. 테스트용 가짜 비밀은 줄 끝에 `betterleaks:allow` 주석을 단다.
```

`docs/superpowers/specs/2026-09-26-ai-template-foundation-design.md`를 고친다.

(1) 찾을 부분:

```markdown
# AI 바이브코딩 템플릿: 기반 설계

- 작성일: 2026-09-26
- 상태: 승인됨. 하위 프로젝트 0(기반), 1(FastAPI), 2(Next.js web) 구현 완료
- 범위: 하위 프로젝트 0(기반)의 설계와 네 템플릿 전체 로드맵
- 다음 단계: 하위 프로젝트 3(create CLI)를 설계하고 구현한다. 앞선 설계는 [FastAPI 템플릿 설계](2026-09-26-fastapi-template-design.md), [Next.js web 템플릿 설계](2026-09-30-nextjs-web-design.md)를 참고한다.

## 1. 목표

```

바꿀 내용:

```markdown
# AI 바이브코딩 템플릿: 기반 설계

- 작성일: 2026-09-26
- 상태: 승인됨. 하위 프로젝트 0(기반), 1(FastAPI), 2(Next.js web) 구현 완료. 3(create CLI)는 설계와 로컬 검증 완료, Docker 기반 완료 조건은 PR CI 확인 대기
- 범위: 하위 프로젝트 0(기반)의 설계와 네 템플릿 전체 로드맵
- 다음 단계: [create CLI 설계](2026-10-03-create-cli-design.md)의 CI 결과를 확인하고 구현 계획을 작성한다. 앞선 설계는 [FastAPI 템플릿 설계](2026-09-26-fastapi-template-design.md), [Next.js web 템플릿 설계](2026-09-30-nextjs-web-design.md)를 참고한다.

## 1. 목표

```

(2) 찾을 부분:

````markdown

### 3.3 새 프로젝트 생성 (create CLI)

- 단독: 템플릿 하나를 대상 폴더 루트에 복사하고 프로젝트 이름을 치환한다.
- 조합: 아래 구조의 모노레포를 만든다.

```
my-project/
├── AGENTS.md, CLAUDE.md          # 조합 구조와 앱 사이의 흐름
├── package.json, pnpm-workspace.yaml, turbo.json
├── compose.yaml                  # 통합 로컬 인프라
└── apps/
    ├── api/                      # fastapi 또는 nestjs (FastAPI면 얇은 package.json 래퍼를 추가)
    ├── web/
    └── admin/
```

- 루트의 명령 어휘는 템플릿과 같다. Turborepo가 앱별 명령을 캐시하며 실행한다.
- 생성한 뒤에는 백엔드 코드가 진실의 원천이다(code-first). 백엔드 `gen`이 `openapi.json`을 내보내 커밋하고, 프론트 `gen`이 그 파일로 타입과 클라이언트를 다시 만든다. 템플릿 저장소의 계약은 템플릿끼리의 호환을 보장하는 용도로만 쓴다.

### 3.4 하위 프로젝트 로드맵
````

바꿀 내용:

````markdown

### 3.3 새 프로젝트 생성 (create CLI)

- 저장소를 clone한 뒤 `pnpm new`로 실행한다. 입력, 이름 치환, 잠금 파일과 하네스의 세부 규칙은 [create CLI 설계](2026-10-03-create-cli-design.md)를 따른다.
- 단독: 템플릿 하나의 git 추적 파일을 대상 폴더 루트에 복사하고 프로젝트 이름을 치환한다.
- 이번 조합은 FastAPI+web이다. admin과 NestJS 조합은 각 템플릿 사이클에서 더한다.

```
my-project/
├── AGENTS.md, CLAUDE.md          # 조합 구조와 앱 사이의 흐름
├── package.json, pnpm-workspace.yaml, pnpm-lock.yaml, turbo.json
├── lefthook.yml, .betterleaks.toml, .mcp.json
├── .claude/                      # 앱 hook 디스패처와 합친 권한
├── .github/workflows/ci.yml
├── scripts/                      # 조합 명령 실행기
└── apps/
    ├── api/                      # FastAPI, package.json 래퍼, compose.yaml
    └── web/                      # Next.js BFF, TypeSpec·목 사본
```

- 루트 compose는 없다. 로컬 인프라는 `apps/api/compose.yaml`이 맡고 compose 프로젝트 이름은 생성한 프로젝트 이름이다. 포트는 템플릿의 고정값을 쓰므로 여러 프로젝트의 동시 실행은 지원하지 않는다.
- 루트의 명령 어휘는 템플릿과 같다. Turborepo는 api·web만 골라 실행하고 `check`·`test`를 캐시한다. `gen`은 생성물 복원 범위를 검증하기 전까지 캐시하지 않는다.
- 생성한 뒤에는 백엔드 코드가 진실의 원천이다(code-first). 백엔드 `gen`이 `openapi.json`을 내보내 커밋하고, 프론트 `gen`이 그 파일로 타입과 클라이언트를 다시 만든다. 템플릿 저장소의 계약은 템플릿끼리의 호환을 보장하는 용도로만 쓴다.

### 3.4 하위 프로젝트 로드맵
````

(3) 찾을 부분:

```markdown

### 6.2 명령 어휘

모든 템플릿과 조합 루트가 같은 이름을 쓴다. 단, `db:migrate`와 `db:reset`은 DB가 있는 백엔드 템플릿과 조합 루트에만 둔다. 프론트엔드 템플릿의 `setup`과 `dev`는 단독 모드에서 목 서버를 함께 다룬다.

| 명령 | 의미 |
|---|---|
```

바꿀 내용:

```markdown

### 6.2 명령 어휘

모든 템플릿과 조합 루트가 같은 이름을 쓴다. 단, `db:migrate`와 `db:reset`은 DB가 있는 백엔드 템플릿과 조합 루트에만 둔다. `e2e:serve`는 백엔드 명령이며 조합 루트의 web E2E 실행기가 부른다. 프론트엔드 템플릿의 `setup`과 `dev`는 단독 모드에서 목 서버를 함께 다룬다.

| 명령 | 의미 |
|---|---|
```

(4) 찾을 부분:

```markdown
| `fix` | 포맷과 자동 수정 가능한 린트 오류를 고친다 |
| `test` | 테스트(E2E 제외) |
| `test:e2e` | E2E 테스트 |
| `gen` | 코드 생성(OpenAPI 내보내기, 클라이언트와 타입, ORM 클라이언트 등) |
| `db:migrate` | 마이그레이션 적용 |
| `db:reset` | 로컬 DB를 초기 상태(마이그레이션과 시드)로 되돌린다 |
```

바꿀 내용:

```markdown
| `fix` | 포맷과 자동 수정 가능한 린트 오류를 고친다 |
| `test` | 테스트(E2E 제외) |
| `test:e2e` | E2E 테스트 |
| `e2e:serve` | E2E 백엔드를 띄우고 받은 명령을 실행한 뒤 내린다. 조합 프로젝트의 web E2E용 |
| `gen` | 코드 생성(OpenAPI 내보내기, 클라이언트와 타입, ORM 클라이언트 등) |
| `db:migrate` | 마이그레이션 적용 |
| `db:reset` | 로컬 DB를 초기 상태(마이그레이션과 시드)로 되돌린다 |
```

(5) 찾을 부분:

```markdown
### 6.8 최종 안전망

- Git hooks(lefthook): pre-commit에서 스테이징된 파일의 포맷, 린트, 비밀 스캔을 하고, pre-push에서 `check`를 돌린다.
- CI(§7.5)가 모든 AI 도구의 실수를 마지막으로 잡는다.

### 6.9 하네스 표준 검사 (템플릿 저장소)

`scripts/verify-templates`는 템플릿마다 다음을 검사한다.

- AGENTS.md와 CLAUDE.md의 짝, CLAUDE.md의 내용, 루트 AGENTS.md의 길이
- 템플릿 종류별 필수 명령(§6.2)이 모두 있는지
- `.claude/settings.json`에 필수 hook 4종이 exec form으로 있는지
- `.env.example`, `docs/recipes/`, 골든 모듈이 있는지
- 공유 자산 사본이 원본과 같은지

## 7. 공통 인프라와 품질

### 7.1 로컬 인프라 (docker compose)

백엔드 템플릿과 조합 루트에 둔다. 프론트엔드 템플릿은 단독 모드에서 목 서버만 쓰므로 compose가 필요 없다.

| 서비스 | 용도 |
|---|---|
```

바꿀 내용:

```markdown
### 6.8 최종 안전망

- Git hooks(lefthook): pre-commit에서 스테이징된 파일의 포맷, 린트, 비밀 스캔을 하고, pre-push에서 `check`를 돌린다.
- CI(§7.5)가 모든 AI 도구의 실수를 마지막으로 잡는다. 생성 프로젝트도 자기 CI에서 `check`, E2E와 이미지 빌드를 돈다.

### 6.9 하네스 표준 검사 (템플릿 저장소)

`scripts/verify-templates`는 템플릿마다 다음을 검사한다.

- AGENTS.md와 CLAUDE.md의 짝, CLAUDE.md의 내용, 루트 AGENTS.md의 길이
- 템플릿 종류별 필수 명령(§6.2)이 모두 있는지. 백엔드는 `e2e:serve`도 요구한다
- `.claude/settings.json`에 필수 hook 4종이 exec form으로 있는지
- `.env.example`, `.github/workflows/ci.yml`, `.gitattributes`, `docs/recipes/`, 골든 모듈이 있는지
- 공유 자산 사본이 원본과 같은지

## 7. 공통 인프라와 품질

### 7.1 로컬 인프라 (docker compose)

백엔드 템플릿에 둔다. 조합에서는 api 앱의 compose를 그대로 쓰며 루트에는 두지 않는다(§3.3). 프론트엔드 템플릿은 단독 모드에서 목 서버만 쓰므로 compose가 필요 없다.

| 서비스 | 용도 |
|---|---|
```

(6) 찾을 부분:

```markdown

- 템플릿마다 `check`, `test:e2e`, Docker 이미지 빌드를 돌린다.
- 템플릿 저장소는 여기에 계약 컴파일과 차이 검사, 룰셋 테스트, 적합성 테스트(3개 대상), 하네스 표준 검사, 사본 동기화 검사를 더한다.

### 7.6 보안 기본값

```

바꿀 내용:

```markdown

- 템플릿마다 `check`, `test:e2e`, Docker 이미지 빌드를 돌린다.
- 템플릿 저장소는 여기에 계약 컴파일과 차이 검사, 룰셋 테스트, 적합성 테스트(3개 대상), 하네스 표준 검사, 사본 동기화 검사를 더한다.
- 단독·조합 프로젝트에 CI 워크플로를 넣는다. 저장소의 `create-combo`와 `create-standalone` 작업은 실제 생성 결과의 setup·check와 조합 E2E·이미지 빌드를 확인한다. 워크플로 파일은 actionlint로 검사한다([create CLI 설계](2026-10-03-create-cli-design.md) §5.9·§7.3).

### 7.6 보안 기본값

```

(7) 찾을 부분:

```markdown
|---|---|
| 1. FastAPI | 모두 정했다. 결정은 [FastAPI 설계](2026-09-26-fastapi-template-design.md) §2와 §7에 있다 |
| 2. web | API 클라이언트 생성기(openapi-fetch 또는 orval)와 JSON:API 역직렬화 헬퍼 설계, 데이터 패칭 패턴(RSC와 Server Actions, 클라이언트 쿼리의 역할 분담), 폼 라이브러리(TanStack Form 또는 React Hook Form), shadcn 기반(Base UI 또는 Radix), Next.js 관리 블록 처리(수용 또는 `agentRules: false`), i18n URL 전략, 목 서버 구현 방식, 단독 프론트에서 계약을 확장하는 방법(TypeSpec 원본 동봉 여부), TS 7 병용, Node 26 전환, 템플릿 안 계약 사본(`openapi.yaml`)을 비밀 스캔에서 빼는 방법 |
| 3. create CLI | 배포 방식(GitHub에서 npx 실행 또는 로컬 clone), 조합 루트의 세부 구성, 포트 배정 |
| 4. admin | 리소스 선언 형식, 범용 목록·상세·폼 화면의 범위 |
| 5. NestJS | ORM 최종 확인(Prisma 7), JSON:API DTO와 swagger 스키마 이름을 맞추는 방법, 린터 구성(TS 6 제약 아래 ESLint 또는 oxlint) |

## 11. 확인한 사실과 출처 (2026-09-26)

```

바꿀 내용:

```markdown
|---|---|
| 1. FastAPI | 모두 정했다. 결정은 [FastAPI 설계](2026-09-26-fastapi-template-design.md) §2와 §7에 있다 |
| 2. web | API 클라이언트 생성기(openapi-fetch 또는 orval)와 JSON:API 역직렬화 헬퍼 설계, 데이터 패칭 패턴(RSC와 Server Actions, 클라이언트 쿼리의 역할 분담), 폼 라이브러리(TanStack Form 또는 React Hook Form), shadcn 기반(Base UI 또는 Radix), Next.js 관리 블록 처리(수용 또는 `agentRules: false`), i18n URL 전략, 목 서버 구현 방식, 단독 프론트에서 계약을 확장하는 방법(TypeSpec 원본 동봉 여부), TS 7 병용, Node 26 전환, 템플릿 안 계약 사본(`openapi.yaml`)을 비밀 스캔에서 빼는 방법 |
| 3. create CLI | 모두 정했다. 로컬 clone 뒤 `pnpm new`, apps/api·apps/web 조합과 api 소유 인프라, 고정 포트다. 결정은 [create CLI 설계](2026-10-03-create-cli-design.md) §2·§5·§6에 있다 |
| 4. admin | 리소스 선언 형식, 범용 목록·상세·폼 화면의 범위, 조합에서 web과 admin이 계약·목 패키지(`@ai-template/*`)를 함께 쓰는 방식(같은 이름의 패키지 충돌), admin 포트 3001 |
| 5. NestJS | ORM 최종 확인(Prisma 7), JSON:API DTO와 swagger 스키마 이름을 맞추는 방법, 린터 구성(TS 6 제약 아래 ESLint 또는 oxlint), `e2e:serve` 구현, 조합의 `--api nestjs` |
| 나중 | 생성한 프로젝트 갱신, npm 배포, 포트 오프셋 |

## 11. 확인한 사실과 출처 (2026-09-26)

```

`docs/superpowers/specs/2026-10-03-create-cli-design.md`를 고친다.

(1) 찾을 부분:

```markdown
# create CLI 설계 (하위 프로젝트 3)

- 작성일: 2026-10-03
- 상태: 승인됨(2026-10-03). 구현 전
- 상위 문서: [기반 설계](2026-09-26-ai-template-foundation-design.md)
  - 이 문서는 기반 설계 §10에서 사이클 3으로 미룬 결정(배포 방식, 조합 루트의 세부 구성, 포트 배정)을 내리고, `create/` CLI와 이번 사이클의 템플릿·저장소 변경을 설계한다.
  - 템플릿의 동작 기준은 [FastAPI 설계](2026-09-26-fastapi-template-design.md), [보강 설계](2026-09-29-fastapi-hardening-design.md), [Next.js web 설계](2026-09-30-nextjs-web-design.md)다.
- 구현 계획: 프로토타입을 검증한 뒤 `docs/superpowers/plans/`에 쓴다.
- 다음 단계: 프로토타입(§8.3의 확인부터) → 계획 → 구현

## 1. 목표와 범위

```

바꿀 내용:

```markdown
# create CLI 설계 (하위 프로젝트 3)

- 작성일: 2026-10-03
- 상태: 승인됨(2026-10-03). 로컬 검증 완료, Docker 기반 완료 조건은 PR CI 확인 대기(§8.4)
- 상위 문서: [기반 설계](2026-09-26-ai-template-foundation-design.md)
  - 이 문서는 기반 설계 §10에서 사이클 3으로 미룬 결정(배포 방식, 조합 루트의 세부 구성, 포트 배정)을 내리고, `create/` CLI와 이번 사이클의 템플릿·저장소 변경을 설계한다.
  - 템플릿의 동작 기준은 [FastAPI 설계](2026-09-26-fastapi-template-design.md), [보강 설계](2026-09-29-fastapi-hardening-design.md), [Next.js web 설계](2026-09-30-nextjs-web-design.md)다.
- 구현 계획: 검증 결과와 이 문서의 결정을 반영해 `docs/superpowers/plans/`에 쓴다.
- 다음 단계: 생성 프로젝트의 PR CI 확인 → 계획 → 구현

## 1. 목표와 범위

```

(2) 찾을 부분:

```markdown
| C6  | git         | `git init -b main`과 첫 커밋. 메시지에 템플릿 저장소의 커밋을 적는다                                                                  | hook 설치와 Stop hook의 변경 감지가 git 저장소를 전제한다. 출처가 남는다                                 |
| C7  | 조합 구조   | `apps/api`(FastAPI와 package.json 래퍼), `apps/web`. 로컬 인프라는 `apps/api/compose.yaml`이고 루트 compose는 두지 않는다             | 프론트는 인프라가 필요 없다. 앱 폴더가 단독 템플릿과 같은 구조로 남아 앱 문서와 명령이 그대로 맞는다    |
| C8  | workspace   | 루트 pnpm workspace 하나. 루트 잠금 파일은 web 잠금 파일에서 만든다                                                                   | 템플릿에서 검증한 의존성 버전을 그대로 쓴다                                                              |
| C9  | Turborepo   | `dev`만 앱을 함께 띄우고 나머지는 앱을 차례로 돈다. `check`·`test`·`gen`만 캐시한다                                                    | 동시 실행 부하로 인한 간헐 실패를 피한다. 부수 효과가 있는 명령은 캐시하지 않는다                        |
| C10 | 계약        | code-first. web `gen`이 api의 `openapi.json`으로 web 타입을 만든다. 목과 TypeSpec 사본은 대역으로 남는다                               | 기반 설계 §3.3, web 설계 §5.4·§8.8                                                                       |
| C11 | 조합 E2E    | 백엔드 명령 `e2e:serve`가 E2E 설정의 api를 띄우고, 루트 실행기가 그 위에서 web E2E(fastapi 대상)를 돈다                                | web과 api의 실제 연결을 자동으로 확인한다. web 템플릿은 바꾸지 않는다                                    |
| C12 | Claude 설정 | 루트 설정은 두 앱 설정의 합집합과 hook 디스패처다. skill은 앱에 둔다                                                                   | Claude Code는 시작 폴더의 설정만 읽고, 하위 폴더의 skill은 그 폴더의 파일을 읽을 때 불러온다(§10)       |
```

바꿀 내용:

```markdown
| C6  | git         | `git init -b main`과 첫 커밋. 메시지에 템플릿 저장소의 커밋을 적는다                                                                  | hook 설치와 Stop hook의 변경 감지가 git 저장소를 전제한다. 출처가 남는다                                 |
| C7  | 조합 구조   | `apps/api`(FastAPI와 package.json 래퍼), `apps/web`. 로컬 인프라는 `apps/api/compose.yaml`이고 루트 compose는 두지 않는다             | 프론트는 인프라가 필요 없다. 앱 폴더가 단독 템플릿과 같은 구조로 남아 앱 문서와 명령이 그대로 맞는다    |
| C8  | workspace   | 루트 pnpm workspace 하나. 루트 잠금 파일은 web 잠금 파일에서 만든다                                                                   | 템플릿에서 검증한 의존성 버전을 그대로 쓴다                                                              |
| C9  | Turborepo   | `dev`만 앱을 함께 띄우고 나머지는 앱을 차례로 돈다. `check`·`test`를 캐시하고 `gen`은 캐시하지 않는다                                  | 동시 실행 부하를 줄이고, 아직 복원 범위를 검증하지 않은 생성물을 캐시 hit로 누락하지 않는다(§5.4)       |
| C10 | 계약        | code-first. web `gen`이 api의 `openapi.json`으로 web 타입을 만든다. 목과 TypeSpec 사본은 대역으로 남는다                               | 기반 설계 §3.3, web 설계 §5.4·§8.8                                                                       |
| C11 | 조합 E2E    | 백엔드 명령 `e2e:serve`가 E2E 설정의 api를 띄우고, 루트 실행기가 그 위에서 web E2E(fastapi 대상)를 돈다                                | web과 api의 실제 연결을 자동으로 확인한다. web 템플릿은 바꾸지 않는다                                    |
| C12 | Claude 설정 | 루트 설정은 두 앱 설정의 합집합과 hook 디스패처다. skill은 앱에 둔다                                                                   | Claude Code는 시작 폴더의 설정만 읽고, 하위 폴더의 skill은 그 폴더의 파일을 읽을 때 불러온다(§10)       |
```

(3) 찾을 부분:

```markdown
다음이면 아무것도 만들지 않고 `pnpm new: <문제> — <고치는 방법>`을 출력한다. 사용법 오류는 종료 코드 2, 그 밖은 1이다.

- 대상 폴더가 있고 비어 있지 않다.
- 대상 폴더가 템플릿 저장소 안에 있다.
- 이름이 규칙에 맞지 않는다.
- 템플릿 폴더에 커밋하지 않은 변경이 있다.
- 필요한 도구가 없다: 모두 `git`, 조합은 `pnpm`도.

### 3.3 생성 순서

1. 입력과 도구를 검사한다(§3.2).
2. 대상 폴더와 같은 부모 아래 임시 폴더를 만든다.
3. 파일을 복사하고 이름을 바꾼다(단독 §4, 조합 §5).
4. 조합이면 루트 잠금 파일을 만들고(§5.3), `pnpm install --frozen-lockfile`과 web `gen`을 실행해 web 생성물을 api의 `openapi.json` 기준으로 맞춘다(§5.5). 이 단계만 npm 레지스트리에 접속한다.
5. 임시 폴더를 대상 폴더로 옮긴다. 어느 단계든 실패하면 임시 폴더를 지우고 대상 폴더는 만들지 않는다.
6. `git init -b main`과 첫 커밋을 한다(`--no-git`이면 건너뛴다). 메시지는 `chore: create <이름> from ai-template <템플릿 저장소 커밋>`이다. git 사용자 정보가 없으면 init만 하고 커밋 방법을 안내한다. 사용자의 서명 설정은 그대로 따른다.
7. 다음 명령을 안내한다: 단독 fastapi는 `uv run poe setup`, 단독 nextjs와 조합은 `pnpm setup`.

- CLI와 그 테스트의 git 호출은 상속된 저장소 지정 변수(`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` 등)를 지운 환경에서 한다. W4에서 pre-push hook 안의 테스트가 상속된 `GIT_DIR`로 실제 저장소를 다시 초기화한 일이 있었다.
```

바꿀 내용:

```markdown
다음이면 아무것도 만들지 않고 `pnpm new: <문제> — <고치는 방법>`을 출력한다. 사용법 오류는 종료 코드 2, 그 밖은 1이다.

- 대상 폴더가 있고 비어 있지 않다.
- 대상 폴더가 템플릿 저장소 안에 있다. 심볼릭 링크를 따라간 실제 경로도 검사한다.
- 이름이 규칙에 맞지 않는다.
- 템플릿 폴더에 커밋하지 않은 변경이 있다.
- 필요한 도구가 없다: 모두 `git`, 조합은 `pnpm`도.

비어 있는 일반 폴더는 허용한다. 템플릿의 변경 검사는 git 추적 파일만 보며, 무추적 파일은 복사하지 않는다.

### 3.3 생성 순서

1. 입력과 도구를 검사한다(§3.2).
2. 대상 폴더와 같은 부모 아래 임시 폴더를 만든다.
3. 파일을 복사하고 이름을 바꾼다(단독 §4, 조합 §5).
4. 조합이면 루트 잠금 파일을 만들고(§5.3), `pnpm install --frozen-lockfile`을 실행한다. 동적으로 합친 `.claude/settings.json`, `lefthook.yml`, `.mcp.json`을 고정 Prettier로 포맷한 뒤 web `gen`을 실행해 web 생성물을 api의 `openapi.json` 기준으로 맞춘다(§5.5). 이 단계만 npm 레지스트리에 접속한다.
5. 임시 폴더를 대상 폴더로 옮긴다. 어느 단계든 실패하면 임시 폴더를 지우고 대상 폴더는 만들지 않는다.
6. `git init -b main`과 첫 커밋을 한다(`--no-git`이면 건너뛴다). 메시지는 `chore: create <이름> from ai-template <템플릿 저장소 short SHA>`다. 설정된 `user.name` 또는 `user.email`이 없으면 init만 하고 커밋 방법을 안내한다. git이 환경에서 추측한 신원은 쓰지 않으며, 사용자의 서명 설정은 그대로 따른다. git 단계가 실패하면 생성한 대상도 정리한다.
7. 다음 명령을 안내한다: 단독 fastapi는 `uv run poe setup`, 단독 nextjs와 조합은 `pnpm setup`.

- CLI와 그 테스트의 git 호출은 상속된 저장소 지정 변수(`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` 등)를 지운 환경에서 한다. W4에서 pre-push hook 안의 테스트가 상속된 `GIT_DIR`로 실제 저장소를 다시 초기화한 일이 있었다.
```

(4) 찾을 부분:

```markdown
### 5.2 루트 파일

- `package.json`: `name`은 `<이름>`이고 `private`, `type: module`, `packageManager: pnpm@12.6.0`, `engines.node`는 web과 같다. 스크립트는 §5.4의 명령이다.
- devDependencies는 turbo, lefthook, prettier다. 정확한 버전으로 고정한다. lefthook과 prettier는 web 템플릿과 같은 버전이고, turbo는 `minimumReleaseAge`를 만족하는 최신 2.x다.
- `.gitignore`: `node_modules/`, `.turbo/`. 앱의 `.gitignore`는 그대로 둔다.
- `.prettierrc.json`: web과 같은 설정이다. 루트가 소유한 파일(루트 문서, 설정, `scripts/`, `.claude/hooks/`)만 루트에서 포맷한다.

### 5.3 workspace와 잠금 파일

- `pnpm-workspace.yaml`의 패키지는 `apps/api`, `apps/web`, `apps/web/contract/*`다. web의 workspace 설정(`minimumReleaseAge`, `allowBuilds`)은 루트로 옮긴다.
- 루트 잠금 파일은 web 잠금 파일에서 만든다.
  1. importer 경로를 바꾼다(`.` → `apps/web`, `contract/<패키지>` → `apps/web/contract/<패키지>`).
  2. `pnpm install --lockfile-only`로 루트와 `apps/api` importer만 더 푼다.
  3. web 쪽 패키지의 해석 결과가 템플릿 잠금 파일과 같은지 CLI가 확인하고, 다르면 실패한다.
- `apps/api`의 Python 의존성은 앱의 `uv.lock`이 그대로 맡는다.

### 5.4 명령
```

바꿀 내용:

```markdown
### 5.2 루트 파일

- `package.json`: `name`은 `<이름>`이고 `private`, `type: module`, `packageManager: pnpm@12.6.0`, `engines.node`는 web과 같다. 스크립트는 §5.4의 명령이다.
- devDependencies는 turbo, lefthook, prettier다. 정확한 버전으로 고정한다. lefthook과 prettier는 web 템플릿과 같은 버전이다. turbo는 `2.11.6`으로 고정했다. 선정 시각(2026-10-03 06:28 UTC)에 최신 `2.11.7`은 공개 후 24시간이 지나지 않아, `minimumReleaseAge: 1440`을 만족한 최신 안정 2.x를 골랐다. 생성할 때 최신 버전으로 다시 풀지 않는다.
- `.gitignore`: `node_modules/`, `.turbo/`. 앱의 `.gitignore`는 그대로 둔다.
- `.prettierrc.json`: web과 같은 설정이다. 루트가 소유한 파일(루트 문서, 설정, `scripts/`, `.claude/hooks/`)만 루트에서 포맷한다.

### 5.3 workspace와 잠금 파일

- `pnpm-workspace.yaml`의 패키지는 `apps/api`, `apps/web`, `apps/web/contract/*`다. web의 workspace 설정(`minimumReleaseAge`, `allowBuilds`)은 루트로 옮긴다.
- `overrides.typescript`는 web 템플릿의 정확한 TypeScript 버전(`6.0.3`)으로 둔다. workspace를 옮겨도 계약·목 패키지의 peer가 같은 버전을 쓰게 한다. 루트 devDependencies에 TypeScript를 새로 넣지 않는다.
- 루트 잠금 파일은 web 잠금 파일에서 만든다.
  1. importer 경로를 바꾼다(`.` → `apps/web`, `contract/<패키지>` → `apps/web/contract/<패키지>`).
  2. `pnpm install --lockfile-only`로 루트와 `apps/api` importer만 더 푼다.
  3. 모든 web importer, 기존 패키지의 버전 키·resolution과 snapshot 의존성 해석이 템플릿 잠금 파일과 같은지 CLI가 확인하고, 다르면 실패한다. override가 바꾼 peer 선언 문구는 실제 버전 해석과 구분한다.
- pnpm 12의 잠금 파일은 도구 설치와 프로젝트 의존성의 두 YAML 문서다. 도구 설치 문서는 보존하고 의존성 문서의 importer만 옮긴다.
- `apps/api`의 Python 의존성은 앱의 `uv.lock`이 그대로 맡는다.

### 5.4 명령
```

(5) 찾을 부분:

```markdown
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `setup`                  | 도구 확인(Node 24, pnpm, uv, Docker) → `pnpm install --frozen-lockfile` → 루트 `lefthook install` → api `setup` → web `setup` |
| `dev`                    | `turbo run dev`: api(8000, worker·scheduler 포함)와 web(3000, 백엔드 모드)을 함께 띄운다                             |
| `check`                  | 루트 검사(루트 파일 포맷, 루트 스크립트 테스트, 지침 파일) → api `check` → web `check`                               |
| `fix`                    | 앱별 `fix`와 루트 파일 포맷                                                                                           |
| `test`                   | 앱별 `test`                                                                                                           |
| `test:e2e`               | api `test:e2e` → web E2E를 실제 api에(§5.7). 첫 실패에서 멈춘다                                                       |
```

바꿀 내용:

```markdown
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `setup`                  | 도구 확인(Node 24, pnpm, uv, Docker) → `pnpm install --frozen-lockfile` → 루트 `lefthook install` → api `setup` → web `setup` |
| `dev`                    | `turbo run dev`: api(8000, worker·scheduler 포함)와 web(3000, 백엔드 모드)을 함께 띄운다                             |
| `check`                  | 루트 검사(루트 파일 포맷, 루트 스크립트 테스트, 지침 파일) → 두 앱의 `check`를 한 번에 하나씩 실행한다. 앱 순서는 고정하지 않는다 |
| `fix`                    | 앱별 `fix`와 루트 파일 포맷                                                                                           |
| `test`                   | 앱별 `test`                                                                                                           |
| `test:e2e`               | api `test:e2e` → web E2E를 실제 api에(§5.7). 첫 실패에서 멈춘다                                                       |
```

(6) 찾을 부분:

```markdown
- `check`의 출력 원칙은 템플릿과 같다. 성공하면 한 줄, 실패하면 실패한 단계의 출력만 보여 준다.
- Turborepo 설정
  - `dev`는 `persistent`이고 캐시하지 않는다.
  - `check`·`test`·`gen`은 캐시한다. web의 `check`·`gen` 입력에는 `$TURBO_ROOT$/apps/api/openapi.json`을 더한다.
  - `web#gen`은 `api#gen`에 의존한다.
  - 앱을 차례로 돌도록 동시 실행 수를 1로 둔다(`dev` 제외).
- `setup`, `test:e2e`, `db:*`는 루트 실행기(`scripts/`)가 차례로 부르고 캐시하지 않는다.

### 5.5 계약 연결 (code-first)

```

바꿀 내용:

```markdown
- `check`의 출력 원칙은 템플릿과 같다. 성공하면 한 줄, 실패하면 실패한 단계의 출력만 보여 준다.
- Turborepo 설정
  - `dev`는 `persistent`이고 캐시하지 않는다.
  - `check`·`test`는 캐시한다. `gen`과 `web#gen`은 `cache: false`다. api 내보내기와 web의 TypeSpec·목 생성까지 산출물 전체의 복원 범위를 검증하지 않았으므로 캐시 hit로 생성을 건너뛰지 않는다. 정확한 outputs와 복원 검증을 갖춘 뒤 캐시를 켤 수 있다.
  - web의 `check`·`gen` 입력에는 `$TURBO_ROOT$/apps/api/openapi.json`을 더한다.
  - `web#gen`은 `api#gen`에 의존한다.
  - 앱 작업은 `--filter=api --filter=web`으로 두 앱만 고른다. web 내부 계약 작업을 중복 실행하지 않는다. 앱을 차례로 돌도록 동시 실행 수를 1로 둔다(`dev` 제외).
- `setup`, `test:e2e`는 루트 실행기(`scripts/`)가 차례로 부르고 캐시하지 않는다. `db:migrate`, `db:reset`은 루트 package.json 스크립트가 `pnpm --filter api run <명령>`으로 직접 넘기며 캐시하지 않는다.

### 5.5 계약 연결 (code-first)

```

(7) 찾을 부분:

```markdown
- 그래서 백엔드 코드 → `openapi.json` → web 타입이 `check`로 이어진다. api 코드를 바꾸고 `pnpm gen`을 빼먹으면 api나 web의 생성물 검사가 실패한다.
- 템플릿의 web 생성물은 TypeSpec에서 만든 것이다. 그래서 조합을 만들 때 CLI가 web `gen`을 한 번 실행하고(§3.3), 첫 커밋의 web 생성물이 api `openapi.json`과 맞게 한다.
- 목과 TypeSpec 사본은 프론트만 개발할 때와 web 통합 테스트에 쓰는 대역이다. 백엔드가 플랫폼 API를 바꿔도 목은 따라가지 않는다. 실제 동작의 차이는 §5.7의 E2E가 잡는다. 이 관계를 루트 AGENTS.md에 적는다.
- 위험: web 코드가 FastAPI `openapi.json`에서 만든 타입으로도 컴파일되는지는 아직 확인하지 않았다(§8.3의 첫 확인). 다르면 원인 쪽을 고친다. 계약과 다른 스키마 이름이나 모양은 FastAPI 쪽을 고친다(기반 설계 §3.2). 생성 방식의 차이는 web 생성기를 고친다.

### 5.6 환경 파일

- `apps/web/.env.example`
  - 조합에서 `API_BASE_URL=http://127.0.0.1:8000/api/v1`, `NEXT_PUBLIC_REALTIME_URL=http://127.0.0.1:8000`으로 바꾼다.
  - 그래서 web `dev`가 백엔드 모드로 `next dev`만 띄운다. 나머지 값은 템플릿과 같다.
- `apps/api/.env.example`은 템플릿 그대로다. `FRONTEND_URL`, `REALTIME_ALLOWED_ORIGINS`, `OAUTH_REDIRECT_URIS`, `STORAGE_ALLOWED_ORIGINS`가 이미 web 3000을 가리킨다.
- 두 앱의 `setup`이 각자 `.env`를 만든다(없으면 복사, 있으면 없는 키만 더한다).

```

바꿀 내용:

```markdown
- 그래서 백엔드 코드 → `openapi.json` → web 타입이 `check`로 이어진다. api 코드를 바꾸고 `pnpm gen`을 빼먹으면 api나 web의 생성물 검사가 실패한다.
- 템플릿의 web 생성물은 TypeSpec에서 만든 것이다. 그래서 조합을 만들 때 CLI가 web `gen`을 한 번 실행하고(§3.3), 첫 커밋의 web 생성물이 api `openapi.json`과 맞게 한다.
- 목과 TypeSpec 사본은 프론트만 개발할 때와 web 통합 테스트에 쓰는 대역이다. 백엔드가 플랫폼 API를 바꿔도 목은 따라가지 않는다. 실제 동작의 차이는 §5.7의 E2E가 잡는다. 이 관계를 루트 AGENTS.md에 적는다.
- FastAPI `openapi.json`에서 만든 타입으로 web `check`가 통과했다(§8.4). 계약과 다른 스키마 이름이나 모양은 FastAPI 쪽을 고치고(기반 설계 §3.2), 생성 방식의 차이는 web 생성기를 고친다.

### 5.6 환경 파일

- `apps/web/.env.example`
  - 조합에서 `API_BASE_URL=http://127.0.0.1:8000/api/v1`, `NEXT_PUBLIC_REALTIME_URL=http://127.0.0.1:8000`으로 바꾼다.
  - 그래서 web `dev`가 백엔드 모드로 `next dev`만 띄운다. 두 값만 제자리에서 바꾸며 주석과 나머지 값은 템플릿과 같다.
- `apps/api/.env.example`은 템플릿 그대로다. `FRONTEND_URL`, `REALTIME_ALLOWED_ORIGINS`, `OAUTH_REDIRECT_URIS`, `STORAGE_ALLOWED_ORIGINS`가 이미 web 3000을 가리킨다.
- 두 앱의 `setup`이 각자 `.env`를 만든다(없으면 복사, 있으면 없는 키만 더한다).

```

(8) 찾을 부분:

```markdown
   - `E2E_MAILPIT_URL`(Mailpit API), `E2E_OAUTH_URL`(모의 OAuth)
   - `E2E_RECENT_LOGIN_SECONDS`
6. 명령이 끝나면 세 프로세스를 내리고 명령의 종료 코드로 끝난다. Ctrl+C와 신호도 세 프로세스를 정리한다.

- 루트 `test:e2e`는 두 단계다.
  1. api `test:e2e`(pytest E2E)를 돈다.
```

바꿀 내용:

```markdown
   - `E2E_MAILPIT_URL`(Mailpit API), `E2E_OAUTH_URL`(모의 OAuth)
   - `E2E_RECENT_LOGIN_SECONDS`
6. 명령이 끝나면 세 프로세스를 내리고 명령의 종료 코드로 끝난다. Ctrl+C와 신호도 세 프로세스를 정리한다.

- `--web-url`은 경로·쿼리·조각·계정 없는 http(s) Origin만 받는다. 명령은 poe의 `POE_PWD`(호출한 폴더)에서 실행한다.
- 서버 준비, 설정 덮어쓰기, 프로세스 그룹, readiness와 로그는 기존 `test:e2e`와 공유한다. readiness가 60초 안에 성공하지 못하면 로그 끝부분을 출력하고 종료 코드 1로 끝난다.

- 루트 `test:e2e`는 두 단계다.
  1. api `test:e2e`(pytest E2E)를 돈다.
```

(9) 찾을 부분:

```markdown

    | 이벤트                              | 디스패처                                                                                                       |
    | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
    | `PostToolUse` (`Edit`, `Write`)     | 고친 파일이 속한 앱의 hook. 루트 파일이면 루트 포맷만                                                         |
    | `Stop`                              | `stop_hook_active`면 통과. 바뀐 파일이 있는 앱의 hook만 돌리고, 루트 파일이 바뀌었으면 루트 검사도 돈다. 하나라도 막으면 이유를 모아 막는다 |
    | `PreToolUse` (`Bash`, `PowerShell`) | 두 앱의 hook을 모두 돌리고 하나라도 거부하면 거부한다                                                         |
    | `SessionStart`                      | 두 앱의 요약을 앱 이름과 함께 이어 붙인다                                                                     |

- skill은 앱에 둔다. Claude Code는 시작 폴더 아래의 `.claude/skills/`를 그 폴더의 파일을 처음 읽거나 고칠 때 불러온다(§10).
- 루트 `.mcp.json`에는 web의 MCP 서버(next-devtools-mcp)를 그대로 올린다.
```

바꿀 내용:

```markdown

    | 이벤트                              | 디스패처                                                                                                       |
    | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
    | `PostToolUse` (`Edit`, `Write`, `MultiEdit`) | 고친 파일이 속한 앱의 hook. 루트 파일이면 루트 포맷만                                                         |
    | `Stop`                              | `stop_hook_active`면 통과. 바뀐 앱의 hook만 돌리고, 루트 변경에는 포맷·Node 테스트·지침 3단계만 돈다. 하나라도 막으면 이유를 모아 막는다 |
    | `PreToolUse` (`Bash`, `PowerShell`, `Edit`, `Write`, `MultiEdit`) | 두 앱의 matcher에 맞는 hook을 돌리고 하나라도 거부하면 거부한다. API의 커밋된 마이그레이션 편집 보호도 유지한다 |
    | `SessionStart`                      | 두 앱의 요약을 앱 이름과 함께 이어 붙인다                                                                     |

  - exit 2 또는 JSON deny는 허용보다 우선한다. PreToolUse의 JSON 결정은 deny → defer → ask → allow 순서로 합친다. Stop·PostToolUse는 block과 이유를 모으며, SessionStart는 한 앱의 진단이 실패해도 다른 앱의 요약을 보존한다.
  - 직접 node로 시작한 hook에도 PATH에서 찾은 pnpm 진입점을 넘긴다. shell 없이 Windows의 pnpm 실행과 web 생성물 검사를 지원한다.

- skill은 앱에 둔다. Claude Code는 시작 폴더 아래의 `.claude/skills/`를 그 폴더의 파일을 처음 읽거나 고칠 때 불러온다(§10).
- 루트 `.mcp.json`에는 web의 MCP 서버(next-devtools-mcp)를 그대로 올린다.
```

(10) 찾을 부분:

```markdown
    - 루트 파일 포맷과 비밀 스캔 한 번을 더한다.
  - 비밀 스캔
    - 루트 `.betterleaks.toml`을 쓴다. 두 앱 설정의 허용 경로에 `apps/<앱>/`을 붙여 합친 파일이다.
    - 실행 파일은 web의 고정 Betterleaks(`pnpm --filter web run -s tool betterleaks ...`)를 쓴다.
  - pre-push: 루트 `pnpm check`.
  - 앱의 hook 설치기는 git 최상위가 아니면 hook을 걸지 않으므로 루트 hook과 다투지 않는다.
- 루트 `scripts/`의 실행기와 `.claude/hooks/`의 디스패처는 Node 내장 모듈만 쓰는 ESM이다. `node --test` 테스트를 함께 두고 루트 `check`가 돈다.
```

바꿀 내용:

```markdown
    - 루트 파일 포맷과 비밀 스캔 한 번을 더한다.
  - 비밀 스캔
    - 루트 `.betterleaks.toml`을 쓴다. 두 앱 설정의 허용 경로에 `apps/<앱>/`을 붙여 합친 파일이다.
    - 실행 파일은 web의 고정 Betterleaks를 쓴다. web 작업 폴더에서 루트 저장소와 설정을 모두 지정한다: `pnpm --filter web run -s tool betterleaks git ../.. --pre-commit --staged --no-banner --redact --config ../../.betterleaks.toml`. 루트 파일도 스캔하며 앱의 생성물 예외는 해당 앱 경로 안으로 제한한다.
  - pre-push: 루트 `pnpm check`.
  - 앱의 hook 설치기는 git 최상위가 아니면 hook을 걸지 않으므로 루트 hook과 다투지 않는다.
- 루트 `scripts/`의 실행기와 `.claude/hooks/`의 디스패처는 Node 내장 모듈만 쓰는 ESM이다. `node --test` 테스트를 함께 두고 루트 `check`가 돈다.
```

(11) 찾을 부분:

```markdown

- 단독 워크플로는 템플릿 폴더의 `.github/workflows/ci.yml`이다. 조합 워크플로의 원본은 `create/assets/combo/`에 있다.
- 템플릿 저장소의 `pnpm check`가 셋 모두를 actionlint로 검사한다.

## 6. 포트

템플릿의 고정 포트를 그대로 쓰고 모두 127.0.0.1에 연다.

| 용도                                                                     | 포트                                     |
| ------------------------------------------------------------------------ | ---------------------------------------- |
```

바꿀 내용:

```markdown

- 단독 워크플로는 템플릿 폴더의 `.github/workflows/ci.yml`이다. 조합 워크플로의 원본은 `create/assets/combo/`에 있다.
- 템플릿 저장소의 `pnpm check`가 셋 모두를 actionlint로 검사한다.
- actionlint는 `1.7.12`와 릴리스의 sha256 체크섬으로 고정한다. 외부 shellcheck·pyflakes는 끄고 같은 actionlint 검사로 루트와 생성용 워크플로 4개를 확인한다.
- 조합 web 이미지의 원본은 `create/assets/combo/apps/web/`에 있다. 루트 lockfile·workspace와 앱 manifest로 `pnpm --filter web... install --frozen-lockfile`을 실행한다. root manifest는 복사하지 않아 turbo·lefthook·prettier 설치를 피한다. workspace의 TypeScript override와 release-age 설정은 유지한다.
- 빌드는 web 작업 폴더에서 `NEXT_OUTPUT=standalone node node_modules/next/dist/bin/next build`로 실행한다. pnpm run이 나머지 workspace를 자동 설치하는 것을 피한다. runtime은 standalone의 workspace 배치와 정적 자산을 보존하고 `node apps/web/server.js`로 시작한다. UID/GID 10001, HTTP health check와 실행 시 환경 설정은 단독 이미지와 같다. 인접 `Dockerfile.dockerignore`는 환경 파일·git·설치물·캐시·빌드 결과·Python 가상환경을 문맥에서 제외한다.

## 6. 포트

템플릿의 고정 포트를 그대로 쓴다. 인프라 포트는 127.0.0.1에 열고, web dev는 Next.js의 기본 바인딩(0.0.0.0)을 쓴다.

| 용도                                                                     | 포트                                     |
| ------------------------------------------------------------------------ | ---------------------------------------- |
```

(12) 찾을 부분:

```markdown

- `create-combo`(한도 90분)
  1. 루트 설치
  2. `pnpm new "$RUNNER_TEMP/combo" --api fastapi --web --name ci-combo`
  3. 생성 폴더에서 `pnpm setup` → Chromium Linux 의존성 → `pnpm check` → `pnpm test:e2e`
  4. 두 이미지 빌드(§5.9의 조합 단계). 조합용 web Dockerfile을 이 작업이 확인한다
  - git 사용자 정보는 작업에서 정한다.
- `create-standalone`(한도 60분): fastapi를 만들어 `uv run poe setup` → `uv run poe check`, nextjs를 만들어 `pnpm setup` → `pnpm check`.
- 생성 프로젝트의 워크플로 파일 자체는 실행하지 않는다. actionlint로 검사하고, 같은 단계를 위 작업이 돈다.

## 8. 테스트와 검증

```

바꿀 내용:

```markdown

- `create-combo`(한도 90분)
  1. 루트 설치
  2. `pnpm new "$RUNNER_TEMP/aitpl-combo" --api fastapi --web --name ci-combo`
  3. 생성 폴더에서 `pnpm setup` → Chromium Linux 의존성 → `pnpm check` → `pnpm test:e2e`
  4. 두 이미지 빌드(§5.9의 조합 단계) → 조합 web 컨테이너를 띄워 `GET /`의 200 확인(§8.3 #6). 생성 프로젝트의 워크플로는 빌드까지만 한다
  - git 사용자 정보는 작업에서 정한다.
- `create-standalone`(한도 60분): `$RUNNER_TEMP/aitpl-fastapi`를 만들어 `uv run poe setup` → `uv run poe check`, `$RUNNER_TEMP/aitpl-nextjs`를 만들어 `pnpm setup` → `pnpm exec playwright install-deps chromium` → `pnpm check`.
- 생성 프로젝트의 워크플로 파일 자체는 실행하지 않는다. actionlint로 검사하고, `create-standalone`은 단독 프로젝트의 setup·check를, `create-combo`는 조합의 setup·check·E2E·이미지 빌드와 web 컨테이너 시작을 확인한다.

## 8. 테스트와 검증

```

(13) 찾을 부분:

```markdown
- 로컬에서는 개발 compose 프로젝트(`fastapi`, `joon`)와 그 볼륨을 쓰거나 내리는 명령을 실행하지 않는다. 생성한 프로젝트는 자기 이름의 compose 프로젝트를 쓰지만, 포트가 개발 스택과 겹치므로 로컬에서 띄우지 않는다.
- 로컬 확인: CLI 테스트, 생성한 web의 `check`(목 프로세스만 쓴다), FastAPI의 인프라 없는 검사.

### 8.3 위험과 첫 확인

프로토타입은 다음 순서로 확인한다. 막히면 설계 판단을 기록하고 이 문서를 고친다.

1. FastAPI `openapi.json`에서 만든 web 타입으로 web `check`가 통과한다(§5.5).
2. 루트 잠금 파일: web 잠금 파일의 경로를 바꾸고 lockfile-only로 풀어도 web 패키지 해석이 그대로다(§5.3).
3. 조합 안에서 web `check`와 `build`가 통과한다. workspace를 옮긴 뒤의 경로, tsconfig, Turbopack 루트, 목 통합 테스트를 본다.
4. 조합 안에서 api `check`가 package.json 래퍼와 `node_modules`가 있어도 통과한다(FastAPI 하네스 검사).
5. Turborepo가 Windows와 Linux에서 uv 명령을 실행하고 캐시한다.
6. 조합용 web 이미지가 루트 문맥에서 빌드되고, standalone 출력이 workspace 구조에서 서버를 띄운다(CI).

## 9. 미룬 결정

```

바꿀 내용:

```markdown
- 로컬에서는 개발 compose 프로젝트(`fastapi`, `joon`)와 그 볼륨을 쓰거나 내리는 명령을 실행하지 않는다. 생성한 프로젝트는 자기 이름의 compose 프로젝트를 쓰지만, 포트가 개발 스택과 겹치므로 로컬에서 띄우지 않는다.
- 로컬 확인: CLI 테스트, 생성한 web의 `check`(목 프로세스만 쓴다), FastAPI의 인프라 없는 검사.

### 8.3 검증 항목

다음 항목을 확인한다. 로컬 결과와 CI가 맡는 범위는 §8.4에 구분한다.

1. FastAPI `openapi.json`에서 만든 web 타입으로 web `check`가 통과한다(§5.5).
2. 루트 잠금 파일: web 잠금 파일의 경로를 바꾸고 lockfile-only로 풀어도 web 패키지 해석이 그대로다(§5.3).
3. 조합 안에서 web `check`와 `build`가 통과한다. workspace를 옮긴 뒤의 경로, tsconfig, Turbopack 루트, 목 통합 테스트를 본다.
4. 조합 안에서 api `check`가 package.json 래퍼와 `node_modules`가 있어도 통과한다(FastAPI 하네스 검사).
5. Turborepo가 Windows와 Linux에서 uv 명령을 실행하고 `check`·`test` 캐시를 쓴다. `gen`은 캐시하지 않는다.
6. 조합용 web 이미지가 루트 문맥에서 빌드된다(CI). `create-combo`가 컨테이너를 띄워 workspace 배치의 standalone 서버를 실행하고, 60초 안에 `GET /`의 200을 확인한 뒤 정리한다. standalone 서버·정적 자산의 workspace 배치는 로컬 빌드로도 확인한다.

### 8.4 구현 기록 (2026-10-03)

단독·조합 생성, 루트 실행기와 하네스, 생성용 CI를 구현했다. 로컬 확인은 Docker 없이 진행했다.

| 범위 | 확인 결과 |
| --- | --- |
| CLI·실행기·디스패처 | create 타입 검사, Vitest 52개와 Node 테스트 23개 통과. 실제 생성 트리·첫 커밋·깨끗한 git 상태, 네 hook과 루트 pre-commit smoke 확인 |
| 저장소 | 루트 `pnpm check` 11단계, actionlint 워크플로 4개 통과 |
| web | FastAPI OpenAPI 입력의 `check`, 템플릿 `check` 9단계·build·mock E2E 20개, 생성 단독·조합의 web `check` 통과. 조합의 gen 재실행은 diff 없음 |
| 잠금 파일·이미지 입력 | web 버전·peer 해석 보존, turbo gen 순서와 캐시 설정 확인. Docker 없는 filtered 설치와 직접 Next 빌드로 standalone의 workspace 서버·정적 자산, root 도구·mock 미설치 확인 |
| FastAPI | 템플릿과 생성 앱의 Ruff·basedpyright·architecture·harness, 인프라 없는 테스트 55개 통과 |
| PR CI | 실행 37106952072에서 `create-combo`의 setup·전체 check·실제 api E2E(api 12개·web 20개)·두 이미지 빌드와 `create-standalone`의 setup·check 통과. 루트 check의 Linux fixture 실행 권한을 고쳤으며 재실행과 추가한 조합 web 컨테이너의 `GET /` 200 확인은 대기 |

DB·Valkey·스토리지 기반 테스트와 실제 `e2e:serve`, Docker 이미지 빌드·컨테이너 시작은 로컬에서 실행하지 않았다. 루트 CI의 `create-combo`는 조합 web 이미지에 loopback URL·시간대·매번 만든 32바이트 난수 세션 비밀을 전달하고, loopback 포트의 `GET /`가 200인지 확인한다. 실패하면 로그를 출력하고 성공·실패 모두 같은 단계의 trap으로 컨테이너를 지운다. 생성 프로젝트의 CI는 빌드까지만 한다. Windows·Linux의 Turborepo uv 실행과 캐시 hit도 로컬 dry graph만으로 완료했다고 보지 않는다.

## 9. 미룬 결정

```

- [ ] **Step 4: 검사를 돌린다**

Run(`templates/nextjs`에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 모든 단계를 다시 돌리려면 `templates/nextjs/.cache/check.json`을 지운다.

Run(`templates/nextjs`에서): `pnpm build`

Expected: `Compiled successfully`.

Run(`templates/nextjs`에서): `pnpm test:e2e`

Expected: `20 passed`(목 대상, 걸린 시간은 다르다).

Run(`templates/fastapi`에서): `uv sync --frozen && uv run ruff check . && uv run ruff format --check . && uv run basedpyright && uv run python -m tools.checks architecture && uv run python -m tools.checks harness`

Expected: 오류 없이 끝난다. 개발 인프라(DB·Valkey)가 필요한 FastAPI 테스트와 `poe check`는 CI가 돌린다. 로컬에서 `uv run poe setup|check|test|test:e2e|e2e:serve`나 `templates/fastapi`의 compose를 쓰지 않는다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 11단계`로 시작하는 한 줄

- [ ] **Step 5: 커밋한다**

```bash
git add \
  AGENTS.md \
  docs/superpowers/specs/2026-09-26-ai-template-foundation-design.md \
  docs/superpowers/specs/2026-10-03-create-cli-design.md \
  templates/fastapi/AGENTS.md \
  templates/fastapi/README.md \
  templates/nextjs/AGENTS.md \
  templates/nextjs/README.md \
  templates/nextjs/docs/architecture.md
git commit -m "docs(create): document generated project workflows"
```
