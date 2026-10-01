# Next.js web

Server Component가 읽고 Server Action이 쓰는 BFF 템플릿이다. Node 24와 pnpm 12.6.0을 쓴다.

## 명령

| 명령                             | 하는 일                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| `pnpm setup`                     | 고정 의존성·Chromium 설치, 환경 키 보충, 독립 저장소의 git hook 설치 |
| `pnpm dev`                       | 단독 모드: 목(4010)과 web(3000), 백엔드 모드: web만 실행             |
| `pnpm check`                     | 포맷, 린트, 타입, 단위·통합 테스트, 생성물, i18n, 계약, 하네스       |
| `pnpm check --fast -- <파일...>` | Stop hook용 빠른 검사와 관련 테스트                                  |
| `pnpm fix`                       | 포맷·자동 수정 가능한 린트                                           |
| `pnpm test`                      | Vitest 단위·통합 테스트                                              |
| `pnpm test:e2e`                  | Playwright 인증 E2E. 목(4110)과 운영 web(3100)을 기동·종료           |
| `pnpm gen`                       | TypeSpec 계약, web API·실시간·에러 타입, 목 타입 생성                |
| `pnpm build`, `pnpm start`       | 운영 빌드, 운영 서버(3000)                                           |

## 구조

| 경로                | 내용                                                  |
| ------------------- | ----------------------------------------------------- |
| `src/app/[locale]/` | ko/en 페이지·레이아웃                                 |
| `messages/`         | ko 기준 메시지 타입, ko/en 번역과 모든 계약 에러 코드 |
| `src/proxy.ts`      | 로케일 라우팅, 로그인 검사, 세션 갱신                 |
| `src/features/`     | 기능별 구현과 공개 `index.ts`. posts는 W3에서 채운다  |
| `src/lib/`          | 설정, API·세션 등 공통 기반                           |
| `src/components/`   | 헤더·상태 UI, CLI로 추가한 Base UI 기반 `ui/`         |
| `scripts/`          | check, setup, gen, 경계 린트, 외부 도구               |
| `.claude/hooks/`    | 편집·종료·위험 명령·세션 시작 hook                    |
| `e2e/`              | Playwright 인증 흐름과 대상별 메일 어댑터             |
| `docs/`             | 아키텍처, 버전 문서, 레시피                           |

## 핵심 규칙

- 작업 전에 설치 버전 문서를 읽는다. Next.js는 `node_modules/next/dist/docs`, 나머지는 [stack](docs/stack.md)에서 찾는다. 관리 지침 자동 삽입은 `agentRules: false`로 끈다.
- 브라우저가 백엔드 API를 직접 부르지 않는다. 읽기는 Server Component, 쓰기는 Server Action이다. 토큰을 클라이언트·URL·로그에 내보내지 않는다.
- `app`은 기능의 공개 `index.ts`, `lib`, `components`를 쓴다. 다른 기능의 내부 import는 금지한다.
- `lib/api`, `lib/session`, 기능의 `actions.ts`·`queries.ts`에는 `import "server-only"`를 둔다.
- 갱신은 proxy에서만 한다. 화면·Action은 `createSessionApiClient`로 요청의 토큰을 읽고, 401은 `redirectOnUnauthorized`로 쿠키 정리 route에 보낸다. `/me`·`/my-posts`는 로그인 경로다.
- 폼은 `<form action>`과 `useActionState`로 만든다. 백엔드가 검증의 원본이다. 제출 버튼은 `useFormStatus`로 막는다. 인증 폼은 로케일별 permalink로 JS 없이도 제출한다.
- 가입은 `/signup`에서 메일 안내·재발송 화면으로 전환한다. 메일 링크 `/verify-email?token=…`는 쿠키·언어 헤더로 로케일을 고르고 확인 버튼의 Action만 토큰을 소비한다.
- `/forgot-password`는 계정 존재 여부와 관계없이 같은 메일 안내를 보여 준다. 메일 링크 `/reset-password?token=…`에서 새 비밀번호를 제출하면 성공·로그인 링크를 표시하고 폐기된 세션 쿠키를 지운다.
- 로그인은 `/me`의 계정 로케일로 `NEXT_LOCALE`과 이동 URL을 맞춘다. `returnTo`는 로케일 접두사 제거 뒤에도 검증한다. 로그아웃은 API 실패여도 쿠키를 지우고 현재 로케일 홈으로 간다.
- 로딩은 스피너나 스켈레톤만 쓴다. 로딩 문구는 쓰지 않는다. 스피너에는 화면 낭독기용 `aria-label`만 붙인다.
- 하네스는 TSX의 문자열·템플릿 문구와 카탈로그의 로딩 문구를 막는다. URL 속성과 객체 속성 이름은 문구가 아니다. 접근성 예외는 `aria-label`과 카탈로그의 `accessibility.spinner`뿐이며 스피너 이름에만 쓴다.
- 기본 UI 부품은 `pnpm exec shadcn add <부품>`으로만 추가한다. 공식 `.claude/skills/shadcn/`의 latest 명령은 설치된 고정 CLI로 바꿔 실행한다. 다크 모드는 시스템만 따른다.
- 문구는 ko/en 카탈로그에 둔다. ko는 `/`, en은 `/en`이며 선택은 `NEXT_LOCALE`, 첫 방문은 `Accept-Language`를 따른다. 메시지 타입은 ko에서 파생한다.
- 에러 번역은 `errors` namespace에 코드와 `meta.params`를 전달한다. 서버·클라이언트의 `getFormatter`/`useFormatter`는 요청 설정과 provider의 같은 `TIME_ZONE`을 쓴다.
- `.env`를 읽거나 출력하지 않는다. 키는 `.env.example`과 `src/lib/env.ts`에서 확인한다. 운영에는 예시 `SESSION_SECRET`을 쓸 수 없다.
- 환경 검증은 `next.config.ts`의 개발·운영 서버 phase에서 한다. 빌드에는 서버 비밀이 필요 없다. 잘못된 설정은 서버 시작 때 변수마다 한 줄을 알리고 종료한다.
- 의존성 버전은 정확히 고정한다. pnpm의 `minimumReleaseAge: 1440`을 유지한다.
- 생성물은 직접 고치지 않는다. 생성 원본을 고치고 `pnpm gen`한다.
- 첫 줄의 직접 수정 금지 헤더는 web 생성물에 적용한다. `contract/` 사본은 원본 헤더를 보존하고 패키지 검사로 최신 여부를 확인한다.
- 이 저장소의 `contract/`와 `docs/conventions/`는 sync 사본이다. 원본 수정 뒤 저장소 루트에서 `pnpm sync`한다. 독립 복사본에서는 TypeSpec을 확장하고 `pnpm gen`한다.
- Claude Edit·Write 차단은 생성물 경로에만 적용한다. 독립 복사본의 TypeSpec·목 수기 소스는 편집할 수 있다. 저장소 사본은 루트 `verify-templates`가 원본과 비교한다.
- `pnpm dev`는 Next 환경 로더 뒤 `API_BASE_URL`이 HTTP loopback(localhost·127.0.0.1·[::1])의 4010 `/api/v1`이면 목도 시작한다. 그 밖의 주소는 web만 시작한다. Ctrl+C로 두 서버를 함께 내린다.
- E2E는 기본 `E2E_TARGET=mock`이다. webServer가 목 → 운영 빌드 → start를 실행하고 매번 새 세션 비밀을 전달한다. 3100·4110은 비워 두며 기존 서버를 재사용하지 않는다. FastAPI 어댑터는 W4에서 구현한다.
- 소스 400줄, 테스트 600줄을 넘기지 않는다. 타입·린트 억제(`@ts-nocheck` 포함)는 같은 억제 주석의 같은 줄에 `사유: 설명`을 적는다. `any`의 사유는 같은 줄의 뒤따르는 주석에 적는다. 문자열과 연산자는 사유로 인정하지 않는다.
- 템플릿 밖의 파일에 의존하지 않는다. 비밀 스캔 허용 목록은 계약 사본과 생성물로 제한한다.
- 테스트·개발 예시의 가짜 비밀에는 같은 줄의 주석에 `betterleaks:allow 사유: 설명`을 적는다.
- 커밋 메시지는 영문 Conventional Commits다. AI 태그와 트레일러, `--no-verify`는 쓰지 않는다.

## 완료 기준과 문서

`pnpm check`가 통과해야 끝난다. UI·런타임 변경은 `pnpm build`, 사용자 흐름은 E2E도 확인한다.
캐시를 무시하고 재검사하려면 `.cache/check.json`을 지운다. check의 성공 출력은 한 줄이며 실패한 단계만 상세 출력한다.

- [아키텍처](docs/architecture.md)
- [버전과 공식 문서](docs/stack.md)
- [페이지 추가](docs/recipes/add-page.md)
