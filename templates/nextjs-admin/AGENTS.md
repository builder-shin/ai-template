# Next.js admin

Server Component가 읽고 Server Action이 쓰는 관리 BFF다. Node 24와 pnpm 12.6.0을 쓴다.

## 명령

| 명령                             | 하는 일                                                             |
| -------------------------------- | ------------------------------------------------------------------- |
| `pnpm setup`                     | 고정 설치·환경 키 보충·독립 git hook·Chromium 준비                  |
| `pnpm dev`                       | 단독 admin(3001)·목(4011), 백엔드 모드는 admin만 실행               |
| `pnpm check`                     | 포맷·린트·타입·단위·통합·생성물·리소스 문구·i18n·계약·하네스 10단계 |
| `pnpm check --fast -- <파일...>` | Stop hook의 빠른 검사                                               |
| `pnpm fix`                       | 포맷·자동 수정 가능한 린트                                          |
| `pnpm test`                      | Vitest 단위·실제 목 통합 검사                                       |
| `pnpm test:e2e`                  | 목(4111)과 운영 admin(3101)의 Chromium E2E                          |
| `pnpm gen`                       | TypeSpec·목·API·에러·실시간 타입 생성                               |
| `pnpm gen:resource <type>`       | 계약에서 리소스 선언·ko/en 문구·등록 초안 생성                      |
| `pnpm build`, `pnpm start`       | 운영 빌드·서버(3001)                                                |

## 구조

| 경로                | 내용                                                     |
| ------------------- | -------------------------------------------------------- |
| `src/app/[locale]/` | login·forbidden과 `(admin)`의 보호 레이아웃              |
| `src/lib/admin/`    | 비밀번호 로그인·권한 판정·로그아웃·계정 언어             |
| `src/lib/`          | API·세션·실시간·i18n·환경 스키마                         |
| `src/components/`   | 레이아웃·폼·상태·Base UI 부품                            |
| `src/resources/`    | 관리 리소스, 글 골든 위치 `posts/`                       |
| `messages/`         | 앱 문구(ko/en), `messages/shared/`의 공통 문구·에러 번역 |
| `contract/`         | 독립 TypeSpec·목·OpenAPI                                 |
| `scripts/`, `e2e/`  | 하네스·생성·테스트 실행기와 브라우저 흐름                |
| `.claude/`, `docs/` | hook·공식 skill·버전 문서·레시피                         |

## 규칙

- 먼저 [설치 버전 문서](docs/stack.md)를 읽는다. Next.js 문서는 `node_modules/next/dist/docs`다. `agentRules: false`를 유지한다.
- 브라우저는 백엔드 API를 직접 부르지 않는다. 토큰은 서버의 암호화 쿠키에만 둔다. 개발 `admin-session`, 운영 `__Host-admin-session`이다.
- 로그인은 password grant다. `/me`의 `meta.permissions`에 `admin:access`가 없으면 발급한 세션을 끝내고 쿠키를 쓰지 않는다.
- `/login` 외의 모든 화면은 로그인이 필요하다. `(admin)` 레이아웃은 요청마다 권한을 확인한다. 권한 상실은 `/forbidden`, 401은 쿠키 정리 뒤 로그인으로 보낸다.
- 소셜로만 가입해 비밀번호가 없는 계정은 로그인할 수 없다. web의 비밀번호 재설정으로 비밀번호를 정하거나 다른 관리자 계정을 쓴다. 이 앱에는 소셜 로그인·가입·메일 인증·재설정 화면이 없다.
- 로그아웃은 현재 API 세션을 끝내고 쿠키를 지운 뒤 같은 언어의 `/login`으로 간다. API 실패에도 브라우저 쿠키를 지운다.
- 갱신은 `proxy.ts` 한 곳에서만 한다. 읽기와 Action은 `createSessionApiClient`를 쓴다. 401은 `redirectOnUnauthorized`로 처리한다.
- `/session/clear`는 `APP_URL`과 같은 Origin 또는 `Sec-Fetch-Site: same-origin`을 요구한다. 확인할 수 없는 요청에는 403을 반환한다.
- 폼은 `useActionState`와 Server Action, 제출은 `SubmitButton`으로 만든다. 로그인 permalink는 로케일별이며 JS 없이 제출된다.
- 로딩은 스피너·스켈레톤만 쓴다. 로딩 문구는 쓰지 않는다. 다크 모드는 시스템 설정만 따른다.
- 문구는 ko/en 카탈로그에 둔다. ko는 접두사가 없고 en은 `/en`이다. `NEXT_LOCALE`은 host-only이며 계정 언어와 함께 바뀐다.
- `me.updated`는 화면을 갱신해 접근 권한을 다시 확인한다. `session.revoked`는 현재 세션의 401을 확인한 뒤 로그인으로 간다. 다른 세션의 폐기는 현재 세션을 끝내지 않는다.
- 403·404는 같은 화면의 안내, 429는 `Retry-After` 안내다. 필드 오류는 `source.pointer`, 그 밖의 오류는 배너다.
- `src/lib/api`, `src/lib/session`, 관리 서버 모듈에는 `import "server-only"`를 둔다. 제품 코드는 테스트 지원을 가져오지 않는다. [공통 기반](src/lib/AGENTS.md)을 따른다.
- `.env`를 읽거나 출력하지 않는다. 키는 `.env.example`과 `src/lib/env.ts`에서 확인한다. 운영은 새 32바이트 이상의 `SESSION_SECRET`을 쓴다.
- 생성물은 직접 고치지 않는다. TypeSpec·목 수기 소스를 고치고 `pnpm gen`한다. [계약 확장](docs/recipes/change-contract.md)을 따른다.
- UI 부품은 고정 `pnpm exec shadcn add <부품>`으로 더한다. 공식 skill의 latest 명령도 설치된 CLI로 실행한다. 브라우저 도구는 세션 규칙을 따른다.
- 의존성은 정확히 고정하고 `minimumReleaseAge: 1440`을 유지한다. 공식 skill은 `pnpm skills:sync`로 복원한다.
- 소스 400줄·테스트 600줄을 넘기지 않는다. 억제 주석에는 같은 줄의 `사유: 설명`, 테스트 가짜 비밀에는 `betterleaks:allow 사유: 설명`을 단다.
- 템플릿 밖의 파일을 참조하지 않는다. hook을 끄거나 `--no-verify`를 쓰지 않는다. 커밋은 영문 Conventional Commits이며 AI 태그·트레일러를 쓰지 않는다.
- Docker 이미지는 이 프로젝트를 문맥으로 빌드하고 Node 24.19.0·pnpm 12.6.0·UID 10001을 쓴다. `NEXT_OUTPUT=standalone`은 이미지 빌드에만 설정한다. 일반 빌드·E2E는 `next start`다.

## 고정 앱 계약

기반 코드가 가져오는 앱 파일은 아래 여덟 개다. 경로와 내보내기를 유지한다.

| 파일                                   | 계약                                                |
| -------------------------------------- | --------------------------------------------------- |
| `app.config.json`                      | 앱 이름과 dev·mock·e2e·e2eMock 포트                 |
| `messages/en.json`, `messages/ko.json` | 공통 카탈로그와 겹치지 않는 앱 문구                 |
| `e2e/targets/app.ts`                   | `appEnvironment`, `mockEnvironment`, `extendTarget` |
| `scripts/check/steps.ts`               | `assembleSteps`, `ContractInputs`                   |
| `scripts/test/e2e-app.ts`              | `extraE2eEnv`                                       |
| `src/lib/env.ts`                       | `envSchema`                                         |
| `src/lib/session/routes.ts`            | `isProtectedPath`                                   |

`.claude/settings.json`의 exec hook·명령 권한·환경 읽기와 생성물 편집 차단, strict tsconfig와 `@/*` 별칭, check의 `types`·`harness` 이름, Vitest의 `mockBaseUrl`, start의 dev 포트, 환경 예시의 dev·mock 포트도 유지한다.

## 리소스

- 리소스 하나는 `src/resources/<type>/resource.ts` 하나로 선언하고 `src/resources/index.ts`에 등록한다. 등록 순서가 메뉴 순서다. 처음 허용된 리소스가 홈이다. 없는 type·선언 없는 화면은 404다.
- `app`·`lib`·`components`는 등록 목록만 가져온다. 리소스끼리 내부를 가져오지 않는다. `lib/resources`·선언·리소스의 `actions.ts`는 server-only다.
- `defineResource`가 생성 계약 타입으로 열·필드·필터·정렬·쓰기 operation을 검사한다. 타입을 넓혀 우회하지 않는다. sort가 string이면 속성 키로 제한하며 서버 후보는 계약 확장으로 확인한다.
- 목록 쿼리는 URL에 둔다. 선언한 필터·sort만 보내고 page[size]는 20, include는 서버 선언만 쓴다. 읽기·쓰기는 요청의 세션 클라이언트를 쓴다.
- 입력 종류는 `create`·`edit`의 fields, 표시·enum values·관계 대상·필드 override는 최상위 fields에 둔다. 폼은 선언한 필드만 보낸다.
- 메뉴·버튼·화면과 Server Action 모두 권한·조건을 확인한다. 최종 판정은 API다. 삭제·확인 동작은 dialog를 사용한다. 리소스 전체 화면 override는 두지 않는다.
- 문구는 `resources.<type>.title`, `fields.<name>`, `enums.<field>.<value>`, `actions.<name>`이다. enum에는 values를 선언한다. 점이 있는 값은 카탈로그의 중첩 키로 적는다. `resource-messages`가 ko/en을 검사한다.
- 골든은 `src/resources/posts/`다. 글은 목록·상세·발행·발행 취소·삭제만 제공한다. 작성·수정 화면은 선언하지 않는다. 생성기는 계약의 쓰기 operation도 뽑으므로 제품 범위에 맞춰 초안을 줄인다.
- 생성기의 문구는 번역 전 자리표시자다. 권한은 `x-permission`, 없으면 `admin:access` 초안이므로 반드시 검토한다. 이미 있는 리소스·문구·등록은 덮지 않는다.
- 절차: [리소스 추가](docs/recipes/add-resource.md), [필드 종류 추가](docs/recipes/add-field-kind.md), [동작 추가](docs/recipes/add-action.md). `.claude/skills/add-resource/`는 리소스 레시피를 따른다.

## 완료 기준

`pnpm check`를 통과해야 끝난다. 실행 코드 변경은 `pnpm build`, 사용자 흐름은 `pnpm test:e2e`도 확인한다. `.cache/check.json`을 지우면 전 단계를 다시 검사한다. E2E·build·check는 차례로 실행하고 시작한 서버는 모두 종료한다. [E2E 규칙](e2e/AGENTS.md), [아키텍처](docs/architecture.md)를 따른다.
