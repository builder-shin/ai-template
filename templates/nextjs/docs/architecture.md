# 아키텍처

Next.js App Router의 BFF다. Server Component가 데이터를 읽고 Server Action이 쓴다.
브라우저는 백엔드 API를 직접 부르지 않는다. W3의 실시간 Socket.IO와 presigned URL 업로드는 직접 연결한다.
API 계약·목 사본은 이 프로젝트의 `contract/` 안에 두고 자체 workspace로 실행한다.
W2는 하네스·API·세션·i18n·레이아웃과 비밀번호 인증 흐름까지 구현했다. 글·내 정보·세션 화면, 소셜 로그인·실시간·업로드와 `gen:feature`는 W3이며 `features/posts`는 아직 골든 기능 자리다.

## 경계

화면은 `features/<기능>/index.ts`, `lib`, `components`를 쓴다. 기능끼리도 공개 인터페이스만 쓴다.
공통 기반은 기능에 의존하지 않는다. ESLint 경계 규칙이 상대 경로·재수출·동적 import에도 적용된다.
API·세션과 기능 actions/queries는 `server-only` 표식이 없으면 린트가 실패한다.

## 설정과 실행

`next.config.ts` 설정 함수가 개발·운영 서버 phase에서만 Zod 스키마를 검증한다.
빌드·타입 생성에서는 검증하지 않으므로 서버 비밀 없이 빌드할 수 있다.
서버 시작 때 틀린 변수는 변수마다 한 줄을 표준 오류에 쓰고 값·스택 없이 종료 코드 1로 멈춘다.
운영 서버는 예시 `SESSION_SECRET`을 거절한다. 빌드의 `NODE_ENV=production`만으로 서버 검증을 실행하지 않는다.
`setup`이 의존성과 환경 파일을 준비한다. 기존 값은 보존하고 예시에서 새 키만 더한다.
API 기본 주소는 `http://localhost:4010/api/v1`, Socket.IO는 `http://localhost:4010`이다.
web은 3000에서 뜬다. `dev`는 단독 모드에서 목도 함께 띄운다.

## 세션 설계

`src/lib/session/cookie.ts`는 `SESSION_SECRET`의 SHA-256 키와 jose의 JWE(dir/A256GCM)로 두 토큰을 함께 암호화한다. 토큰 내용은 해석하지 않는다. `accessTokenExpiresAt`과 `refreshTokenExpiresAt`은 계약 응답에서 가져오며 쿠키·JWE의 수명은 refresh 만료까지다. 쿠키는 httpOnly, SameSite=Lax, Path=/이고 운영에서는 Secure와 `__Host-session` 이름을 쓴다.

`src/proxy.ts`는 next-intl 라우팅, `/me`·`/my-posts`와 하위 경로의 로그인 검사, 토큰 갱신을 합성한다. next-intl과 같은 decodeURI·슬래시 정리와 URL의 점 구간 정규화 뒤 로케일 접두사를 제외한다. `safeReturnTo`도 같은 정규화한 경로에 원래 쿼리·hash를 붙여 반환한다. 로그인은 그 결과에서 로케일을 제거·재검증하고 계정 로케일을 붙인다. access 만료까지 60초 미만이면 refresh grant를 보내고 새 쿠키를 응답과 같은 요청의 쿠키 헤더에 함께 넣는다. next-intl의 로케일 헤더·rewrite·쿠키를 보존한다. matcher는 페이지로 가는 Server Action POST와 `/me/a.b` 같은 하위 경로도 포함하며 공개 정적 파일은 이름으로 제외한다.

같은 refresh 토큰은 모듈의 Map에 하나의 진행 중 요청을 두고, 완료 결과를 30초 동안 기억한다. 실패도 기억해 결과가 불확실한 토큰을 즉시 다시 보내지 않는다. 시간이 지나면 결과를 메모리에서 치운다. 갱신 실패는 쿠키 삭제와 303 로그인 리다이렉트로 처리한다. `returnTo`는 같은 사이트의 상대 경로만 받고, 외부 주소·중첩 인코딩 우회·역슬래시·제어 문자는 `/`로 바꾼다.

Server Component·Server Action은 `readSession`과 `createSessionApiClient`로 요청 쿠키를 읽기만 하며 갱신하지 않는다. 로그인 Action은 `writeSession`으로 쿠키를 쓴다. 쿠키를 쓸 수 있는 Action은 `clearSessionAndRedirect`로 직접 정리할 수 있다. 공통 `redirectOnUnauthorized`는 `ApiError`의 401일 때 `/session/clear`로 보낸다. Server Component는 쿠키를 삭제할 수 없으므로 이 route의 GET 응답에서 지운 뒤 303으로 로그인에 간다. 정리 route는 Origin을 `APP_URL`의 origin과 비교하고, Origin 없는 이동은 `Sec-Fetch-Site: same-origin`으로 확인한다. cross-site·same-site·출처를 확인할 수 없는 요청은 Set-Cookie 없이 403으로 거절한다. 다른 오류는 원래 흐름에서 처리한다.

동시 갱신 묶기는 프로세스 안에서만 유효하다. 기본 배포는 인스턴스 하나다.
여러 인스턴스에서는 sticky session이 필요하며, 인스턴스를 넘는 갱신 조율은 별도 설계 대상이다.

## 로케일과 시간대

화면은 `src/app/[locale]/`에 둔다. `src/proxy.ts`의 next-intl middleware는 ko의 접두사를 없애고 en에 `/en`을 붙인다. URL, `NEXT_LOCALE` 쿠키, `Accept-Language`, 기본 ko 순으로 로케일을 고른다. 헤더와 다른 언어를 선택하면 middleware가 쿠키를 갱신한다. 헤더와 같은 첫 선택에는 불필요한 쿠키를 쓰지 않는다. 로그인 Action은 발급된 access 토큰으로 `/me`를 읽어 계정 로케일로 쿠키와 이동 URL을 맞춘다.

`src/lib/i18n/request.ts`는 선택한 카탈로그와 `TIME_ZONE`을 반환한다. 레이아웃은 같은 메시지와 시간대를 `NextIntlClientProvider`에 전달한다. 서버의 `getFormatter`와 클라이언트의 `useFormatter`를 써서 호스트 시간대 차이에 따른 날짜 불일치를 막는다. 기본 시간대는 `Asia/Seoul`이다.

`AppConfig`의 메시지 타입은 `messages/ko.json`에서 파생한다. 없는 번역 키는 컴파일 오류이며, check의 i18n 단계는 ko/en의 키와 생성된 모든 ErrorCode의 번역을 검사한다. 에러 코드는 `errors` 아래 영역별 객체로 두고 코드와 `meta.params`를 넘겨 ICU 값을 치환한다.

## 로그인 폼과 로그아웃

`features/auth`의 공개 인터페이스가 인증 화면과 Action을 제공한다. 입력 이름은 계약의 `name`·`email`·`password`다. `useActionState`에 실제 Server Action과 로케일별 permalink를 넘기므로 JS 없이도 HTML 폼을 제출한다. 로그인 성공은 303으로 이동하고 가입·메일 인증 결과는 HTML에 복원한다. 비밀번호는 반환 상태에 넣지 않는다. `useFormStatus`는 제출 중 버튼을 막고 스피너만 더하며 버튼의 접근성 이름은 유지한다.

`toFormResult`가 속성 pointer를 입력 오류로, 나머지를 폼 오류로 번역한다. 로그인 자격증명의 401은 폼에 남는다. 미인증 이메일에는 안내와 재발송 폼을 보여 주고, 429는 `Retry-After`의 초를 안내한다. 연결 실패·서버 오류는 trace를 가진 오류 경계로 넘긴다. 이동 경로는 계정 로케일 접두사를 붙이기 전후의 상대 경로 규칙을 지킨다.

레이아웃이 로그아웃 Action을 헤더에 넘긴다. 사용자 메뉴의 버튼은 바깥 HTML 폼과 `form` 속성으로 연결해 포털에서도 제출한다. Action은 `DELETE /sessions/current`를 호출하고 실패해도 `finally`에서 쿠키를 지운 뒤 현재 로케일 홈으로 간다.

실제 Next HTTP 통합 검사는 홈의 세션 헤더와 가입·메일 인증·로그인·재발송·비밀번호 재설정·로그아웃 폼을 사용한다. 테스트 중 페이지를 만들거나 Next 타입 파일을 백업하지 않는다. 거절되는 옛 access 토큰과 유효한 refresh 토큰으로 같은 렌더링·Action의 새 토큰 사용을 확인한다.

## 가입과 메일 인증

`/signup`은 가입 성공 뒤 같은 URL에서 메일 발송 안내와 재발송 폼으로 바뀐다. 이메일을 URL이나 별도 쿠키에 보관하지 않고 Action 결과에서 받는다. 가입과 재발송 hook은 같은 순서로 항상 호출하므로 JS 없는 재발송 응답도 안내 화면을 복원한다. `Accept-Language`에 UI 로케일을 보내 계정과 메일의 언어를 정한다. 재발송은 기존 Action을 공유하며 429의 `Retry-After` 초를 안내한다.

목과 FastAPI는 `FRONTEND_URL`에 `/verify-email?token=…`를 붙인다. 이 경로를 그대로 제공하며 로케일 접두사가 없는 첫 요청은 `NEXT_LOCALE`, `Accept-Language`, 기본 ko 순으로 고른다. 영어는 토큰 쿼리를 유지한 `/en/verify-email`로 이동한다. 계정의 로케일은 인증 전에는 알 수 없으므로 메일의 언어를 URL에서 추측하지 않는다.

링크의 GET은 확인 폼만 보여 주며 버튼의 Server Action이 `POST /email-verifications`를 호출한다. 메일 미리보기·prefetch·언어 전환으로 토큰을 소모하지 않는다. 성공은 로그인 링크를, 실패는 번역한 안내를 보여 준다. 토큰 누락·반복 쿼리는 실패 안내로 처리한다. 토큰은 반환 상태·API 로그에 넣지 않으며 토큰 pointer는 편집할 입력칸이 없어 폼 오류로 연결한다.

## 비밀번호 재설정

로그인의 안내 링크는 `/forgot-password`로 간다. 이메일을 `POST /password-reset-requests`에 보내며 계정 존재 여부와 관계없이 같은 성공 상태·메일 안내를 보여 준다. 이메일 형식 오류는 입력칸에 연결하고, 메일 요청 한도는 계정 여부와 관계없이 `Retry-After`로 안내한다.

목과 FastAPI의 메일 경로는 `/reset-password?token=…`다. 인증 메일과 같은 쿠키·언어 헤더 규칙으로 로케일을 고른다. GET은 새 비밀번호 폼만 보여 주며 Action이 `POST /password-resets`에 메일 토큰과 `password`를 보낸다. 누락·반복 token 쿼리는 제출 없이 번역한 오류를 보여 준다. 토큰 오류는 폼 안내, 비밀번호 pointer는 입력 오류로 번역한다. 비밀번호·토큰은 반환 상태나 API 로그에 넣지 않는다.

성공하면 새 비밀번호로 로그인하는 링크를 보여 준다. 백엔드가 모든 세션을 폐기하므로 Action도 현재 브라우저의 세션 쿠키를 지워 성공 화면의 헤더를 익명 상태로 렌더링한다. 두 폼은 로케일별 permalink를 사용해 JS 없이도 결과를 복원한다.

## API 호출과 에러

`src/lib/api/client.ts`의 `createApiClient`에 요청의 baseUrl(`/api/v1` 포함), locale, accessToken과 선택 traceId를 넘긴다. 화면·Action에서는 `await createSessionApiClient({locale})`로 요청 세션의 access 토큰을 연결한다. 호출 경로는 `/posts`처럼 쓴다. 클라이언트를 전역에 보관하지 않는다. 읽기의 요청 내 중복 제거는 기능 queries에서 `React.cache`로 한다.

미들웨어가 JSON:API 미디어 타입, 현재 로케일, 세션 토큰과 W3C traceparent를 설정한다. 데이터는 캐시하지 않는다. 로그에는 메서드, 계약 경로, 상태, trace id, 소요 시간만 남기며 `log` 옵션으로 서버 로거를 연결할 수 있다. 기본값은 구조화된 콘솔 로그다.

`jsonapi.ts`는 생성 스키마에서 포함 리소스와 쿼리 타입을 파생한다. `buildQuery`의 filter·page·fields는 해당 GET 계약에 있는 그룹만 받으며 없는 그룹은 `never`다. filter·page의 값 타입과 fields의 문자열·배열 입력을 유지한다. 관계는 type과 id로 연결하고 페이지 이동은 응답 링크를 그대로 쓴다. 비정상 응답은 `ApiError`다. `toFormResult`는 코드와 params를 카탈로그로 번역하고 속성 pointer를 필드별 메시지 배열로 바꾼다. 입력칸 목록을 넘기면 짝이 없는 속성도 폼 에러가 된다. `FormResult`는 Server Action에서 직렬화할 성공/실패 타입이며 `mapApiError`는 로그인·권한·없는 리소스·요청 한도·예상 밖 에러를 분류한다.

단위·통합 테스트는 Vitest의 global setup이 자유 포트에 띄운 실제 `contract/mock` 사본을 쓴다. 개발 포트 3000/4010을 쓰지 않으며 종료 때 자신이 시작한 프로세스 트리를 내린다. `server-only` 별칭은 Node 테스트에서만 표식을 비우고 Next 빌드의 서버 경계는 유지한다.

## UI와 상태 화면

Tailwind 4와 shadcn의 Base UI 부품을 사용한다. `pnpm exec shadcn add <부품>`으로 필요한 기본 부품만 `src/components/ui/`에 추가한다. 공식 스킬의 원본 텍스트는 `.claude/skills/shadcn/`에 두며 latest 명령 대신 설치된 CLI를 쓴다. CSS의 `prefers-color-scheme`으로 색상 토큰과 dark 변형을 적용한다. 테마 저장소·스위치·외부 폰트는 필요 없다.

레이아웃은 헤더, 본문, 푸터다. `getHeaderUser`가 세션이 있을 때만 `/me`를 읽고 요청 안에서 중복 호출을 묶는다. 클라이언트에는 이름만 넘긴다. 헤더의 사용자 메뉴는 로그아웃 Action을 제출하며 제출 중에는 메뉴를 막고 스피너만 표시한다. 로케일 링크는 현재 경로와 반복 쿼리를 보존하며 next-intl이 언어 쿠키를 갱신한다. ko로 바꾸는 링크의 `/ko`는 proxy에서 제거된다.

`Spinner`는 Loader2와 aria-label만 렌더링하고 `loading.tsx`는 문구 없는 스켈레톤이다. 하네스는 src의 TSX 문자열·JSX 문구와 ko/en 카탈로그에서 Loading·로딩 중·불러오는 중을 막는다. aria-label과 카탈로그의 `accessibility.spinner`만 예외다. import 경로·주석·테스트·계약 사본은 검사하지 않는다.

경로 오류 경계는 번역된 안내·복구 버튼과 Next의 `digest`를 표시하며 원본 오류 문구를 출력하지 않는다. 루트 레이아웃의 헤더 `/me` 실패는 `global-error.tsx`가 처리한다. 이 화면은 기존 레이아웃을 대체하므로 자체 html·body·스타일·번역 provider를 두고 URL의 로케일로 같은 복구 UI를 렌더링한다. `ApiError.digest`에 traceId를 보존하므로 운영의 Server Component 오류에서도 서버 로그와 연결된다. 일반 Next 오류의 digest는 Next가 만든 진단 식별자다. catch-all 경로가 알 수 없는 URL을 로케일별 not-found 화면으로 연결한다. UI 테스트는 실제 Base UI와 next-intl을 사용하며 Next 요청 훅만 대체한다. 헤더 오류 통합 검사는 실제 HTTP `/me` 500을 두 로케일의 브라우저 복구 화면에서 확인한다. E2E용 test id는 추가하지 않는다.

## 하네스

check는 단계별 입력 해시를 캐시한다. 삭제도 변경으로 본다. 실패한 단계는 캐시하지 않는다. 전체·관련 테스트의 입력에는 `.claude/hooks/*.mjs`와 `.claude/settings.json`도 포함한다.
Stop은 세션 시작 또는 마지막 통과 때의 스냅샷과 비교하므로 셸 편집도 감지한다.
세션별 상태는 `.cache/hooks/`에만 두며 환경 파일·의존성·빌드 산출물은 읽지 않는다.
빠른 검사는 변경 관련 테스트를 쓰고, 전체 검사는 pre-push와 CI에서 쓴다.
두 검사의 타입 단계는 `.next/types`를 비우고 `next typegen`으로 현재 route 타입을 만든 뒤 `tsconfig.check.json`으로 검사한다. 실행 중인 dev가 소유한 `.next/dev/types`는 보존하고 검사에서 제외한다. 타입 캐시에는 소스·설정과 현재 `.next/types` 내용을 포함한다.
App Router 템플릿은 Pages 전용 `no-html-link-for-pages` 규칙만 끈다. 저장소 루트의 pre-commit과 프로젝트 안의 린트가 같은 설정을 쓴다.
생성물 검사는 TypeSpec 계약과 web·목 타입을 재생성해 비교한다. E2E는 별도 `pnpm test:e2e`로 실행한다.

PreToolUse의 셸 검사는 단어 기반의 최선 검사다. `git push -fv`처럼 짧은 옵션 그룹의 어느 위치에든 `f`가 있으면 래퍼 안에서도 강제 push를 막는다. 권한 deny 글롭도 결합 옵션을 보수적으로 막는다. 별도 프로그램 안에서 파일을 여는 동작까지 해석하지 않는다.
Hook JSON 형식의 기준은 [Claude Code 공식 문서](https://code.claude.com/docs/en/hooks)다.
저장소 비밀 스캔의 `@inquirer/password` 예외는 중첩 잠금 파일 경로와 패키지 이름을 모두 만족해야 한다. 독립 템플릿은 기본 prefilter로 잠금 파일을 제외하므로 별도 패키지 이름 예외를 두지 않는다. 수기 소스의 같은 표식은 비밀번호를 허용하지 않는다.

## 계약과 단독 개발

`contract/*`는 pnpm workspace다. 목의 `@ai-template/contract`는 TypeSpec 사본으로 연결되고 두 패키지는 루트 `tsconfig.base.json`과 고정된 개발 도구를 사용한다. API 규약도 `docs/conventions/`에 함께 복사해 계약 테스트와 AI가 같은 문서를 읽는다.

`pnpm gen`은 TypeSpec을 컴파일하고 API 선언, 실시간 이벤트 이름·payload 매핑, 에러 코드 목록과 목 타입을 다시 만든다. `pnpm check`는 임시 디렉터리의 생성 결과를 비교하고 계약 두 패키지의 자체 검사도 돌린다. 사본은 원본 포맷을 보존하므로 web 포맷·린트에서 제외한다.
web 자체 생성물은 첫 줄에 직접 수정 금지 헤더를 둔다. 계약 사본은 원본 헤더를 보존하고 자체 freshness 검사와 저장소 사본 비교로 확인한다. 이 저장소 안의 사본은 원본 수정 뒤 sync하고, 독립 복사본에서는 그 프로젝트의 TypeSpec과 목을 확장한다.

`pnpm dev`는 Next 환경 로더로 설정을 준비한다. API 주소가 HTTP loopback의 4010 `/api/v1`이면 목과 web을 함께 시작하며, 외부 백엔드 주소라면 web만 시작한다. 어느 자식이 종료하거나 Ctrl+C를 받으면 자신이 시작한 프로세스 트리를 함께 내린다.

## HTTP 통합과 E2E

Vitest global setup이 자유 포트의 실제 복사 목과 Next dev를 하나씩 시작한다. `scripts/http/`의 i18n·세션 갱신·로그인·가입·비밀번호 재설정 파일은 같은 `helpers.ts`에서 서버 주소·API·폼 제출을 가져온다. 종료는 Next → 목 순서다. 개발 포트 3000·4010을 사용하지 않는다.

`pnpm setup`은 고정 Playwright 1.63.0의 Chromium을 설치한다. `pnpm test:e2e`는 headless Chromium에서 운영 코드를 검사한다. Playwright `webServer`가 `scripts/e2e-server.ts`를 실행해 복사 목 readiness → `next build` → `next start` 순서를 보장한다. web은 localhost:3100, 목은 127.0.0.1:4110이다. 두 포트가 사용 중이면 실패하며 기존 서버를 재사용하거나 종료하지 않는다. 개발 서버와 동시에 실행할 수 있는 포트지만 Next 빌드 산출물을 함께 쓰므로 이 프로젝트의 dev·build·check와 E2E는 동시에 실행하지 않는다.

운영 start는 예시 비밀을 거절하므로 Playwright 설정이 실행마다 32바이트 무작위 `SESSION_SECRET`을 생성해 서버 프로세스에만 전달한다. 환경 파일을 고치거나 비밀을 출력하지 않는다. 운영의 Secure·`__Host-session` 쿠키를 localhost Chromium에서 그대로 검사한다. 성공·실패 모두 Playwright가 서버 트리와 브라우저를 종료하고, 기동 스크립트도 오류·종료 신호에서 자신이 시작한 자식만 정리한다.

`e2e/targets/`는 `E2E_TARGET`의 부수 채널 어댑터다. 기본 mock은 실제 `/_test/mail?to=…`에서 목적별 메일 링크를 읽는다. FastAPI는 W4에서 같은 인터페이스에 Mailpit 조회와 백엔드 스택 기동을 연결한다. 현재 fastapi 선택은 W4 안내와 함께 실패하며 목으로 바뀌지 않는다. 인증 흐름은 실제 브라우저 폼으로 가입·인증·로그인·로그아웃·재설정·returnTo를 검사한다. `/me` 화면은 W3 범위이므로 returnTo 검사는 이동 URL과 로그인 헤더를 확인한다.

저장소 CI의 `nextjs` 작업은 Node 24·pnpm 12.6.0을 준비하고 이 템플릿의 lockfile로 frozen 설치한다. `pnpm check` 뒤 Chromium과 Linux 시스템 의존성을 설치하고 `E2E_TARGET=mock`으로 `pnpm test:e2e`를 실행한다. 검사의 자유 포트 서버와 E2E의 운영 서버는 각 실행이 준비하므로 별도의 환경 파일 준비가 필요 없다. Docker 이미지와 FastAPI 대상 E2E는 W4에서 추가한다.
