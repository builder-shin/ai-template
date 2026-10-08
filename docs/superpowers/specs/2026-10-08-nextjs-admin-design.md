# Next.js admin 설계 (하위 프로젝트 4)

- 작성일: 2026-10-08
- 상태: 승인됨(2026-10-08)
- 상위 문서: [기반 설계](2026-09-26-ai-template-foundation-design.md)
  - 이 문서는 기반 설계 §10에서 사이클 4로 미룬 결정을 내린다: 리소스 선언 형식, 범용 목록·상세·폼 화면의 범위, 조합에서 web과 admin이 계약·목 패키지를 함께 쓰는 방식, admin 포트.
  - 동작 기준은 [Next.js web 설계](2026-09-30-nextjs-web-design.md), [create CLI 설계](2026-10-03-create-cli-design.md), [FastAPI 설계](2026-09-26-fastapi-template-design.md)다.
- 구현 계획: 마일스톤(§11)마다 `docs/superpowers/plans/`에 쓴다.
- 다음 단계: A1 프로토타입 → 계획 → 구현

## 1. 목표와 범위

### 1.1 산출물

1. `shared/nextjs/`: web과 admin이 같이 쓰는 코드의 원본. `pnpm sync`가 두 템플릿에 같은 바이트로 복사한다(§3).
2. 계약 위치 설정: 템플릿이 목 서버와 TypeSpec의 위치를 `gen.config.json`에서 읽는다. 조합은 루트 `contract/` 하나를 공유한다(§3.5, §9).
3. `templates/nextjs-admin/`: 플랫폼 관리 기능의 백오피스. 비밀번호 로그인, 권한별 메뉴, 리소스 선언과 범용 목록·상세·폼 화면, 리소스 다섯 개(글·사용자·역할·권한·감사 로그), 실시간, ko/en, 하네스, 리소스 생성기, Playwright E2E, Dockerfile(§4~§8).
4. create CLI: 단독 `--template nextjs-admin`과 조합의 `--admin`(§9).
5. 템플릿 저장소 변경: verify-templates 규칙, CI 작업, FastAPI E2E 실행기의 admin 지원, 목 서버와 FastAPI의 실시간 허용 출처, 문서(§10).

### 1.2 완료 조건

기반 설계 §3.4의 완료 조건(admin E2E가 목과 FastAPI 양쪽에서 통과)을 다음으로 확인한다.

- admin 템플릿 폴더에서 `pnpm check`와 `pnpm test:e2e`(목 대상)가 통과한다.
- 같은 E2E가 FastAPI 스택에서도 통과한다(루트 `pnpm admin-e2e fastapi`, CI 작업 `nextjs-admin-e2e-fastapi`).
- 공유 원본으로 옮긴 뒤에도 web의 `pnpm check`, E2E 20개(목), FastAPI E2E가 그대로 통과한다.
- CI 작업 `create-combo`가 FastAPI+web+admin 조합을 만들어 `pnpm setup` → `pnpm check` → `pnpm test:e2e`를 통과하고, `create-standalone`이 admin 단독 프로젝트의 `setup` → `check`를 통과한다.
- 저장소 루트의 `pnpm check`와 기존 CI 작업이 모두 통과한다.

### 1.3 범위 밖

기반 설계 §4.11에 더해 다음은 이번 사이클에서 다루지 않는다.

- admin의 소셜 로그인, 가입, 이메일 인증, 비밀번호 재설정(web의 몫이다)
- 대시보드 통계(계약에 엔드포인트가 없다), 일괄 작업, CSV 내보내기, 저장한 필터, 열 선택
- 범용 화면을 리소스별로 통째로 바꾸는 기능
- admin에서 글 작성·수정(기반 설계 §4.9: admin은 필터, 상태 변경, 삭제, 실시간 반영만 한다)
- NestJS(하위 프로젝트 5), 생성한 프로젝트의 갱신, 포트 오프셋

## 2. 결정 기록

| # | 주제 | 결정 | 이유 |
| --- | --- | --- | --- |
| AD1 | 진행 방식 | 스펙 하나, 마일스톤 셋(A1 공유 원본, A2 admin 뼈대, A3 나머지 리소스·FastAPI E2E·create CLI). 마일스톤마다 프로토타입 → 계획(Opus 5.5 작업자) → SDD(codex 구현, Opus 리뷰) → PR CI → 병합 | 공유 원본 추출(web 리팩터링)과 새 템플릿과 CLI 변경을 한 번에 검증하면 실패 원인을 가르기 어렵다 |
| AD2 | 스택 | web과 같은 스택·버전·구조. web 설계 N2~N16(데이터 패칭, API 클라이언트, 폼, UI, i18n, 세션, 목 서버, 관리 블록, TypeScript, Node, 비밀 스캔, 로딩 표시, 테스트 대상)을 그대로 따른다 | 두 프론트가 같은 패턴이라 AI가 헷갈리지 않고 공유 원본(AD3)이 가능하다 |
| AD3 | 공통 코드 | `shared/nextjs/` 원본을 `pnpm sync`가 두 템플릿에 같은 바이트로 복사하고, 저장소 check가 사본 일치를 검사한다 | 한쪽만 고친 버그·보안 수정이 다른 쪽에서 빠지지 않는다. 템플릿은 사본을 가져 자기완결로 남는다(기반 설계 §3.2) |
| AD4 | 화면 방식 | 리소스마다 선언 파일 하나를 두고 범용 목록·상세·폼 화면이 그린다. 선언의 키는 계약에서 만든 타입으로 검사한다 | 새 리소스 추가가 선언 하나로 끝나 화면이 일관된다. 계약이 바뀌면 타입 검사가 선언의 오래된 키를 잡는다 |
| AD5 | 바꿔 끼우기 | 선언으로 안 되는 부분은 필드 표시·입력 컴포넌트와 동작(Server Action)만 리소스 폴더에서 바꾼다 | 범용 화면의 일관성을 지킨다. 지금 리소스 다섯 개에 필요한 것보다 넓히지 않는다 |
| AD6 | 인증 범위 | 비밀번호 로그인, 로그아웃, 권한 없음 화면만 둔다 | 사용자 결정(2026-10-08). 소셜로만 가입해 비밀번호가 없는 계정은 admin에 들어올 수 없다(문서에 적는다) |
| AD7 | 관리자 판정 | 로그인 직후 `admin:access`가 없으면 그 세션을 끝낸다. 로그인 중에는 레이아웃이 요청마다 확인하고 실시간 `me.updated`로 다시 확인한다 | admin 앱이 관리자가 아닌 세션을 쥐지 않는다. 역할을 잃으면 다음 요청이나 이벤트에서 막힌다 |
| AD8 | 세션 쿠키 이름 | 앱 이름에서 만든다: `web-session`, `admin-session`. 운영에서는 `__Host-` 접두사를 붙인다 | 쿠키는 포트를 구분하지 않아 같은 이름이면 localhost:3000과 :3001의 로그인이 서로 덮어쓴다 |
| AD9 | 포트 | admin dev 3001, 단독 admin의 목 4011, E2E admin 3101·목 4111. 조합은 api 8000, web 3000, admin 3001 | 단독 web(3000·4010)과 단독 admin을 함께 띄울 수 있다. 기반 설계 §10의 admin 포트 3001 |
| AD10 | 계약 위치 | `gen.config.json`의 `contract`(기본 `contract`). 조합은 루트 `contract/` 하나를 두 앱이 공유한다. web만 있는 조합도 같은 배치다 | 같은 이름의 패키지(`@ai-template/contract`, `@ai-template/mock`)가 workspace에 두 번 들어가지 않는다. 조합 배치가 하나라 CLI와 문서가 단순하다 |
| AD11 | i18n | web과 같은 설정(ko/en, `as-needed`, 계정 `locale` 동기화). 메시지는 공유(`messages/shared/`)와 앱 고유로 나눈다. 리소스 메시지 키는 check 단계가 확인한다 | 에러 번역을 두 앱이 같이 쓴다. 범용 화면은 키를 동적으로 만들어 타입 검사로는 빠진 키를 잡지 못한다 |
| AD12 | E2E | 목이 기본이고, FastAPI는 기존 실행기를 넓힌 루트 `pnpm admin-e2e fastapi`로 돈다. 전용 compose 프로젝트와 새 볼륨만 쓴다 | web E2E와 같은 데이터 보호 규칙(W4)을 그대로 쓴다 |
| AD13 | 조합 이름 | `fastapi`, `api`, `web`, `admin`을 거절한다 | 앞의 셋은 create CLI의 규칙이다. `admin`도 앱 workspace 패키지 이름이라 루트 이름과 겹치면 pnpm 필터가 루트 명령을 재귀로 부른다 |
| AD14 | 잠금 파일 | 조합의 루트 잠금 파일은 프론트 템플릿들의 잠금 파일을 합쳐 만든다. 두 템플릿의 공통 의존성 버전이 같은지는 저장소 check가 강제한다 | 템플릿에서 검증한 해석을 그대로 쓰고, 합칠 때 같은 패키지가 다른 버전으로 갈라지지 않는다 |
| AD15 | 생성기 | `pnpm gen:resource <type>`이 계약을 읽어 선언 초안을 만든다 | 범용 화면이라 골든을 복사할 코드가 없다. 계약에서 열·필터·쓰기 동작을 정확히 뽑는다 |
| AD16 | Docker 검증 | Docker가 필요한 확인은 CI에서만 한다 | 이 PC의 개발 compose 프로젝트(`fastapi`, `joon`)와 그 데이터를 지킨다(W4·create CLI와 같은 규칙) |

## 3. 공유 원본 (A1)

### 3.1 위치와 동기화

- 원본은 `shared/nextjs/`다. 안쪽 경로는 템플릿 안 경로를 그대로 따른다. 예: `shared/nextjs/src/lib/session/cookie.ts` → 두 템플릿의 `src/lib/session/cookie.ts`.
- `scripts/shared-assets.json`에 `mode: "overlay"`, `source: "shared/nextjs"`, 템플릿 루트 대상(`path: "."`)을 둔다. 사본에 해당하는 파일만 쓰고 템플릿의 다른 파일은 건드리지 않는다. A1의 대상은 `nextjs`이며 `nextjs-admin`은 A2에서 더한다. 정렬된 `managedFiles`는 현재 파일과 삭제 기록의 합집합이다.
- 계약·목·규약 문서 사본(`contract/**`, `docs/conventions/**`)은 지금처럼 따로 동기화하고 admin에도 같은 사본을 둔다.

- 덮어 놓기 원본은 git 인덱스에 있고 디스크에 남은 파일만 고른다. 새 파일은 먼저 `git add`한다. 각 대상에도 `managedFiles`를 두어 실제로 받은 경로만 기록한다. 새 대상의 현재 원본 경로는 빈 자리나 같은 바이트만 받아들이고, 이미 지운 원본 경로의 앱 파일은 보존한다. 사본을 지우면 경로마다 한 줄씩 알린다.

### 3.2 공유하는 것

아래는 A1 프로토타입에서 확정한 원본 132개다. 정확한 파일 목록은 `scripts/shared-assets.json`의 `shared/nextjs` 항목에 있다. 구현 옆 테스트와 해당 스크립트 테스트·fixture도 원본에 두며 템플릿 사본의 check에서 돈다.

- 앱 코드
  - `src/lib/api/**`: 클라이언트, JSON:API 도우미, 에러 번역, 경로·추적
  - `src/lib/session/`: `cookie.ts`, `key.ts`, `refresh.ts`, `request.ts`, `user.ts`, `redirect.ts`와 쿠키·redirect 테스트. `oauth.ts`·테스트와 보호 규칙 `routes.ts`는 앱 파일이다
  - `src/lib/realtime/**`, `src/lib/i18n/**`(routing·navigation·request·catalogs·merge·타입과 테스트), `src/lib/env/startup.ts`·테스트, `src/lib/testing/account.ts`
  - `src/lib/app-config.mjs`: 앱 이름·포트·쿠키 이름 읽기. `src/lib/utils.ts`: UI 클래스 병합
  - `src/components/ui/**`: shadcn 부품. 두 앱이 쓰는 부품의 합집합이다
  - 공용 컴포넌트: `spinner.tsx`, `submit-button.tsx`, `error-boundary.tsx`, `locale-switcher.tsx`, `common.test.tsx`. 헤더·404와 그 테스트는 앱에 둔다
  - 생성물: `src/lib/generated/**`(에러 코드, 실시간 이벤트)
  - 공유 메시지: `messages/shared/{ko,en}.json`(에러 코드 번역과 공통 문구)
- 스크립트와 하네스
  - `scripts/check/**` 중 `steps.ts`·`steps.test.ts`를 뺀 실행기·파일 읽기·타입·i18n·로딩 문구·skill·하네스와 테스트. 단계 목록은 앱이 소유한다
  - 계약 생성: `scripts/gen.ts`, `generate.ts`, `gen-input.ts`, `gen-config.mjs`와 `gen.test.ts`, `gen-input.test.ts`, `gen-input-light.test.ts`, `gen-config.test.ts`
  - 개발·설치: `scripts/dev.mjs`, `dev-mode.mjs`, `setup.mjs`와 테스트. `scripts/app-config.test.ts`, `api-types.test.ts`, `i18n-types.test.ts`
  - E2E: `scripts/e2e-server.ts`, `e2e-runtime.ts`·테스트, `scripts/fastapi-target.test.ts`, `e2e/targets/{index,mock,fastapi}.ts`. 공통 대상은 메일·최근 로그인 창을 다루며 OAuth는 요구하지 않는다
  - 테스트 지원: `scripts/test/{browser,dependency-links,mock-server,server-only,session,server-action}.ts`와 browser·mock-server·server-action 테스트, `scripts/http/server.ts`, `scripts/session-core.test.ts`, `session-refresh.integration.test.ts`
  - 프로세스·환경: `scripts/{process,process-tree,envfile,git-environment}.mjs`와 process·process-tree·envfile 테스트, `scripts/workspace-root.ts`·테스트
  - hook: `.claude/hooks/*.mjs`, `scripts/hooks/**`(JSON fixture 포함). 공식 skill 동기화: `scripts/skills/{sync.ts,sources.json}`
  - 린트: `scripts/lint/boundaries.mjs`·`rules.test.ts`. Betterleaks: `scripts/tools/{cli,betterleaks,betterleaks.test}.ts`

혼합 파일은 다음처럼 나눴다. 공통 코드가 가져오는 앱 파일은 두 앱에서 같은 경로·내보내기 이름을 쓴다.

- `redirect.ts`는 경로 디코딩·로케일 제거·점 구간 정리만 하고 `src/lib/session/routes.ts`의 `isProtectedPath`를 부른다. web의 기능 생성기와 페이지 레시피도 `routes.ts`를 수정한다.
- `e2e/targets/app.ts`는 `appEnvironment`, `mockEnvironment`, `extendTarget`을 내보낸다. web은 OAuth URL·목 콜백·소셜 어댑터를 여기서 더한다. 소셜 구현·타입은 `e2e/targets/social.ts`, 검사는 `scripts/social-target.test.ts`다. 공통 E2E 테스트의 앱별 추가 설정은 `scripts/test/e2e-app.ts`의 `extraE2eEnv`로 준다.
- `scripts/lint/app.mjs`는 web의 features 요소·정책·서버 파일 패턴을 공통 `architectureConfig`에 넘긴다. web 경계와 ESLint 설정 테스트는 앱에 남긴다.
- 공용 컴포넌트 검사는 `common.test.tsx`, 헤더·404 검사는 `layout.test.tsx`다. 세션 읽기·401 검사는 `session-core.test.ts`, 앱의 쿠키 정리 route 검사는 `session-request.test.ts`다. Server Action 응답 대기는 web E2E fixture에서 공통 `scripts/test/server-action.ts`로 분리했다.
- 환경 스키마·테스트(`src/lib/env.ts`, `env.test.ts`), instrumentation·next 설정·proxy·HTTP 시나리오·Vitest global setup은 앱 파일이다. 시작 검증과 check는 같은 경로의 앱 스키마를 가져온다.

### 3.3 앱마다 두는 것

- 화면(`src/app/**`), 기능(web `src/features/**`, admin `src/resources/**`)
- `src/proxy.ts`와 보호 경로 규칙, 환경 변수 스키마(`src/lib/env.ts`), 앱 화면 문구(`messages/{ko,en}.json`)
- E2E 시나리오, check 단계 목록, `package.json`, `next.config.ts`, `playwright.config.ts`, `.env.example`, `Dockerfile`, `app.config.json`, `template.json`, AGENTS.md와 문서
- web 전용: OAuth(`lib/session/oauth.ts`, `app/oauth/**`), 가입·인증·재설정 화면

공유 코드가 import하는 고정 앱 파일은 다음 여덟 개다. 두 앱이 같은 경로와 내보내기를 제공한다.

| 파일                                   | 계약                                                |
| -------------------------------------- | --------------------------------------------------- |
| `app.config.json`                      | 앱 이름과 `ports.dev`, `mock`, `e2e`, `e2eMock`     |
| `messages/en.json`, `messages/ko.json` | 공유 카탈로그와 겹치지 않는 앱 문구                 |
| `e2e/targets/app.ts`                   | `appEnvironment`, `mockEnvironment`, `extendTarget` |
| `scripts/check/steps.ts`               | `assembleSteps`, `ContractInputs`                   |
| `scripts/test/e2e-app.ts`              | 통합 검사에 더할 `extraE2eEnv`                      |
| `src/lib/env.ts`                       | `envSchema`                                         |
| `src/lib/session/routes.ts`            | `isProtectedPath`                                   |

import 밖에도 아래 앱 계약이 있다. 새 앱을 만들 때 함께 맞춘다.

| 위치                                   | 계약                                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/settings.json`                | 공통 hook의 exec form, 명령 어휘 허용, 환경 파일 읽기·생성물 Edit/Write·위험 명령 차단                                                                     |
| `tsconfig.json`, `tsconfig.check.json` | strict 설정과 `@/*` → `src/*`, 공통 TS·TSX·MJS 포함. check 설정은 기본 설정을 잇고 `.next/dev`를 제외                                                      |
| check 단계 이름 `types`, `harness`     | `types` 성공 뒤 route 타입의 캐시를 다시 계산하고, `harness`는 공통 하네스·공식 skill 검사를 직접 실행                                                     |
| Vitest global setup                    | `ProvidedContext.mockBaseUrl: string`을 선언하고 실제 목 서버의 Origin을 `project.provide("mockBaseUrl", …)`로 제공. 종료 함수로 서버 정리                 |
| `package.json`의 `start`               | `next start --port <ports.dev>`                                                                                                                            |
| `.env.example`                         | `envSchema`와 같은 키. 공통 키는 `API_BASE_URL`, `APP_URL`, `SESSION_SECRET`, `TIME_ZONE`, `NEXT_PUBLIC_REALTIME_URL`; 단독 기본 주소는 앱의 dev·mock 포트 |

### 3.4 앱마다 다른 값

- 공유 파일에 앱 이름이나 포트를 직접 쓰지 않는다. 앱 루트의 `app.config.json`에 앱 이름과 포트(dev, 목, E2E, E2E 목)를 두고 공유 스크립트가 읽는다. `template.json`은 생성할 때 복사하지 않으므로(create CLI 설계 C4) 쓰지 않는다.
- 공유 코드가 앱 고유 값을 import해야 하면 두 앱에 같은 이름의 앱 파일을 둔다. 예: 보호 경로를 내보내는 `src/lib/session/routes.ts`.
- 세션 쿠키 이름은 앱 이름에서 만든다(AD8).

### 3.5 계약 위치

- `gen.config.json`에 `contract`를 더한다. 앱 루트 기준 상대 경로이고, 파일이 없거나 키가 없으면 `contract`다.
- 공유 스크립트(dev, `gen`, E2E, 테스트의 목 실행)는 모두 이 값으로 `<contract>/mock`과 `<contract>/typespec`을 찾는다. 지금은 `contract/mock/src/main.ts`, `contract/typespec` 같은 경로를 직접 쓴다.
- `openapi`(백엔드 스펙 위치, create CLI 설계 §5.5)는 그대로다.

### 3.6 검사

- 저장소 루트 check의 사본 검사가 공유 사본도 확인한다. 템플릿에서 사본을 고치면 "원본(`shared/nextjs/…`)을 고친 뒤 `pnpm sync`한다"로 실패한다.
- 생성한 프로젝트에서는 평범한 파일이다. 템플릿 지침은 원본 폴더를 언급하지 않는다.
- 공유 생성물(API 타입, 에러 코드, 실시간 이벤트)도 원본에 있다. 계약을 바꾼 뒤에는 저장소 전용 helper `scripts/src/sync/gen-nextjs.mjs`가 루트 계약으로 원본의 생성물을 만들고 `pnpm sync`가 사본을 맞춘다. 템플릿의 `pnpm gen`은 사본을 고쳐 사본 검사를 실패시키므로 저장소에서는 쓰지 않는다.

- 원본의 포맷·자동 수정은 루트 `pnpm fix:shared [원본 파일...]`로 한다. 파일을 생략하면 추적 중인 일반 공유 소스를 모두 고른다. web의 ESLint 설정과 사본 경로로 원본 내용을 검사·수정하고 Prettier로 포맷한 뒤 원본에만 쓴다. 생성물과 환경 파일은 제외한다. 실행 뒤 `pnpm sync`와 템플릿 check로 확인한다.

### 3.7 web 변경

A1은 web의 동작을 바꾸지 않는다. 바뀌는 것은 다음뿐이다.

- 공유 파일의 위치(같은 경로로 사본이 남는다)
- 세션 쿠키 이름(AD8). 개발 중인 기존 로그인이 한 번 풀린다
- 메시지 파일 분리(AD11). 키와 문장은 같다
- 계약 경로를 설정에서 읽기(§3.5)

## 4. admin 앱 (A2)

### 4.1 폴더

```
templates/nextjs-admin/
├── AGENTS.md, CLAUDE.md
├── .claude/, .mcp.json, lefthook.yml, .env.example, package.json, next.config.ts, Dockerfile
├── app.config.json, template.json, gen.config.json(선택)
├── contract/                 # 저장소에서 sync한 사본(TypeSpec, openapi.yaml, mock/)
├── messages/                 # 앱 문구(ko, en), shared/(공유 사본)
├── src/
│   ├── proxy.ts              # 로케일 라우팅, 로그인 필요, 토큰 갱신
│   ├── app/[locale]/
│   │   ├── login/, forbidden/
│   │   └── (admin)/          # 레이아웃(메뉴, 관리자 판정)과 범용 리소스 화면
│   ├── resources/<type>/     # 리소스 선언, 동작, 바꿔 끼우는 컴포넌트
│   ├── lib/resources/        # 선언 타입, 데이터 계층(server-only), URL 상태
│   ├── components/resource/  # 범용 목록·상세·폼·필터·페이지·동작
│   └── lib/, components/     # 공유 사본(§3.2)과 앱 파일
├── e2e/, scripts/, docs/
```

### 4.2 화면 경로

로케일은 web과 같다(ko 접두사 없음, en은 `/en`).

| 경로 | 내용 |
| --- | --- |
| `/login` | 이메일과 비밀번호. `admin:access`가 없는 계정은 세션을 끝내고 같은 화면에 권한 없음 안내 |
| `/` | 볼 수 있는 첫 리소스의 목록으로 이동 |
| `/<type>` | 범용 목록 |
| `/<type>/new` | 범용 생성 폼(선언에 생성이 있을 때) |
| `/<type>/<id>` | 범용 상세 |
| `/<type>/<id>/edit` | 범용 수정 폼(선언에 수정이 있을 때) |
| `/forbidden` | 로그인 중 관리 권한을 잃었거나 리소스 권한이 없을 때. 로그아웃 버튼 |

등록되지 않은 리소스와 선언에 없는 화면은 404다.

### 4.3 인증과 권한

- 로그인은 `POST /sessions`(grantType `password`)다. 성공하면 BFF가 `/me`의 `meta.permissions`를 읽고, `admin:access`가 없으면 `DELETE /sessions/current`로 세션을 끝낸 뒤 쿠키를 만들지 않는다.
- `proxy.ts`는 web처럼 세션 확인과 토큰 갱신만 한다. `/login` 밖은 모두 로그인이 필요하다.
- `(admin)` 레이아웃(Server Component)은 요청마다 `/me`를 읽어 `admin:access`를 확인하고, 없으면 `/forbidden`으로 보낸다. 리소스 화면은 선언의 권한을 확인한다.
- 화면에서 동작을 숨기는 것은 편의다. 최종 판단은 백엔드이고 403은 그 자리의 안내로 보여 준다.
- 로그아웃은 Server Action이다(`DELETE /sessions/current`, 쿠키 삭제, `/login`).
- 소셜로만 가입한 계정은 비밀번호가 없어 admin에 로그인할 수 없다. web에서 비밀번호를 정하거나(재설정 흐름) 다른 관리자 계정을 쓴다. 이 한계를 admin 문서에 적는다.

### 4.4 레이아웃

- 왼쪽 메뉴: 리소스 등록 순서대로, 권한이 있는 리소스만.
- 위쪽 줄: 계정 이름과 이메일, 언어 전환, 로그아웃.
- 좁은 화면에서는 메뉴를 시트로 연다. 다크 모드는 시스템 설정만 따른다(web N5).

### 4.5 설정

- 환경 변수는 web과 같다: `API_BASE_URL`, `APP_URL`, `SESSION_SECRET`, `TIME_ZONE`, `NEXT_PUBLIC_REALTIME_URL`. OAuth 설정은 없다.
- 단독 실행은 web처럼 단독 모드(목 서버와 함께, 목 4011)와 백엔드 모드가 있다.
- 포트는 AD9를 따른다.

### 4.6 실시간

- 공유 `RealtimeProvider`를 쓴다. BFF가 `POST /realtime-tickets`로 티켓을 받는다.
- `me.updated`: 화면을 새로 그려 레이아웃이 권한을 다시 확인한다.
- `session.revoked`: 로그인 화면으로 보낸다.
- 선언에 `realtime` 채널이 있는 리소스는 목록과 상세가 그 채널을 구독하고, 이벤트가 오면 `router.refresh()`로 다시 그린다. 짧은 시간에 여러 번 오면 한 번으로 묶는다.
- 목 서버와 FastAPI의 실시간 허용 출처 기본값에 admin 출처를 더한다(§10).

### 4.7 에러

- 공유 에러 번역(`errors.*`)을 쓴다.
- 401은 로그인 화면, 403·404는 그 자리의 안내다.
- 422의 필드 에러는 폼 필드에 붙이고(`source.pointer`), 그 밖의 에러는 배너다.
- 429는 `Retry-After`를 안내한다.

### 4.8 i18n과 로딩

- web과 같은 설정이다(AD11). 로그인 중 언어를 바꾸면 계정 `locale`도 바꾼다.
- 로딩은 스켈레톤이나 스피너만 쓰고 문구를 쓰지 않는다(web N15). check가 강제한다.

## 5. 리소스 선언과 범용 화면 (A2)

### 5.1 선언 형식

리소스 하나는 폴더 하나다. `src/resources/<type>/resource.ts`가 선언이고 `src/resources/index.ts`가 등록 순서(메뉴 순서)를 정한다.

```ts
// src/resources/posts/resource.ts
export default defineResource({
  type: "posts", // JSON:API type, 경로 /api/v1/posts
  permission: "posts:manage", // 메뉴와 화면을 보는 데 필요한 권한
  list: {
    columns: ["title", "author", "status", "publishedAt", "createdAt"],
    filters: { "filter[q]": "text", "filter[status]": "enum", "filter[author]": "relation" },
    sort: { fields: ["createdAt", "publishedAt", "title"], default: "-createdAt" },
    include: ["author"],
  },
  detail: { fields: ["title", "body", "status", "author", "coverImage", "publishedAt"] },
  actions: [publish, unpublish], // ./actions.ts의 Server Action과 표시 조건
  delete: { permission: "posts:manage" },
  realtime: { channel: "posts:all" }, // 이벤트가 오면 다시 그린다
});
```

생성·수정이 있는 리소스는 `create`, `edit`에 필드와 입력 종류, 권한을 둔다. 예: 사용자 수정은 `{ permission: "users:manage", fields: { status: "enum", roles: "relation-many" } }`.

### 5.2 타입 검사

- 필드·열의 키는 리소스의 속성·관계 이름, 필터 키는 목록 operation의 쿼리 파라미터 이름이다. 둘 다 계약에서 만든 타입(`src/lib/api/schema.d.ts`)으로 검사한다.
- 계약에 없는 operation은 선언할 수 없다. 예: 감사 로그에 `create`를 쓰면 타입 오류다.
- 오타나 계약 변경으로 사라진 키는 `check`의 타입 검사에서 실패한다.

### 5.3 데이터 계층

- `src/lib/resources/`(server-only)가 리소스 type으로 경로(`/api/v1/<type>`, `/api/v1/<type>/{id}`)를 만들어 목록·상세·생성·수정·삭제를 부른다. 공유 API 클라이언트(openapi-fetch)와 JSON:API 도우미를 쓴다.
- 목록의 필터·정렬·페이지는 URL 쿼리에 둔다. Server Component가 `searchParams`로 읽어 호출하므로 공유할 수 있는 주소가 된다.
- 쓰기는 범용 Server Action이 선언의 필드로 JSON:API 문서(`data.type`, `data.id`, `attributes`, `relationships`)를 만든다.

### 5.4 표시·입력·필터 종류

| 종류 | 표시 | 입력 | 필터 |
| --- | --- | --- | --- |
| 텍스트 | 문자열 | 한 줄 입력 | 텍스트 검색(`filter[q]`) |
| 여러 줄 텍스트 | 줄바꿈 보존 | 여러 줄 입력 | |
| 날짜·시각 | `TIME_ZONE` 기준 | | 기간(시작·끝) |
| 열거값 | 번역한 배지 | 선택 | 선택 |
| 참/거짓 | 표시 | 체크박스 | |
| 관계 | 대상 상세로 가는 링크 | 단일 선택(대상 목록에서 옵션, `filter[q]`가 있으면 검색) | 선택 |
| 다중 관계 | 배지 목록 | 다중 선택 | |
| 파일 | 파일 이름 | | |

### 5.5 목록

- 선언의 열을 표로 그린다. 행을 누르면 상세로 간다.
- 필터 막대, 정렬(선언에 있는 필드만, 오름·내림), 페이지(`page[number]`, `page[size]`, 크기 20 고정)를 둔다.
- 관계 열은 선언의 `include`로 함께 읽는다.
- 권한이 있으면 생성 버튼과 행 동작(수정, 삭제, 선언한 동작)을 보인다.
- 결과가 없으면 빈 상태를 보인다. 로딩은 표 모양 스켈레톤이다.

### 5.6 상세

- 선언의 필드를 표시 종류대로 그린다.
- 수정·삭제·선언한 동작 버튼을 권한과 표시 조건에 따라 보인다.

### 5.7 폼

- web과 같이 Server Action과 `useActionState`로 만든다. 폼 라이브러리는 쓰지 않는다(web N4).
- 검증은 백엔드가 한다. JSON:API 에러의 `source.pointer`로 필드 에러를 붙인다.
- 수정 폼은 선언한 필드만 보낸다. 성공하면 상세로 간다.

### 5.8 삭제와 동작

- 삭제는 확인 대화상자를 거친다. 성공하면 목록으로 가고, 실패하면(예: 시스템 역할) 에러 코드를 번역해 보인다.
- 동작은 리소스 폴더의 `actions.ts`에 Server Action, 이름 키, 권한, 표시 조건(예: 초안일 때만 발행)으로 선언한다. 확인이 필요한 동작은 대화상자를 거친다.

### 5.9 바꿔 끼우기

- 선언의 필드에 리소스 폴더의 표시·입력 컴포넌트를 지정할 수 있다. 예: 역할 폼의 권한 선택기는 `/permissions`를 접두사(`users`, `roles` 등)별로 묶어 보인다.
- 범용 화면 전체를 리소스별로 바꾸는 기능은 두지 않는다(§1.3).

### 5.10 문구

- 메시지 키: `resources.<type>.title`, `resources.<type>.fields.<이름>`, `resources.<type>.enums.<필드>.<값>`, `resources.<type>.actions.<이름>`.
- 범용 화면은 키를 동적으로 만든다. check 단계 `resource-messages`가 등록한 모든 선언에서 키를 모아 ko/en 양쪽에 있는지 확인한다.

### 5.11 생성기와 골든

- `pnpm gen:resource <type>`
  - 계약에서 리소스 속성·관계로 열과 상세 필드를, 목록 operation의 쿼리 파라미터로 필터와 정렬 후보를, 쓰기 operation의 유무로 생성·수정·삭제를 정해 선언 초안을 쓴다.
  - 메시지 키 자리(ko/en)와 등록(`src/resources/index.ts`)을 함께 만든다.
  - 계약에 그 type의 목록 operation이 없으면 거절한다.
- 골든은 글 관리(`src/resources/posts/`)다. 폼의 예시는 사용자와 역할이 맡는다.
- 레시피와 skill이 생성기와 골든을 가리킨다.

## 6. 리소스

| 리소스 | 마일스톤 | 권한 | 내용 |
| --- | --- | --- | --- |
| 글 | A2(골든) | `posts:manage` | 목록(검색·상태·작성자 필터, `createdAt`·`publishedAt`·`title` 정렬, 작성자 include), 상세, 발행·발행 취소, 삭제, 실시간 `posts:all` |
| 사용자 | A3 | `users:read`, 수정은 `users:manage` | 목록(검색·상태·역할 필터), 상세, 수정(상태, 역할 다중 선택) |
| 역할 | A3 | `roles:read`, 쓰기는 `roles:manage` | 목록(검색), 상세, 생성·수정(이름, 권한 선택기), 삭제. 시스템 역할은 삭제 버튼을 감추고 백엔드 거부도 번역한다 |
| 권한 | A3 | `roles:read` | 읽기 전용 목록 |
| 감사 로그 | A3 | `audit-logs:read` | 읽기 전용 목록(행위자·행위·대상 종류·기간 필터), 상세 |

## 7. 하네스

- 명령 어휘와 check, hook, 권한, 생성물 규칙은 web과 같다(공유 원본). 단계 목록은 앱 파일이다.
- admin check에는 `resource-messages`(§5.10)가 더해진다.
- 경계 린트
  - 화면(`app`)은 `resources/index.ts`, `lib`, `components`만 쓴다.
  - 리소스끼리 서로의 내부를 import하지 않는다.
  - `lib/resources`와 리소스의 `actions.ts`는 server-only다.
- 레시피: 리소스 추가, 필드 종류 추가, 동작 추가. skill: 리소스 추가(생성기와 골든).
- AGENTS.md에 소셜 로그인 한계(§4.3), 리소스 선언 규칙, 공유 사본 안내를 적는다.

## 8. 테스트와 검증

### 8.1 단위·컴포넌트

- 선언 타입: 잘못된 필드·필터 키와 계약에 없는 operation이 타입 오류인지 확인하는 테스트.
- 범용 목록·필터·페이지·폼·삭제 대화상자·동작 버튼을 Testing Library로 실제 DOM에서 시험한다.
- 생성기: 계약 조각에서 선언·메시지·등록을 만드는 테스트.

### 8.2 BFF 통합

web처럼 실제 목 서버 프로세스에 붙인다(web N16).

- 데이터 계층: 필터·정렬·페이지·include
- 생성·수정·삭제와 필드 에러
- 로그인의 `admin:access` 판정과 일반 회원 거부(세션이 남지 않음)
- 403 처리와 권한별 메뉴

### 8.3 E2E

Playwright headless Chromium. 목이 기본이고 FastAPI 대상은 같은 시나리오다. 약 18개를 예상한다.

1. 로그인 성공 뒤 첫 리소스로 이동
2. 일반 회원 로그인 거부(안내, 세션 없음)
3. 로그아웃
4. 글 목록의 검색·상태 필터, 정렬, 페이지
5. 글 발행과 발행 취소
6. 글 삭제(확인 대화상자)
7. 다른 세션이 만든 글이 목록에 실시간으로 나타남
8. 사용자 목록의 검색·상태·역할 필터
9. 사용자 역할 부여와 비활성화
10. 역할 생성(권한 선택기)과 수정
11. 역할 삭제와 시스템 역할 삭제 거부
12. 권한 목록
13. 감사 로그 필터(행위·기간)와 상세
14. 로그인 중 관리 권한을 잃으면 `/forbidden`
15. 일부 권한만 있는 관리자의 메뉴와 화면
16. 폼의 필드 에러 표시
17. 언어 전환
18. 등록되지 않은 리소스 404

A2는 인증·글·공통 시나리오(1~7, 14, 15, 17, 18)를 갖추고, A3가 나머지(8~13, 16)를 더한다. 14·15에 필요한 역할 변경은 테스트가 API로 준비한다.

### 8.4 FastAPI E2E 실행기

- 저장소의 web E2E 실행기를 admin에도 쓰도록 넓혀 `pnpm admin-e2e fastapi`를 더한다. 옵션(`--smoke`, `--print`, `--keep`, `--run-id <ID>`, `--down`)과 규칙은 web과 같다.
- 전용 compose 프로젝트 `ai-template-admin-e2e-<ID>`, 새 볼륨, 실행 이미지 `ai-template-admin-e2e-fastapi:<ID>`만 쓰고, 성공 뒤와 `--down`은 그것만 정리한다. 개발 프로젝트 `fastapi`·`joon`은 건드리지 않는다.
- E2E가 쓰는 일반 회원·일부 권한 관리자는 목에서는 테스트 통로, FastAPI에서는 가입과 Mailpit 인증 뒤 시드 관리자가 역할을 바꿔 만든다.

### 8.5 web 회귀

A1 뒤에도 web의 check, build, E2E 20개(목), FastAPI E2E(`pnpm web-e2e fastapi`, CI)가 그대로 통과해야 한다.

### 8.6 CI 작업

| 작업 | 마일스톤 | 내용 |
| --- | --- | --- |
| `nextjs-admin` | A2 | 고정 설치, check, build, 목 E2E |
| `nextjs-admin-e2e-fastapi` | A3 | `pnpm admin-e2e fastapi` |
| `create-combo` | A3 | FastAPI+web+admin 조합의 setup → check → test:e2e(web·admin 모두 실제 api), 이미지 셋, web·admin 컨테이너 `GET /` |
| `create-standalone` | A3 | admin 단독 setup → check 추가 |

Docker가 필요한 확인은 PR CI에서만 한다(AD16).

## 9. create CLI 변경 (A3)

### 9.1 단독

`pnpm new <대상 폴더> --template nextjs-admin [--name <이름>] [--no-git]`. 파일과 이름 규칙은 nextjs 단독과 같다(create CLI 설계 §4).

### 9.2 조합 구조

`--api fastapi`에 `--web`, `--admin` 가운데 하나 이상을 더한다.

```
<이름>/
├── (루트 파일: create CLI 설계 §5.1과 같다)
├── contract/            # TypeSpec, openapi.yaml, mock/ — 프론트들이 공유
└── apps/
    ├── api/
    ├── web/             # --web
    └── admin/           # --admin
```

- 프론트의 `contract/`는 지우고, 각 프론트의 `gen.config.json`은 `{ "openapi": "../api/openapi.json", "contract": "../../contract" }`다.
- 기존 FastAPI+web 조합도 이 배치로 바뀐다(create CLI 설계 §5.1·§5.3 갱신).
- `apps/admin`의 package.json `name`은 `admin`, README 제목은 `# <이름> admin`이다. Dockerfile은 web처럼 조합 루트를 빌드 문맥으로 쓰는 조합용으로 바꾼다.

### 9.3 workspace와 잠금 파일

- `pnpm-workspace.yaml`의 패키지는 `apps/api`, 있는 프론트들, `contract/*`다.
- 루트 잠금 파일은 프론트 잠금 파일들을 합쳐 만든다.
  1. 앱 importer 경로를 바꾼다(`.` → `apps/<앱>`).
  2. 두 프론트에 있는 `contract/<패키지>` importer는 루트 `contract/<패키지>` 하나로 합친다. 두 잠금 파일에서 해석이 같아야 하고, 다르면 실패한다.
  3. 같은 패키지 키의 해석이 같은지 확인하며 패키지를 합친다.
  4. `pnpm install --lockfile-only`로 루트와 `apps/api`를 더 푼다.
  5. 모든 프론트 importer의 해석이 템플릿 잠금 파일과 같은지 CLI가 확인한다(create CLI 설계 §5.3의 보존 검사를 넓힌다).
- 두 템플릿의 공통 의존성(dependencies, devDependencies, overrides) 버전이 같은지 저장소 check(verify-templates)가 강제한다.

### 9.4 루트 명령과 하네스

- setup·check·test:e2e와 turbo 필터가 있는 프론트를 모두 포함한다. 순서는 고정하지 않는다.
- `test:e2e`는 `e2e:serve`가 띄운 api 위에서 프론트 E2E를 차례로 돈다(fastapi 대상).
- hook 디스패처에 `[admin]`을 더하고, lefthook·Betterleaks·권한을 합친다. `.mcp.json`은 같은 서버를 하나로 합친다.

### 9.5 이름

조합에서는 `fastapi`, `api`, `web`, `admin`을 사용법 오류(2)로 거절하고 다른 `--name`을 안내한다(AD13).

### 9.6 CI 워크플로

생성 조합의 워크플로와 저장소 `create-combo`에 admin E2E(실제 api), admin 이미지 빌드, 컨테이너 확인을 더한다. 두 워크플로의 명령 순서 일치 테스트(create)를 그대로 유지한다.

## 10. 템플릿·저장소 변경 요약

| 마일스톤 | 대상 | 변경 |
| --- | --- | --- |
| A1 | 저장소 | `shared/nextjs/`, `scripts/shared-assets.json`의 덮어 놓기 항목, 사본 검사 |
| A1 | web | 공유 사본으로 이동, 쿠키 이름, 메시지 분리, 계약 경로 설정 |
| A2 | 저장소 | `templates/nextjs-admin/`, verify-templates의 admin 규칙과 공통 의존성 버전 일치 규칙, CI `nextjs-admin`, 계약·목·규약 사본 대상에 admin 추가 |
| A2 | 목 서버 | 실시간 허용 출처 기본값에 admin 출처 추가 |
| A3 | FastAPI | `REALTIME_ALLOWED_ORIGINS` 기본값과 `.env.example`에 `http://localhost:3001` 추가 |
| A3 | 저장소 | FastAPI E2E 실행기의 admin 지원(`pnpm admin-e2e fastapi`), CI `nextjs-admin-e2e-fastapi` |
| A3 | create | 단독 admin, 조합의 `--admin`과 루트 `contract/`, 잠금 파일 합치기, 이름 규칙, CI 작업 |
| A3 | 문서 | 기반 설계(상태, §3.3, §10), create CLI 설계(§5), 루트 AGENTS.md, 이 문서의 구현 기록 |

## 11. 마일스톤

| 마일스톤 | 산출물 | 완료 확인 |
| --- | --- | --- |
| A1 공유 원본 | §3, §10의 A1 | 루트 check(사본 검사 포함), web check·build·목 E2E 20개, PR CI(web FastAPI E2E 포함) |
| A2 admin 뼈대 | 인증·레이아웃·리소스 프레임워크·글(골든)·생성기·하네스·목 E2E | admin check·build·목 E2E, 루트 check, PR CI `nextjs-admin` |
| A3 나머지 | 사용자·역할·권한·감사 로그, FastAPI E2E, create CLI, 문서 | admin 목 E2E 전체, PR CI(`nextjs-admin-e2e-fastapi`, `create-combo`, `create-standalone` 포함) |

마일스톤마다 프로토타입 → 계획 → SDD → PR CI → 병합을 거친다(AD1).

## 12. 계획 단계에서 확인할 것

1. 선언 타입(A2 첫 스파이크): 리소스 type으로 만든 경로를 openapi-fetch의 경로 리터럴 타입과 이어 붙이는 방법, 속성·관계와 목록 쿼리 파라미터 키의 추출.
2. 덮어 놓기 동기화(A1): manifest 형식, 사본 검사, 원본에서 지운 파일의 처리.
3. 메시지 분리(A1): next-intl에서 공유·앱 메시지를 합치는 방법과 메시지 타입.
4. 쿠키 이름 변경의 범위(A1): web 세션·E2E·통합 테스트.
5. shadcn(Base UI) 부품(A2): 표, 대화상자, 선택(다중 포함), 시트, 체크박스, 배지의 CLI 제공 여부와 버전.
6. 잠금 파일 합치기(A3): web·admin 잠금 파일 importer 합치기와 해석 보존.
7. E2E 계정 준비(A2·A3): 목의 테스트 통로와 FastAPI의 가입·Mailpit 흐름으로 일반 회원과 일부 권한 관리자를 만드는 방법.
8. 실시간 허용 출처(A2·A3): 목·FastAPI 기본값과 E2E 출처.
9. 로케일 쿠키(A2): 공유 i18n 설정의 `NEXT_LOCALE`은 두 앱이 같은 이름이라 localhost에서 web과 admin의 언어 선택이 서로 덮인다. 계정 `locale` 동기화(AD11)로 같은 사용자의 선택이라 해는 작다. 그대로 둘지 `<app>-locale`로 나눌지 A2에서 정한다.
10. 공유 테스트의 입력값(A2 전): 공유 테스트에는 web 값(`app: "web"`, 3000·4010 등)이 검증 입력으로 들어 있다. 실행 앱의 설정이 아니고 admin 사본에서도 통과하므로 허용한다(§3.4는 실행 코드에 대한 규칙이다).

## 13. 미룬 결정

기반 설계 §10의 admin 행은 이 문서로 정한다. 남는 것은 다음이다.

- 대시보드와 통계: 계약에 집계 엔드포인트가 생기면 정한다.
- 일괄 작업, CSV 내보내기, 저장한 필터
- admin의 소셜 로그인: 운영에서 SSO가 필요해지면 정한다.

## 14. 확인한 사실과 출처 (2026-10-08)

- 계약의 관리 operation과 쿼리 파라미터
  - users: `GET /users`(`sort`, `filter[q]`, `filter[status]`, `filter[role]`), `GET /users/{id}`, `PATCH /users/{id}`(`contract/typespec/src/resources/users.tsp:137-168`).
  - roles·permissions: `GET/POST /roles`(`filter[q]`), `GET/PATCH/DELETE /roles/{id}`, `GET /permissions`(`contract/typespec/src/resources/roles.tsp:64-129`).
  - audit-logs: `GET /audit-logs`(`filter[actor]`, `filter[action]`, `filter[targetType]`, `filter[createdFrom]`, `filter[createdTo]`), `GET /audit-logs/{id}`(`contract/typespec/src/resources/audit-logs.tsp:74-101`).
  - 페이지는 `page[number]`, `page[size]`다(`contract/typespec/src/jsonapi.tsp:126-129`).
- 목 서버와 FastAPI는 시드 관리자(`admin@example.com`)를 만든다(`contract/mock/src/config.ts:105`, `contract/mock/src/seed.ts`, `templates/fastapi/src/app/seed.py`).
- 스토리지 허용 출처에는 `http://localhost:3001`이 이미 있고, 실시간 허용 출처는 `http://localhost:3000`뿐이다(`templates/fastapi/.env.example:17,35`, `contract/mock/src/config.ts:123-124`).
- web 세션 쿠키 이름은 개발 `session`, 운영 `__Host-session`이다(`templates/nextjs/src/lib/session/cookie.ts:52-53`).
- web은 목 서버와 TypeSpec을 경로로 참조한다(`templates/nextjs/scripts/dev.mjs:55`, `scripts/e2e-runtime.ts:28`, `scripts/gen.ts:29`, `scripts/generate.ts:59`, `scripts/test/mock-server.ts:17`).
- 공유 자산 동기화 목록은 `scripts/shared-assets.json`이다. 지금 web에는 `contract/mock`, `contract/typespec`, `contract/openapi.yaml`, 규약 문서 둘이 들어간다.
- 현재 조합의 workspace는 `apps/api`, `apps/web`, `apps/web/contract/*`다(create CLI 설계 §5.3).
- 기반 설계 §4.3: admin 앱에 로그인하려면 `admin:access`가 있어야 한다. §4.9: admin에는 전체 글 관리(필터, 상태 변경, 삭제, 실시간 반영)가 들어간다.
