# Next.js web 템플릿 설계 (하위 프로젝트 2)

- 작성일: 2026-09-30
- 상태: 초안(사용자 검토 대기)
- 상위 문서: [기반 설계](2026-09-26-ai-template-foundation-design.md)
  - 이 문서는 기반 설계 §10에서 사이클 2로 미룬 결정을 내리고, `templates/nextjs`, 목 서버(`contract/mock`), 이번 사이클의 저장소 변경을 설계한다.
  - 기반 설계의 규칙은 그대로 따른다: 플랫폼 기능(§4), API 규약(§5), 하네스(§6), 인프라와 품질(§7).
  - 백엔드의 동작 기준은 [FastAPI 설계](2026-09-26-fastapi-template-design.md)와 [보강 설계](2026-09-29-fastapi-hardening-design.md)다. 목 서버는 그 동작을 따른다.
- 다음 단계: W1(목 서버) 구현 계획

## 1. 목표와 범위

### 1.1 산출물

1. `contract/mock`: 계약 전체를 메모리로 구현한 목 서버. 단독 web의 개발·E2E 백엔드이자 적합성 스위트의 `mock` 대상이다.
2. `templates/nextjs`: web 템플릿. 기반 설계 §4의 플랫폼 기능 가운데 web이 맡는 화면(§6)을 BFF 구조(§5)로 구현하고, 하네스(§9)를 적용한 독립 프로젝트다.
3. 적합성 스위트 변경: `mock` 대상과 그 부수 채널 어댑터(§8.7).
4. 템플릿 저장소 변경: 공유 자산 동기화, `verify-templates`의 Next.js 템플릿 규칙, CI(§11).

### 1.2 완료 조건

기반 설계 §3.4의 완료 조건(목 서버가 적합성 테스트를 통과하고, web E2E가 목과 FastAPI 양쪽에서 통과한다)을 다음으로 확인한다.

- `pnpm conformance mock`이 적합성 스위트 전체를 통과한다.
- 템플릿 폴더에서 `pnpm check`와 `pnpm test:e2e`(목 대상)가 통과한다.
- 같은 E2E가 FastAPI 스택을 대상으로도 통과한다(`E2E_TARGET=fastapi`).
- 저장소 루트의 `pnpm check`(verify-templates 포함)와 CI가 통과한다.

### 1.3 범위 밖

기반 설계 §4.11에 더해 다음은 이번 사이클에서 다루지 않는다.

- admin 화면(하위 프로젝트 4), create CLI(3), NestJS(5)
- 분석, PWA, 로케일별 메타데이터를 넘는 SEO
- 다크 모드 토글(시스템 설정만 따른다)
- 목 서버의 영속 저장, 여러 인스턴스, 운영 수준의 비밀번호 해시
- web 인스턴스 여러 대 사이의 토큰 갱신 조율(§5.2의 한계)

## 2. 결정 기록

| #   | 주제                  | 결정                                                                                                                                       | 이유                                                                                                            |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| N1  | 진행 방식             | 스펙 하나에 마일스톤 넷(W1 목 서버 → W2 web 뼈대 → W3 기능 화면과 실시간 → W4 E2E와 마무리). 마일스톤마다 프로토타입 → 계획 → SDD        | 목 서버의 테스트 통로와 web E2E를 한 설계에서 맞춘다                                                            |
| N2  | 데이터 패칭           | Server Component가 읽고 Server Action이 쓴다. 클라이언트 캐시 라이브러리(TanStack Query 등)는 넣지 않는다. 실시간은 `router.refresh()`로 반영한다 | 패턴이 하나라 AI가 헷갈리지 않는다. BFF가 토큰을 쥐므로 읽기와 쓰기가 모두 서버에서 일어난다                    |
| N3  | API 클라이언트        | openapi-typescript로 계약 타입을 만들고 openapi-fetch로 부른다. JSON:API 도우미는 계약 타입을 유지하도록 직접 쓴다                         | orval의 쿼리 훅과 MSW는 N2와 N9에서 쓰지 않는다. 범용 JSON:API 라이브러리(jsona 등)는 계약 타입과 끊긴다        |
| N4  | 폼                    | 폼 라이브러리 없이 Server Action과 `useActionState`. 필드 에러는 JSON:API 에러의 `source.pointer`로 붙인다                               | 검증 원본은 백엔드 하나다. JS 없이도 제출된다                                                                   |
| N5  | UI                    | Tailwind 4와 shadcn(Base UI 기반). shadcn 공식 skill은 넣고 MCP는 넣지 않는다. 다크 모드는 시스템 설정만 따른다                           | Base UI가 shadcn의 기본이 됐다(2026-07). CLI와 skill로 충분하고 도구 부담이 적다                                 |
| N6  | i18n                  | next-intl, `localePrefix: 'as-needed'`(ko는 접두사 없음, en은 `/en`), `NEXT_LOCALE` 쿠키, 계정의 `locale`과 동기화                         | 한국어 우선 서비스의 URL이 짧고, 영어 페이지도 공유·검색되는 자기 URL을 가진다                                   |
| N7  | 세션                  | 두 토큰을 암호화한 쿠키 하나(JWE)에 둔다. 갱신은 `proxy.ts` 한 곳에서만 하고, 프로세스 안에서 같은 토큰의 갱신을 묶는다                    | 백엔드가 refresh token 재사용을 유예 없이 감지해 세션을 폐기한다(§5.2)                                           |
| N8  | 소셜 로그인           | route handler가 code verifier를 암호화한 단기 쿠키에 두고, 콜백은 그 쿠키가 없으면 거부한다                                                | 기반 설계 §4.2의 BFF 흐름과 로그인 CSRF 방지                                                                    |
| N9  | 목 서버               | `contract/mock`에 TypeScript(Hono, socket.io)로 인메모리 구현. 요청 검증은 계약의 JSON Schema(Ajv)로 한다. 테스트 통로는 `/_test`, `/_mock` | 적합성 스위트(Socket.IO, 부수 채널)를 통과하려면 상태 있는 서버가 필요하다. 계약이 바뀌면 검증이 저절로 따라간다 |
| N10 | 단독 web의 계약 확장  | TypeSpec 원본을 계약 사본과 함께 템플릿에 넣는다. `pnpm gen`이 `openapi.yaml`과 타입을 다시 만든다                                         | JSON:API YAML을 손으로 고치면 반복이 많아 AI가 틀리기 쉽다                                                      |
| N11 | Next.js 관리 블록     | `agentRules: false`로 끄고, 설치 버전 문서를 먼저 읽는다는 규칙을 우리 AGENTS.md에 직접 둔다                                                | 하네스가 검사하는 지침 문서를 도구가 바꾸지 않게 한다                                                            |
| N12 | TypeScript            | 6.0.3만 쓴다                                                                                                                               | TS7은 GA지만 typescript-eslint(8.71)가 아직 지원하지 않는다                                                     |
| N13 | Node                  | 24 LTS                                                                                                                                     | Next 16.3이 Node 26에서 vendored `jsonwebtoken` 문제로 깨진다(PR 미병합). W4에서 다시 본다                      |
| N14 | 비밀 스캔             | 동기화한 계약 사본과 생성물 경로만 허용 목록에 둔다                                                                                        | 계약의 예시 값이 비밀로 오탐된다. 손으로 쓴 코드는 계속 검사한다                                                |
| N15 | 로딩 표시             | 스켈레톤이나 스피너만 쓰고 문구를 쓰지 않는다. 템플릿 규칙으로 둔다                                                                       | 이 저장소 사용자의 규칙이다. AI가 만든 화면도 같은 규칙을 따르게 한다                                           |
| N16 | 테스트 대상           | BFF 통합 테스트는 실제 목 서버 프로세스에 붙인다. E2E는 목이 기본이고 `E2E_TARGET=fastapi`로 FastAPI 스택에 붙인다                        | 자기 인프라를 모킹하지 않는다(기반 설계 §7.4). 같은 E2E로 두 백엔드를 확인한다                                  |

## 3. 스택

버전은 2026-09-29에 확인했다(§14). 모두 정확히 고정한다(`^`, `~`, 범위 금지).

| 항목                                        | 버전                          | 비고                                                                     |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| Node / pnpm                                 | 24 LTS / 12                   | N13                                                                      |
| Next.js / React                             | 16.3.7 / 19.3.0               | 16.3.6이 2026-09 보안 릴리스(next/og RCE)다                              |
| TypeScript                                  | 6.0.3                         | N12                                                                      |
| Tailwind CSS / shadcn CLI                   | 4.3.3 / 4.21.0                | Base UI 기반(`-b base`)                                                  |
| next-intl / Zod                             | 4.14.7 / 4.6.5                |                                                                          |
| openapi-typescript / openapi-fetch          | 7.13.0 / 0.17.0               | `application/vnd.api+json`은 직렬화 설정이 필요하다(§13 #2)              |
| socket.io-client / socket.io                | 4.8.4 / 4.8.4                 | python-socketio 5.x(프로토콜 v5)와 호환                                  |
| Hono / @hono/node-server                    | 4.13.11 / 2.1.3               | 목 서버                                                                  |
| ESLint / typescript-eslint / eslint-config-next | 10.11.0 / 8.71.0 / 16.3.7 | flat config만(Next 16에서 `next lint` 제거)                              |
| Vitest                                      | 5                             | 저장소와 같게                                                            |
| Playwright / @playwright/cli                | 1.63.0 / 0.1.22               |                                                                          |
| next-devtools-mcp                           | 0.4.0                         |                                                                          |

아직 확인하지 않은 것(Ajv, jose, react-markdown과 remark-gfm, 경계 린트 플러그인, Prettier, tsx)은 해당 마일스톤의 계획을 쓸 때 확인해 고정하고 이 표에 더한다.

## 4. 템플릿 구조

### 4.1 폴더

```
templates/nextjs/
├── AGENTS.md, CLAUDE.md
├── .claude/                  # hooks, settings.json, skills
├── .mcp.json                 # next-devtools-mcp (버전 고정)
├── lefthook.yml, .env.example, package.json, next.config.ts, Dockerfile
├── contract/                 # TypeSpec 원본과 openapi.yaml (저장소에서 sync한 사본)
├── mock/                     # 목 서버 (저장소에서 sync한 사본)
├── messages/                 # ko.json, en.json
├── src/
│   ├── proxy.ts              # 로케일 라우팅, 로그인 필요 경로, 토큰 갱신
│   ├── app/
│   │   ├── [locale]/…        # 화면
│   │   └── auth/oauth/…      # 소셜 로그인 route handler (로케일 밖)
│   ├── features/<기능>/      # posts(골든), auth, me, sessions: 컴포넌트, actions.ts, queries.ts, index.ts(공개 인터페이스)
│   ├── lib/
│   │   ├── api/              # 클라이언트, 생성 타입, JSON:API 도우미, 에러
│   │   ├── session/          # 쿠키 암호화, 갱신 묶기
│   │   ├── realtime/         # RealtimeProvider, useChannel
│   │   ├── i18n/             # next-intl 설정, 에러 메시지
│   │   └── env.ts            # 설정 스키마
│   └── components/ui/        # shadcn 부품
├── e2e/                      # Playwright
├── scripts/                  # check 실행기, gen, gen:feature, hook 스크립트
└── docs/                     # architecture.md, stack.md, recipes/
```

### 4.2 계층과 경계

- 화면(`app`)은 기능의 공개 인터페이스(`features/<기능>/index.ts`)와 `lib`, `components`만 쓴다.
- 기능끼리는 서로의 내부를 import하지 않는다. 다른 기능이 필요하면 그 기능의 공개 인터페이스를 쓴다.
- `lib/api`, `lib/session`과 기능의 `actions.ts`·`queries.ts`는 `server-only`다. 클라이언트 번들에 들어가면 빌드가 실패한다.
- 규칙은 경계 린트가 강제한다(§9.3).

### 4.3 실행

- 단독 모드(`API_BASE_URL`이 목을 가리킨다): `pnpm dev`가 목 서버와 `next dev`를 함께 띄운다.
- 백엔드 모드(`API_BASE_URL`이 실제 백엔드를 가리킨다): `pnpm dev`가 `next dev`만 띄운다.
- E2E는 Playwright의 `webServer`로 목(또는 대상 백엔드)과 `next build` + `next start`를 띄운다.

## 5. BFF

### 5.1 원칙과 세션 쿠키

- 브라우저는 백엔드 API를 부르지 않는다(백엔드 CORS는 닫혀 있다, 기반 설계 §7.6). 모든 API 호출은 Next.js 서버 코드(Server Component, Server Action, route handler)가 한다.
- 브라우저가 백엔드 쪽에 직접 붙는 곳은 둘뿐이다. Socket.IO 연결(티켓, 허용 Origin)과 presigned URL로 스토리지에 올리는 업로드다.
- 로그인하면 BFF가 access token, refresh token, access token의 만료 시각을 쿠키 하나에 담는다.
  - 만료 시각은 계약의 세션 응답(`accessTokenExpiresAt`, `refreshTokenExpiresAt`)에서 읽는다. BFF는 토큰의 내용을 해석하지 않는다.
  - 쿠키는 `SESSION_SECRET`으로 암호화한다(JWE). 수명은 refresh token의 만료 시각까지다.
  - httpOnly, SameSite=Lax, Path=/. 운영에서는 Secure와 `__Host-` 접두사를 붙인다.
  - 쿠키 하나라 두 토큰이 늘 함께 바뀐다.
- 로그인이 필요한 경로(내 정보, 내 글)는 `proxy.ts`가 쿠키가 없으면 로그인으로 보낸다. `returnTo`는 같은 사이트의 상대 경로만 받는다(열린 리다이렉트 방지). 권한 판정의 원본은 백엔드의 401·403이다.

### 5.2 토큰 갱신

- 백엔드는 이미 쓴 refresh token이 다시 들어오면 그 세션을 폐기한다(유예 없음, `auth.refresh_token_reused`). BFF는 같은 refresh token을 두 번 보내면 안 된다.
- 갱신은 `proxy.ts` 한 곳에서만 한다.
  - access token의 남은 시간이 60초 미만이면 갱신한다.
  - 새 쿠키를 응답에 싣고, 같은 요청의 렌더링도 새 토큰을 보도록 요청의 쿠키 헤더를 바꾼다.
  - 같은 refresh token의 동시 갱신은 프로세스 안에서 하나로 묶는다. 결과를 30초 동안 기억해서, 옛 쿠키를 들고 늦게 온 요청이 옛 토큰으로 다시 갱신하지 않게 한다.
  - 갱신이 실패하면(재사용 감지, 만료, 폐기) 쿠키를 지우고 로그인으로 보낸다.
- Server Component와 Server Action은 갱신하지 않는다. 백엔드가 401을 주면 쿠키를 지우고 로그인으로 보낸다.
- `proxy.ts`의 matcher는 Server Action 요청(페이지 경로로 가는 POST)도 포함한다.
- 한계: web 인스턴스가 여럿이면 서로 다른 인스턴스가 같은 토큰으로 동시에 갱신할 수 있다. 기본 배포는 인스턴스 하나이고, 여러 대면 sticky session을 쓰라고 `docs/architecture.md`에 적는다. 이 한계를 없애려면 백엔드가 직전 refresh token의 짧은 재사용을 허용해야 하는데, 계약 변경이라 이번 사이클에서는 하지 않는다.

### 5.3 데이터 흐름

- 읽기: Server Component가 요청마다 만든 API 클라이언트(§5.4)로 읽는다. 같은 요청 안에서는 `React.cache`로 중복 호출을 막는다.
- 쓰기: Server Action이 부른다. 성공하면 `revalidatePath`나 `refresh`로 화면을 갱신하고, 실패하면 §5.5의 에러 상태를 돌려준다.
- 실시간 티켓: 클라이언트 컴포넌트가 Server Action으로 `POST /realtime-tickets`의 티켓을 받아 Socket.IO에 붙는다.
- 로케일: 모든 API 호출에 현재 UI 로케일을 `Accept-Language`로 보낸다. 가입할 때 계정의 `locale`이 이것으로 정해진다.

### 5.4 API 클라이언트와 JSON:API 도우미

- `gen`이 `contract/openapi.yaml`에서 `src/lib/api/schema.d.ts`(openapi-typescript)를 만든다. 조합 프로젝트에서는 백엔드의 `openapi.json`이 입력이다(기반 설계 §3.3).
- openapi-fetch 클라이언트를 요청마다 만들고 미들웨어를 붙인다.
  - `Authorization: Bearer`, `Accept-Language`, `Accept`와 `Content-Type`(`application/vnd.api+json`), 본문 직렬화
  - trace id 전달과 로그
  - 비정상 응답을 `ApiError`로 바꾼다
- JSON:API 도우미는 계약 타입을 그대로 쓴다.
  - include 해석과 관계 연결(`included`에서 찾는다)
  - 쿼리 조립(filter, sort, page, include, fields)
  - 페이지 링크에서 다음·이전 페이지를 읽는다
- 실시간 이벤트 이름과 페이로드 타입, 계약의 에러 코드 목록도 `gen`이 계약에서 만든다(`x-realtime-events`, `ErrorCode`).

### 5.5 에러

- `ApiError`는 상태, 에러 코드, `meta.params`, `source.pointer`, trace id를 가진다. 클라이언트가 믿는 것은 코드와 params뿐이다(기반 설계 §4.8).
- 폼 액션은 `{ ok: true }` 또는 `{ ok: false, formError, fieldErrors }`를 돌려준다.
  - `source.pointer`가 `/data/attributes/<속성>`이면 그 입력칸의 에러다.
  - 짝이 없으면 폼 에러다.
  - 메시지는 에러 코드와 params로 번역한다(§7.2).
- 401은 로그인으로, 403과 404는 해당 화면의 안내로, 429는 `Retry-After`를 쓴 안내로 바꾼다.
- 예상하지 못한 에러는 에러 경계가 trace id와 함께 보여 준다.

### 5.6 소셜 로그인

1. 로그인 화면의 제공자 버튼은 route handler(`/auth/oauth/<제공자>/start`)로 간다.
2. handler가 code verifier(RFC 7636)를 만들고, 제공자와 `returnTo`와 함께 암호화한 단기 쿠키(10분)에 둔다. 브라우저를 백엔드의 `GET /api/v1/oauth/<제공자>/authorize?redirectUri=<web 콜백>&codeChallenge=<S256>`으로 보낸다.
3. 콜백 handler(`/auth/oauth/callback`)는 verifier 쿠키가 없거나 제공자가 다르면 거부한다(로그인 CSRF 방지, 기반 설계 §4.2).
4. 쿠키가 맞으면 서버 간 호출로 `POST /sessions`(grantType `oauthCode`, `codeVerifier`)를 부르고, 세션 쿠키를 만들고, verifier 쿠키를 지우고, `returnTo`로 보낸다.
5. `error`가 오면(`auth.oauth_denied`, `auth.oauth_failed`) 로그인 화면에 번역한 안내를 띄운다.

- web 콜백 주소는 백엔드의 `redirectUri` 허용 목록에 있어야 한다(§11.2).

### 5.7 보안

- Server Action은 Next.js의 Origin 검사를 쓴다. 값을 바꾸는 route handler는 Origin을 직접 확인한다.
- 세션과 verifier 쿠키는 암호화하고 httpOnly다. 토큰은 URL, 로그, 클라이언트 번들에 나오지 않는다.
- 비밀은 `.env`에 두고 AI의 읽기를 막는다(기반 설계 §6.5).

### 5.8 설정

- 설정은 `src/lib/env.ts`의 Zod 스키마로 시작할 때 검증한다. 빠지거나 틀리면 어떤 변수인지 알려 주고 멈춘다.
- 서버 전용: `API_BASE_URL`, `APP_URL`(web의 바깥 주소, 콜백에 쓴다), `SESSION_SECRET`(32바이트 이상), `TIME_ZONE`(기본 `Asia/Seoul`)
- 브라우저: `NEXT_PUBLIC_REALTIME_URL`(Socket.IO 주소)
- 운영(`NODE_ENV=production`)에서 `SESSION_SECRET`이 `.env.example`의 예시 값이면 시작하지 않는다(보강 설계 H6와 같은 규칙).
- `.env.example`과 설정 스키마가 같은지 `check`가 본다(기반 설계 §6.3).

## 6. 화면과 기능

기반 설계 §4.9의 web 범위와 §4.1의 사용자 기능 가운데 일반 사용자가 쓰는 것을 모두 넣는다.

### 6.1 공개 글

- 목록: 발행된 글, 검색(`filter[q]`), 정렬(최신·발행일·제목), 페이지, 작성자와 커버 이미지(`include=author,coverImage`)
- 상세: 마크다운 본문, 작성자, 커버 이미지
- 둘 다 `posts` 채널로 실시간 반영한다(§6.7).

### 6.2 인증

- 가입(이름, 이메일, 비밀번호). 인증 메일 안내와 재발송
- 이메일 인증 링크 처리(메일의 토큰으로 `POST /email-verifications`)
- 로그인(비밀번호). `auth.email_not_verified`면 재발송을 안내한다
- 소셜 로그인(Google, Kakao, Naver, §5.6)
- 비밀번호 재설정 요청과 재설정(메일의 토큰)
- 로그아웃(`DELETE /sessions/current`. 실패해도 쿠키는 지운다)

### 6.3 내 정보

- 이름, 로케일, 아바타(§6.8)를 바꾼다. 로케일을 바꾸면 쿠키와 URL도 바꾼다(§7.2).
- 비밀번호 변경(현재 비밀번호 필요). 다른 세션이 폐기된다는 안내를 보여 준다.

### 6.4 세션

- 활성 세션 목록(현재 세션 표시)
- 세션 하나 폐기, 다른 기기 로그아웃, 전체 로그아웃(`POST /session-revocations`)

### 6.5 탈퇴

- 확인을 받고 `DELETE /me`를 부른다.
- `auth.reauthentication_required`(로그인한 지 10분이 지남)면 다시 로그인하게 안내하고, 로그인한 뒤 탈퇴 화면으로 돌아온다.
- 성공하면 쿠키를 지우고 첫 화면으로 보낸다.

### 6.6 내 글

- 목록: 내 초안과 발행 글, 상태로 거르기
- 작성과 수정: 제목, 본문(마크다운 textarea와 미리보기), 커버 이미지(§6.8)
- 발행과 발행 취소(`status` 변경. `post.invalid_transition`을 안내한다), 삭제

### 6.7 실시간

- 루트 레이아웃의 `RealtimeProvider`가 연결 하나를 관리한다. 로그인했으면 티켓으로, 아니면 익명으로 붙고 WebSocket만 쓴다.
- 페이지는 `useChannel('posts', 처리기)`처럼 채널을 구독한다. ack가 거부면 조용히 무시하지 않고 로그를 남긴다.
- 서버가 끊으면(`io server disconnect`) 새 티켓으로 다시 붙는다.
- 이벤트
  - `session.revoked`: 로그아웃 처리(쿠키 삭제, 로그인 화면)
  - `me.updated`: `router.refresh()`
  - `post.*`: 목록은 짧게 모아 `router.refresh()`로 반영한다. 상세는 같은 글이면 반영하고, 지워졌거나 발행이 취소됐으면 안내를 띄운다.

### 6.8 업로드

1. Server Action이 `POST /files`(파일 이름, 타입, 크기)로 업로드 정보(`meta.upload`)를 받는다.
2. 브라우저가 presigned URL로 스토리지에 바로 올린다.
3. Server Action이 `PATCH /files/{id}`로 `ready`를 보낸다.
4. 파일 id를 폼 값으로 넘겨 글의 커버나 내 아바타에 건다.

- 크기·타입·한도 에러(`file.*`)는 번역해 보여 준다. 진행 중에는 스피너만 보여 준다(N15).

## 7. UI, i18n, 폼

### 7.1 UI

- 부품은 `shadcn add`로 `components/ui`에 넣는다. 기본 부품을 손으로 새로 만들지 않는다.
- 레이아웃: 헤더(글, 내 글, 로케일 전환, 사용자 메뉴 또는 로그인), 본문, 짧은 푸터. 반응형이다.
- 마크다운은 원시 HTML 없이 렌더링한다(react-markdown + GFM).
- 로딩 상태는 스켈레톤이나 스피너(`Loader2`)로만 표시하고 문구를 쓰지 않는다(N15). 스피너에는 화면 낭독기용 `aria-label`만 붙인다.
- E2E가 역할과 이름으로 요소를 찾을 수 있게 접근성 속성을 붙인다. 테스트 전용 id는 최소로 쓴다.

### 7.2 i18n

- next-intl, `localePrefix: 'as-needed'`: ko는 접두사가 없고 en은 `/en`이다.
- 첫 방문은 `Accept-Language`로 정하고, 선택은 `NEXT_LOCALE` 쿠키로 유지한다.
- 로그인한 사용자는 계정의 `locale`을 따른다. 로그인할 때 계정 로케일로 맞추고, 프로필에서 바꾸면 백엔드와 쿠키를 함께 바꾼다.
- 메시지는 `messages/ko.json`과 `messages/en.json`이다. 타입은 ko를 기준으로 만들어 없는 키를 쓰면 컴파일 에러가 난다.
- `check`가 두 로케일의 키가 같은지와, 계약의 모든 에러 코드에 두 로케일의 번역이 있는지 본다(기반 설계 §6.3).
- 날짜와 시간은 서버와 클라이언트가 같은 시간대(`TIME_ZONE`)로 포맷한다(hydration 불일치 방지).

### 7.3 폼

- `useActionState`와 `<form action>`으로 만든다. 입력칸의 `name`은 계약의 속성 이름과 같다.
- 제출 중에는 `useFormStatus`로 버튼을 막고 스피너를 보여 준다.
- 클라이언트 검증은 HTML 속성(required, maxLength, type)까지만 한다. 검증 원본은 백엔드다.
- JS가 꺼져 있어도 제출되고, 결과에 따라 리다이렉트된다(§13 #8).

## 8. 목 서버

### 8.1 역할

- 단독 web의 개발·E2E 백엔드이고, 적합성 스위트의 세 번째 대상이다(기반 설계 §5.9).
- 계약을 흉내만 내지 않고 FastAPI와 똑같이 동작한다. 검증, 에러 코드와 우선순위, JSON:API 규칙(include, fields, sort, 415·406·413, 페이지 링크), 레이트 리밋, 실시간 이벤트, 연결 재검사까지 같다.

### 8.2 구성

- 위치는 `contract/mock/`(저장소 pnpm 워크스페이스 패키지)이다. TypeScript를 Node 24에서 `tsx`로 바로 실행한다.
- Hono와 `@hono/node-server`가 HTTP를, 같은 `node:http` 서버에 붙인 socket.io가 실시간을 맡는다. 포트 하나(기본 4010)에 API, Socket.IO, 가짜 스토리지, 테스트 통로가 함께 뜬다.
- 모듈은 백엔드와 같은 단위(auth, users, roles, files, posts, audit-logs, realtime)로 나눈다. JSON:API 공통 층(문서 렌더링, 에러, 쿼리 해석, 미디어 타입 협상, 본문 한도)은 따로 둔다.
- 목의 타입은 web과 같은 `openapi.yaml`에서 생성한다.

### 8.3 요청 검증

- 요청 문서는 `openapi.yaml`의 JSON Schema로 Ajv(2020-12)가 검증한다. 실패는 `validation.*` 코드와 JSON pointer로 옮긴다.
- 계약이 바뀌면 목의 검증도 저절로 따라간다.
- 옮긴 결과가 FastAPI의 동작(적합성 스위트의 기대)과 같은지는 W1 프로토타입에서 확인한다(§13 #1).

### 8.4 데이터와 토큰

- 데이터는 프로세스 메모리에 두어 재시작하면 초기화된다.
- 시작할 때 FastAPI와 같은 시드(admin·member 역할, 관리자, 예제 글)를 넣는다. 관리자 계정은 환경 변수로 받는다.
- 토큰은 불투명한 무작위 문자열이어도 된다. 만료 시각은 계약의 세션 응답(`accessTokenExpiresAt`, `refreshTokenExpiresAt`)으로 알리고, 수명(access 15분, refresh 30일)은 FastAPI와 같다. BFF(§5.2)는 이 값만 보므로 두 백엔드에서 똑같이 동작한다.
- refresh token의 회전과 재사용 감지, 이메일 인증·재설정 토큰, 소셜 로그인의 1회용 코드는 FastAPI와 같은 규칙이다.
- 비밀번호는 가벼운 해시로 둔다(운영용이 아니다).

### 8.5 파일

- `meta.upload`의 presigned URL은 목의 가짜 스토리지(`PUT /_storage/...`)를 가리킨다. 서명과 만료를 검사하고, web Origin의 CORS를 허용한다.
- `ready`로 바꿀 때 객체가 있는지와 크기를 확인한다. 한도, 풀린 파일 정리는 FastAPI와 같다.

### 8.6 실시간

- 티켓 인증, `user:{id}` 룸, `posts`·`posts:all` 구독과 ack, 이벤트, 세션 폐기·역할 변경 때의 재검사와 연결 끊기를 구현한다.
- 목은 프로세스가 하나라 제어 채널 없이 바로 처리한다.

### 8.7 테스트 통로

`MOCK_TEST_ENDPOINTS`(기본 켜짐)일 때만 연다.

- 메일 수신함: 적합성과 E2E가 인증·재설정 메일을 읽는 JSON API(`/_test/mail`). 사람이 보는 목록 화면(`/_mock/mail`)도 둔다. 단독 개발에서 Mailpit 역할을 한다.
- 소셜 로그인
  - 테스트가 다음 로그인의 신원(클레임)을 미리 정하는 엔드포인트(`/_test/oauth/...`)
  - 사람이 신원을 고르는 가짜 제공자 화면(`/_mock/oauth/...`)
  - FastAPI 쪽 모의 OAuth 서버와 같은 흐름(authorize → 제공자 → callback → 1회용 코드)을 탄다.
- 적합성 키트에 `mock` 대상의 부수 채널 어댑터를 이 통로로 더한다. `pnpm conformance mock`은 Docker 없이 목 프로세스만 띄워 돈다.

### 8.8 web 템플릿과의 관계

- `pnpm sync`가 `contract/mock`, `contract/openapi.yaml`, `contract/typespec`을 web 템플릿의 `mock/`과 `contract/`로 복사한다. 저장소 CI는 사본이 원본과 같은지 본다.
- 단독 web 프로젝트가 API를 넓힐 때는 TypeSpec을 고치고 `pnpm gen`으로 `openapi.yaml`과 타입을 다시 만든 뒤, 목에 핸들러를 더한다(레시피).
- 조합 프로젝트에서는 백엔드의 `openapi.json`이 원본이고, 목은 프론트만 개발할 때 쓴다.

## 9. 하네스

### 9.1 명령

| 명령          | 하는 일                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `setup`       | 의존성 설치, `.env` 준비(없으면 복사, 있으면 없는 키만 더함), Playwright 브라우저 설치                     |
| `dev`         | 단독 모드면 목 서버와 `next dev`, 백엔드 모드면 `next dev`                                                |
| `check`       | §9.2의 단계                                                                                              |
| `fix`         | 포맷과 자동 수정 가능한 린트                                                                              |
| `test`        | 단위·통합 테스트(E2E 제외)                                                                                |
| `test:e2e`    | Playwright E2E(기본 목 대상)                                                                              |
| `gen`         | TypeSpec → `openapi.yaml` → API 타입, 실시간 이벤트 타입, 에러 코드 목록                                  |
| `gen:feature` | 골든 기능 `posts`를 복사해 새 기능을 만든다(§9.7)                                                         |

DB가 없으므로 `db:*`는 두지 않는다(기반 설계 §6.2).

### 9.2 check

- 단계: 포맷, 린트, 타입, 테스트, 생성물 최신 여부, i18n(키 일치, 에러 코드 번역), 하네스(지침 파일 짝, 파일 크기, 억제 주석 사유, `.env.example`과 설정 스키마 일치)
- 실행기는 템플릿 안의 TypeScript로 쓴다(템플릿은 저장소의 다른 폴더를 참조하지 않는다). 성공하면 한 줄, 실패하면 실패한 단계의 출력만 보여 준다. 바뀌지 않은 단계는 캐시로 건너뛴다.
- 빠른 경로(Stop hook): 포맷, 린트, 타입, 바뀐 파일과 관련된 테스트(`vitest related`), 생성물 최신 여부

### 9.3 강제 장치

- TS 6.0.3 strict(`noUncheckedIndexedAccess` 포함)
- ESLint 10 flat config: eslint-config-next, typescript-eslint, 경계 린트(§4.2)
- 억제 주석(`eslint-disable`, `@ts-expect-error` 등)은 사유 주석이 없으면 실패한다.
- 파일 크기: 소스 400줄, 테스트 600줄(생성물 제외)
- 생성물: 첫 줄에 수정 금지 헤더를 달고, Claude 권한으로 생성물 경로의 Edit·Write를 막는다.
- 비밀 스캔(Betterleaks): 동기화한 계약 사본과 생성물 경로만 허용 목록에 둔다(N14).
- Next.js의 AGENTS.md 관리 블록은 `agentRules: false`로 끈다(N11).

### 9.4 hooks

기반 설계 §6.4의 4종을 Node 스크립트(`.claude/hooks/*.mjs`)로 exec form에 둔다.

- `PostToolUse`(Edit, Write): 고친 파일만 포맷하고 빠른 린트를 돌린다.
- `Stop`: §9.2의 빠른 경로
- `PreToolUse`(Bash, PowerShell): 위험한 명령(강제 푸시, 넓은 삭제 등) 차단
- `SessionStart`: 의존성, `.env`, 생성물 최신 여부 요약

### 9.5 권한 (`.claude/settings.json`)

- 허용: 명령 어휘(`pnpm check` 등), 읽기 전용 git 명령
- 차단: `.env` 읽기(`.env.example`은 허용), 생성물 경로의 Edit·Write, 위험한 명령

### 9.6 생성물

- `src/lib/api/schema.d.ts`, 실시간 이벤트 타입, 에러 코드 목록, `contract/openapi.yaml`(TypeSpec 컴파일 결과)
- 저장소의 사본(`contract/`, `mock/`)은 템플릿 저장소에서는 동기화 대상이다. 생성한 프로젝트에서는 그 프로젝트의 소스가 된다.

### 9.7 생성기, 레시피, skill

- 골든 기능은 `features/posts`와 그 화면(`app/[locale]/posts`, `app/[locale]/my/posts`)이다.
- `gen:feature <이름>`은 골든 기능을 복사해 이름을 바꾸고 등록 작업(메시지 키, 화면 경로, 테스트)까지 처리한다. AI는 기능 로직만 채운다.
- 레시피(`docs/recipes/`): 기능 추가, 페이지 추가, Server Action 추가, 실시간 구독, 번역 추가, API 넓히기(TypeSpec + 목 핸들러), UI 부품 추가
- skill: 레시피마다 얇은 포장(`.claude/skills/`). 공식 skill로 Next.js `next-dev-loop`, shadcn, Playwright CLI를 넣는다.
- `.mcp.json`에는 next-devtools-mcp(0.4.0)만 넣는다(N5).

### 9.8 지침 파일과 문서

- 루트 AGENTS.md(200줄 이하): 명령, 구조 지도, 핵심 규칙(BFF, 경계, 폼, 로딩 표시, i18n), 완료 기준, 문서 링크
- 설치 버전의 문서를 보라는 규칙: Next.js는 `node_modules/next/dist/docs`, 다른 라이브러리는 `docs/stack.md`의 버전과 링크
- 폴더별 AGENTS.md: `src/features/`, `src/lib/`, `mock/`, `e2e/`
- 모든 AGENTS.md 옆에 `@AGENTS.md` 한 줄짜리 CLAUDE.md

## 10. 템플릿 테스트

| 계층      | 대상                                                                                     | 실행                    |
| --------- | ---------------------------------------------------------------------------------------- | ----------------------- |
| 단위      | JSON:API 도우미, 에러 매핑, 쿠키 암호화, 갱신 묶기, 설정 검증, 클라이언트 컴포넌트        | `check`                 |
| 통합      | BFF의 API 호출, Server Action, 토큰 갱신. 실제 목 서버 프로세스에 붙인다(N16)            | `check`                 |
| E2E       | 브라우저 사용자 흐름(Playwright). 목이 기본이고 FastAPI로도 돈다                         | `test:e2e`, CI          |

E2E 흐름

- 가입과 메일 인증, 로그인과 로그아웃, 비밀번호 재설정과 변경
- 내 정보와 아바타, 로케일 전환
- 세션 폐기(브라우저 컨텍스트 둘: 한쪽에서 폐기하면 다른 쪽이 로그아웃된다)
- 내 글의 작성, 커버 업로드, 발행, 발행 취소, 삭제
- 공개 목록의 실시간 반영(컨텍스트 둘)
- 소셜 로그인
- 재인증이 필요한 탈퇴

부수 채널: 목 대상은 목의 테스트 통로(§8.7)를, FastAPI 대상은 Mailpit과 모의 OAuth 서버를 쓴다. E2E 안에 대상별 어댑터를 둔다(적합성 키트와 같은 방식).

## 11. 템플릿 저장소 변경

### 11.1 저장소

- `contract/mock`를 pnpm 워크스페이스 패키지로 더한다.
- 적합성: `mock` 대상(기동 명령, 주소, 부수 채널 어댑터)을 `scripts/src/conformance/targets.ts`와 적합성 키트에 더한다.
- `pnpm sync`: §8.8의 사본을 더한다.
- `verify-templates`: Next.js 템플릿 규칙(필수 명령, hook 4종의 exec form, 골든 기능 `features/posts`, `.env.example`, 레시피, 사본 최신 여부)
- CI 작업
  - `conformance-mock`: `pnpm conformance mock`
  - `nextjs`: 템플릿의 `check`, 목 대상 `test:e2e`, Docker 이미지 빌드
  - `nextjs-e2e-fastapi`: FastAPI 스택을 띄우고 같은 E2E를 FastAPI 대상으로 돌린다

### 11.2 FastAPI 템플릿 (필요하면)

web이 실제 백엔드에 붙으려면 다음이 FastAPI 설정에 있어야 한다. W2~W4의 프로토타입에서 확인하고, 없으면 그 마일스톤에서 더한다.

- Socket.IO 허용 Origin에 web 주소(§13 #6)
- 소셜 로그인 `redirectUri` 허용 목록에 web 콜백
- 스토리지(SeaweedFS)의 CORS가 web Origin의 PUT을 허용(§13 #7)

## 12. 마일스톤

| #   | 내용                                                                                                                                         | 완료 기준                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| W1  | 목 서버(§8), 적합성 `mock` 대상과 부수 채널 어댑터, CI 작업                                                                                  | `pnpm conformance mock` 전체 통과           |
| W2  | web 뼈대: 하네스(§9), BFF 세션·토큰 갱신·API 클라이언트·JSON:API 도우미(§5), i18n, 레이아웃, 인증 화면(§6.2), 목과 함께 도는 `setup`·`dev`, sync | web `check`, 인증 E2E가 목에서 통과        |
| W3  | 기능 화면: 글(§6.1, §6.6), 내 정보·세션·탈퇴(§6.3~§6.5), 소셜 로그인, 실시간(§6.7), 업로드(§6.8), `gen:feature`                                | 기능 E2E가 목에서 통과                      |
| W4  | E2E의 FastAPI 대상, FastAPI 설정 보강(§11.2), CI, 레시피·skill·문서, Docker 이미지                                                              | §1.2의 완료 조건                            |

각 마일스톤은 main의 사본에서 프로토타입을 먼저 만들어 태스크별 커밋으로 검증하고, 그 커밋에서 계획을 조립한 뒤 SDD로 실행한다(FastAPI 사이클과 같다).

## 13. 계획 단계에서 확인할 것

| #   | 확인할 것                                                                                                                  | 안 되면                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Ajv 검증 실패를 `validation.*` 코드와 pointer로 옮긴 결과가 적합성 스위트의 기대(FastAPI 동작)와 같은가                       | 목의 요청 검증을 리소스별 Zod 스키마로 직접 쓴다                    |
| 2   | openapi-fetch가 `application/vnd.api+json` 요청·응답과 계약의 JSON:API 제네릭 타입을 다루는가                                | openapi-typescript 타입 위에 얇은 fetch 래퍼를 직접 쓴다            |
| 3   | `proxy.ts`에서 갱신한 토큰을 응답 쿠키와 같은 요청의 렌더링(요청 쿠키 덮어쓰기)에 함께 넘길 수 있는가                          | 갱신을 route handler로 옮기고 리다이렉트한다(왕복 한 번 더)         |
| 4   | 갱신 묶기용 모듈 상태가 `proxy.ts` 호출 사이에 공유되는가                                                                    | `globalThis`에 둔다                                                 |
| 5   | next-intl 미들웨어(as-needed)와 세션 갱신을 `proxy.ts` 하나에서 함께 돌릴 수 있는가                                          | 순서를 고정한 합성 함수로 감싼다                                   |
| 6   | 브라우저의 Socket.IO 연결이 FastAPI(Origin 허용 목록)와 목에 모두 붙는가                                                     | FastAPI 설정에 web Origin을 더한다                                 |
| 7   | 브라우저에서 SeaweedFS presigned PUT이 되는가(CORS)                                                                         | FastAPI compose에 S3 CORS 설정을 더한다                            |
| 8   | Server Action과 `useActionState`가 로케일 경로에서 JS 없이도 제출·리다이렉트되는가                                            | JS가 필요한 폼으로 명시한다                                        |
| 9   | `output: 'standalone'` 이미지를 비루트 사용자와 헬스체크로 만들 수 있는가                                                     | 일반 `next start` 이미지                                           |
| 10  | W4 시점에 Next.js가 Node 26을 지원하는가(PR #97492), typescript-eslint가 TS7을 지원하는가                                     | Node 24와 TS 6을 유지한다                                          |

## 14. 확인한 사실과 출처 (2026-09-29)

| 사실                                                                                                                                                           | 출처                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 최신은 16.3.7이고, 16.3.6이 next/og ImageResponse의 RCE(16.2.0~16.3.5 영향)를 고친 보안 릴리스다. 최소 Node는 20.9.0이다                                   | https://github.com/vercel/next.js/releases/tag/v16.3.6, https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j, https://nextjs.org/docs/app/getting-started/installation |
| Next 16.3은 Node 26에서 vendored `jsonwebtoken`이 깨진다(수정 PR 미병합)                                                                                         | https://github.com/vercel/next.js/pull/97492                                                                                          |
| `next dev`는 코딩 에이전트를 감지하면 AGENTS.md에 `nextjs-agent-rules` 블록을 쓰고, `next.config`의 `agentRules: false`로 끈다. 공식 skill `next-dev-loop`와 next-devtools-mcp(0.4.0)가 있다 | https://nextjs.org/blog/next-16-3-ai-improvements, https://nextjs.org/docs/app/guides/mcp                                            |
| `proxy.ts`는 Node 런타임이고 v16.0.0에서 `middleware.ts`의 이름이 바뀌었다. Server Function의 POST는 페이지 경로로 가서 matcher가 놓칠 수 있다                     | https://nextjs.org/docs/app/api-reference/file-conventions/proxy                                                                      |
| TypeScript 7.0(Go 네이티브)이 2026-07-08 GA다. typescript-eslint 8.71의 TypeScript peer는 `<6.1.0`이다                                                           | https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/, https://registry.npmjs.org/typescript-eslint/8.71.0              |
| shadcn CLI 4.21은 `-b base|radix|aria`를 받고, 2026-07부터 Base UI가 기본이다. 공식 skill과 MCP가 있다                                                          | https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/changelog/2026-07-base-ui-default.mdx, https://ui.shadcn.com/docs/skills |
| next-intl 4.14는 Next 16을 지원하고 `localePrefix`로 always·as-needed·never를 고른다. 로케일 사이의 키 누락을 정적으로 보는 기능은 없다                          | https://next-intl.dev/docs/routing/configuration, https://next-intl.dev/docs/workflows/typescript                                     |
| openapi-fetch는 요청 `Content-Type`을 `application/json`으로 고정하고 본문을 `JSON.stringify`한다. 응답은 Content-Type과 상관없이 JSON으로 파싱한다               | https://openapi-ts.dev/openapi-fetch/api                                                                                              |
| MSW 3.0은 독립 HTTP 서버 모드가 없고 Socket.IO를 다루지 못한다. `@hono/node-server`의 `serve()`는 socket.io가 붙을 수 있는 `node:http` 서버를 돌려준다             | https://mswjs.io/docs/api/ws, https://hono.dev/docs/getting-started/nodejs                                                            |
| socket.io-client 4.x는 python-socketio 5.x(프로토콜 v5)와 호환된다                                                                                              | https://python-socketio.readthedocs.io/en/latest/intro.html                                                                           |
| Playwright는 코딩 에이전트에 CLI와 skill 방식을 권장하고, `@playwright/cli`가 별도 패키지다                                                                      | https://github.com/microsoft/playwright-cli, https://github.com/microsoft/playwright-mcp                                              |
