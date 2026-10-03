# create CLI 설계 (하위 프로젝트 3)

- 작성일: 2026-10-03
- 상태: 승인됨(2026-10-03). 로컬 검증 완료, Docker 기반 완료 조건은 PR CI 확인 대기(§8.4)
- 상위 문서: [기반 설계](2026-09-26-ai-template-foundation-design.md)
  - 이 문서는 기반 설계 §10에서 사이클 3으로 미룬 결정(배포 방식, 조합 루트의 세부 구성, 포트 배정)을 내리고, `create/` CLI와 이번 사이클의 템플릿·저장소 변경을 설계한다.
  - 템플릿의 동작 기준은 [FastAPI 설계](2026-09-26-fastapi-template-design.md), [보강 설계](2026-09-29-fastapi-hardening-design.md), [Next.js web 설계](2026-09-30-nextjs-web-design.md)다.
- 구현 계획: [create CLI 계획](../plans/2026-10-03-create-cli.md)
- 다음 단계: 브랜치 PR CI의 Docker 확인(§8.4) → 병합

## 1. 목표와 범위

### 1.1 산출물

1. `create/`: 단독 프로젝트와 조합 모노레포를 만드는 Node CLI. 저장소 루트에서 `pnpm new`로 실행한다.
2. 조합 루트 자산: 루트 명령 실행기, Claude Code hook 디스패처, 지침 파일, CI 워크플로의 원본(`create/assets/combo/`).
3. 템플릿 변경: FastAPI의 `e2e:serve` 명령, web `gen`의 백엔드 스펙 입력과 글·커버 저장 E2E의 Server Action POST 응답 대기, 두 템플릿의 CI 워크플로와 줄바꿈 설정.
4. 저장소 변경: `pnpm new`, actionlint 도구, `verify-templates` 규칙, 하네스 표준, CI 작업.

### 1.2 완료 조건

기반 설계 §3.4의 완료 조건(생성한 FastAPI+web 프로젝트가 `setup` → `check` → `test:e2e` 통과)을 다음으로 확인한다.

- CI 작업 `create-combo`: 저장소 밖 임시 폴더에 FastAPI+web 조합 프로젝트를 만들고 `pnpm setup` → `pnpm check` → `pnpm test:e2e`를 통과한다.
- CI 작업 `create-standalone`: fastapi와 nextjs 단독 프로젝트를 만들어 각각 `setup` → `check`를 통과한다.
- 저장소 루트의 `pnpm check`(CLI 테스트와 actionlint 포함)와 기존 CI 작업이 모두 통과한다.

### 1.3 범위 밖

- npm 배포, GitHub에서 npx로 실행
- 대화형 질문
- 포트 오프셋과 생성 프로젝트 여러 개의 동시 실행
- admin·NestJS 조합. 두 프론트가 계약·목 패키지를 함께 쓰는 방식도 포함한다(하위 프로젝트 4·5)
- 이미 만든 프로젝트를 새 템플릿으로 갱신하기
- API 제목, 메일 발신자 이름, 계약 사본 패키지 이름(`@ai-template/*`)까지 프로젝트 이름으로 바꾸기

## 2. 결정 기록

| #   | 주제        | 결정                                                                                                                                   | 이유                                                                                                     |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| C1  | 진행 방식   | 스펙 하나, 마일스톤 하나. 프로토타입 → 계획 → SDD. 계획과 리뷰는 Opus 5.5 작업자, 구현은 codex 작업자가 맡는다                         | 사용자 지시(2026-10-03). 프로토타입으로 검증한 코드에서 계획을 조립하는 방식은 W1~W4와 같다             |
| C2  | 배포        | 템플릿 저장소를 clone한 뒤 `pnpm new`로 실행한다                                                                                      | 저장소가 비공개다. npx는 인증과 저장소 전체 설치가 필요하고, npm 배포는 템플릿을 공개한다                |
| C3  | 입력        | 플래그만 받는다. 빠졌거나 틀리면 고치는 방법을 알리고 끝난다                                                                           | AI 에이전트가 그대로 실행할 수 있다                                                                      |
| C4  | 복사 대상   | 템플릿 폴더의 git 추적 파일만 복사하고 `template.json`은 뺀다. 템플릿 폴더에 커밋하지 않은 변경이 있으면 거부한다                     | `.env`, 설치물, 캐시가 따라가지 않는다. 첫 커밋에 적는 템플릿 커밋과 내용이 같다                         |
| C5  | 이름        | 프로젝트 이름(kebab-case)은 package 이름, compose 프로젝트 이름, 이미지 이름, README 제목에만 쓴다                                     | 잠금 파일과 생성물을 바꾸지 않는다                                                                       |
| C6  | git         | `git init -b main`과 첫 커밋. 메시지에 템플릿 저장소의 커밋을 적는다                                                                  | hook 설치와 Stop hook의 변경 감지가 git 저장소를 전제한다. 출처가 남는다                                 |
| C7  | 조합 구조   | `apps/api`(FastAPI와 package.json 래퍼), `apps/web`. 로컬 인프라는 `apps/api/compose.yaml`이고 루트 compose는 두지 않는다             | 프론트는 인프라가 필요 없다. 앱 폴더가 단독 템플릿과 같은 구조로 남아 앱 문서와 명령이 그대로 맞는다    |
| C8  | workspace   | 루트 pnpm workspace 하나. 루트 잠금 파일은 web 잠금 파일에서 만든다                                                                   | 템플릿에서 검증한 의존성 버전을 그대로 쓴다                                                              |
| C9  | Turborepo   | `dev`만 앱을 함께 띄우고 나머지는 앱을 차례로 돈다. `check`·`test`를 캐시하고 `gen`은 캐시하지 않는다                                  | 동시 실행 부하를 줄이고, 아직 복원 범위를 검증하지 않은 생성물을 캐시 hit로 누락하지 않는다(§5.4)       |
| C10 | 계약        | code-first. web `gen`이 api의 `openapi.json`으로 web 타입을 만든다. 목과 TypeSpec 사본은 대역으로 남는다                               | 기반 설계 §3.3, web 설계 §5.4·§8.8                                                                       |
| C11 | 조합 E2E    | 백엔드 명령 `e2e:serve`가 E2E 설정의 api를 띄우고, 루트 실행기가 그 위에서 web E2E(fastapi 대상)를 돈다                                | web과 api의 실제 연결을 자동으로 확인한다. web E2E 실행기와 fastapi 대상은 바꾸지 않는다. 실제 api에서 드러난 저장 직후 경쟁 때문에 글·커버 저장 시나리오만 Server Action POST 응답을 기다린다 |
| C12 | Claude 설정 | 루트 설정은 두 앱 설정의 합집합과 hook 디스패처다. skill은 앱에 둔다                                                                   | Claude Code는 시작 폴더의 설정만 읽고, 하위 폴더의 skill은 그 폴더의 파일을 읽을 때 불러온다(§10)       |
| C13 | git hook    | 루트 lefthook 하나. 앱 작업은 lefthook `root`로 그 앱 폴더에서 돌고, 비밀 스캔은 합친 설정으로 한 번 한다                              | 앱의 hook 설치기는 git 최상위가 아니면 hook을 걸지 않는다                                                |
| C14 | 생성 CI     | 단독은 템플릿 폴더에 워크플로를 두고, 조합은 CLI가 루트에 만든다. Action은 SHA로 고정하고 actionlint로 검사한다                         | 기반 설계 §7.5·§6.8의 최종 안전망                                                                        |
| C15 | 포트        | 템플릿의 고정 포트를 그대로 쓴다                                                                                                       | 포트를 바꾸는 설정은 템플릿 여러 곳을 고쳐야 한다. 동시 실행은 범위 밖이다                               |
| C16 | 줄바꿈      | 저장소 루트의 `.gitattributes`와 `.editorconfig`를 공유 자산으로 두 템플릿에 넣는다                                                   | 템플릿을 폴더째 가져간 프로젝트를 Windows에서 clone하면 CRLF가 되어 포맷 검사가 실패한다                 |
| C17 | Docker 검증 | Docker가 필요한 확인은 CI에서만 한다                                                                                                   | 이 PC의 개발 compose 프로젝트(`fastapi`, `joon`)와 그 데이터를 지킨다(W4와 같은 규칙)                    |

## 3. CLI

### 3.1 명령

```
pnpm new <대상 폴더> --template <fastapi|nextjs> [--name <이름>] [--no-git]
pnpm new <대상 폴더> --api fastapi --web [--name <이름>] [--no-git]
pnpm new --help
```

- `--template`은 단독, `--api`와 `--web`은 조합이다. 둘을 함께 쓸 수 없고, 이번 사이클의 조합은 `--api fastapi`와 `--web`이 모두 있어야 한다.
- 대상 폴더가 상대 경로면 명령을 실행한 폴더 기준이다. pnpm이 스크립트에 넘기는 `INIT_CWD`를 쓴다(스크립트의 작업 폴더는 저장소 루트다).
- 이름은 `--name`이 없으면 대상 폴더 이름이다. 규칙은 `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, 50자 이하다. compose 프로젝트, npm 패키지, Docker 이미지 이름에 모두 쓸 수 있는 모양이다.
- `pnpm create`는 pnpm의 내장 명령이라 쓰지 않는다. pnpm 12.6.0은 `pnpm new`와 `pnpm setup`을 package.json 스크립트로 실행한다(§10).

### 3.2 거부

다음이면 아무것도 만들지 않고 `pnpm new: <문제> — <고치는 방법>`을 출력한다. 사용법 오류는 종료 코드 2, 그 밖은 1이다.

- 대상 폴더가 있고 비어 있지 않다.
- 대상 폴더가 템플릿 저장소의 어느 worktree 안에 있다. 심볼릭 링크를 따라간 실제 경로도 검사한다.
- 이름이 규칙에 맞지 않는다.
- FastAPI가 있는 프로젝트(단독 fastapi·조합)의 이름이 `fastapi`다. 템플릿의 개발 compose 프로젝트 이름이라 예약한다. `--name`과 대상 폴더에서 고른 이름 모두 사용법 오류 2로 거절하고 다른 `--name`을 안내한다. 단독 nextjs는 허용한다.
- 템플릿 폴더 또는 조합 자산·루트 `.gitattributes`·`.editorconfig`에 커밋하지 않은 추적 변경이 있다. 조합 입력은 HEAD의 추적 내용만 복사한다.
- 필요한 도구가 없다: 모두 `git`, 조합은 `pnpm`도.

비어 있는 일반 폴더는 허용한다. 템플릿의 변경 검사는 git 추적 파일만 보며, 무추적 파일은 복사하지 않는다.

주의: `fastapi` 외에 이 PC의 다른 compose 프로젝트(다른 로컬 스택 등)와 이름이 겹치지 않도록 사용자가 고른다. 같은 compose 이름은 볼륨을 공유한다.

### 3.3 생성 순서

1. 입력과 도구를 검사한다(§3.2). CLI 위치가 git 루트와 맞는지 확인하며 Windows 경로의 대소문자·8.3 짧은 이름 차이는 실제 경로로 확인한다. 대상 드라이브나 공유가 없으면 폴더를 만들기 전에 거절한다.
2. 대상 폴더와 같은 부모 아래 임시 폴더를 만든다.
3. 파일을 복사하고 이름을 바꾼다(단독 §4, 조합 §5).
4. 조합이면 루트 잠금 파일을 만들고(§5.3), `pnpm install --frozen-lockfile`을 실행한다. 합치거나 복사한 `.claude/settings.json`, `lefthook.yml`, `.mcp.json`을 고정 Prettier로 포맷한 뒤 web `gen`을 실행해 web 생성물을 api의 `openapi.json` 기준으로 맞춘다(§5.5). 이 단계만 npm 레지스트리에 접속한다.
5. 새 대상에는 기본 폴더 권한으로 임시 폴더를 옮긴다. 기존 빈 대상은 폴더 자체를 유지하고 임시 폴더의 항목만 넣는다. 어느 단계든 실패하면 생성한 항목과 새 부모 폴더를 재시도하며 정리한다. 정리도 실패하면 원래 원인과 남은 경로를 함께 알린다. Windows에서 폴더가 사용 중이면 해당 프로그램을 닫도록 안내한다.
6. `git init -b main`과 첫 커밋을 한다(`--no-git`이면 건너뛴다). 복사한 파일은 이름 목록으로 `git add -f`하여 전역 excludes에 빠지지 않게 하고 원본 인덱스의 실행 권한을 보존한다. 조합이 만든 파일은 프로젝트의 ignore 규칙을 적용하며 설치물·캐시는 제외한다. 메시지는 `chore: create <이름> from ai-template <템플릿 저장소 short SHA>`다. 설정된 `user.name` 또는 `user.email`이 없으면 init과 스테이징을 하고 신원 설정·첫 커밋 명령을 안내한다. git이 환경에서 추측한 신원은 쓰지 않으며, 사용자의 서명 설정은 그대로 따른다. git 단계가 실패하면 생성한 항목도 정리한다.
7. 다음 명령을 안내한다: 단독 fastapi는 `uv run poe setup`, 단독 nextjs와 조합은 `pnpm setup`.

- CLI와 그 테스트의 git 호출은 상속된 저장소 지정 변수(`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` 등)를 지운 환경에서 한다. W4에서 pre-push hook 안의 테스트가 상속된 `GIT_DIR`로 실제 저장소를 다시 초기화한 일이 있었다.
- 성공 출력은 만든 폴더와 다음 명령 몇 줄이다.
- 실패 메시지에는 시스템 오류 코드·경로, 일반 오류의 이름·원인, git stderr의 첫 줄 또는 잘못된 옵션의 원인을 남긴다.

### 3.4 패키지

```
create/
├── package.json      # @ai-template/create. check, test 스크립트
├── src/              # cli, 입력 검사, 템플릿 파일 목록, 단독, 조합(workspace·잠금 파일·하네스 합치기), git
├── assets/combo/     # 조합 루트 파일 원본(§5)
└── test/
```

- TypeScript이고 tsx로 실행한다. 의존성은 저장소에 이미 있는 `yaml`, `smol-toml`과 Node 내장 모듈만 쓴다.
- 저장소 workspace에 `create`를 더하고 루트 package.json에 `"new"` 스크립트를 둔다. 루트 `pnpm check`는 workspace 패키지의 `check`를 자동으로 포함한다.

## 4. 단독 생성

### 4.1 파일과 이름

템플릿 폴더의 git 추적 파일을 대상 폴더 루트에 그대로 복사한다(`template.json` 제외). 바꾸는 곳은 다음뿐이다.

| 템플릿  | 파일           | 바꾸는 것                                                                    |
| ------- | -------------- | ---------------------------------------------------------------------------- |
| 공통    | `README.md`    | 첫 줄 제목을 `# <이름>`으로                                                  |
| nextjs  | `package.json` | `name`을 `<이름>`으로                                                        |
| fastapi | `compose.yaml` | 맨 앞에 설명 주석과 최상위 `name: <이름>`을 삽입하고, `image: fastapi-template-app`을 `<이름>-app`으로 |

FastAPI 패키지 이름 `app`, 계약 사본의 `@ai-template/*`, API 제목은 그대로 둔다. 바꾸면 `uv.lock`, 잠금 파일, `openapi.json`과 테스트가 함께 바뀐다.

### 4.2 템플릿 변경

- FastAPI 템플릿 `compose.yaml`은 최상위 `name`을 두지 않고 폴더 이름을 기본 compose 이름으로 쓴다. 템플릿 폴더는 `fastapi`라 개발 데이터(`fastapi_*` 볼륨)와 `pnpm conformance fastapi`의 동작은 그대로다. CLI는 생성할 때 맨 앞에 폴더와 관계없이 프로젝트·볼륨 이름을 고정한다는 주석과 `name: <이름>`을 넣는다. 이름은 YAML 문자열로 직렬화해 `null`·`true`·`false`도 문자열로 보존하고, 일반 이름에는 따옴표를 붙이지 않는다. 템플릿에 이미 최상위 `name`이 있으면 손으로 복사한 프로젝트끼리 볼륨을 공유하므로 지우도록 안내하고 실패한다. 앱 이미지는 YAML 값의 바이트 범위만 바꿔 주석·앵커를 보존한다.
- 두 템플릿에 `.github/workflows/ci.yml`을 둔다(§5.9). 템플릿 저장소에서는 실행되지 않는 파일이고, 폴더째 복사한 프로젝트에서 동작한다.
- 저장소 루트의 `.gitattributes`와 `.editorconfig`를 `scripts/shared-assets.json`에 더해 두 템플릿에 동기화한다(C16).

## 5. 조합 생성

### 5.1 구조

```
<이름>/
├── AGENTS.md, CLAUDE.md, README.md
├── package.json, pnpm-workspace.yaml, pnpm-lock.yaml, turbo.json
├── lefthook.yml, .betterleaks.toml, .mcp.json
├── .gitignore, .gitattributes, .editorconfig, .prettierrc.json
├── .claude/settings.json, .claude/hooks/   # 앱 hook으로 나눠 보내는 디스패처
├── .github/workflows/ci.yml
├── scripts/                                # 루트 명령 실행기와 그 테스트
└── apps/
    ├── api/   # FastAPI 템플릿과 package.json 래퍼
    └── web/   # Next.js web 템플릿
```

- 앱 폴더는 단독 생성(§4)과 같은 파일에서 시작한다. 앱의 `.claude/`, `.mcp.json`, `lefthook.yml`, AGENTS.md는 남긴다. 앱 폴더에서 Claude Code를 열거나 명령을 실행해도 단독 프로젝트처럼 동작한다.
- 앱의 `.github/`는 지운다. 루트 워크플로가 대신한다.
- `apps/api`
  - compose 맨 앞에 설명 주석과 `name: <이름>`을 넣고, 이미지는 `<이름>-api`, README 제목은 `# <이름> api`로 바꾼다. 이름 `fastapi`는 예약하며 템플릿에 이미 최상위 `name`이 있으면 거절한다(§3.2·§4.2).
  - `package.json` 래퍼: `name`은 `api`이고, 명령 어휘와 `e2e:serve`를 `uv run poe <명령>`으로 넘기는 스크립트만 둔다.
- `apps/web`
  - package.json `name`은 `web`, README 제목은 `# <이름> web`이다.
  - 앱의 `pnpm-workspace.yaml`과 `pnpm-lock.yaml`은 루트로 합친다(§5.3).
  - `gen.config.json`(§5.5)을 더하고 `.env.example`을 백엔드 모드 값으로 바꾼다(§5.6).
  - `Dockerfile`은 조합 루트를 빌드 문맥으로 쓰는 조합용으로 바꾸고 그 옆에 `Dockerfile.dockerignore`를 둔다. 템플릿의 Dockerfile은 web 폴더 안의 잠금 파일과 workspace 파일을 쓰는데, 조합에서는 둘이 루트에 있기 때문이다(§5.9).
- web 템플릿의 `next.config.ts`는 Turbopack 루트와 standalone 추적 루트를 가장 가까운 pnpm workspace 루트(`pnpm-workspace.yaml`이 있는 폴더)로 정한다. 단독이면 web 폴더이고 조합이면 조합 루트다. 조합의 의존성은 루트 `node_modules`에 있어서 web 폴더를 루트로 두면 찾지 못한다.

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

루트의 명령 어휘는 템플릿과 같다(기반 설계 §6.2).

| 명령                     | 동작                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `setup`                  | 도구 확인(Node 24, pnpm, uv, Docker) → `pnpm install --frozen-lockfile` → 루트가 git 최상위일 때만 `lefthook install`(그 밖은 안내 후 생략) → api `setup` → web `setup` |
| `dev`                    | `turbo run dev`: api(8000, worker·scheduler 포함)와 web(3000, 백엔드 모드)을 함께 띄운다                             |
| `check`                  | 루트 검사(루트 파일 포맷, 루트 스크립트 테스트, 지침 파일) → 두 앱의 `check`를 한 번에 하나씩 실행한다. 앱 순서는 고정하지 않는다 |
| `fix`                    | 앱별 `fix`와 루트 파일 포맷                                                                                           |
| `test`                   | 앱별 `test`                                                                                                           |
| `test:e2e`               | api `test:e2e` → web E2E를 실제 api에(§5.7). 첫 실패에서 멈춘다                                                       |
| `gen`                    | api `gen` → web `gen`                                                                                                 |
| `db:migrate`, `db:reset` | api에 넘긴다                                                                                                          |

- `check`의 출력 원칙은 템플릿과 같다. 성공하면 한 줄, 실패하면 실패한 단계의 출력만 보여 준다.
- Turborepo 설정
  - `dev`는 `persistent`이고 캐시하지 않는다.
  - `check`·`test`는 캐시한다. `gen`과 `web#gen`은 `cache: false`다. api 내보내기와 web의 TypeSpec·목 생성까지 산출물 전체의 복원 범위를 검증하지 않았으므로 캐시 hit로 생성을 건너뛰지 않는다. 정확한 outputs와 복원 검증을 갖춘 뒤 캐시를 켤 수 있다.
  - web의 `check`·`gen` 입력에는 `$TURBO_ROOT$/apps/api/openapi.json`을 더한다.
  - `web#gen`은 `api#gen`에 의존한다.
  - 앱 작업은 `--filter=api --filter=web`으로 두 앱만 고른다. web 내부 계약 작업을 중복 실행하지 않는다. 앱을 차례로 돌도록 동시 실행 수를 1로 둔다(`dev` 제외).
- `setup`, `test:e2e`는 루트 실행기(`scripts/`)가 차례로 부르고 캐시하지 않는다. `db:migrate`, `db:reset`은 루트 package.json 스크립트가 `pnpm --filter api run <명령>`으로 직접 넘기며 캐시하지 않는다.

### 5.5 계약 연결 (code-first)

- web 템플릿의 `gen`이 web 루트의 `gen.config.json`을 읽는다. 단독 템플릿에는 이 파일이 없다.

  ```json
  { "openapi": "../api/openapi.json" }
  ```

- 파일이 없으면 지금처럼 TypeSpec → `contract/openapi.yaml` → 목과 web 타입을 만든다.
- 파일이 있으면 다음처럼 만든다.
  - web 타입(`src/lib/api/schema.d.ts`, 실시간 이벤트, 에러 코드)은 그 OpenAPI 파일에서 만든다.
  - `contract/openapi.yaml`과 목 타입은 TypeSpec에서 그대로 만든다.
  - `gen --check`(생성물 최신 여부)도 같은 입력으로 본다.
  - 파일이 없으면 "api에서 `gen`을 먼저 실행하라"며 실패한다.
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

### 5.7 E2E

백엔드 템플릿에 명령 `e2e:serve`를 더한다. FastAPI는 `uv run poe e2e:serve [--web-url <주소>] -- <명령> [인자...]`이다.

1. 인프라가 떠 있는지 확인한다. 꺼져 있으면 `setup`을 안내하고 실패한다.
2. E2E DB(`app_e2e`)를 마이그레이션하고 E2E용 Valkey DB(14)를 비운다. `test:e2e`와 같은 격리다.
3. api(127.0.0.1:18000), worker, scheduler를 E2E 설정으로 띄운다.
   - 레이트 리밋을 크게 두고 `RECENT_LOGIN_SECONDS=10`으로 한다.
   - `FRONTEND_URL`, `REALTIME_ALLOWED_ORIGINS`, `STORAGE_ALLOWED_ORIGINS`, `OAUTH_REDIRECT_URIS`는 web 주소 기준으로 둔다. 기본 web 주소는 `http://localhost:3100`이다.
   - `API_URL`은 E2E api 주소다.
4. 스토리지 버킷의 CORS에 web Origin을 더한다.
5. `/health/ready`가 200이면 받은 명령을 실행한다. 명령의 환경에는 백엔드가 아는 값만 넣는다.
   - `E2E_API_URL`, `E2E_WEB_URL`
   - `E2E_MAILPIT_URL`(Mailpit API), `E2E_OAUTH_URL`(모의 OAuth)
   - `E2E_RECENT_LOGIN_SECONDS`
6. 명령이 끝나면 세 프로세스를 내리고 명령의 종료 코드로 끝난다. Ctrl+C와 신호도 세 프로세스를 정리한다.

- `--web-url`은 경로·쿼리·조각·계정 없는 http(s) Origin만 받는다. 명령은 poe의 `POE_PWD`(호출한 폴더)에서 실행한다.
- 서버 준비, 설정 덮어쓰기, 프로세스 그룹, readiness와 로그는 기존 `test:e2e`와 공유한다. readiness가 60초 안에 성공하지 못하면 로그 끝부분을 출력하고 종료 코드 1로 끝난다.

- 루트 `test:e2e`는 두 단계다.
  1. api `test:e2e`(pytest E2E)를 돈다.
  2. api `e2e:serve`로 루트의 `scripts/web-e2e.mjs`를 실행한다.
- `scripts/web-e2e.mjs`는 위 값을 web의 fastapi 대상 변수로 바꿔 web `test:e2e`를 실행한다.
  - 바꾸는 변수: `E2E_TARGET=fastapi`, `APP_URL`, `API_BASE_URL`, `NEXT_PUBLIC_REALTIME_URL`, `E2E_MAILPIT_URL`, `E2E_OAUTH_URL`, `E2E_RECENT_LOGIN_SECONDS`
  - web E2E 실행기와 fastapi 대상은 바꾸지 않는다. fastapi 대상은 이미 외부 주소를 받고, API readiness를 기다린 뒤 web만 빌드해 3100에 띄운다.
  - 실제 api에서 드러난 저장 직후 경쟁 때문에 글·커버 저장 시나리오만 Server Action POST 응답을 기다린다. 저장 직후의 reload·다음 동작이 응답보다 앞서지 않게 한다.
- 개발 DB와 Valkey DB 0은 건드리지 않는다.
- Mailpit은 개발 인프라의 것을 함께 쓰고 비우지 않는다. web의 FastAPI 어댑터가 수신자와 새 메일로 고른다.
- 스토리지는 개발 버킷을 쓰고 E2E Origin의 CORS만 더한다.
- `e2e:serve`는 하네스 표준의 백엔드 명령이 된다. NestJS 템플릿(하위 프로젝트 5)도 같은 계약으로 구현한다.

### 5.8 하네스

- 루트 `.claude/settings.json`
  - 허용: 루트 명령 어휘(Bash와 PowerShell), 읽기 전용 git, 두 앱의 허용 규칙.
  - 차단: 두 앱의 차단 규칙.
  - 앱 규칙 가운데 경로 규칙은 `./`를 `./apps/<앱>/`로 바꿔 옮긴다(예: `Read(./apps/api/.env)`). 명령 규칙은 그대로 옮기고 중복을 뺀다.
  - hook 4종은 exec form으로 `node ${CLAUDE_PROJECT_DIR}/.claude/hooks/<이름>.mjs`를 부르는 디스패처다. 디스패처는 각 앱의 `.claude/settings.json`에서 앱 hook 명령을 읽는다. 그 앱 폴더를 작업 폴더와 `CLAUDE_PROJECT_DIR`로 두고 같은 입력 JSON으로 실행한다. 앱 설정이 hook의 단일 원본으로 남는다.

    | 이벤트                              | 디스패처                                                                                                       |
    | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
    | `PostToolUse` (`Edit`, `Write`, `MultiEdit`) | 고친 파일이 속한 앱의 hook. 루트 파일이면 루트 포맷만                                                         |
    | `Stop`                              | `stop_hook_active`면 통과. 루트가 자기 git 저장소의 최상위가 아니면 안내 후 검사를 생략한다. 바뀐 앱의 hook만 돌리고, 루트 변경에는 포맷·Node 테스트·지침 3단계만 돈다. 하나라도 막으면 이유를 모아 막는다 |
    | `PreToolUse` (`Bash`, `PowerShell`, `Edit`, `Write`, `MultiEdit`) | 두 앱의 matcher에 맞는 hook을 돌리고 하나라도 거부하면 거부한다. API의 커밋된 마이그레이션 편집 보호도 유지한다 |
    | `SessionStart`                      | 두 앱의 요약을 앱 이름과 함께 이어 붙인다                                                                     |

  - exit 2 또는 JSON deny는 허용보다 우선한다. PreToolUse의 JSON 결정은 deny → defer → ask → allow 순서로 합친다. Stop·PostToolUse는 block과 이유를 모으며, SessionStart는 한 앱의 진단이 실패해도 다른 앱의 요약을 보존한다.
  - 앱 hook을 시작하지 못하거나 시간이 초과하면 설치·시간 설정 안내와 함께 비차단 오류로 알린다. 다른 앱의 차단 이유와 요약도 보존한다.
  - 직접 node로 시작한 hook에도 PATH에서 찾은 pnpm 진입점을 넘긴다. shell 없이 Windows의 pnpm 실행과 web 생성물 검사를 지원한다.

- skill은 앱에 둔다. Claude Code는 시작 폴더 아래의 `.claude/skills/`를 그 폴더의 파일을 처음 읽거나 고칠 때 불러온다(§10).
- 루트 `.mcp.json`에는 web의 MCP 서버(next-devtools-mcp)를 그대로 올린다.
- 지침 파일
  - 루트 AGENTS.md는 200줄 이하다. 담는 것: 구조, 앱 사이 흐름(`gen` 순서와 code-first, 목의 역할, 포트, E2E), 명령, 완료 기준(`pnpm check`).
  - 앱 안의 규칙은 각 앱의 AGENTS.md를 가리킨다.
  - 루트 CLAUDE.md는 `@AGENTS.md` 한 줄이다.
- git hook(루트 `lefthook.yml`)
  - pre-commit
    - 두 앱 `lefthook.yml`의 pre-commit 작업 가운데 비밀 스캔을 뺀 것을 옮긴다. `root: apps/<앱>/`과 앱 이름 접두사를 붙인다.
    - 루트 파일 포맷과 비밀 스캔 한 번을 더한다.
  - 비밀 스캔
    - 루트 `.betterleaks.toml`을 쓴다. 두 앱 설정의 허용 경로에 `apps/<앱>/`을 붙여 합친 파일이며 원래의 `(^|/)` 경계를 유지해 파일 이름 중간에는 예외가 적용되지 않게 한다.
    - 실행 파일은 web의 고정 Betterleaks를 쓴다. web 작업 폴더에서 루트 저장소와 설정을 모두 지정한다: `pnpm --filter web run -s tool betterleaks git ../.. --pre-commit --staged --no-banner --redact --config ../../.betterleaks.toml`. 루트 파일도 스캔하며 앱의 생성물 예외는 해당 앱 경로 안으로 제한한다.
  - pre-push: 루트 `pnpm check`.
  - 루트와 앱의 hook 설치기는 자기 폴더가 git 최상위일 때만 hook을 건다. 상위 저장소 안이나 git 밖에서는 설치만 건너뛰며, 루트와 FastAPI 설치기는 안내도 출력한다.
- 루트 `scripts/`의 실행기와 `.claude/hooks/`의 디스패처는 Node 내장 모듈만 쓰는 ESM이다. `node --test` 테스트를 함께 두고 루트 `check`가 돈다.

### 5.9 CI 워크플로

Action은 템플릿 저장소 CI와 같은 SHA로 고정한다. Node 24, pnpm 12.6.0, uv를 쓰며 registry push는 없다.

| 대상    | 단계                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| fastapi | `uv sync --locked` → `uv run poe setup` → `check` → `test:e2e` → `docker build`                                                                   |
| nextjs  | `pnpm install --frozen-lockfile` → Chromium과 Linux 의존성 설치 → `pnpm check` → `pnpm test:e2e` → `docker build`                                 |
| 조합    | `pnpm setup` → Chromium Linux 의존성 설치 → `pnpm check` → `pnpm test:e2e` → `docker build apps/api`와 루트에서 `docker build -f apps/web/Dockerfile .`. 인프라를 함께 쓰므로 작업 하나다 |

- 단독 워크플로는 템플릿 폴더의 `.github/workflows/ci.yml`이다. 조합 워크플로의 원본은 `create/assets/combo/`에 있다.
- 템플릿 저장소의 `pnpm check`가 셋 모두를 actionlint로 검사한다.
- actionlint는 `1.7.12`와 릴리스의 sha256 체크섬으로 고정한다. 외부 shellcheck·pyflakes는 끄고 같은 actionlint 검사로 루트와 생성용 워크플로 4개를 확인한다.
- 조합 web 이미지의 원본은 `create/assets/combo/apps/web/`에 있다. 루트 lockfile·workspace와 앱 manifest로 `pnpm --filter web... install --frozen-lockfile`을 실행한다. root manifest는 복사하지 않아 turbo·lefthook·prettier 설치를 피한다. workspace의 TypeScript override와 release-age 설정은 유지한다.
- 빌드는 web 작업 폴더에서 `NEXT_OUTPUT=standalone node node_modules/next/dist/bin/next build`로 실행한다. pnpm run이 나머지 workspace를 자동 설치하는 것을 피한다. runtime은 standalone의 workspace 배치와 정적 자산을 보존하고 `node apps/web/server.js`로 시작한다. UID/GID 10001, HTTP health check와 실행 시 환경 설정은 단독 이미지와 같다. 인접 `Dockerfile.dockerignore`는 환경 파일·git·설치물·캐시·빌드 결과·Python 가상환경을 문맥에서 제외한다.

## 6. 포트

템플릿의 고정 포트를 그대로 쓴다. 인프라 포트는 127.0.0.1에 열고, web dev는 Next.js의 기본 바인딩(0.0.0.0)을 쓴다.

| 용도                                                                     | 포트                                     |
| ------------------------------------------------------------------------ | ---------------------------------------- |
| web dev                                                                  | 3000                                     |
| admin dev(예약, 하위 프로젝트 4)                                         | 3001                                     |
| 목 dev(프론트만 개발할 때)                                               | 4010                                     |
| api dev                                                                  | 8000                                     |
| 인프라: PostgreSQL, Valkey, S3, SMTP, Mailpit 화면·API, 모의 OAuth       | 25432, 26379, 28333, 21025, 28025, 28080 |
| 관측(선택 프로필): Grafana, OTLP gRPC·HTTP                               | 23000, 24317, 24318                      |
| api E2E(`test:e2e`, `e2e:serve`)                                         | 18000                                    |
| web E2E                                                                  | 3100                                     |
| 목 E2E                                                                   | 4110                                     |

- 생성한 프로젝트 둘을 동시에 띄우면 포트가 겹친다. 지원하지 않는다고 루트 AGENTS.md에 적는다.
- compose 프로젝트 이름은 프로젝트마다 달라서 볼륨은 섞이지 않는다.

## 7. 템플릿 저장소 변경

### 7.1 템플릿

- FastAPI
  - `compose.yaml`은 폴더 이름을 기본 compose 이름으로 쓴다. CLI가 생성할 때 `name: <이름>`을 삽입한다(§4.2)
  - `e2e:serve`와 그 단위 테스트(인자, 자식 환경, 설정 덮어쓰기). 실제 실행은 CI `create-combo`가 확인한다
  - `.github/workflows/ci.yml`
  - AGENTS.md 명령 표와 E2E 문서
- web
  - `gen.config.json` 입력과 두 모드의 테스트(픽스처 OpenAPI)
  - 글·커버 저장 E2E는 공통 `waitForServerAction` 도우미로 Server Action POST 응답을 기다린다(§5.7)
  - `next.config.ts`의 Turbopack·standalone 추적 루트를 가장 가까운 pnpm workspace 루트로(§5.1)와 그 테스트
  - `.github/workflows/ci.yml`
  - AGENTS.md와 `docs/architecture.md`의 계약 설명(조합에서의 입력)
- 공유 자산: `.gitattributes`, `.editorconfig`(§4.2)

### 7.2 저장소

- `create/` 패키지, workspace의 `create`, 루트 `"new"` 스크립트
- `pnpm tool actionlint`: 버전과 체크섬을 고정한 바이너리. 루트 `check`가 두 템플릿과 조합의 워크플로를 검사한다
- `verify-templates`: 백엔드 템플릿의 `e2e:serve`, 모든 템플릿의 `.github/workflows/ci.yml`과 `.gitattributes`
- 하네스 표준(`docs/harness/standard.md`): 명령 어휘에 `e2e:serve`(백엔드), 최종 안전망에 생성 프로젝트 CI
- 문서
  - 루트 AGENTS.md: 구조 표에 `create/`, 명령 표에 `pnpm new`
  - 기반 설계: 상태, §3.3의 조합 구조(루트 compose 없음), §10

### 7.3 CI 작업

- `create-combo`(한도 90분)
  1. 루트 설치
  2. `pnpm new "$RUNNER_TEMP/aitpl-combo" --api fastapi --web --name ci-combo`
  3. 생성 폴더에서 `pnpm setup` → Chromium Linux 의존성 → `pnpm check` → `pnpm test:e2e`
  4. 두 이미지 빌드(§5.9의 조합 단계) → 조합 web 컨테이너를 띄워 `GET /`의 200 확인(§8.3 #6). 생성 프로젝트의 워크플로는 빌드까지만 한다
  - git 사용자 정보는 작업에서 정한다.
- `create-standalone`(한도 60분): `$RUNNER_TEMP/aitpl-fastapi`를 만들어 `uv run poe setup` → `uv run poe check`, `$RUNNER_TEMP/aitpl-nextjs`를 만들어 `pnpm setup` → `pnpm exec playwright install-deps chromium` → `pnpm check`.
- 생성 프로젝트의 워크플로 파일 자체는 실행하지 않는다. actionlint로 검사하고, `create-standalone`은 단독 프로젝트의 setup·check를, `create-combo`는 조합의 setup·check·E2E·이미지 빌드와 web 컨테이너 시작을 확인한다.

## 8. 테스트와 검증

### 8.1 CLI 테스트

`create/test`는 루트 `check`에 들어간다. Docker와 네트워크를 쓰지 않는다.

- 단위
  - 인자와 이름 검사, 템플릿 파일 목록(추적 파일, `template.json` 제외, 변경 있음 거부), 이름 바꾸기
  - 루트 파일 만들기: package.json, workspace, turbo, lefthook 합치기, Betterleaks 설정 합치기, Claude 설정 합치기
  - 잠금 파일 importer 경로 바꾸기
- 디스패처와 루트 실행기
  - 입력 JSON 픽스처로 앱 hook 선택과 결과 합치기(Stop 막기, PreToolUse 거부, SessionStart 이어 붙이기)
  - 루트 `check`의 출력 원칙, `web-e2e.mjs`의 변수 바꾸기
- 통합
  - 임시 git 저장소의 픽스처 템플릿으로 단독·조합을 만든다. 결과 트리, 이름, git 상태, 실패 때 아무것도 남지 않는지를 확인한다.
  - 실제 템플릿으로 만든 결과의 파일 목록도 확인한다. 잠금 파일 단계는 네트워크가 필요해 CI 작업에서 확인한다.
- 테스트의 git 호출은 §3.3처럼 상속된 저장소 지정 변수를 지운다. 픽스처 커밋은 서명하지 않는다.

### 8.2 Docker가 필요한 검증

- 생성한 프로젝트의 FastAPI `setup`·`check`·`test:e2e`와 조합의 `test:e2e`는 CI(`create-combo`, `create-standalone`)에서만 돈다. 결과는 PR CI로 확인한다.
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

기반 설계 §10에 옮긴다.

| 사이클   | 결정할 것                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| 4. admin | 조합에서 web과 admin이 계약·목 패키지(`@ai-template/*`)를 함께 쓰는 방식(같은 이름의 패키지 충돌), admin 포트 3001 |
| 5. NestJS | `e2e:serve` 구현, 조합의 `--api nestjs`                                                                           |
| 나중     | 생성한 프로젝트 갱신, npm 배포, 포트 오프셋                                                                        |

## 10. 확인한 사실과 출처 (2026-10-03)

| 사실                                                                                                                                    | 출처                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 저장소는 비공개다                                                                                                                       | `gh repo view builder-shin/ai-template`                     |
| pnpm 12.6.0은 `pnpm setup`과 `pnpm new`를 package.json 스크립트로 실행하고, 스크립트에 `INIT_CWD`(실행한 폴더)를 넘긴다. `pnpm create`는 내장 명령이다 | 로컬 확인(pnpm 12.6.0)                                       |
| Turborepo 최신은 2.11.7이다. `inputs`의 `$TURBO_ROOT$`, `dependsOn`의 `<패키지>#<작업>`, `persistent`, `cache`                           | `npm view turbo version`, https://turborepo.dev/docs/reference/configuration |
| Claude Code는 세션의 시작 폴더에서 `.claude/settings.json`을 읽는다                                                                      | https://code.claude.com/docs/en/settings                     |
| 시작 폴더 아래의 `.claude/skills/`는 그 폴더의 파일을 처음 읽거나 고칠 때 불러온다                                                       | https://code.claude.com/docs/en/skills                       |
| lefthook `root`는 작업 폴더를 바꾸고 `{staged_files}`를 그 폴더 기준으로 거른다. glob은 저장소 루트 기준이다                             | https://lefthook.dev/configuration/root                      |
| Compose 프로젝트 이름의 우선순위는 `-p` > `COMPOSE_PROJECT_NAME` > 최상위 `name:` > 폴더 이름이다. 소문자·숫자·`-`·`_`만 쓰고 소문자나 숫자로 시작한다 | https://docs.docker.com/compose/how-tos/project-name/        |
| actionlint 최신은 v1.7.12(2026-03-30)다                                                                                                 | https://github.com/rhysd/actionlint/releases                 |
