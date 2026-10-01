# Next.js web

Server Component가 읽고 Server Action이 쓰는 BFF 템플릿이다. Node 24와 pnpm 12.6.0을 쓴다.

## 명령

| 명령                             | 하는 일                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| `pnpm setup`                     | 고정 의존성 설치, 환경 파일의 없는 키 보충, 독립 저장소의 git hook 설치 |
| `pnpm dev`                       | web 개발 서버(3000). 목 동시 실행은 계약 사본을 더할 때 연결한다        |
| `pnpm check`                     | 포맷, 린트, 타입, 단위·통합 테스트, 생성물, 하네스                      |
| `pnpm check --fast -- <파일...>` | Stop hook용 빠른 검사와 관련 테스트                                     |
| `pnpm fix`                       | 포맷·자동 수정 가능한 린트                                              |
| `pnpm test`                      | Vitest 단위·통합 테스트                                                 |
| `pnpm test:e2e`                  | E2E 실행 지점. 현재 등록된 흐름 없음                                    |
| `pnpm gen`                       | 코드 생성 실행 지점. 현재 생성 대상 없음                                |
| `pnpm build`, `pnpm start`       | 운영 빌드, 운영 서버(3000)                                              |

## 구조

| 경로              | 내용                                                 |
| ----------------- | ---------------------------------------------------- |
| `src/app/`        | 페이지·레이아웃                                      |
| `src/features/`   | 기능별 구현과 공개 `index.ts`. posts는 W3에서 채운다 |
| `src/lib/`        | 설정, API·세션 등 공통 기반                          |
| `src/components/` | 공통 UI를 더할 자리                                  |
| `scripts/`        | check, setup, gen, 경계 린트, 외부 도구              |
| `.claude/hooks/`  | 편집·종료·위험 명령·세션 시작 hook                   |
| `e2e/`            | Playwright 흐름을 더할 자리                          |
| `docs/`           | 아키텍처, 버전 문서, 레시피                          |

## 핵심 규칙

- 작업 전에 설치 버전 문서를 읽는다. Next.js는 `node_modules/next/dist/docs`, 나머지는 [stack](docs/stack.md)에서 찾는다. 관리 지침 자동 삽입은 `agentRules: false`로 끈다.
- 브라우저가 백엔드 API를 직접 부르지 않는다. 읽기는 Server Component, 쓰기는 Server Action이다. 토큰을 클라이언트·URL·로그에 내보내지 않는다.
- `app`은 기능의 공개 `index.ts`, `lib`, `components`를 쓴다. 다른 기능의 내부 import는 금지한다.
- `lib/api`, `lib/session`, 기능의 `actions.ts`·`queries.ts`에는 `import "server-only"`를 둔다.
- 폼은 `<form action>`과 `useActionState`로 만든다. 백엔드가 검증의 원본이다.
- 로딩은 스피너나 스켈레톤만 쓴다. 로딩 문구는 쓰지 않는다. 스피너에는 화면 낭독기용 `aria-label`만 붙인다.
- i18n을 붙인 뒤 문구는 ko/en 카탈로그에 둔다. 날짜·시간은 `TIME_ZONE`을 쓴다.
- `.env`를 읽거나 출력하지 않는다. 키는 `.env.example`과 `src/lib/env.ts`에서 확인한다. 운영에는 예시 `SESSION_SECRET`을 쓸 수 없다.
- 환경 검증은 `next.config.ts`의 개발·운영 서버 phase에서 한다. 빌드에는 서버 비밀이 필요 없다. 잘못된 설정은 서버 시작 때 변수마다 한 줄을 알리고 종료한다.
- 의존성 버전은 정확히 고정한다. pnpm의 `minimumReleaseAge: 1440`을 유지한다.
- 생성물은 직접 고치지 않는다. 생성 원본을 고치고 `pnpm gen`한다.
- 소스 400줄, 테스트 600줄을 넘기지 않는다. 타입·린트 억제에는 같은 줄에 `사유: 설명`을 적는다.
- 템플릿 밖의 파일에 의존하지 않는다. 비밀 스캔 허용 목록은 계약 사본과 생성물로 제한한다.
- 커밋 메시지는 영문 Conventional Commits다. AI 태그와 트레일러, `--no-verify`는 쓰지 않는다.

## 완료 기준과 문서

`pnpm check`가 통과해야 끝난다. UI·런타임 변경은 `pnpm build`, 사용자 흐름은 E2E도 확인한다.
캐시를 무시하고 재검사하려면 `.cache/check.json`을 지운다. check의 성공 출력은 한 줄이며 실패한 단계만 상세 출력한다.

- [아키텍처](docs/architecture.md)
- [버전과 공식 문서](docs/stack.md)
- [페이지 추가](docs/recipes/add-page.md)
