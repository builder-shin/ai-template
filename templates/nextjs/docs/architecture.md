# 아키텍처

Next.js App Router의 BFF다. Server Component가 데이터를 읽고 Server Action이 쓴다.
브라우저는 백엔드 API를 직접 부르지 않는다. W3의 실시간 Socket.IO와 presigned URL 업로드는 직접 연결한다.
API 계약·목 사본은 이 프로젝트의 `contract/` 안에 두고 자체 workspace로 실행한다.
앱 이름과 dev·mock·e2e·e2eMock 포트의 설정 파일: `app.config.json`. 기본값: `web`, 3000·4010·3100·4110. 설정 모듈(`src/lib/app-config.mjs`)은 plain Node와 TypeScript가 함께 쓰며 kebab-case 이름과 1024–65535의 서로 다른 정수 포트를 검사한다. 운영 start 포트(`package.json`)와 APP_URL origin(`.env.example`)이 dev 설정과 다르면 check가 고칠 값을 알린다.
W3까지 비밀번호·소셜 인증, 공개·내 글, 내 정보·비밀번호 변경·탈퇴, 세션 관리, 업로드와 실시간을 구현했다.
`features/posts`는 `pnpm gen:feature`가 복사하는 골든 기능이다. 같은 E2E 20개가 목과 외부 FastAPI에서 통과하며 standalone 이미지·일곱 레시피·고정 skill을 갖춘다. CI 실행 결과는 PR CI에서 확인한다.

## 기능과 생성기

`features/auth`는 가입·메일 인증·비밀번호 로그인·재설정과 소셜 안내를, `features/me`는 프로필·비밀번호
변경·탈퇴를, `features/sessions`는 기기 목록·폐기를 맡는다. `features/files`의 업로드는 글 커버와
아바타가 함께 쓴다. 다른 기능은 해당 `index.ts`만 가져온다.

골든 `features/posts`는 공개 `/posts`·`/posts/[id]`와 보호된 `/my-posts`·작성·수정·삭제 확인 화면이다.
`queries.ts`가 요청별 `React.cache`로 읽고 `actions.ts`가 작성·수정·발행·취소·삭제 뒤 영향을 받은
ko/en 페이지를 갱신한다. 공개 조회는 발행 글만, 내 글 조회는 현재 사용자의 글만 읽는다.
Markdown 상세·미리보기는 react-markdown과 remark-gfm으로 raw HTML 없이 렌더링한다.
제목·본문·상태·삭제 확인 폼은 JS 없이 제출되며 업로드와 미리보기 탭은 JS가 필요하다.
작성·미리보기 탭은 설치된 shadcn CLI의 Tabs를 쓰며 미리보기 중에도 textarea를 폼에 남긴다.

공개·내 글과 세션 목록의 page는 1~2,147,483,647의 정수만 받으며 잘못되거나 int32 범위를 벗어나면 1로 바꾼다. size는 1~100을 유지하며 세션 화면은 10으로 고정한다.
백엔드 404는 not-found 화면으로 옮긴다. `posts/[id]`처럼 로딩 스켈레톤으로 스트리밍하는 상세의 not-found는 HTTP 200에 안내와 `noindex`를 담을 수 있다.

`pnpm gen:feature <복수형 이름> [--singular <끝 단어의 단수형>]`은 골든 기능과 두 화면 트리·HTTP
테스트를 복사해 이름을 바꾼다. ko/en namespace와 `/my-<이름>` 로그인 보호도 등록한다. 계약 타입·API
경로·JSON:API type·에러 코드·실시간 채널은 posts 값을 보존하므로 새 계약과 권한·문구를 채워야 한다.
골든 코드의 `gen:feature: 빼기`·`그대로`·`고칠 곳` 표시가 복사·이름 변경·검토 대상을 정한다.
기존 경로·namespace는 덮어쓰지 않는다. 출력한 검토 목록과 [기능 추가](recipes/add-feature.md)를 따라
헤더·홈 링크까지 고친다. 생성된 기능은 편집할 소스이며 `pnpm gen`의 계약 타입 생성물과 구분한다.

기능·페이지·Server Action·실시간 구독·번역·API 확장·UI 부품 추가는 [일곱 레시피](../AGENTS.md#완료-기준과-문서)를 따른다.
`.claude/skills/add-*/`는 파일 순서와 검사만 안내하며 레시피가 원본이다.
Next `next-dev-loop`·shadcn·Playwright CLI는 [고정 출처](stack.md#공식-skill)의 사본이다.
check의 harness가 원문·버전·파일 해시를 네트워크 없이 검사하며 `pnpm skills:sync`으로 복원한다.
캐시 키에는 설치 패키지 버전·설치 skill 해시도 포함한다. 전용 열거기가 공식 사본과 설치 원본의 skill 폴더에서 예상 밖 항목(숨김 파일·빈 폴더·링크 포함)을 모두 거절한다.

## 파일 업로드

`features/files`의 재사용 `FileUpload`는 JavaScript가 필요하며 화면에도 이를 안내한다.
파일 본문은 Server Action으로 보내지 않는다. Action이 이름·타입·크기로 `POST /files`를 부르고,
브라우저가 반환된 presigned URL에 PUT한 뒤 Action이 `PATCH /files/{id}`로 ready를 확인한다.
PUT은 응답의 헤더를 그대로 쓰며 Content-Length는 브라우저가 본문에서 정한다.
목의 `/_storage`는 web Origin의 CORS를 허용한다. 실제 스토리지도 해당 Origin의 PUT을 허용해야 한다.
FastAPI의 `STORAGE_ALLOWED_ORIGINS`와 버킷 초기화로 SeaweedFS의 실제 presigned PUT·ready·이미지 표시를 같은 E2E에서 확인했다.

ready 확인이 끝난 id만 부모 폼의 hidden 값에 넣는다. 업로드 중 저장을 막고 스피너만 표시한다.
오류가 나면 기존 커버를 유지하며 다시 같은 파일을 고를 수 있다. 글 작성·수정 Action은
`relationships.coverImage`로 id를 저장하고, 빈 값은 null로 해제하며 필드 생략은 기존 관계를 보존한다.
제목·본문·현재 커버 id의 저장은 JS 없이도 된다. 관계 해제·교체는 다음 저장 때 반영된다.
저장하지 않은 파일은 연결되지 않으며 pending 파일 정리는 백엔드가 맡는다.
create·ready의 429는 `retryAfter`를 보존하며 ko/en의 대기 안내를 표시한다.

## 경계

화면은 `features/<기능>/index.ts`, `lib`, `components`를 쓴다. 기능끼리도 공개 인터페이스만 쓴다.
공통 기반은 기능에 의존하지 않는다. ESLint 경계 규칙이 상대 경로·재수출·동적 import에도 적용된다.
API·세션과 기능 actions/queries는 `server-only` 표식이 없으면 린트가 실패한다.

## 설정과 실행

`src/lib/env/startup.ts`의 `exitOnInvalidEnv`가 `src/lib/env.ts`의 Zod 스키마를 검증한다.
`next.config.ts`의 개발·운영 서버 phase와 `src/instrumentation.ts`의 Node 런타임이 이 helper를 호출한다. instrumentation은 운영 빌드에서는 호출하지 않는다.
빌드·타입 생성에서는 검증하지 않으므로 서버 비밀 없이 빌드할 수 있다.
서버 시작 때 틀린 변수는 변수마다 한 줄을 표준 오류에 쓰고 값·스택 없이 종료 코드 1로 멈춘다.
Next의 Ready 배너가 먼저 나올 수 있지만 잘못된 설정으로 요청을 처리하지 않는다.
운영 서버는 예시 `SESSION_SECRET`을 거절한다. 빌드의 `NODE_ENV=production`만으로 서버 검증을 실행하지 않는다.
`setup`이 의존성과 환경 파일을 준비한다. 기존 값은 보존하고 예시에서 새 키만 더한다.
API 기본 주소는 `http://localhost:4010/api/v1`, Socket.IO는 `http://localhost:4010`이다.
web은 3000에서 뜬다. `dev`는 단독 모드에서 목도 함께 띄운다.

### 환경 행렬

| 변수                       | 단독 개발                      | mock E2E                       | 외부 FastAPI E2E 예시           |
| -------------------------- | ------------------------------ | ------------------------------ | ------------------------------- |
| `E2E_TARGET`               | 사용하지 않음                  | 기본 `mock`                    | `fastapi`                       |
| `APP_URL`                  | `http://localhost:3000`        | `http://localhost:3100`        | `http://localhost:3100`         |
| `API_BASE_URL`             | `http://localhost:4010/api/v1` | `http://127.0.0.1:4110/api/v1` | `http://127.0.0.1:18100/api/v1` |
| `NEXT_PUBLIC_REALTIME_URL` | `http://localhost:4010`        | `http://127.0.0.1:4110`        | `http://127.0.0.1:18100`        |
| `E2E_MAILPIT_URL`          | 사용하지 않음                  | 사용하지 않음                  | `http://127.0.0.1:28125`        |
| `E2E_OAUTH_URL`            | 사용하지 않음                  | 사용하지 않음                  | `http://127.0.0.1:28180`        |
| `E2E_RECENT_LOGIN_SECONDS` | 사용하지 않음                  | 어댑터의 10초                  | `10`                            |
| `SESSION_SECRET`           | 로컬 개발 비밀                 | 실행마다 생성                  | 실행마다 생성                   |
| `TIME_ZONE`                | 기본 `Asia/Seoul`              | `Asia/Seoul`                   | `Asia/Seoul`                    |

mock E2E는 실행기가 주소를 정한다. fastapi는 APP·API·실시간·Mailpit·OAuth URL과 창을 명시해야 하며 누락·오류는 기동 전에 실패한다.
fastapi의 대상 URL은 `?`·`#` 문자가 하나라도 있으면 거절한다. 값이 없는 구분 문자도 허용하지 않는다.
외부 스택의 기동·정리는 호출자가 맡는다. 템플릿은 API의 `/health/ready`를 기다리고 web만 빌드·기동하며 Docker를 실행하지 않는다.
백엔드의 `FRONTEND_URL`·실시간·스토리지 허용 Origin은 `APP_URL`, OAuth 허용 콜백은 `APP_URL`의 `/oauth/callback`으로 맞춘다.
S3의 브라우저 주소도 접근 가능해야 한다(위 예시의 S3는 `http://127.0.0.1:28433`).
백엔드 `RECENT_LOGIN_SECONDS`와 E2E 창은 같은 10초로 맞춘다. 자세한 검증은 [E2E 지침](../e2e/AGENTS.md)을 따른다.

### Docker 이미지

단독 프로젝트의 `Dockerfile`은 이 폴더를 문맥으로 쓰는 다단계 빌드다. Node `24.19.0-bookworm-slim`과 pnpm `12.6.0`으로 frozen 설치하고 빌드 단계의 `NEXT_OUTPUT=standalone`으로 Next `output: "standalone"`을 만든다. 일반 `pnpm build`·`pnpm start`와 E2E는 이 변수 없이 일반 빌드·`next start`를 쓴다.
실행 이미지에는 `server.js`·추적 의존성·서버 산출물·`.next/static`·`public`을 복사한다. UID/GID `10001:10001`로 실행하며 `.next/cache`는 해당 사용자가 쓸 수 있다.
기본 명령은 `node server.js`, `HOSTNAME=0.0.0.0`, `PORT=3000`이다. 헬스체크는 실제 PORT의 `/`가 HTTP 200인지 확인한다.
`.dockerignore`는 `.env*`·의존성·빌드·캐시·git·테스트 출력 등 로컬 파일을 제외한다.

조합에서는 생성기가 조합용 Dockerfile과 인접 `Dockerfile.dockerignore`를 넣는다. 조합 루트가 빌드 문맥이며, web 의존성만 설치하고 standalone의 workspace 서버 배치를 보존한다. 빌드·실행 명령은 생성된 조합 프로젝트의 지침을 따른다. 아래 명령은 단독 프로젝트용이다.

빌드에는 서버 비밀이 필요 없다. API·실시간 URL의 빌드 ARG는 실행 단계에 전달하지 않는다.
실행할 때 `API_BASE_URL`, `APP_URL`, `NEXT_PUBLIC_REALTIME_URL`, `SESSION_SECRET`을 주고 `TIME_ZONE`은 필요하면 바꾼다.
standalone은 next.config의 서버 phase를 다시 실행하지 않으므로 instrumentation이 공통 `exitOnInvalidEnv`로 요청 처리 전에 검사한다.
누락·잘못된 URL·시간대·32바이트 미만 비밀·운영 예시 비밀은 값·스택 없이 종료 코드 1로 멈춘다.
실시간 주소는 Server Component가 실행 환경에서 읽어 클라이언트 prop으로 전달하며 API 주소도 실행 환경을 쓴다.
컨테이너 안의 API 주소는 서버에서, 실시간·S3 주소는 브라우저에서 접근 가능해야 한다. 컨테이너의 localhost는 호스트가 아니다.

호스트 환경에 위 설정과 새 비밀을 준비하고 3000이 비었는지 확인한 뒤 실행한다.

```sh
docker build --tag ai-template-nextjs:local .
docker run --rm --name ai-template-nextjs-local --publish 127.0.0.1:3000:3000 --env API_BASE_URL --env APP_URL --env NEXT_PUBLIC_REALTIME_URL --env SESSION_SECRET --env TIME_ZONE ai-template-nextjs:local
```

## 세션 설계

`src/lib/session/cookie.ts`는 `SESSION_SECRET`의 SHA-256 키와 jose의 JWE(dir/A256GCM)로 두 토큰을 함께 암호화한다. 토큰 내용은 해석하지 않는다. `accessTokenExpiresAt`과 `refreshTokenExpiresAt`은 계약 응답에서 가져오며 쿠키·JWE의 수명은 refresh 만료까지다. 쿠키는 httpOnly, SameSite=Lax, Path=/이고 이름은 앱 설정에서 `<app>-session`으로 만들며 운영에서는 Secure와 `__Host-<app>-session`을 쓴다. 기본 web은 `web-session`·`__Host-web-session`이다. 이름 변경 전의 로그인은 한 번 풀린다.

`src/proxy.ts`는 next-intl 라우팅, `/me`·`/my-posts`와 하위 경로의 로그인 검사, 토큰 갱신을 합성한다. next-intl처럼 decodeURI를 한 번만 적용하고 슬래시 정리와 URL의 점 구간 정규화 뒤 로케일 접두사를 제외한다. `/me/100%25` 같은 유효한 퍼센트 경로도 검사하며 디코딩·정규화 오류는 보호 경로로 취급한다. `safeReturnTo`도 같은 정규화한 경로에 원래 쿼리·hash를 붙여 반환한다. 로그인은 그 결과에서 로케일을 제거·재검증하고 계정 로케일을 붙인다. access 만료까지 60초 미만이면 refresh grant를 보내고 새 쿠키를 응답과 같은 요청의 쿠키 헤더에 함께 넣는다. next-intl의 로케일 헤더·rewrite·쿠키를 보존한다. matcher는 페이지로 가는 Server Action POST와 `/me/a.b` 같은 하위 경로도 포함하며 공개 정적 파일은 이름으로 제외한다.

같은 refresh 토큰은 모듈의 Map에 하나의 진행 중 요청을 두고, 완료 결과를 30초 동안 기억한다. 실패한 Promise도 그대로 재사용하며 실패 완료 시각부터 30초 뒤 만료된다. 결과가 불확실한 토큰을 즉시 다시 보내지 않는다. 재요청이 없어도 타이머가 결과를 메모리에서 치우며 옛 항목의 타이머는 새 항목을 지우지 않는다. 실제 목 통합 검사가 실패 Promise 재사용·완료 후 만료 경계·타이머 교체를 확인한다. 갱신 실패는 쿠키 삭제와 303 로그인 리다이렉트로 처리한다. `returnTo`는 같은 사이트의 상대 경로만 받고, 외부 주소·중첩 인코딩 우회·역슬래시·제어 문자는 `/`로 바꾼다.

Server Component·Server Action은 `readSession`과 `createSessionApiClient`로 요청 쿠키를 읽기만 하며 갱신하지 않는다. 로그인 Action은 `writeSession`으로 쿠키를 쓴다. 쿠키를 쓸 수 있는 Action은 `clearSessionAndRedirect`로 직접 정리할 수 있다. 공통 `redirectOnUnauthorized`는 `ApiError`의 401일 때 `/session/clear`로 보낸다. Server Component는 쿠키를 삭제할 수 없으므로 이 route의 GET 응답에서 지운 뒤 303으로 로그인에 간다. 정리 route는 Origin을 `APP_URL`의 origin과 비교하고, Origin 없는 이동은 `Sec-Fetch-Site: same-origin`으로 확인한다. cross-site·same-site·출처를 확인할 수 없는 요청은 Set-Cookie 없이 403으로 거절한다. 다른 오류는 원래 흐름에서 처리한다.

동시 갱신 묶기는 프로세스 안에서만 유효하다. 기본 배포는 인스턴스 하나다.
여러 인스턴스에서는 sticky session이 필요하며, 인스턴스를 넘는 갱신 조율은 별도 설계 대상이다.

## 소셜 로그인

로그인 화면의 Google·카카오·네이버 링크는 JS 없이 `/oauth/{provider}/start`로 간다.
start는 같은 Origin 이동인지 확인하고 시도마다 무작위 PKCE verifier를 만든다. 제공자·검증한
`returnTo`·화면 언어와 함께 JWE로 암호화해 10분짜리 httpOnly·SameSite=Lax 쿠키에 둔다.
운영에서는 Secure·Path=/·`__Host-oauth`를 쓴다. 세션과 같은 키를 쓰되 JWE의 sub로 용도를 구분한다.
백엔드 authorize 주소에는 `APP_URL`의 `/oauth/callback`과 S256 challenge만 보낸다.
두 OAuth route는 로케일 proxy에서 제외해 콜백 주소가 바뀌지 않는다.

콜백은 제공자에서 돌아오는 cross-site GET이므로 같은 Origin만 요구할 수 없다. 유효한 verifier
쿠키와 PKCE로 시작한 브라우저를 확인하며, 쿠키 누락·만료·변조는 코드 교환 전에 거절한다.
기존 백엔드 계약은 콜백에 code 또는 error만 돌려주고 provider는 주지 않는다. provider가 명시되면
쿠키와 직접 비교한다. 값이 없으면 서로 다른 제공자 시도의 코드·쿠키 교차 사용을 백엔드의
PKCE 검사가 거절한다. 계약의 oauthCode grant에는 provider 필드가 없어 이를 새로 보내지 않는다.

성공은 서버 간 `POST /sessions`와 `GET /me`가 모두 성공한 뒤에만 새 세션 쿠키를 만들고 계정 언어로
`NEXT_LOCALE`과 목적지 URL을 맞춘다. 성공·실패 모두 verifier 쿠키를 지우고 no-store·no-referrer로
응답한다. 거부·실패는 검증한 목적지를 보존한 로그인 화면에 기존 오류 번역을 표시한다.
코드 교환·`GET /me` 실패와 예상하지 못한 응답 등 콜백 처리 실패는 새 세션 쿠키 없이 시도 쿠키를 지우고 `auth.oauth_failed` 안내가 있는 로그인 화면으로 보낸다.
실패해도 기존 세션은 그대로 두며 예상하지 못한 오류는 비밀 없는 오류 클래스 이름만 로그에 남긴다.
토큰과 verifier는 URL·클라이언트 코드·API 로그에 넣지 않는다.

백엔드의 `OAUTH_REDIRECT_URIS`에 정확한 `APP_URL` 콜백을 등록해야 한다. 기본 개발 주소는
`http://localhost:3000/oauth/callback`이다. HTTP 검사는 예약한 자유 포트의 콜백을,
mock E2E 기동기는 `http://localhost:3100/oauth/callback`을 허용 목록에 넣는다. 외부 FastAPI도 같은 콜백을 준비해야 한다.
실제 목 제공자의 username·claims 폼을 POST해 세 제공자의 로그인과 거부·실패·PKCE 불일치를 검사한다.

## 회원 탈퇴

내 정보에서 `/me/delete` 확인 화면으로 간다. `features/me`의 `deleteAccountAction`은 확인 체크를
서버에서도 검사한 뒤 `DELETE /me`를 부른다. `useActionState`와 로케일별 permalink로 JS 없이 제출한다.
성공하면 세션 쿠키를 지우고 레이아웃을 갱신해 현재 언어의 홈으로 간다. 개인정보와 모든 세션은
백엔드가 지우며 작성한 글은 남는다. 마지막 관리자는 번역한 오류와 다른 활성 관리자 지정 안내를 본다.

`auth.reauthentication_required`는 쿠키를 지우고 로그인으로 보낸다. 로그인 화면은 기존 에러 코드의
번역을 안내하고 `returnTo`로 확인 화면에 돌아온다. 로그인 뒤에도 확인을 다시 받으며 자동 탈퇴하지 않는다.
다른 401은 기존 쿠키 정리 route를 쓴다. refresh로는 최근 로그인 조건을 충족할 수 없다.

목과 FastAPI의 `RECENT_LOGIN_SECONDS` 기본값은 600초다. Vitest는 별도 자유 포트의 목에서 2초 창을 쓴다.
양쪽 E2E는 10초 창을 쓰며 FastAPI의 `RECENT_LOGIN_SECONDS`와 어댑터의 `E2E_RECENT_LOGIN_SECONDS`를 맞춘다.
`expireRecentLogin`은 창과 여유 시간을 기다리고 실제 재인증 오류를 확인한다. 검사는 자신이 시작한 프로세스만 내린다.

## 로케일과 시간대

화면은 `src/app/[locale]/`에 둔다. `src/proxy.ts`의 next-intl middleware는 ko의 접두사를 없애고 en에 `/en`을 붙인다. URL, `NEXT_LOCALE` 쿠키, `Accept-Language`, 기본 ko 순으로 로케일을 고른다. 헤더와 다른 언어를 선택하면 middleware가 쿠키를 갱신한다. 헤더와 같은 첫 선택에는 불필요한 쿠키를 쓰지 않는다. 로그인 Action은 발급된 access 토큰으로 `/me`를 읽어 계정 로케일로 쿠키와 이동 URL을 맞춘다.

`src/lib/i18n/request.ts`는 선택한 카탈로그와 `TIME_ZONE`을 반환한다. 레이아웃은 같은 메시지와 시간대를 `NextIntlClientProvider`에 전달한다. 서버의 `getFormatter`와 클라이언트의 `useFormatter`를 써서 호스트 시간대 차이에 따른 날짜 불일치를 막는다. 기본 시간대는 `Asia/Seoul`이다.

`AppConfig`의 메시지 타입은 `messages/ko.json`에서 파생한다. 없는 번역 키는 컴파일 오류이며, check의 i18n 단계는 ko/en의 키와 생성된 모든 ErrorCode의 번역을 검사한다. 에러 코드는 `errors` 아래 영역별 객체로 두고 코드와 `meta.params`를 넘겨 ICU 값을 치환한다.

## 로그인 폼과 로그아웃

`features/auth`의 공개 인터페이스가 인증 화면과 Action을 제공한다. 입력 이름은 계약의 `name`·`email`·`password`다. `useActionState`에 실제 Server Action과 로케일별 permalink를 넘기므로 JS 없이도 HTML 폼을 제출한다. 로그인 성공은 303으로 이동하고 가입·메일 인증 결과는 HTML에 복원한다. 비밀번호는 반환 상태에 넣지 않는다. `useFormStatus`는 제출 중 버튼을 막고 스피너만 더하며 버튼의 접근성 이름은 유지한다.

`toFormResult`에는 실제 입력칸 목록을 넘긴다. 목록에 있는 속성 pointer만 입력 오류로, 나머지는 폼 오류로 번역한다. 목록의 기본값은 빈 배열이므로 생략하면 모든 오류가 폼 안내에 남는다. 로그인 자격증명의 401은 폼에 남는다. 미인증 이메일에는 안내와 재발송 폼을 보여 주고, 429는 `Retry-After`의 초를 안내한다. 연결 실패·서버 오류는 trace를 가진 오류 경계로 넘긴다. 이동 경로는 계정 로케일 접두사를 붙이기 전후의 상대 경로 규칙을 지킨다.

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

## 내 정보와 비밀번호 변경

`/me`는 보호된 화면이다. `features/me/queries.ts`가 `include=avatar`로 이름·계정 언어·아바타를 읽고, 저장 Action은 현재 세션에서 본인 id를 읽어 `PATCH /me`를 호출한다. 이름 저장 뒤 로케일 레이아웃을 갱신해 헤더와 글 작성자 이름도 다시 읽는다. 계정 언어를 `NEXT_LOCALE`에 쓰고 UI 언어와 다르면 한국어 `/me` 또는 영어 `/en/me`로 이동한다.

아바타는 `features/files`의 업로드를 재사용한다. 업로드에는 JavaScript가 필요하며 ready 파일 id만 폼에 연결한다. 업로드 중 프로필 저장을 막는다. 빈 아바타 값은 관계를 해제하고 필드를 생략하면 기존 관계를 보존한다. 이름·언어와 현재 아바타의 저장은 로케일별 permalink와 `useActionState`로 JavaScript 없이도 제출된다.

비밀번호 폼은 `POST /password-changes`에 `currentPassword`와 `newPassword`를 보낸다. 백엔드는 다른 세션만 폐기하므로 현재 쿠키·access token·refresh token을 유지한다. 다른 기기에서 로그아웃된다는 안내를 제출 전과 성공 뒤에 표시한다. `auth.invalid_credentials`의 `currentPassword` pointer가 있는 401은 입력 오류로 번역하고, 실제 세션 오류의 401은 기존 쿠키 정리 route로 보낸다. 비밀번호는 폼 결과에 돌려주지 않는다.

## 세션 관리

`/me/sessions`는 내 정보에서 들어가는 보호된 화면이다. `features/sessions`가 활성 세션을 최근 사용 순서로 10개씩 읽고 현재 세션·기기 정보·로그인과 최근 사용 시각을 표시한다. API 페이지 링크는 번호만 web 경로로 옮긴다. 클라이언트에는 토큰이나 사용자 관계를 전달하지 않는다.

개별 폐기는 `DELETE /sessions/{id}`, 다른 기기와 전체 로그아웃은 `POST /session-revocations`의 `others`·`all`을 쓴다. 개별 폐기 뒤 현재 토큰의 `/me`가 401이면 현재 세션도 끝난 것이므로 쿠키를 지우고 로그인으로 이동한다. 전체 로그아웃도 쿠키를 지운다. 다른 기기 로그아웃은 현재 토큰을 유지하며 백엔드의 실제 폐기 개수를 표시한다. 전체 로그아웃은 확인 체크를 서버에서도 검사한다. 모든 폼은 로케일별 permalink와 `useActionState`로 JavaScript 없이 제출한다.

개별 폐기 결과는 목록 공통 상태 하나에 표시해 해당 행이 사라져도 남긴다.
DELETE 성공 뒤 목록을 갱신하며, 후속 `GET /me`의 4xx는 번역한 폼 안내로 표시한다. 429는 `Retry-After`의 초를 안내하며 401은 위의 세션 정리를 따른다.

폐기된 다른 세션이 다음 요청을 보내면 기존 401 처리와 `/session/clear`가 쿠키를 지우고 로그인으로 보낸다. 열린 화면은 아래 실시간 세션 확인으로 로그인 화면에 간다. 404와 요청 한도는 번역한 폼 안내, 연결·5xx는 오류 경계로 보낸다.

## 실시간

로케일 루트의 `lib/realtime/RealtimeProvider`가 Socket.IO 연결 하나를 관리한다. WebSocket만 쓰며,
로그인한 연결의 `auth` 콜백은 연결·재연결마다 Server Action으로 `POST /realtime-tickets`를 부른다.
브라우저에는 30초짜리 1회용 티켓만 전달하며 access·refresh token은 서버에 남긴다. 익명 연결은
티켓 없이 붙는다. 세션 식별 키가 바뀌면 연결을 끊고 새 티켓으로 다시 인증하며 `io server disconnect`에도 직접 연결한다.
티켓 발급 실패나 연결 인증 거부는 1초 뒤 새 티켓으로 재시도한다. 네트워크 재연결은 Socket.IO가 맡는다.
해제 때 처리기·연결·재시도 타이머를 정리한다.

세션 식별 키는 계약 세션 리소스의 id이며 비밀번호·OAuth 로그인과 refresh 응답에서 암호화한 쿠키에 보관한다.
새 로그인에는 키가 바뀌며 같은 사용자의 재로그인도 다시 인증한다. 같은 세션의 refresh는 키와 연결을 유지한다.
기존 쿠키에 id가 없으면 로그인 상태의 임시 키를 쓰며 첫 refresh로 id를 얻을 때 다시 인증한다. 익명 키는 null이다.
인증 시도마다 generation을 두고 이전 시도의 늦은 티켓·세션 확인·실패 결과는 버린다. 연결 해제나 세션 키 변경 뒤 대기한 결과도 적용하지 않는다.

`useChannel`은 계약의 채널·이벤트 타입을 쓰고 같은 채널의 소비자를 묶는다. 연결 때 ack를 받아
구독하며 거부는 채널과 에러 코드만 로그에 남긴다. 재연결 때 다시 구독하고 마지막 소비자가
떠나면 구독을 해제한다. 이벤트 데이터 캐시는 만들지 않는다.

`session.revoked`는 세션 id 없이 사용자 룸 전체에 전달된다. 따라서 Server Action이 현재 세션으로
`GET /me`를 확인한다. 401이면 쿠키를 지우고 현재 언어의 로그인 화면으로 간다. 살아 있으면
쿠키를 유지하고 `router.refresh()`만 한다. 비밀번호 변경·다른 기기 로그아웃이 현재 기기까지
로그아웃시키지 않도록 하는 규칙이다. 연결 오류·5xx는 쿠키를 지우지 않으며 다음 이벤트나 HTTP
요청에 맡긴다. 겹친 이벤트의 확인 요청은 하나로 묶는다. `me.updated`도 서버 화면을 갱신한다.

같은 탭의 폼 제출은 `useFormStatus`로 실시간 Provider에 알린다. 제출이 끝날 때까지 티켓 요청·
세션 확인·내 정보 갱신을 기다리고, 제출 결과로 로그아웃되면 대기한 확인을 취소한다. 로그아웃·탈퇴의
홈 이동이나 비밀번호 재설정 성공 안내를 실시간 로그인 이동이 덮어쓰지 않도록 한다. 공통
`SubmitButton`과 헤더의 로그아웃 폼이 연결되며 Provider 밖의 독립 폼에는 영향을 주지 않는다.

공개 글 화면은 `posts` 채널을 구독한다. 목록의 `post.*`를 100ms 동안 모아 갱신하고 상세는 같은
id만 갱신한다. 삭제·발행 취소는 번역한 안내를 표시하고 본문을 숨긴다. 상세의 클라이언트 layout과
전용 not-found 경계는 서버가 not-found 화면을 렌더링한 뒤에도 안내·구독을 유지한다.
같은 글의 draft 수정에도 발행 취소 안내를 유지하며 다시 발행하면 상세를 복원한다.

백엔드의 `REALTIME_ALLOWED_ORIGINS`에는 web Origin을 넣는다. HTTP 통합은 자유 포트의 실제 목에
직접 연결하고 `/me` 오류 주입용 HTTP 중계를 거치지 않는다. E2E는 web 3100 Origin을 허용한다.
FastAPI의 web Origin 허용, 실제 Socket.IO 연결·세션 폐기·공개 목록 반영도 같은 운영 E2E로 확인했다.

## API 호출과 에러

`src/lib/api/client.ts`의 `createApiClient`에 요청의 baseUrl(`/api/v1` 포함), locale, accessToken과 선택 traceId를 넘긴다. 화면·Action에서는 `await createSessionApiClient({locale})`로 요청 세션의 access 토큰을 연결한다. 호출 경로는 `/posts`처럼 쓴다. 클라이언트를 전역에 보관하지 않는다. 읽기의 요청 내 중복 제거는 기능 queries에서 `React.cache`로 한다.

미들웨어가 JSON:API 미디어 타입, 현재 로케일, 세션 토큰과 W3C traceparent를 설정한다. 요청·응답 trace id는 같은 검증으로 0이 아닌 32자리 소문자 16진수만 받는다. 응답 trace가 잘못되면 요청 trace를 오류와 digest에 유지한다. 데이터는 캐시하지 않는다. 로그에는 메서드, 계약 경로, 상태, trace id, 소요 시간만 남기며 `log` 옵션으로 서버 로거를 연결할 수 있다. 기본값은 구조화된 콘솔 로그다.

`jsonapi.ts`는 생성 스키마에서 포함 리소스와 쿼리 타입을 파생한다. `buildQuery`의 filter·page·fields는 해당 GET 계약에 있는 그룹만 받으며 없는 그룹은 `never`다. filter·page의 값 타입과 fields의 문자열·배열 입력을 유지한다. 관계는 type과 id로 연결하고 페이지 이동은 응답 링크를 그대로 쓴다. 비정상 응답은 `ApiError`다. `toFormResult`는 코드와 params를 카탈로그로 번역하고 지정한 입력칸의 속성 pointer만 필드별 메시지 배열로 바꾼다. 목록에 없는 속성은 폼 에러이며 목록을 생략하면 필드 에러를 만들지 않는다. `FormResult`는 Server Action에서 직렬화할 성공/실패 타입이며 `mapApiError`는 로그인·권한·없는 리소스·요청 한도·예상 밖 에러를 분류한다.

단위·통합 테스트는 Vitest의 global setup이 자유 포트에 띄운 실제 `contract/mock` 사본을 쓴다. 개발 포트 3000/4010을 쓰지 않으며 종료 때 자신이 시작한 프로세스 트리를 내린다. `server-only` 별칭은 Node 테스트에서만 표식을 비우고 Next 빌드의 서버 경계는 유지한다.

## UI와 상태 화면

Tailwind 4와 shadcn의 Base UI 부품을 사용한다. `pnpm exec shadcn add <부품>`으로 필요한 기본 부품만 `src/components/ui/`에 추가한다. 공식 스킬의 원본 텍스트는 `.claude/skills/shadcn/`에 두며 latest 명령 대신 설치된 CLI를 쓴다. CSS의 `prefers-color-scheme`으로 색상 토큰과 dark 변형을 적용한다. 테마 저장소·스위치·외부 폰트는 필요 없다.

레이아웃은 헤더, 본문, 푸터다. `getHeaderUser`가 세션이 있을 때만 `/me`를 읽고 요청 안에서 중복 호출을 묶는다. 클라이언트에는 이름만 넘긴다. 헤더의 사용자 메뉴는 로그아웃 Action을 제출하며 제출 중에는 메뉴를 막고 스피너만 표시한다. 로케일 링크는 현재 경로와 반복 쿼리를 보존하며 next-intl이 언어 쿠키를 갱신한다. ko로 바꾸는 링크의 `/ko`는 proxy에서 제거된다.
내 정보(`/me`) 링크는 사용자 메뉴 항목에 둔다.

`Spinner`는 Loader2와 aria-label만 렌더링하고 `loading.tsx`는 문구 없는 스켈레톤이다. 하네스는 src의 TSX 문자열·JSX 문구와 ko/en 카탈로그에서 Loading·로딩 중·불러오는 중을 막는다. aria-label과 카탈로그의 `accessibility.spinner`만 예외다. import 경로·주석·테스트·계약 사본은 검사하지 않는다.

경로 오류 경계는 번역된 안내·복구 버튼과 Next의 `digest`를 표시하며 원본 오류 문구를 출력하지 않는다. 루트 레이아웃의 헤더 `/me` 실패는 `global-error.tsx`가 처리한다. 이 화면은 기존 레이아웃을 대체하므로 자체 html·body·스타일·번역 provider를 두고 URL의 로케일로 같은 복구 UI를 렌더링한다. `ApiError.digest`에 traceId를 보존하므로 운영의 Server Component 오류에서도 서버 로그와 연결된다. 일반 Next 오류의 digest는 Next가 만든 진단 식별자다. catch-all 경로가 알 수 없는 URL을 로케일별 not-found 화면으로 연결한다. UI 테스트는 실제 Base UI와 next-intl을 사용하며 Next 요청 훅만 대체한다. 헤더 오류 통합 검사는 실제 HTTP `/me` 500을 두 로케일의 브라우저 복구 화면에서 확인한다. E2E용 test id는 추가하지 않는다.

## 하네스

전체 check는 기존 9단계를 유지하며 공식 skill 검사는 오프라인이다. check는 단계별 입력 해시를 캐시한다. 삭제도 변경으로 본다. 실패한 단계는 캐시하지 않는다. harness 캐시 키에는 설치 패키지 버전·설치 skill 해시도 포함한다. 전체·관련 테스트의 입력에는 `.claude/hooks/*.mjs`와 `.claude/settings.json`도 포함한다.
타입·린트 억제 사유는 파서가 구분한 토큰 앞의 실제 주석 범위에서만 읽는다. 템플릿 본문 안의 `//`·`/* */`는 주석으로 인정하지 않는다. 같은 줄의 실제 주석은 템플릿 뒤나 `${…}` 표현식 안에서도 인정한다.
Stop은 세션 시작 또는 마지막 통과 때의 스냅샷과 비교하므로 셸 편집도 감지한다.
세션별 상태는 `.cache/hooks/`에만 두며 환경 파일·의존성·빌드 산출물은 읽지 않는다.
빠른 검사는 변경 관련 테스트를 쓰고, 전체 검사는 pre-push와 CI에서 쓴다.
두 검사의 타입 단계는 `.next/types`를 비우고 `next typegen`으로 현재 route 타입을 만든 뒤 `tsconfig.check.json`으로 검사한다. 실행 중인 dev가 소유한 `.next/dev/types`는 보존하고 검사에서 제외한다. 타입 캐시에는 소스·설정과 현재 `.next/types` 내용을 포함한다.
App Router 템플릿은 Pages 전용 `no-html-link-for-pages` 규칙만 끈다. 이 프로젝트의 pre-commit과 린트가 같은 설정을 쓴다.
생성물 검사는 TypeSpec 계약과 web·목 타입을 재생성해 비교한다. E2E는 별도 `pnpm test:e2e`로 실행한다.

PreToolUse의 셸 검사는 단어 기반의 최선 검사다. `git push -fv`처럼 짧은 옵션 그룹의 어느 위치에든 `f`가 있으면 래퍼 안에서도 강제 push를 막는다. 권한 deny 글롭은 명시적인 `-f`·`--force`·`--force-with-lease`만 막고 결합 옵션은 hook이 검사한다. `--follow-tags`·`--no-follow-tags` 같은 일반 긴 옵션은 허용한다. 별도 프로그램 안에서 파일을 여는 동작까지 해석하지 않는다.
Hook JSON 형식의 기준은 [Claude Code 공식 문서](https://code.claude.com/docs/en/hooks)다.
저장소 비밀 스캔의 `@inquirer/password` 예외는 중첩 잠금 파일 경로와 패키지 이름을 모두 만족해야 한다. 독립 템플릿은 기본 prefilter로 잠금 파일을 제외하므로 별도 패키지 이름 예외를 두지 않는다. 수기 소스의 같은 표식은 비밀번호를 허용하지 않는다.

## 계약과 단독 개발

`contract/*`는 pnpm workspace다. 목의 `@ai-template/contract`는 TypeSpec 사본으로 연결되고 두 패키지는 루트 `tsconfig.base.json`과 고정된 개발 도구를 사용한다. API 규약도 `docs/conventions/`에 함께 복사해 계약 테스트와 AI가 같은 문서를 읽는다.

`pnpm gen`은 TypeSpec을 컴파일하고 API 선언, 실시간 이벤트 이름·payload 매핑, 에러 코드 목록과 목 타입을 다시 만든다. web 루트에 `gen.config.json`이 없으면 모든 타입의 입력은 TypeSpec 계약이다. 조합에서는 생성기가 이 설정에 백엔드의 `gen`이 내보낸 OpenAPI를 연결한다. 조합 루트의 gen이 백엔드 내보내기 뒤 web 생성을 실행한다.

선택 키: `openapi`, `contract`. 백엔드 스펙(`openapi`)에는 JSON 또는 YAML OpenAPI 파일의 앱 루트 기준 상대 경로를 넣는다. 값이 있으면 web API 선언·실시간 이벤트·에러 코드만 그 스펙에서 만든다. 계약 위치(`contract`)에는 계약 폴더의 앱 루트 기준 상대 경로를 넣는다. 생략한 계약 위치: `contract`. 설정 모듈(`scripts/gen-config.mjs`)이 mock·typespec·openapi.yaml 위치를 계산하고 dev·E2E·생성기·테스트 목·check가 함께 쓴다. 계약 OpenAPI와 목 타입은 선택한 계약의 TypeSpec에서 계속 만든다. 다른 키나 빈 값·절대 경로·없는 계약 폴더는 고치는 방법과 함께 거절한다. 백엔드 스펙이 없으면 백엔드에서 gen을 먼저 실행한다. 목은 프론트 단독 개발과 통합 테스트의 대역이며 백엔드 변경을 자동으로 따라가지 않는다.

`pnpm gen --check`도 같은 입력으로 임시 생성 결과를 비교한다. `pnpm check`의 생성물 캐시는 설정과 외부 스펙 변경을 반영하며 계약 두 패키지의 자체 검사도 돌린다. 사본은 원본 포맷을 보존하므로 web 포맷·린트에서 제외한다.
web 자체 생성물은 첫 줄에 직접 수정 금지 헤더를 둔다. 계약 생성물은 자체 freshness 검사로 확인한다. [계약 확장](recipes/change-contract.md)의 순서로 이 프로젝트의 TypeSpec과 목 수기 소스를 고치고 `pnpm gen`한다.
`gen.config.json`으로 백엔드 OpenAPI를 선택했다면 이 레시피는 대역을 바꾸는 절차이며, web 타입을 바꾸려면 백엔드 선언을 고쳐 OpenAPI를 먼저 내보낸다.

`pnpm dev`는 Next 환경 로더로 설정을 준비한다. API 주소가 HTTP loopback(localhost·127.0.0.1·[::1])에서 앱 설정의 mock 포트(기본 4010)와 `/api/v1`을 쓰면 같은 loopback에 목과 web을 함께 시작하며, 외부 백엔드 주소라면 web만 시작한다. 어느 자식이 종료하거나 Ctrl+C를 받으면 자신이 시작한 프로세스 트리를 함께 내린다. dev·HTTP 통합·E2E는 공통 `scripts/process-tree.mjs`를 쓴다. 목은 `node --import tsx`로 직접 실행하고, POSIX에서는 런처 종료 뒤에도 그룹을 정리한다. Windows는 직접 node가 자식을 소유하며 taskkill로 트리를 끝낸다. 종료 확인을 기다리고 한도를 넘으면 강제 종료한다.

## HTTP 통합과 E2E

공통 테스트 계정 지원은 `src/lib/testing/account.ts`에 두며 가입·메일 인증·로그인 준비를 공유한다. 기능 fixture는 자기 자원의 생성·정리를 맡는다.
공통 목 실행기는 `scripts/test/mock-server.ts`에 두며 테스트 설정을 받아 자유 포트·준비 확인·실패와 종료 정리를 맡는다. global setup이 서버 기동 순서와 역순 정리를 맡는다.
제품 코드는 `lib/testing`과 `scripts/test`를 import하거나 재수출하지 않는다. 경계 린트가 동적 import도 막으며 제품 공개 인터페이스에 테스트 지원을 내보내지 않는다.

Vitest global setup이 자유 포트의 실제 복사 목 두 개(기본·재인증용)와 Next dev를 시작한다. 헤더 오류 검사는 별도 자유 포트의 HTTP 중계에서 `/me` 500만 주입하고, 나머지 요청은 기본 목에 전달한다. `pnpm check`·`pnpm test`는 이 오류 화면을 브라우저에서 확인하므로 `pnpm setup`이 설치한 Chromium이 필요하다. 없으면 서버를 시작하기 전에 설치 안내 한 줄로 실패한다. `scripts/http/`의 i18n·세션 갱신·로그인·가입·비밀번호 재설정 파일은 같은 `helpers.ts`에서 서버 주소·API·폼 제출을 가져온다. 브라우저는 검사 finally에서, Next → 중계 → 목은 global setup의 finally에서 내린다. 개발 포트 3000·4010을 사용하지 않는다.

`pnpm setup`은 의존성 설치 → 환경 키 보충 → 독립 저장소 hook 설치 → 고정 Playwright 1.63.0의 Chromium 설치 순서다. 브라우저 설치가 실패해도 환경과 hook 준비는 남고 실패 코드로 끝난다. 재실행은 기존 환경 값을 유지한다. `pnpm test:e2e`는 headless Chromium에서 운영 코드를 검사한다.

Playwright `webServer`가 `scripts/e2e-server.ts`를 실행한다. mock 대상만 목 127.0.0.1:4110을 검사·기동하고 `/health/ready`를 기다린다. FastAPI 대상은 외부 API의 `/health/ready`를 기다리며 목을 시작하거나 4110을 검사하지 않는다. 두 대상 모두 web localhost:3100을 검사하고 `next build` → `next start`를 실행한다. 검사할 포트가 사용 중이면 실패하며 기존 서버를 재사용하거나 종료하지 않는다. 개발 서버와 동시에 실행할 수 있는 포트지만 Next 빌드 산출물을 함께 쓰므로 이 프로젝트의 dev·build·check와 E2E는 동시에 실행하지 않는다.

운영 start는 예시 비밀을 거절하므로 Playwright 설정이 실행마다 32바이트 무작위 `SESSION_SECRET`을 생성해 서버 프로세스에만 전달한다. 환경 파일을 고치거나 비밀을 출력하지 않는다. Playwright 설정은 상속한 `NO_COLOR`를 지우고 서버와 테스트 프로세스에 `FORCE_COLOR=1`을 사용해 색상 경고를 막는다. 운영의 Secure·`__Host-web-session` 쿠키를 localhost Chromium에서 그대로 검사한다. 성공·실패 모두 Playwright가 서버 트리와 브라우저를 종료하고, 기동 스크립트도 오류·종료 신호에서 자신이 시작한 자식만 정리한다.

`e2e/targets/`는 `E2E_TARGET`의 부수 채널 어댑터다. mock은 실제 `/_test/mail?to=…`를, fastapi는 Mailpit의 수신자·목적·새 메일을 골라 실제 web 링크를 읽는다. 메일함은 비우지 않는다. `expireRecentLogin`은 설정한 창과 여유 시간을 기다린다. 세 제공자의 성공은 username·제공자별 claims 폼과 실제 redirect를, 거부는 현재 state·redirect_uri를 쓴다. BFF의 PKCE를 유지하며 일반 E2E에 대상별 분기·전용 URL을 넣지 않는다. fastapi는 외부 API 준비 뒤 web만 기동하고 목으로 대체하지 않는다.

운영 Chromium E2E 20개는 기존 가입·메일 인증·로그인·로그아웃·재설정·returnTo와 W3 프로필·아바타·언어 전환·내 글·커버·발행·취소·삭제·소셜 로그인·거부·탈퇴 재인증·비밀번호 변경을 검사한다. 두 컨텍스트의 세션 폐기·비밀번호 변경은 실제 Socket.IO 연결과 session.revoked를 확인하며 현재 세션을 유지한다. 공개 목록은 posts 구독 ack 뒤 글을 바꿔 문서 reload 없이 반영되는지 확인한다. 커버·아바타 PNG는 텍스트에서 실행 때 만들고 실제 이미지 로드까지 확인한다.

`pnpm check`의 생성기 검사는 독립 임시 사본에 새 기능을 만들고 그 사본의 타입·경계 린트·단위·실제 목·HTTP 검사를 실행한다. 생성기 project는 기존 web 검사 뒤에 실행해 Next 빌드 산출물이 겹치지 않게 한다. 환경 파일은 임시 사본에 복사하지 않는다.

CI의 web 작업은 Node 24·pnpm 12.6.0과 frozen 설치·Chromium의 Linux 의존성을 준비하고 check → mock E2E → 이미지 빌드를 실행한다. 외부 FastAPI 작업은 호출자가 전용 스택과 같은 E2E·동일 실행 ID의 후속 정리를 맡는다. 로컬에서 두 대상의 20개를 확인했으며 CI 결과는 PR CI에서 확인한다.
