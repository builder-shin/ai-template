# Next.js web

Server Component가 읽고 Server Action이 쓰는 BFF 템플릿이다. Node 24와 pnpm 12.6.0을 쓴다.

## 명령

| 명령                             | 하는 일                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm setup`                     | 고정 의존성·Chromium 설치, 환경 키 보충, 독립 저장소의 git hook 설치                  |
| `pnpm dev`                       | 단독 모드: 목(4010)과 web(3000), 백엔드 모드: web만 실행                              |
| `pnpm check`                     | 포맷, 린트, 타입, 단위·통합 테스트, 생성물, i18n, 계약, 하네스. setup의 Chromium 필요 |
| `pnpm check --fast -- <파일...>` | Stop hook용 빠른 검사와 관련 테스트                                                   |
| `pnpm fix`                       | 포맷·자동 수정 가능한 린트                                                            |
| `pnpm test`                      | Vitest 단위·통합 테스트                                                               |
| `pnpm test:e2e`                  | Playwright 인증·기능 E2E. 기본 목(4110) 또는 준비된 FastAPI와 운영 web(3100)          |
| `pnpm gen`                       | TypeSpec 계약·목 타입과 web 타입 생성. web은 선택한 `gen.config.json` 스펙을 사용     |
| `pnpm gen:feature <이름>`        | 골든 posts와 화면·번역·테스트를 복사하고 보호 경로를 등록                             |
| `pnpm build`, `pnpm start`       | 운영 빌드, 운영 서버(3000)                                                            |

## 구조

| 경로                | 내용                                                  |
| ------------------- | ----------------------------------------------------- |
| `src/app/[locale]/` | ko/en 페이지·레이아웃                                 |
| `messages/`         | ko 기준 메시지 타입, ko/en 번역과 모든 계약 에러 코드 |
| `src/proxy.ts`      | 로케일 라우팅, 로그인 검사, 세션 갱신                 |
| `src/features/`     | auth·posts(골든)·me·sessions·files의 공개 `index.ts`  |
| `src/lib/`          | 설정, API·세션 등 공통 기반                           |
| `src/components/`   | 헤더·상태 UI, CLI로 추가한 Base UI 기반 `ui/`         |
| `scripts/`          | check, setup, gen, 경계 린트, 외부 도구               |
| `.claude/hooks/`    | 편집·종료·위험 명령·세션 시작 hook                    |
| `e2e/`              | Playwright 인증·기능 흐름과 메일·재인증·소셜 어댑터   |
| `docs/`             | 아키텍처, 버전 문서, 레시피                           |

## 핵심 규칙

- 작업 전에 설치 버전 문서를 읽는다. Next.js는 `node_modules/next/dist/docs`, 나머지는 [stack](docs/stack.md)에서 찾는다. 관리 지침 자동 삽입은 `agentRules: false`로 끈다.
- 브라우저가 백엔드 API를 직접 부르지 않는다. 읽기는 Server Component, 쓰기는 Server Action이다. 토큰을 클라이언트·URL·로그에 내보내지 않는다.
- `app`은 기능의 공개 `index.ts`, `lib`, `components`를 쓴다. 다른 기능의 내부 import는 금지한다.
- 제품 코드는 `src/lib/testing`·`scripts/test`를 import·재수출하지 않는다. 공통 테스트 계정·목 실행기는 [HTTP 통합과 E2E](docs/architecture.md#http-통합과-e2e)를 따른다.
- `lib/api`, `lib/session`, 기능의 `actions.ts`·`queries.ts`에는 `import "server-only"`를 둔다.
- 갱신은 proxy에서만 한다. 화면·Action은 `createSessionApiClient`로 요청의 토큰을 읽고, 401은 `redirectOnUnauthorized`로 쿠키 정리 route에 보낸다. `/me`·`/my-posts`는 로그인 경로다.
- `/session/clear`는 `APP_URL`과 같은 Origin을 요구하며 이동 GET에 Origin이 없으면 `Sec-Fetch-Site: same-origin`을 확인한다. cross-site·확인할 수 없는 요청은 403이며 쿠키를 쓰지 않는다.
- 폼은 `<form action>`과 `useActionState`로 만든다. 백엔드가 검증의 원본이다. 제출 버튼은 `useFormStatus`로 막는다. 인증 폼은 로케일별 permalink로 JS 없이도 제출한다.
- 공개 글은 `/posts`·`/posts/[id]`, 내 글은 `/my-posts`·`/my-posts/new`·수정·삭제 확인 화면이다. Markdown은 raw HTML 없이 렌더링한다. 일반 입력·상태 변경·확인 폼은 JS 없이 제출되며 파일 업로드·미리보기 탭은 JS가 필요하다.
- 내 정보 링크는 사용자 메뉴 항목에 둔다. 내 정보·아바타·비밀번호는 `/me`, 세션은 `/me/sessions`, 탈퇴는 `/me/delete`다. 비밀번호 변경은 현재 세션을 유지한다. 탈퇴 재인증은 다시 로그인한 뒤 확인 화면으로 돌아오며 자동 탈퇴하지 않는다.
- 소셜 로그인은 `/oauth/[provider]/start`와 `/oauth/callback`을 쓴다. 콜백은 암호화한 10분 시도 쿠키와 PKCE로 검증한다. 요청에 provider가 있으면 쿠키와 비교하며 계정 언어로 쿠키·URL을 맞춘다. 세션 발급·실패 정리는 [소셜 로그인](docs/architecture.md#소셜-로그인)을 따른다.
- 브라우저의 직접 연결은 Socket.IO와 presigned PUT이다. 실시간 `session.revoked`는 Server Action의 `GET /me`가 401일 때만 로그아웃하며 성공·연결 오류·5xx에는 현재 세션을 유지한다. `post.*`와 `me.updated`는 서버 화면을 갱신한다. 세션 식별·인증 시도는 [실시간](docs/architecture.md#실시간)을 따른다.
- `pnpm gen:feature <복수형 이름> [--singular <끝 단어의 단수형>]`은 화면·ko/en·테스트·로그인 보호를 등록한다. posts 계약을 보존한 초안이며 출력한 고칠 곳에 맞춰 계약·권한·문구·진입 링크를 채운다. [기능 추가](docs/recipes/add-feature.md)를 따른다.
- 가입은 `/signup`에서 메일 안내·재발송 화면으로 전환한다. 메일 링크 `/verify-email?token=…`는 쿠키·언어 헤더로 로케일을 고르고 확인 버튼의 Action만 토큰을 소비한다.
- `/forgot-password`는 계정 존재 여부와 관계없이 같은 메일 안내를 보여 준다. 메일 링크 `/reset-password?token=…`에서 새 비밀번호를 제출하면 성공·로그인 링크를 표시하고 폐기된 세션 쿠키를 지운다.
- 로그인은 `/me`의 계정 로케일로 `NEXT_LOCALE`과 이동 URL을 맞춘다. 보호 검사와 `returnTo`는 next-intl처럼 경로를 한 번만 디코딩하며 점 구간도 제거한다. 보호 검사의 디코딩·정규화 오류는 보호 경로로 취급한다. 정규화한 목적지에서 로케일 접두사를 제거·재검증한 뒤 계정 로케일을 붙인다. matcher는 점이 있는 보호 하위 경로도 포함하며 공개 정적 파일은 이름으로 제외한다. 로그아웃은 API 실패여도 쿠키를 지우고 현재 로케일 홈으로 간다.
- 로딩은 스피너나 스켈레톤만 쓴다. 로딩 문구는 쓰지 않는다. 스피너에는 화면 낭독기용 `aria-label`만 붙인다.
- 하네스는 TSX의 문자열·템플릿 문구와 카탈로그의 로딩 문구를 막는다. URL 속성과 객체 속성 이름은 문구가 아니다. 접근성 예외는 `aria-label`과 카탈로그의 `accessibility.spinner`뿐이며 스피너 이름에만 쓴다.
- 기본 UI 부품은 `pnpm exec shadcn add <부품>`으로만 추가한다. 공식 `.claude/skills/shadcn/`의 latest 명령은 설치된 고정 CLI로 바꿔 실행한다. 다크 모드는 시스템만 따른다.
- 문구는 ko/en 카탈로그에 둔다. ko는 `/`, en은 `/en`이며 선택은 `NEXT_LOCALE`, 첫 방문은 `Accept-Language`를 따른다. 메시지 타입은 ko에서 파생한다.
- 에러 번역은 `errors` namespace에 코드와 `meta.params`를 전달한다. 서버·클라이언트의 `getFormatter`/`useFormatter`는 요청 설정과 provider의 같은 `TIME_ZONE`을 쓴다.
- 루트 레이아웃의 `/me` 실패도 `global-error.tsx`가 번역한 복구 화면과 trace를 보여 준다. 전역 오류 화면은 자체 html·body·스타일·번역 provider를 갖춘다.
- `.env`를 읽거나 출력하지 않는다. 키는 `.env.example`과 `src/lib/env.ts`에서 확인한다. 운영에는 예시 `SESSION_SECRET`을 쓸 수 없다.
- `pnpm setup`은 의존성 → 환경 키 보충 → 독립 저장소 hook → Chromium 순서다. 브라우저 설치가 실패해도 앞의 준비를 보존하고 실패 코드로 끝난다. 다시 실행하면 기존 환경 값을 유지한다.
- 환경 검증은 `src/lib/env/startup.ts`의 `exitOnInvalidEnv`가 같은 `src/lib/env.ts` 스키마로 한다. `next.config.ts`의 개발·운영 서버 phase와 `src/instrumentation.ts`의 Node 런타임이 호출하며 운영 빌드에서는 호출하지 않는다. 빌드에는 서버 비밀이 필요 없다. 잘못된 설정·운영 예시 비밀은 값·스택 없이 변수별 안내를 쓰고 종료 코드 1로 멈춘다. Next의 Ready 배너가 먼저 나올 수 있지만 요청은 처리하지 않는다.
- 단독 [Docker 이미지](docs/architecture.md#docker-이미지)는 Node 24.19.0 slim·pnpm 12.6.0으로 `NEXT_OUTPUT=standalone`을 설정해 빌드하고 `node server.js`로 시작한다. 조합은 생성기가 넣은 Dockerfile로 workspace 서버를 실행하며 조합 프로젝트의 지침을 따른다. 일반 `pnpm build`·`pnpm start`와 E2E는 이 변수 없이 일반 빌드·`next start`를 쓴다. UID/GID 10001로 실행하며 API·실시간 URL과 비밀은 실행 때 전달한다. standalone도 instrumentation의 `exitOnInvalidEnv` 호출로 시작 설정을 검사한다.
- 의존성 버전은 정확히 고정한다. pnpm의 `minimumReleaseAge: 1440`을 유지한다.
- `.claude/skills/add-*/`는 아래 레시피의 얇은 포장이다. 절차가 다르면 레시피를 따른다.
- 공식 `next-dev-loop`·shadcn·Playwright CLI skill의 [고정 출처](docs/stack.md#공식-skill)는 check의 harness가 오프라인 검사한다. 캐시 키에 설치 패키지 버전·설치 skill 해시도 포함한다. 전용 열거기가 공식 사본·설치 원본 skill 폴더의 예상 밖 항목(숨김 파일·빈 폴더·링크 포함)을 모두 거절한다. 전체 check는 기존 9단계다. 사본은 직접 고치지 않고 `pnpm skills:sync`으로 복원한다. shadcn의 latest 예시는 `pnpm exec shadcn`, Playwright CLI는 `pnpm exec playwright-cli`로 실행한다. 세션의 브라우저 도구 규칙이 우선한다.
- 생성물은 직접 고치지 않는다. 생성 원본을 고치고 `pnpm gen`한다.
- 첫 줄의 직접 수정 금지 헤더는 web 생성물에 적용한다. `contract/` 사본은 원본 헤더를 보존하고 패키지 검사로 최신 여부를 확인한다.
- 계약 변경은 [계약 확장](docs/recipes/change-contract.md)의 순서로 TypeSpec·목 수기 소스를 고치고 `pnpm gen`한다.
- Claude Edit·Write 차단은 생성물 경로에만 적용한다. TypeSpec·목 수기 소스는 편집할 수 있다.
- `pnpm dev`는 Next 환경 로더 뒤 `API_BASE_URL`이 HTTP loopback(localhost·127.0.0.1·[::1])의 4010 `/api/v1`이면 같은 loopback에 목도 시작한다. 그 밖의 주소는 web만 시작한다. Ctrl+C로 두 서버를 함께 내린다.
- dev·HTTP 통합·E2E는 `scripts/process-tree.mjs`로 직접 node를 시작하고 종료한다. 런처 종료 뒤에도 POSIX 그룹을 정리하며, 종료를 기다린 뒤 한도를 넘으면 강제 종료한다. tsx는 CLI 대신 `node --import` 로더로 쓴다.
- E2E는 기본 `E2E_TARGET=mock`이다. mock만 목 4110을 검사·기동하고 readiness를 기다린다. `E2E_TARGET=fastapi`는 [E2E 설정](e2e/AGENTS.md)의 외부 API `/health/ready`를 기다린다. 두 대상 모두 web 3100을 검사하고 운영 빌드 → `next start`를 실행하며 매번 새 세션 비밀을 전달한다. 기존 서버는 재사용하지 않는다. fastapi의 API·Socket.IO·Mailpit·OAuth·APP URL에는 `?`·`#`를 하나도 허용하지 않는다. 최근 로그인 창도 명시하며 외부 스택은 호출자가 준비·정리한다. [환경 행렬](docs/architecture.md#환경-행렬)을 따른다.
- 목과 FastAPI의 `RECENT_LOGIN_SECONDS` 기본값은 600초다. 탈퇴 통합 검사는 별도 목의 2초, 양쪽 E2E는 10초 창을 쓴다. FastAPI 어댑터의 `E2E_RECENT_LOGIN_SECONDS`는 백엔드 설정과 같아야 한다.
- 소스 400줄, 테스트 600줄을 넘기지 않는다. 타입·린트 억제(`@ts-nocheck` 포함)는 같은 억제 주석의 같은 줄에 `사유: 설명`을 적는다. `any`의 사유는 같은 줄의 뒤따르는 주석에 적는다. 파서가 구분한 실제 주석만 인정하며 문자열·템플릿 본문·연산자는 사유로 인정하지 않는다.
- 템플릿 밖의 파일에 의존하지 않는다. 비밀 스캔 허용 목록은 계약 사본과 생성물로 제한한다.
- 테스트·개발 예시의 가짜 비밀에는 같은 줄의 주석에 `betterleaks:allow 사유: 설명`을 적는다.
- 커밋 메시지는 영문 Conventional Commits다. AI 태그와 트레일러, `--no-verify`는 쓰지 않는다.
- 강제 push 권한은 명시적인 `-f`·`--force`·`--force-with-lease`만 막는다. 결합된 짧은 옵션은 hook이 검사하며 `--follow-tags` 같은 일반 긴 옵션은 허용한다.

## 완료 기준과 문서

`pnpm check`가 통과해야 끝난다. 헤더 오류의 브라우저 통합 검사를 위해 `pnpm setup`이 설치한 Chromium이 필요하며 없으면 설치 안내로 실패한다. UI·런타임 변경은 `pnpm build`, 사용자 흐름은 E2E도 확인한다.
캐시를 무시하고 재검사하려면 `.cache/check.json`을 지운다. check의 성공 출력은 한 줄이며 실패한 단계만 상세 출력한다.

- [아키텍처](docs/architecture.md)
- [버전과 공식 문서](docs/stack.md)
- [페이지 추가](docs/recipes/add-page.md)
- [기능 추가](docs/recipes/add-feature.md)
- [Server Action 추가](docs/recipes/add-action.md)
- [실시간 구독 추가](docs/recipes/add-realtime.md)
- [번역 추가](docs/recipes/add-translation.md)
- [계약 확장](docs/recipes/change-contract.md)
- [UI 부품 추가](docs/recipes/add-ui.md)
