# Next.js admin 설계 (하위 프로젝트 4)

- 작성일: 2026-10-08
- 상태: 승인됨(2026-10-08)
- 상위 문서: [기반 설계](2026-09-26-ai-template-foundation-design.md)
  - 이 문서는 기반 설계 §10에서 사이클 4로 미룬 결정을 내린다: 리소스 선언 형식, 범용 목록·상세·폼 화면의 범위, 조합에서 web과 admin이 계약·목 패키지를 함께 쓰는 방식, admin 포트.
  - 동작 기준은 [Next.js web 설계](2026-09-30-nextjs-web-design.md), [create CLI 설계](2026-10-03-create-cli-design.md), [FastAPI 설계](2026-09-26-fastapi-template-design.md)다.
- 구현 계획: 마일스톤(§11)마다 `docs/superpowers/plans/`에 쓴다.
- 현재 단계: A1·A2 병합(main e48f6e5), A3 구현. PR CI·main 병합 뒤 하위 프로젝트 5(NestJS)

## 1. 목표와 범위

### 1.1 산출물

A3까지 리소스 다섯 개(posts·users·roles·permissions·audit-logs), admin FastAPI E2E, create CLI의 단독 admin·조합 --admin 확장을 구현했다. 실제 SDD 확인 범위와 남은 CI·검토는 §16에 기록한다.

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
| AD7 | 관리자 판정 | 로그인 직후 `admin:access`가 없으면 그 세션을 끝낸다. 로그인 중에는 레이아웃이 문서 요청마다, 화면과 Action이 요청마다 확인하고 실시간 `me.updated`로 다시 확인한다 | admin 앱이 관리자가 아닌 세션을 쥐지 않는다. 역할을 잃으면 다음 요청이나 이벤트에서 막힌다 |
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

- 원본의 포맷·자동 수정은 루트 `pnpm fix:shared [원본 파일...]`로 한다. 파일을 생략하면 추적 중인 일반 공유 소스를 모두 고른다. web의 ESLint 설정과 사본 경로로 원본 내용을 검사·수정하고 Prettier로 포맷한 뒤 원본에만 쓴다. 생성물과 환경 파일은 제외한다. 새 원본은 `git add` → `pnpm sync` → `pnpm fix:shared <파일...>` → `pnpm sync` 순서다. 새 원본끼리 import하면 ESLint가 사본 경로에서 대상을 찾으므로 첫 동기화가 필요하다. 기존 원본만 수정하면 첫 동기화는 생략할 수 있다. 실행 뒤 `pnpm sync`와 템플릿 check로 확인한다.

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
- `(admin)` 레이아웃은 문서 요청마다, 리소스 화면과 Action은 요청마다 `/me`를 읽어 `admin:access`와 리소스 권한을 확인한다. 클라이언트 이동은 레이아웃을 다시 실행하지 않는다. 권한이 없으면 `/forbidden`으로 보낸다.
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

- 공유 `RealtimeProvider`를 쓰며 세션 id를 key로 유지한다. BFF가 `POST /realtime-tickets`로 티켓을 받는다.
- `me.updated`: 화면을 새로 그려 레이아웃이 권한을 다시 확인한다.
- `session.revoked`: 현재 세션의 401을 확인한 뒤 로그인 화면으로 보낸다. 다른 세션의 폐기는 무시한다.
- 선언에 `realtime` 채널이 있는 리소스는 목록과 상세가 그 채널을 구독하고 `ResourceRealtime`이 첫 이벤트부터 1초 고정 창으로 묶어 `router.refresh()`를 실행한다. 이후 이벤트로 예약을 미루지 않는다. 상세는 자신의 레코드 이벤트만 반영하며 숨은 탭은 갱신을 보류하고 다시 보일 때 한 번 갱신한다. 채널·레코드 변경과 unmount 때 이전 예약과 보류를 취소한다.
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
    include: ["author", "coverImage"],
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
| 글 | A2(골든) | `posts:manage` | 목록(검색·상태·작성자 필터, `createdAt`·`publishedAt`·`title` 정렬, 작성자·표지 이미지 include), 상세, 발행·발행 취소, 삭제, 실시간 `posts:all` |
| 사용자 | A3 | `users:read`, 수정은 `users:manage` | 목록(검색·상태·역할 필터), 상세, 수정(상태, 역할 다중 선택) |
| 역할 | A3 | `roles:read`, 쓰기는 `roles:manage` | 목록(검색), 상세, 생성·수정(이름, 선택 사항인 설명 textarea, 권한 선택기), 삭제. 시스템 역할은 삭제 버튼을 감추고 백엔드 거부도 번역한다 |
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
| `nextjs-admin` | A2 | 고정 설치, check, 목 E2E(운영 빌드 포함), 이미지 빌드 |
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
| A3 나머지 | 사용자·역할·권한·감사 로그, FastAPI E2E, create CLI, 문서 | admin 목 E2E 18개, PR CI(`nextjs-admin-e2e-fastapi`, `create-combo`, `create-standalone` 포함) |

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

### A2 프로토타입에서 확인한 결정 (2026-10-08)

| 항목 | 결정과 근거 |
| --- | --- |
| 1 선언 타입 | `src/lib/resources/contract.ts`가 `ApiPaths`의 단일 컬렉션 GET에서 JSON:API type·attributes·relationships·query와 쓰기 operation을 추출한다. `defineResource`는 type만으로 추론하고 `NoInfer`로 키 오류의 타입 확장을 막는다. `AnyResource`는 판별 union이다. 동적 경로 단언은 data.ts의 비공개 요청 경계에만 두고 실제 목 통합으로 확인한다. 현재 sort 생성 타입은 string이므로 선언 타입은 속성 키로 제한한다. 생성기는 `x-jsonapi-sort` 후보를 우선하며 속성 밖 후보는 제외한다. 음성 fixture의 `@ts-expect-error` 12개를 기존 types 단계가 컴파일하고 오류가 사라지면 TS2578로 실패한다. |
| 5 Base UI 부품 | 고정 shadcn 4.21.0·base-nova가 table·dialog·select·sheet·checkbox·badge를 제공했다. Task 3이 여섯 부품을 한 번에 더하고 CLI가 다시 쓴 기존 부품은 되돌렸다. Table은 native table, dialog·sheet는 Base UI Dialog, select의 다중 선택은 Select.Root multiple, checkbox는 Checkbox, badge는 useRender다. 기존 @base-ui/react 1.8.0·cn 0.4.0·lucide-react 1.49.0·class-variance-authority 0.7.1을 쓰며 의존성·잠금 변경은 없다. 새 부품은 원본에서 생성·번역 후 sync했고 고정 앱 import는 여덟 개를 유지했다. |
| 7 E2E 계정 | A2는 실제 목 API로 UUID별 일반 회원을 가입시키고 `/_test/mail`의 인증 링크로 인증한다. 시드 관리자는 API로 역할을 만들고 부여한다. 기본 관리 계정은 admin:access·posts:manage·users:read, 부분 관리 계정은 시나리오별 권한을 받는다. admin의 fixtures와 scripts/test/admin-fixture.ts에 두며 시드 계정은 브라우저 주체로 쓰지 않는다. A3의 FastAPI 가입·Mailpit 준비는 아직 구현하지 않았다. |
| 8 실시간 출처 | 목 기본값에 `http://localhost:3001`을 추가해 web 3000과 함께 허용한다. admin E2E는 3101, web E2E는 3100을 명시한다. FastAPI 기본값 변경과 admin FastAPI 실행기는 A3다. 글 목록·상세는 posts:all을 구독하고 첫 이벤트부터 1초의 고정 창으로 갱신을 묶는다. 상세는 자신의 레코드 이벤트만 반영하며 숨은 탭은 다시 보일 때 한 번 갱신한다. 채널·레코드 변경·unmount 때 예약과 보류를 취소한다. 성공한 subscribe ACK 뒤 다른 세션의 생성·수정이 목록·상세에 반영되는지 확인한다. |
| 9 로케일 쿠키 | NEXT_LOCALE을 유지한다. 운영은 서로 다른 host의 host-only 쿠키라 공유하지 않고 localhost에서는 같은 사용자의 계정 locale 동기화가 선택을 맞춘다. 이름을 바꿔 기존 web 동작을 바꾸지 않는다. 세션 쿠키는 별도로 app 이름에서 계산한다. |

### A3에서 확정한 결정

| 항목 | 결정과 근거 |
| --- | --- |
| 6 잠금 파일·계약 | 루트 contract 하나를 쓰고 프론트의 추적 경로·바이트·실행 권한을 비교한다. importer·package·snapshot·도구 문서의 같은 키와 workspace minimumReleaseAge·allowBuilds·overrides가 다르면 생성 전에 거절하고 TypeScript 6.0.3 해석을 보존한다. |
| 7 E2E 계정 | 시나리오마다 가입·메일 인증한 새 계정을 쓴다. 공유 registerTestAccount의 등록 옵션에만 선택 mailLink를 받으며 기본 목 조회·오류·locale·userAgent와 login 공개 인터페이스를 유지한다. 시드는 API 역할 준비만 맡는다. |
| 8 실시간 출처 | 개발 기본 Origin은 web 3000·admin 3001, E2E는 각 3100·3101이다. admin 전용 FastAPI 실행기는 새 프로젝트·볼륨·이미지만 소유하며 OAuth 준비를 요구하지 않는다. |
| 관계·폼 | 관계 대상·라벨·다중 여부는 계약 타입으로 제한한다. included로 현재값을 보충하고 관계 옵션 403은 그 입력만 막으며, enum의 표시 values와 입력 inputValues·loadValues를 분리한다. |
| 로그인 복귀 | 안전한 경로·쿼리·hash는 계정 언어로 보존한다. 반복 로케일·대문자·끝 슬래시·중첩 인코딩을 판정해 login·session/clear·외부·모호한 값은 홈으로 보내고 폐기 쿠키도 정리한다. |
| 사용자 | users:read와 users:manage를 나누고 이름 없는 사용자는 번역한 사용자/User로 보인다. 상태 입력은 active·deactivated, 표시·필터는 deleted도 포함하며 탈퇴 사용자 수정과 상위 권한 부여는 거절한다. |
| 역할·권한 | 권한은 attributes의 enum-many이며 관계와 분리한다. 선언 values는 API의 모든 권한 코드와 같아야 하고 읽기 전용 관리자의 생성·수정 직접 URL은 forbidden이다. 권한 그룹은 지원 브라우저에서 동작하는 로컬 Map 순회로 만든다. API 권한 코드가 늘면 roles 선언 values와 ko/en 문구를 함께 늘린다. 빠지면 types 단계가 실패한다. |
| Q3 역할 설명 | 사용자 계획 검토에서 선택 사항인 description(nullable, 최대 200자)을 생성·수정 textarea로 확정했다. |
| 감사 로그 | 읽기 전용 목록·상세와 행위자·행위·대상·기간 필터를 둔다. 끝 날짜는 설정 시간대 다음 날 0시를 배타적 상한으로 보내고 metadata는 키·값, targetId는 등록·보기 권한이 있는 상세만 링크한다. |
| 등록·초안 검토 | 등록 순서는 posts·users·roles·permissions·audit-logs다. 생성 초안의 권한·필드·관계·문구는 레시피대로 검토하고 골든은 posts, 폼 예시는 users·roles다. |
| 실행기·빌드 진단 | Darwin의 0 신호 EPERM만 기존 한도까지 회수를 기다리며 실제 종료 신호 오류는 보존한다. E2E 빌드는 close를 기다려 실패 stdout·stderr를 한 번만 출력한다. |
| CLI·하네스 | 단독 admin과 선택 프론트 목록에 맞춰 workspace·권한·hook·도구·워크플로를 만든다. 앱 발견 규칙은 유지하고 실제 settings.json entry 없음만 hook 없음으로 처리한다. |
| 조합 순서·이미지 | 생성 gen은 web→admin, runtime E2E는 api→admin→web이다. 각 gen은 api#gen에 의존하고 캐시하지 않는다. 이미지 셋의 빌드와 프론트 컨테이너 둘의 HTTP smoke는 저장소 create-combo CI가 확인한다. |
| Q2 단일 프론트 CI | 사용자 계획 검토에서 web만·admin만 조합은 생성·루트 Node 테스트·Turbo check dry-run으로 확정했다. setup·실제 백엔드 E2E·이미지·컨테이너는 전체 조합에서 확인한다. |
| Q1 공유 IP 예산 | 사용자 계획 검토에서 한계 문서만 이번 범위에 두고 BFF 클라이언트 주소 전달은 별도 보안 검토 작업으로 확정했다. |
| Q4 기존 web 진단 | 사용자 계획 검토에서 17 stderr 블록은 동일성 예외로 유지하고 정리는 별도 후속으로 확정했다. 별도 경고 제안 문서는 만들지 않는다. |

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

## 15. A2 구현 기록 (2026-10-08)

A1 머리에서 SDD 아홉 태스크와 리뷰 수정을 순서대로 구현했다. 독립 admin의 공통 사본은 덮어 놓기 대상에 등록하고 원본 수정 뒤 동기화로 맞췄다. A2 당시 제품 등록은 posts 하나였다.

| 태스크 | 구현 |
| --- | --- |
| 1 | overlay 대상별 managedFiles, 새 대상 충돌·삭제 보호, git 인덱스 원본 선택, 삭제 경로 출력, fix:shared |
| 2 | 독립 admin·포트 3001/4011/3101/4111, 공통 의존성 버전 검사, 목의 admin 출처, CI nextjs-admin, 앱 계약 여덟 개 |
| 3 | table·dialog·select·sheet·checkbox·badge, 닫기 번역과 팝업 DOM 검사, 기존 부품 복구·원본 동기화 |
| 4 | password grant와 admin:access, 보호 레이아웃·메뉴·언어·로그아웃·forbidden, 목 인증 E2E 5개 |
| 5 | 계약 타입 기반 defineResource·데이터 계층, 필드·쿼리·operation 음성 검사, 실제 목 CRUD |
| 6 | 범용 목록·상세·필터·페이지·표시, 관계 옵션·권한·기간 날짜, resource-messages로 admin check 10단계 |
| 7 | 범용 생성·수정 폼, 필드 오류·삭제·동작, 최신 레코드 조건과 상태 충돌 |
| 8 | posts 골든·발행·발행 취소·삭제, 목록·상세 실시간, 인증·글·권한·언어 목 E2E 11개 |
| 9 | 계약 기반 리소스 생성기, 실제 계약의 초안 다섯 개 strict 컴파일·문구 검사, 레시피 셋과 add-resource skill |

확인 범위는 루트 check 11단계, admin check 10단계·build·실제 목 Chromium E2E 11개다. 공유 변경 태스크는 web check 9단계·build·목 E2E 20개도 확인했다. 테스트 경고 검사는 전체 로그에서 stderr·Warning·ENVIRONMENT_FALLBACK이 0인지 확인한다. Docker·FastAPI E2E·이미지 빌드는 PR CI에서 확인하며 로컬 개발 fastapi·joon은 사용하지 않았다.

계획이 바꾼 결정은 다음과 같다.

- 검색 가능한 관계 옵션은 첫 페이지 20개와 대상 검색을 쓰고 검색 없는 대상만 끝까지 읽는다.
- 관계 링크는 등록한 상세 화면과 보기 권한이 있는 대상에만 보인다.
- 잘못된 URL 필터를 포함한 목록 4xx는 그 자리의 번역 안내다.
- 권한이 있으나 최신 상태가 조건과 다르면 409 resource.conflict로 알린다.
- 글 목록·상세는 작성자·표지 이미지를 include하고 표지 이미지 파일 이름은 상세에서만 보인다.

SDD 리뷰에서 바꾼 내용은 다음과 같다.

- 사본 없는 공유 import 오류 메시지는 git add를 안내한다.
- 새 공유 원본 순서: `git add` → `pnpm sync` → `pnpm fix:shared <파일...>` → `pnpm sync`.
- 목 문서는 템플릿 밖 저장소 경로를 포함하지 않는다.
- 필터 파라미터가 없는 목록의 `list.filters` 타입: `never`.
- 필터 막대는 URL 쿼리·갱신 옵션을 따르며 시작한 관계 검색은 새로고침에도 유지한다.
- 오래된 수정 화면은 같은 화면에서 409 `resource.conflict` 오류를 보인다.
- 알 수 없는 저장 모드는 권한 검사 전에 거절한다.
- 실시간 갱신은 1초 고정 창이며 상세는 자기 레코드만, 숨은 탭은 복귀 때 한 번 갱신한다.
- 로그인 뒤 복귀 경로 보존은 A3로 남긴다. 쿼리 키: `returnTo`.
- 실시간 provider의 key는 세션 id를 유지한다. 컴포넌트: `RealtimeProvider`.
- 최종 수정 묶음(Ruling 20): 옵션 밖 URL 관계 값은 `included` 라벨 또는 id로 보충해 검색 뒤에도 보존한다. 폼과 같은 보충 helper를 쓴다. 동작 UI는 안정 키로 묶고 관계 검색은 Enter도 받으며 URL에서 API용 `include`를 뺀다. 골든 오류 문구·직접 호출 충돌 검사, 활성 린트 테스트만 임시 폴더 생성, `Permission` 내보내기를 고정했다. 목 적합성 흐름·admin 스택·생성기 include·E2E 문서와 A2 구현 계획의 우선순위 안내도 맞췄다.

Base UI 팝업의 열림은 findByRole, 닫힘은 waitFor로 기다린다. 번역 테스트는 intlFixture로 환경 스키마의 TIME_ZONE을 고정한다. Next 스트리밍 404는 응답 시작 뒤 HTTP 200일 수 있어 화면과 head의 noindex를 함께 확인했다. 빠른 메뉴 이동에서 Next의 `The destination stream closed early` 진단을 관찰했으며 UI/API assertion 통과와 별도로 기록했다. 원인은 확정하지 않았다.

A2는 PR CI의 아홉 작업과 검토·main 병합을 완료했다. 사용자·역할·권한·감사 로그의 제품 등록, admin FastAPI E2E와 가입·Mailpit 준비, create CLI의 admin 지원과 실제 SDD 보완은 A3 구현 기록(§16)에 정리한다.

## 16. A3 구현 기록 (2026-10-11)

사용자가 승인한 열두 태스크를 SDD로 구현하고 실제 검증·리뷰에서 확인한 보완을 반영했다. 이 기록의 Ruling1–21은 이번 SDD 결정이며 §15의 A2 결정 번호나 이전 참고 구현 번호와 별개다. Q1–Q4는 사용자 계획 검토에서 확정한 보충 결정(§12)이다.

| 태스크 | 구현 |
| --- | --- |
| 1 | 공유 Darwin process-tree의 0 신호 EPERM 회수 대기, 기존 종료 오류·한도 보존 |
| 2 | 루트 E2E execute의 소유 그룹 회수 대기와 같은 오류 객체 보존 |
| 3 | 계약 관계 대상·라벨·다중 타입, included 폼, 403 입력 처리, 검색형 다중 Combobox의 안정 행·키보드 대상과 IME 보호 |
| 4 | 안전한 로그인 복귀·permalink·쿠키 정리, 반복 언어 접두사 거절, 인증·오류 main |
| 5 | users 등록, 표시·입력 상태 분리, 역할 필터, 이름 없는 사용자와 최신 상태 검사 |
| 6 | roles·permissions 등록, enum-many·id·loadValues·설명 textarea, 권한별 직접 URL·values 동등성·로컬 Map 그룹 |
| 7 | audit-logs 등록, metadata·권한별 대상 링크, 시간대의 포함 종료 날짜 |
| 8 | admin FastAPI 전용 실행기·가입·Mailpit·시드, 실패 빌드 진단, 공유 등록 mailLink 보완 |
| 9 | 조합 루트 계약, 외부 계약 check·gen·hook·Turbo·이미지, 비정규 경로와 snapshot 오류 보완 |
| 10 | 단독 admin·목록 기반 실행기·하네스·CI, pnpm→poe 인자, 업로드 검사 동기화, 설정 없는 앱 hook 보완 |
| 11 | --admin 조합, 잠금·workspace·계약 보존, admin 이미지·CI, gen 순서·없는 앱 검증과 Windows fixture 모드 보완 |
| 12 | 실제 SDD 결정·확인 범위·이월 기록, 템플릿 안내, 60원본의 96제목과 sync 사본 정리 |

Task12까지의 로컬 확인 범위는 루트 check 11단계, web check 9단계(0 캐시)·build·실제 목 Chromium E2E 20개, admin check 10단계(0 캐시)·build·목 E2E 18개다. 당시 전체 Vitest는 web 105파일·929개, admin 89파일·801개 통과였다. Ruling20 최종 보완의 실제 합계는 아래에 구분한다. gen-feature의 중첩 96개 요약은 최상위 합계와 구분한다. Docker·FastAPI 인프라·조합 루트 setup/check/E2E·이미지·컨테이너는 PR CI에서 확인하며 로컬 개발 스택은 사용하지 않았다. 단독 admin setup/check와 실제 조합 frozen 생성·프론트 check/gen·Node 테스트는 앞 태스크에서 허용 범위로 확인했다.

web의 기존 stderr 17블록은 layout 2, login-form 1, password-reset-form 2, signup-form 3, profile-upload 2, upload 2, deletion-form 1, me/forms 2, posts/editor 1, sessions/components 1이다. 블록 안 React act 17·Base UI defaultValue 2·nativeButton 1은 겹친다. 파일·제목·진단·횟수가 기준선과 같고 제목 매핑은 `세션이 있으면 마우스로 이름과 로그아웃 메뉴를 연다` → `세션이 있으면 (마우스)로 이름과 로그아웃 메뉴를 연다` 하나다. admin 경고는 0이다. 경고를 숨기거나 제품 assertion을 완화하지 않았다.

계획의 Review Focus1–5는 권한 읽기 전용 직접 URL·선언/API values 동등성, 안전한 로그인 복귀·폐기 쿠키, .cache 조상·물리 임시 경로, 없는 프론트의 작업·하네스·CI 제거, 잠금/workspace 충돌 거절·양 순서 gen의 같은 출력으로 구체화했다.

두 프로세스 교정은 Darwin에서 종료된 소유 그룹의 0 신호 확인이 부모 회수 전 EPERM을 반환하는 통제 실험과 native fixture를 근거로 한다. 공유 helper는 15개, 루트 helper covering은 12개를 통과했다. 판단 불가를 성공으로 바꾸지 않고 기존 한도까지 기다려 성공한 0 신호에 기억 오류를 지우고 ESRCH에 종료한다. 실제 SIGTERM·SIGINT·SIGKILL 오류와 다른 플랫폼은 그대로이며 확인과 실제 신호 사이의 좁은 경쟁은 남는다. 원래 실패 당시 구성원을 확정했다고 주장하지 않는다. Rulings6–7의 물리 TMPDIR·tsx IPC 준비는 환경 교정이며 source/test 우회나 재시도 예외가 아니다. Task11의 원 PID99999 예측 75바이트와 코디네이터의 보수적 PID2147483647 예측 80바이트 증거는 구분하며 후자의 보고서 보완은 제품·gate 재실행이 아니다.

| 실제 SDD 결정 | 반영·확인 범위 |
| --- | --- |
| Ruling1 | 독립인 루트 프로세스 교정을 공유 교정보다 먼저 구현했다. 초기 zero EPERM root 실패를 보존하고 재시도·skip으로 숨기지 않았다. |
| Ruling2 | enum-many·id와 loadValues/inputValues/필터 관계를 typed 선언에 확장했다. §5.4 표 전면 개편과 범용 화면 교체는 범위 밖이다. |
| Ruling3 | 목 리소스 추가 절차만 계약·기존 posts를 기준으로 중립화했다. 나머지 FastAPI 비교 설명·assertion은 유지한다. |
| Ruling4 | 생성 workflow는 이미지 빌드까지, 저장소 create-combo가 실제 컨테이너 HTTP smoke를 소유한다. 실제 Docker 확인은 CI에 남는다. |
| Ruling5 | 생성 web→admin과 runtime api→admin→web을 고정했다. 실제 전체 조합의 web→admin→web gen 뒤 동일 계약·clean 상태를 확인했다. |
| Ruling6 | 검사 자식·hook에 물리 TMPDIR를 명시했다. /var·/private/var 불일치 원본 실패는 보존했고 제품 변경으로 우회하지 않았다. |
| Ruling7 | 긴 TMPDIR의 실측 120바이트 IPC 실패를 보존하고 물리 OS-temp의 100바이트 미만 예측·tsx 시작을 먼저 확인했다. |
| Ruling8 | Task2의 고정 종료 안내·한도 오류 문구는 구체적 요구대로 유지했다. 숫자 조사·다음 조치 문구는 최종 전체 검토의 T2-I1 leave 판정으로 별도 문구 정리에 남긴다. |
| Ruling9 | 공유 OS-temp의 소유 불명 fixture는 목록만 보존했다. 직접 만든 증거가 있는 경로만 정리하며 생성시각·snapshot만으로 삭제하지 않는다. |
| Ruling10 | 검색형 다중 선택만 공개 Combobox로 좁게 보완했다. 열린 같은 검색 결과의 행 순서·키보드 대상·선택 라벨과 비동기 포커스를 여덟 회귀로 확인했다. |
| Ruling11 | 같은 원 구현자를 새 문맥으로 재사용하고 단일 editor·기존 lifecycle 자원을 검토까지 유지했다. terminal 미지원 실패를 보존했으며 모델·계정·Run은 바꾸지 않았다. |
| Ruling12 | 반복 ko/en 접두사를 모두 제거한 판정에서 login·session/clear를 막았다. 실제 목 로그인 표 세 행과 기존 경로·쿼리·쿠키 회귀를 확인했다. |
| Ruling13 | 다중 Combobox의 조합 중 Enter·Space를 public composing-key guard로 보호했다. 기존 여덟 사례와 이벤트 회귀 넷, 합계 12개를 통과했으며 native OS IME 실행 증거는 아니다. |
| Ruling14 | Map.groupBy를 로컬 Map 순회로 바꾸고 absent-API 인접 회귀를 확인했다. 그룹·옵션 순서와 선택·제출을 유지했고 구형 브라우저 실제 실행은 증명하지 않았다. |
| Ruling15 | 등록에만 선택 mailLink를 추가하고 admin memberFixture를 공유 helper로 위임했다. 새 shared Scripts 실제 목 회귀와 두 sync 사본으로 focused web 50개·admin 75개, 전체 gate·목 E2E20/18을 확인했다. login 인터페이스·기본 목 오류·locale·userAgent는 유지한다. |
| Ruling16 | 추가 설정·외부 계약 snapshot 오류만 제한 처리했다. 두 앱 실제 hook subprocess RED 각 8 실패·43 통과 뒤 covering 각 6파일·93개, 전체 gate·목 E2E20/18을 확인했다. 엄격한 생성기·JSON·정상 키·무변경 캐시를 유지하며 다른 파일 읽기·해싱 오류는 숨기지 않는다. |
| Ruling17 | settings.json 실제 entry 없음만 hook을 생략한다. 새 dispatcher 19개·covering Node 66개·create 159개(7 skip)·실제 전체 생성 Node 66개·root11과 clean HEAD를 확인했다. invalid·unreadable·dangling settings와 실제 deny는 엄격하다. 프론트 gate 재실행은 없고 부모 .claude 링크/Windows 일반 파일 경계는 최종 전체 검토의 T10-RR1-M1 leave 판정으로 비정상 상태의 수용 경계로 남긴다. |
| Ruling18 | private admin-combo fixture에 core.filemode=false를 먼저 고정하고 원본 100755 인덱스 경로만 update-index로 보존했다. macOS RED4/5→GREEN9·create159(7 skip)·Node66·root11, 실제 Windows 고정 BASE4실패/5통과→FIX9통과를 확인했다. 기존 assertion·매개변수는 그대로며 프론트·Docker 재검증이나 Windows root/full/CI 증거가 아니다. |
| Ruling19 | Task12의 create 설계 결정 참조에 §2·만 더한 5바이트 보완이다. 일반 hook 한 커밋, 루트 check11 커밋 전·깨끗한 HEAD 뒤, sync19·빈 상태를 확인했고 프론트·제품·assertion은 바꾸지 않았다. |
| Ruling20 | 정식 전체 검토의 FW-I1과 FX1–FX6을 한 최종 보완으로 반영했다. 역할 전용 전수 타입 가드·음성 사례, 로그인 진입의 비문자열 정규화, 문서 교정, 기존 단언을 유지한 fixture·E2E 보강이다. 일반 리소스 타입·실행 값·순서·loadValues·changeLocaleAction·공유/web·계약·의존성·create 제품 코드·자산은 그대로다. |
| Ruling21 | fresh root-pre exit1·67.129초의 기존 web-e2e 첫 PID marker JSON 경쟁을 좁게 교정했다. 직접 소유 helper의 빈 최종 파일/완성 tmp→rename 제어 대조 exit0 뒤 첫 writer의 atomic 게시와 직접 소유 .tmp 정리만 바꿨다. focused3 exit0·fresh root11을 확인했으며 기존 제목·종료 assertion·poll·timeout·다른 두 시험·production helper는 그대로다. 자동 재시도 예외는 확장하지 않았다. |

Task1–12의 모든 이월 finding과 증거·운영 행은 아래 정식 전체 검토 처분으로 확정했다. Task11 Ruling18 보완은 범위 재리뷰에서 C0/I0로 수락됐으며 계약 차이 행의 rejected-path 문제는 FX5의 행별 경로 단언으로 해소했다. Task11 Windows 검증 헬퍼 실패 둘은 준비 guard와 정리 audit의 별도 실패로 원본을 보존하고 교정했으며 성공 focused suite와 섞지 않는다. 기존 제목·제품 assertion·fixture의 실행 권한은 유지했다.

A2에서 빠른 메뉴 이동 중 관찰한 `The destination stream closed early` 진단은 UI/API assertion과 별도로 기록하며 원인은 확정하지 않았다. 이번 SDD 최종 로컬 검사에서는 이 스트림 close 진단과 기존 types 단계 무출력 exit1을 재현하지 못했다. 영구 flake 예외로 바꾸지 않으며 기존 web 진단 정리와 BFF 클라이언트 주소 전달은 별도 후속이다.

최종 범위 재검토와 병합은 코디네이터 절차로 남는다. 정확한 PR HEAD와 main fast-forward 뒤 정확한 main HEAD에서 check·fastapi·nextjs·nextjs-admin·nextjs-e2e-fastapi·nextjs-admin-e2e-fastapi·conformance-fastapi·conformance-mock·create-combo·create-standalone 열 작업을 모두 확인해야 한다. 실제 FastAPI·Docker 또는 PR/main 성공은 아직 확인하지 않았으며 이 로컬 기록으로 대신하지 않는다. Windows는 Task11의 실제 focused9만 역사적 증거로 유지하며 전체 root·admin·web은 미검증이다.

### Ruling20·21 최종 보완의 실제 native 기록

| 보완 | 반영·검증 |
| --- | --- |
| FX1 / FW-I1 | 역할 전용 permission-catalog의 Permission 전수 가드와 resource-types 음성 사례다. 가드 전 tsc exit2·TS2578, 실제 역할 helper의 posts:manage 누락 tsc exit2·TS2322/never, 복원 뒤 types exit0·진단0을 확인했다. API 타입·생성물은 고치지 않았다. |
| FX2 / T4-M1 | loginAction 진입에서 비문자열 returnTo를 /로 정규화한다. 실제 목 ko/en 직접 호출 RED exit1·2실패/47통과(TypeError), GREEN은 계정 언어의 /·/en과 유효 세션·로케일 쿠키를 확인했다. 공개 타입과 FW-M3 changeLocaleAction은 그대로다. |
| FX3 | T3-M7 생성 취소, T5-M6 inputValues/edit.visible, T7-M1 삭제된 감사 대상 404 한계, T7-M2 서버 표시 override/client 자식 직렬화, T7-M4 E2E 비활성 대 통합 안내, T8-M5 API_BASE_URL 형식을 실제 코드와 대조해 문서만 고쳤다. read-only 전·후 proof는 exit0이다. |
| FX4 / FW-M1 | 단독 nextjs-admin 이름 허용, 생성 조합의 사본 범위, 실제 Ruling1–21·실측120바이트·정식 전체 처분·최종 합계·create 설계 참조를 기록했다. 무관한 설계 바이트는 유지했다. |
| FX5 | T11-RR1의 네 계약 거절 행이 정확한 경로를 단언한다. 최초 root lint exit1의 any matcher를 원본 보존·코디네이터 판정 뒤 Error.message 단언으로 교정했고 focused lint exit0·fresh root11을 확인했다. 기존 거절 정규식·fixture 모드·빈 폴더 단언은 유지했다. T6-RR1-M1/M2는 사전순과 다른 최초 그룹 순서 및 Map/Object.groupBy 부재·복원, T6-M1은 API 밖 선언값으로 loadValues 교집합을 고정한다. |
| FX6 | T5-M3은 비활성 옵션의 표시, T6-M4는 member 행의 표시를 먼저 기다리고 기존 부정 단언을 그대로 실행한다. 목 E2E18이 통과했다. |

첫 root-initial은 FX5 matcher의 no-unsafe-assignment로 exit1·67.487초(root10/11), 그 교정 뒤 root-pre는 scripts/test/web-e2e/process.test.ts의 Unexpected end of JSON input 한 건으로 exit1·67.129초(root10/11)였다. 두 원본 스트림·실패 source는 보존하고 각각 코디네이터 판정에 따라 typed Error.message와 Ruling21 marker 게시로 고쳤다. 단순 gate 재시도는 하지 않았다. 이번 보완은 focused Vitest 4파일·74개, types 진단0, 루트 check11 뒤 admin check10(0 캐시) → build exit0 → 목 Chromium E2E18 → 전체 verbose Vitest 89파일·804개를 순차 실행해 native exit0·warnings0을 확인했다. 실제 전체 두 출력 스트림을 보존했다. 공유·web diff가 비어 새 web 실행은 하지 않았고 위 105파일·929개·정확한 17블록은 이전 Task12 증거다. create 시험은 루트 check가 덮으며 새 조합 생성·Windows 전체 실행은 추가하지 않았다. 실제 합계를 기록한 이 문서 변경 뒤 커밋 전 루트 check11과 커밋한 깨끗한 HEAD의 루트 check11, sync19·빈 상태·지정8포트 확인을 완료 게이트로 적용한다.

### 최종 전체 검토의 전수 처분

정식 원본: `.superpowers/sdd/2026-10-11-admin-a3/final-review.md`, SHA256 `e377633b02b4a8b9b2863289474af0d4747f7cf9a56f10f19265d9b41a26b9bd`, `Triage of earlier findings`의 Task1–12·공통 증거·운영 모든 행이다. 아래 행은 Ruling20에서 각각의 이유·매핑을 수락한 최종 처분이며 표 안 경로·줄번호는 고정 리뷰 HEAD의 정의다. 해소(FX1–FX6)는 위 native 기록, leave/resolved/증거 수용은 해당 정식 행의 이유·후속을 따른다. 원문은 수정하지 않았다.


판정 기준:

- 해소(FX1–FX6): 이번 최종 보완으로 반영·검증했다. 이유·세부 매핑은 아래 고정 리뷰의 각 행과 위 FX 검증 기록을 따른다.
- leave: 이유와 후속을 남긴다.
- resolved: 이미 반영한 커밋을 적는다.

**Task 1** (fbbf7ad)

| ID | 판정 | 이유·매핑 |
| --- | --- | --- |
| T1-M1 `shared/nextjs/scripts/process-tree.test.ts:250` finally의 `console.info` | leave | verbose 감사에서만 보이는 진단 출력이며 경고 grep(17/0)에는 영향이 없다. 공유 원본을 바꾸면 web·admin 전체 gate를 다시 돌려야 해 비용 대비 이익이 작다. 후속에 assertion 메시지로 옮긴다 |
| T1-M2 같은 파일 `:208,243,246` 고정 800ms·100ms 여유(약 600ms) | leave | 계획이 정한 상수다. 2000ms 강제 대기와 묶여 단순히 늘릴 수 없다. macOS 부하에서만 드문 flake 위험이 있고 Linux CI는 이 assertion을 건너뛴다. 후속에 테스트가 해제를 정하는 프로토콜로 바꾼다 |
| 증거: focused exit·helper 미러 공백 | 수용 | 필수 root·프론트 전체 gate의 native exit는 확인됐다 |
| /var↔/private/var create 실패 이월 | resolved | Task 9 RF3(realpath 정규화)로 해소 |

**Task 2** (16001a8)

| ID | 판정 | 이유·매핑 |
| --- | --- | --- |
| T2-I1 [plan-mandated] 문구 규칙 충돌 | leave | Ruling 8에 동의한다. 저장소 내부 실행기의 기존 문구이며 기능 결함이 없다. 별도 문구 정리에서 다룬다 |
| 범위 밖: 기존 검사가 TMPDIR에 남긴 비 `aitpl-` 폴더 71개 | leave | A3 이전 테스트의 위생 문제다. A3가 더한 임시 폴더는 모두 `aitpl-` 접두사이고 정리된다(직접 확인). 후속에 기존 테스트의 정리를 감사한다 |
| 증거: 미러의 `.command.txt`·`.exit.txt` 일부 공백 | 수용 | primary가 원본을 확인했다 |

**Task 3** (30ce5bb, dfad4bc, 258fa45)

| ID | 판정 | 이유·매핑 |
| --- | --- | --- |
| T3-I1 [plan-mandated] 검색형 다중 선택 재배열 | resolved | Ruling 10, `search-multi-select.tsx`와 `select.test.tsx:47-198` |
| T3-M1 ListScreen·FormScreen의 403 처리 중복 | leave | 동작이 같고 양쪽 모두 테스트가 있다. 리팩터는 범위 밖이다 |
| T3-M2 순서·필터 빈 항목 assertion 없음 | resolved | `select.test.tsx:164-190`이 [전체,A,B]/[전체,B,A]를 고정한다 |
| T3-M3 생성기의 첫 속성·라벨 없음 분기 미검사 | leave | 초안은 사람이 검토하는 수기 파일이다. 후속 시험 |
| T3-M4 첫 페이지 밖 fixture 전제 미단언 | leave | 실제 생성이 지금 통과한다. 후속 시험 |
| T3-M5 override의 notice describedBy 누락 | leave | `error`를 받는 override(관계 옵션 403)가 지금은 없다 |
| T3-M6 `errors.map`의 `error` 가림 | leave | 표기 문제 |
| T3-M7 생성 폼 취소 문서 | 해소(FX3) | `docs/architecture.md:35`, `docs/recipes/add-resource.md:17`이 실제 동작(생성 폼 취소는 항상 목록)과 다르다 |
| T3-M8 `list.test.tsx` 중복 import | leave | 표기 문제 |
| T3-RR1-I1 IME 조합 중 Enter | resolved | Ruling 13(258fa45) |
| T3-RR1-M1 `role="textbox"`에 붙는 `aria-expanded` | leave | 고정 E2E의 textbox 질의를 지키려 승인한 절충이다. 접근 이름은 있다. 후속에 APG 정렬 |
| T3-RR1-M2 방향키로 가리킨 항목의 Enter가 재검색 | leave | 문서화된 동작이며 Space로 토글한다. 후속에 APG 정렬 |
| T3-RR1 범위 밖: Select 경로 Enter IME 가드 | leave | term이 입력마다 갱신되어 결함이 아니다 |
| T3-RR1 증거: helper 원본 삭제 | 수용 | native exit와 원 로그로 확인됐다 |
| T3-RR2-M1 Space 행의 keyCode 13 | leave | 판정 경로(`isComposing`·`key`)와 RED 판별력이 같다 |
| T3-RR2 범위 밖: 진행 중 요청의 pending 차단 | leave | 느린 API에서만 Enter를 다시 눌러야 하는 UX 문제다. 후속 |
| A2 이월(최종 리뷰 M3, T5 M1, T7 M2·M5·M6, A2 Ruling 18, FR-M2·M3) | resolved | Task 3 Step 1의 테스트(enum 제출, `$name` 표, Enter 포커스 등)로 구현됐다. 원 정의는 미러되지 않았지만 브리프 대응으로 확인됐다 |

**Task 4** (1e40186, 6495b24)

| ID | 판정 | 이유·매핑 |
| --- | --- | --- |
| T4-I1 [plan-mandated] 반복 접두사 | resolved | Ruling 12, `redirect.ts:15`와 표 세 행 |
| T4-M1 비문자열 `returnTo`의 TypeError(쿠키 쓰기 뒤 500·세션 삭제) | 해소(FX2) | 공개 Action의 입력 검증 공백이다. 한 줄 정규화와 실제 목 표 한 행이면 된다. admin gate는 FX1로 어차피 돈다 |
| T4-RR1 범위 밖: 정상 반복 접두사 복귀의 남는 로케일 | leave | 조작한 링크에서만 생기며 안전 영향이 없다. 공유 코드라 web gate가 필요하다 |
| 증거: Windows·JS 브라우저 체인 미실행 | 수용 | proxy 실제 NextRequest 시험과 E2E가 있다. Windows는 아래 권고 |

**Task 5** (e2422a6)

| ID | 판정 | 이유·매핑 |
| --- | --- | --- |
| T5-M1 이름 없음 판정 중복 | leave | 결과가 같다. 리팩터 |
| T5-M2 화면별 선언 선택 중복 | leave | 결과가 같다. 리팩터 |
| T5-M3 [plan-mandated] `e2e/users.spec.ts:75` 부정 단언이 팝업 전에 끝남 | 해소(FX6) | 먼저 "비활성" 옵션의 표시를 기다린다. 완화가 아니라 강화다 |
| T5-M4 [plan-mandated] 통합 선택자의 범위 | leave | 상세 단언(:343)이 특정 레코드를 본다 |
| T5-M5 [plan-mandated] 이름 없는 사용자의 같은 라벨 | leave | 승인된 스펙 결정이다. 후속에 짧은 id 대체를 검토한다 |
| T5-M6 inputValues와 `edit.visible` 짝 안내 없음 | 해소(FX3) | `docs/recipes/add-resource.md:15`에 한 문장 |
| A2 이월 T6 M2, T7 M4(사용자), T7 RR-M1, T9 M4 | resolved | `task-5-carryin-review.md` 대응 표. 역할 삭제 403/409 부분은 Task 6의 `삭제 Action의 %s 거절` |
| 증거: Windows junction 분기 미실행 | 수용 | Windows 권고 참조 |

**Task 6** (8d2abfa, 1e0aa77)

| ID | 판정 | 이유·매핑 |
| --- | --- | --- |
| T6-I1 [plan-mandated] `Map.groupBy` | resolved | Ruling 14 |
| T6-M1 `loadValues` 연결을 판별하지 못하는 fixture | 해소(FX5) | `src/components/resource/form-screen.test.tsx:180`의 선언 values에 API에 없는 값을 하나 더한다. 제목·assertion은 그대로다. FW-I1이 이 교집합 경로를 다루므로 함께 고정한다 |
| T6-M2 여러 쪽 권한 읽기 미실행 | leave | 단순 루프이고 권한은 8개다. 후속 단위 시험 |
| T6-M3 / T7-M7 등록 import 위치·이름 | leave | 생성기가 import를 파일 맨 앞에 넣도록 설계됐다(`scripts/gen-resource/generate.ts:67`). index만 고치면 다음 생성에서 다시 생긴다. 후속은 생성기 개선 |
| T6-M4 [plan-mandated] `e2e/roles.spec.ts:73-74` 행 표시 없이 부정 단언 | 해소(FX6) | 먼저 member 행의 표시를 단언한다 |
| T6-M5 / T7-M8 / T8-M6 루트 AGENTS의 E2E 범주 | resolved | Task 12 고정 문장(`AGENTS.md:42`) |
| T6-RR1-M1 선택기 fixture의 그룹 순서가 사전순과 같음 | 해소(FX5) | 처음 본 순서가 사전순과 다른 사례를 하나 더한다. 기존 assertion은 그대로다 |
| T6-RR1-M2 `Object.groupBy`는 남아 있음 | 해소(FX5) | 같은 hook에서 함께 지우고 되돌린다 |
| T6-RR1 범위 밖: override의 `Label htmlFor`가 div를 가리킴 | leave | `aria-label`이 접근 이름을 준다. 후속 접근성 |
| 증거: 구형 브라우저 실제 실행 없음 | 수용 | 설치본 browserslist·polyfill 확인과 API 삭제 회귀가 있다 |

**Task 7** (38490e0)

| ID | 판정 | 이유·매핑 |
| --- | --- | --- |
| T7-M1 [plan-mandated] 삭제된 대상의 링크가 404 안내로 끝남 | 코드 leave, 문서 해소(FX3) | 완전한 해결은 행마다 존재 확인 요청이 필요하다. action 기준으로 막아도 이후 삭제된 대상은 남는다. `docs/architecture.md:59`·`docs/recipes/add-resource.md:23`에 한계를 적는다 |
| T7-M2 `DisplayProps`의 함수 prop | 해소(FX3) | `docs/recipes/add-field-kind.md:5`에 "표시 override는 서버 컴포넌트, 상호작용은 직렬화 가능한 props의 client 자식"을 적는다 |
| T7-M3 `…To]` 끝 판정 중복 | leave | `docs/conventions/jsonapi.md:62`의 기간 필터 반열린 규약과 같다. 중복은 작다 |
| T7-M4 `e2e/AGENTS.md:9`의 403 안내 서술 | 해소(FX3) | E2E는 비활성만 보고 안내 문구는 통합 테스트가 본다고 고친다 |
| T7-M5 metadata·target 분기 직접 시험 없음 | leave | 후속 시험 |
| T7-M6 타입 중복·옵셔널 호출 | leave | 표기 |
| A2 이월 T6M3 ISO 날짜 역변환 | resolved | `filterCalendarDate`와 `date.test.ts` |

**Task 8** (6d51274, 4856847)

| ID | 판정 | 이유·매핑 |
| --- | --- | --- |
| T8-I1 [plan-mandated] 가입 흐름 복사 | resolved | Ruling 15 |
| T8-M1 `--keep` 안내의 실행 ID 변수 미검사 | leave | 실제 문자열 변경은 한 줄이며 CI에서 정리 경로가 돈다. 후속 시험 |
| T8-M2 거절 사례의 왕복 기준 단언 없음 | leave | RED에서 왕복 문서가 통과함이 간접 확인됐다. 후속 |
| T8-M3 `e2e-build.test.ts` 한 번·신호 미단언 | leave | 공유 원본이다(web gate 필요). 후속 |
| T8-M4 [plan-mandated] 앱 설정의 두 기준 | leave | 세 번째 앱이 생길 때 `STACKS`의 명시 속성으로 정리한다 |
| T8-M5 [plan-mandated] `API_BASE_URL` 경로 가정 | 해소(FX3) | `e2e/AGENTS.md:5`에 "`<Origin>/api/v1`이어야 한다"를 적는다 |
| T8-RR1-M1 login 타입 고정의 위치 | leave | 공유 원본이며 동작 영향이 없다 |
| 증거: FastAPI·Mailpit callback 경로 | CI 대기 | `nextjs-admin-e2e-fastapi` |

**Task 9** (b8133e2, 5334547)

| ID | 판정 | 이유·매핑 |
| --- | --- | --- |
| T9-I1 snapshot 예외로 Stop gate가 열림 | resolved | Ruling 16 |
| T9-M1 PostToolUse의 contract 비포맷 사례 없음 | leave | `staged-format.mjs`의 `rootFiles`가 거른다. 후속 시험 |
| T9-M2 새 필수 devDependencies 누락 경로 미검사 | leave | 후속 시험 |
| T9-M3 조합 README의 support 문장 위치 | leave | 생성 자산 문서의 위치 문제다 |
| T9-M4 `create/README.md:39` 저장소 사본 오해 | 해소(FX4) | "생성한 조합에서는"으로 범위를 밝히거나 지운다 |
| T9-RR1-M1 `common.mjs:42` 주석 | leave | 공유 원본이며 동작 영향이 없다 |
| 남는 한계: 실패 시 앱 파일 snapshot만 유지 | 수용 | Ruling 16 경계이며 BASE보다 나쁘지 않다 |
| 증거: stdin 사본 여섯 개는 transcript 전용 | 수용 | 실행 원본과 구분해 기록됐다 |

**Task 10** (f27d345, 3b77eaa)

| ID | 판정 | 이유·매핑 |
| --- | --- | --- |
| T10-I1 [plan-mandated] 설정 없는 앱이 루트 세션을 막음 | resolved(dispatcher) | Ruling 17. setup·E2E의 발견 규칙은 조합 `AGENTS.md:36`에 문서화된 계획 규칙이라 leave |
| T10-M1 `e2eOrigin`의 읽기·파싱 오류 문구 | leave | 생성 자산을 바꾸면 실제 조합 재확인이 필요하다. 후속 |
| T10-M2 잠금 실패 문구의 "web" 고정 | 부분 resolved | Task 11의 병합·보존 문구에 앱 이름이 들어갔다. 남은 부분은 T11-M4로 leave |
| T10-M3 `frontend-config.ts:12` 정규식 | leave | 현재 자산 CI에 해당 단계가 없는 잠재 문제다 |
| T10-M4 / T11-M1 `%j` 행이 첫 값만 보임 | leave | CI 진단성 문제. 후속 |
| T10-M5 실패 경로 넷 미검사 | leave | 후속 시험 |
| T10-M6 그래프 증거의 전역 turbo | 수용 | 버전이 같아 결론이 유지된다 |
| T10-RR1-M1 부모 `.claude` 끊어진 링크·Windows 일반 파일 | leave | 비정상 상태에서만 생긴다. settings.json 삭제와 같은 수준의 이미 수용한 경계다 |

**Task 11** (c6f9770, 0194970)

| ID | 판정 | 이유·매핑 |
| --- | --- | --- |
| T11-I1 [plan-mandated] Windows fixture 실행 권한 | resolved | Ruling 18 |
| T11-M2 생성 문서에 선택하지 않은 프론트 문장이 남음 | leave | 정보성 문장이며 RF4 대상(작업·필터·CI·권한·hook·도구)은 모두 지워진다 |
| T11-M3 [plan-mandated] dockerignore 시험이 web 경로만 봄 | leave | 두 파일이 바이트 동일하다 |
| T11-M4 [plan-mandated] 잠금 오류에 앱 이름 없음 | leave | 후속 문구 |
| T11-M5 RF4 lefthook·도움말 원문 시험 | leave | 생성물 lefthook은 web job이 생길 경로가 없다(`mergeLefthook`). 후속 |
| T11-RR1 계약 차이 행의 정규식이 거절 경로를 고정하지 않음 | 해소(FX5) | `create/test/admin-combo.test.ts:140`이 행마다 기대 경로(`contract/typespec/main.tsp`, `contract/extra.txt`)를 단언하게 한다. 같은 fixture 회귀(I1 부류)를 직접 잡는다 |
| 증거: Windows focused 9와 helper 실패 둘 | 수용 | 전체 Windows 증거가 아님을 기록했다 |

**Task 12** (592e0cd, 2552594)

| ID | 판정 | 이유·매핑 |
| --- | --- | --- |
| T12-M1 설계 스펙의 SDD 운영 기록 | 부분 해소(FX4) | 사실 오류와 낡는 문장만 고친다. 운영 Ruling 행 삭제는 코디네이터 지시라 요구하지 않는다 |
| T12-M2 §2 참조 누락 | resolved | Ruling 19 |
| T12-M3 [plan-mandated] `%[sjd]` 밖 자리표시자(`%i로`, `%i의`, `$nextKey는`) | leave | 계획의 고정 범위다. 후속에 규칙·검사를 확장한다 |
| T12-M4 루트 `AGENTS.md:59` 단독 admin 누락 | 해소(FX4) | 코드(`create/src/arguments.ts:111`)와 create README(`:7`)는 단독 nextjs-admin의 `fastapi`를 허용한다 |
| T12-M5 web 템플릿 문서의 W3·W4 | leave | A3 이전부터 있던 위반이다. web gate가 필요하므로 후속 정리 |
| T12-M6 표 열 폭 | leave | 렌더링 영향 없음 |
| 보고서 결함(`+` 잔존, format-cli-final) | 수용 | 보고서 표기 문제다 |

**공통 증거·운영**

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| Ruling 9의 소유 불명 TEMP 후보(32→55) | leave | Ruling 9에 동의한다. 직접 소유 증거 없이 지우지 않는다. 필요하면 사용자가 자기 Mac TMPDIR을 직접 정리한다 |
| 미러·provenance 한계(Task 3·7·9·10·11·12) | 수용 | 필수 gate의 native exit와 원 로그는 보존됐다. 코디네이터 보충 증명(e15bba60…)도 바이트 일치를 확인한다 |
| PR·main CI 열 작업 | 필수, 미완 | 원격 브랜치가 없다. 프로토타입·계획 CI는 SDD 증거가 아니다 |

FW-I1은 FX1로, FW-M1의 정확성 부분은 FX4로 해소했다. FW-M2(설명 null 왕복)는 범용 파서 변경이라 leave, FW-M3(기존 언어 Action)은 이전 범위라 leave, FW-M4(표시 열거값 전수 검사)는 데이터 손실이 없는 후속으로 leave다. Q1의 BFF 주소 전달과 Q4의 기존 web 진단 정리는 승인된 별도 후속이다. 정식 원본의 `계획이 정한 충돌`, `Ruling assessment`, `Declined to judge`, `Recommendations` 4–6의 각 행도 그대로 확정한다: 실행하지 않은 Docker/FastAPI·Linux·전체 Windows·실제 IME/구형 브라우저·flake 빈도는 미검증, unknown55와 기존 TEMP 위생·삭제 원본/전용 transcript의 provenance 경계는 수용, 나머지 범위 밖 동작·접근성·발견 규칙·문구와 CI는 명시한 후속/필수 미완 상태다.
