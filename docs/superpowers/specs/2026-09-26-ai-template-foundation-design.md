# AI 바이브코딩 템플릿: 기반 설계

- 작성일: 2026-09-26
- 상태: 승인됨. 하위 프로젝트 0(기반) 구현 완료
- 범위: 하위 프로젝트 0(기반)의 설계와 네 템플릿 전체 로드맵
- 다음 단계: 하위 프로젝트 1은 [FastAPI 템플릿 설계](2026-09-26-fastapi-template-design.md)를 따른다

## 1. 목표

FastAPI, NestJS, Next.js(web), Next.js(admin) 네 개의 프로젝트 템플릿을 만든다. 템플릿은 AI 코딩 에이전트로 바이브코딩할 때 결과물이 일관되고 망가지지 않도록 최적화한다. 대상 에이전트는 Claude Code와 AGENTS.md 호환 도구(Codex, Gemini CLI, GitHub Copilot 등)다.

### 1.1 성공 기준

1. 각 템플릿은 폴더째 복사한 뒤 `setup` → `check` 통과 → `dev` 실행까지 된다.
2. web과 admin은 FastAPI, NestJS, 목 서버 중 어디에 붙여도 코드 수정 없이 동작한다. 같은 적합성 테스트가 세 대상 모두에서 통과하는 것으로 이를 증명한다.
3. AI가 규약(타입, 모듈 경계, JSON:API 규약, 생성물 갱신, 로케일 키 일치)을 어기면 `check`가 실패하고, 실패 메시지가 고치는 방법을 알려 준다.
4. Claude Code에서는 파일을 고친 직후 포맷·린트 결과가 자동으로 피드백되고, 턴을 끝내려면 `check`의 빠른 경로를 통과해야 한다.
5. 새 도메인 모듈은 생성기와 레시피를 통해 골든 모듈 `posts`와 같은 구조로 추가된다.
6. create CLI로 단독 프로젝트와 조합 모노레포 프로젝트를 만들 수 있다.

## 2. 결정 기록

| # | 주제 | 결정 | 이유 |
|---|---|---|---|
| D1 | 템플릿 관계 | 각자 단독으로 동작하고, 조합도 가능하다 | 프로젝트마다 필요한 조합이 다르다 |
| D2 | 대상 AI 도구 | Claude Code와 AGENTS.md 호환 도구. AGENTS.md가 규칙의 단일 원본이고, Claude 전용 강화 장치는 `.claude/`에 둔다 | 도구가 바뀌어도 규칙은 하나로 유지된다 |
| D3 | 프론트 역할 | web과 admin은 항상 API를 호출하는 쪽이다. 단독으로 실행하면 목 서버에 붙는다 | "데이터 로직은 백엔드에" 규칙이 하나뿐이라 AI가 헷갈리지 않는다 |
| D4 | 기능 범위 | 프로덕션 풀세트에 다국어와 실시간을 더한다 | 실제 프로젝트의 출발점으로 쓰기 위해서다 |
| D5 | 인증 | 백엔드가 직접 인증한다. 프론트엔드는 BFF가 토큰을 httpOnly 쿠키로 보관한다 | 백엔드를 단독으로 써도 인증이 온전해야 한다(D1) |
| D6 | 배포 | Docker 기반, 클라우드 중립(S3 호환 스토리지, SMTP) | 특정 클라우드에 묶이지 않기 위해서다 |
| D7 | 조합 방식 | 공통 플랫폼 계약을 두 백엔드가 똑같이 구현한다 | 프론트엔드가 백엔드와 무관하게 동작하고, 적합성 테스트가 AI의 계약 파손을 잡는다 |
| D8 | 실시간 | Socket.IO를 쓰고 전송은 WebSocket만 허용한다 | Node와 Python 서버가 프로토콜 호환이고, 재연결·룸·Redis 어댑터가 기본 제공된다 |
| D9 | API 규약 | JSON:API 1.1. CRUD가 아닌 동작도 리소스로 모델링한다 | 스펙이 규약을 정해 두어 해석의 여지가 없다 |
| D10 | 계약 원본 | TypeSpec으로 작성해 OpenAPI 3.1로 컴파일한다 | JSON:API의 반복 스키마를 제네릭으로 한 번에 정의한다 |
| D11 | 하네스 원칙 | 문서는 짧게, 규칙은 기계가 강제한다 | AI가 규칙을 지켜 주기를 기대하지 않고, 어기면 실패하게 한다 |
| D12 | 진행 순서 | 기반 → FastAPI → web → create CLI → admin → NestJS | 계약과 프론트-백 루프를 일찍 검증한다 |

## 3. 전체 구조

### 3.1 템플릿 저장소 레이아웃

```
ai-template/
├── AGENTS.md, CLAUDE.md          # 이 저장소(템플릿 자체)를 작업하는 규칙
├── package.json, pnpm-workspace.yaml   # 저장소 도구용 워크스페이스
├── contract/
│   ├── typespec/                 # 계약 원본 (TypeSpec)
│   ├── openapi.yaml              # 컴파일 결과 (커밋 대상)
│   ├── api-style/                # JSON:API 스타일 룰셋 (Redocly)과 룰셋 테스트
│   ├── conformance/              # 블랙박스 적합성 테스트 (Vitest)
│   └── mock/                     # 인메모리 목 서버 (하위 프로젝트 2에서 구현)
├── templates/
│   ├── fastapi/                  # 각 폴더는 그대로 복사하면 동작하는 독립 프로젝트
│   ├── nestjs/
│   ├── nextjs/
│   └── nextjs-admin/
├── create/                       # 새 프로젝트 생성 CLI
├── scripts/                      # 사본 동기화, 하네스 표준 검사, 구조 비교
└── docs/
    ├── harness/                  # 하네스 표준
    ├── conventions/              # API·코드 규약 상세
    └── superpowers/              # 스펙과 계획
```

### 3.2 자기완결 원칙

- 템플릿 폴더는 저장소의 다른 폴더를 참조하지 않는다.
- 공유 자산은 사본으로 들어간다. 백엔드에는 API 스타일 룰셋이, 프론트엔드에는 계약(`openapi.yaml`)과 목 서버가 들어간다.
- `scripts/sync`가 원본을 사본으로 복사한다. CI는 사본이 원본과 같은지 검사한다.
- 계약의 스키마 이름은 백엔드 스펙에 모두 있어야 하고, operation(메서드와 경로) 집합은 계약과 같아야 한다. 프론트 코드는 스키마 이름으로 타입을 참조하므로, 이름이 다르면 백엔드를 바꿀 때 코드가 깨진다(§5.7). 백엔드 생성기가 중첩 모델에 붙이는 보조 스키마(예: `PostCreateData`)는 더 있어도 된다. 프론트 코드는 계약에 있는 이름만 참조한다.

### 3.3 새 프로젝트 생성 (create CLI)

- 단독: 템플릿 하나를 대상 폴더 루트에 복사하고 프로젝트 이름을 치환한다.
- 조합: 아래 구조의 모노레포를 만든다.

```
my-project/
├── AGENTS.md, CLAUDE.md          # 조합 구조와 앱 사이의 흐름
├── package.json, pnpm-workspace.yaml, turbo.json
├── compose.yaml                  # 통합 로컬 인프라
└── apps/
    ├── api/                      # fastapi 또는 nestjs (FastAPI면 얇은 package.json 래퍼를 추가)
    ├── web/
    └── admin/
```

- 루트의 명령 어휘는 템플릿과 같다. Turborepo가 앱별 명령을 캐시하며 실행한다.
- 생성한 뒤에는 백엔드 코드가 진실의 원천이다(code-first). 백엔드 `gen`이 `openapi.json`을 내보내 커밋하고, 프론트 `gen`이 그 파일로 타입과 클라이언트를 다시 만든다. 템플릿 저장소의 계약은 템플릿끼리의 호환을 보장하는 용도로만 쓴다.

### 3.4 하위 프로젝트 로드맵

| # | 하위 프로젝트 | 산출물 | 완료 조건 |
|---|---|---|---|
| 0 | 기반 | 저장소 뼈대, 계약, 스타일 룰셋, 적합성 테스트 틀, 하네스 표준, 저장소 CI | §9.2 |
| 1 | FastAPI | 계약 전체 구현, 하네스 적용, 플랫폼 흐름 적합성 테스트 작성 | 적합성 테스트 전체 통과, `check` 통과 |
| 2 | Next.js web | web 템플릿, 목 서버 | 목 서버가 적합성 테스트 통과, web E2E가 목과 FastAPI 양쪽에서 통과 |
| 3 | create CLI | 단독·조합 생성 | 생성한 FastAPI+web 프로젝트가 `setup` → `check` → `test:e2e` 통과 |
| 4 | Next.js admin | admin 템플릿 | admin E2E가 목과 FastAPI 양쪽에서 통과 |
| 5 | NestJS | 계약 전체 구현, 하네스 적용 | 적합성 테스트 전체 통과, web·admin E2E가 NestJS로도 통과 |

하위 프로젝트는 각자 스펙 → 계획 → 구현 사이클을 따로 돈다. 사이클마다 미룬 결정은 §10에 모아 둔다.

## 4. 플랫폼 기능

두 백엔드는 이 절의 기능을 계약대로 똑같이 구현한다.

### 4.1 기능 목록

| 영역 | 포함 내용 |
|---|---|
| 인증 | 가입과 이메일 인증, 로그인, refresh token 회전과 재사용 감지, 로그아웃, 다른 기기와 전체 기기 로그아웃, 세션 목록, 비밀번호 재설정과 변경, 소셜 로그인(Google, Kakao, Naver) |
| 사용자 | 내 정보 조회와 수정, 아바타, 회원 탈퇴. 관리 기능으로 목록, 검색, 상세, 역할 부여, 비활성화 |
| RBAC | 코드에 정의된 권한 문자열, DB에 저장하는 역할, 사용자와 역할의 다대다 관계 |
| 파일 | presigned URL 직접 업로드와 완료 확인, 크기·MIME 제한, presigned 다운로드, 끝나지 않은 업로드 자동 정리 |
| 메일 | SMTP, 로케일별 템플릿, 잡을 통한 비동기 발송과 재시도 |
| 잡 | Redis 큐, 별도 worker 프로세스, 재시도와 백오프, 주기 작업 |
| 캐시·레이트 리밋 | Redis 기반 |
| 감사 로그 | 보안·관리 행위 기록과 조회 |
| 실시간 | Socket.IO 이벤트 |
| 다국어 | `ko`(기본), `en` |
| 관측성 | 구조화 로그, OpenTelemetry, 헬스체크 |
| 골든 모듈 | 예제 도메인 `posts` |

### 4.2 인증

- 가입은 `POST /registrations`로 한다. 인증 메일의 토큰으로 `POST /email-verifications`를 호출하면 인증이 끝난다. 인증 전에는 로그인할 수 없다(`auth.email_not_verified`). 인증 메일은 `POST /email-verification-requests`로 다시 보낼 수 있다.
- 로그인은 `POST /sessions`에 grantType `password`로 한다. access token(JWT, 15분)과 refresh token(불투명 토큰, 30일)을 받는다.
- 토큰 갱신은 `POST /sessions`에 grantType `refreshToken`으로 한다. refresh token은 쓸 때마다 새것으로 바뀐다. 이미 쓴 refresh token이 다시 들어오면 그 세션 계열 전체를 폐기하고 `auth.refresh_token_reused`를 돌려준다.
- 로그아웃은 `DELETE /sessions/current`, 특정 세션 폐기는 `DELETE /sessions/{id}`, 다른 기기 또는 전체 로그아웃은 `POST /session-revocations`(scope `others` 또는 `all`)다. `GET /sessions`는 내 활성 세션 목록이다.
- 비밀번호 재설정 요청(`POST /password-reset-requests`)은 계정이 있든 없든 항상 202를 돌려준다. 재설정(`POST /password-resets`)을 하면 모든 세션을 폐기한다. 비밀번호 변경(`POST /password-changes`)을 하면 현재 세션을 뺀 나머지를 폐기한다.
- 소셜 로그인 흐름
  1. 프론트 BFF가 로그인 시도마다 code verifier를 만들어 시작한 브라우저에 연결해 둔다(예: httpOnly 쿠키). 브라우저를 `GET /api/v1/oauth/{provider}/authorize?redirectUri=<프론트 콜백>&codeChallenge=<verifier의 S256>`으로 이동시킨다. `redirectUri`는 허용 목록으로, `codeChallenge`는 형식(43자 base64url)으로 검사한다.
  2. 백엔드가 state와 `codeChallenge`를 함께 두고, 제공자와는 별도인 자신의 PKCE 쌍을 만들어 제공자로 리다이렉트한다.
  3. 제공자가 `GET /api/v1/oauth/{provider}/callback`으로 돌아오면, 백엔드가 계정을 연결하거나 만든 뒤 1회용 코드(60초)에 `codeChallenge`를 실어 프론트 콜백으로 리다이렉트한다. 실패하면 코드 대신 `error`를 붙인다. 제공자의 에러가 `access_denied`(사용자가 거부)일 때만 `auth.oauth_denied`이고, 그 밖의 제공자 에러와 코드 교환·신원 조회 실패는 `auth.oauth_failed`다.
  4. 프론트 BFF가 서버 간 호출로 `POST /sessions`에 grantType `oauthCode`와 `codeVerifier`를 보내 토큰을 받는다. 토큰은 URL에 절대 실리지 않는다. `codeVerifier`는 RFC 7636의 code verifier(`[A-Za-z0-9._~-]` 43~128자)여야 하고, 그 형식이 아니거나 `codeChallenge`와 맞지 않으면 401 `auth.oauth_code_invalid`다.
  - 새 제공자는 제공자 인터페이스를 구현한 파일 하나와 설정으로 추가한다.
  - 소셜 로그인으로 만든 계정은 제공자가 검증한 이메일이면 이메일 인증을 마친 것으로 본다. 제공자가 검증을 보장하지 않는 이메일로는 기존 계정에 자동 연결하지 않는다. 제공자별 세부 연결 규칙은 [FastAPI 설계](2026-09-26-fastapi-template-design.md) §6.2에 있다.
  - BFF는 자기가 verifier를 쥐지 않은 콜백 `code`를 거부한다. 그러지 않으면 공격자가 완성된 콜백 URL을 피해자에게 넘겨 로그인시킬 수 있다(로그인 CSRF).
- 백엔드는 `Authorization: Bearer`만 안다. 쿠키 처리는 프론트 BFF의 책임이다.
- 로그인, 가입, 재설정 요청에는 IP와 식별자 기준의 엄격한 레이트 리밋을 건다.

### 4.3 RBAC

- 권한은 코드에 정의된 문자열 상수다. 초기 목록은 `admin:access`, `users:read`, `users:manage`, `roles:read`, `roles:manage`, `audit-logs:read`, `posts:create`, `posts:manage`다.
- 역할은 권한 문자열 배열로 DB에 저장한다. 시드 역할은 두 개다.
  - `admin`: 모든 권한. 시스템 역할이라 삭제할 수 없다.
  - `member`: `posts:create`. 가입하면 자동으로 부여된다.
- 사용자와 역할은 다대다 관계다.
- 권한 요구는 라우트(핸들러)에 선언하고, 소유권 규칙(자기 글만 수정 등)은 서비스 계층에서 판정한다.
- `GET /me`는 실제 적용되는 권한 목록을 `meta.permissions`로 돌려준다. 역할이 바뀌면 실시간 이벤트 `me.updated`를 보낸다.
- admin 앱에 로그인하려면 `admin:access` 권한이 있어야 한다.

### 4.4 파일

- `POST /files`에 filename, contentType, size를 보내면 크기와 MIME 허용 목록을 검사한 뒤 `pending` 상태의 리소스를 만든다. 응답의 `meta.upload`에 presigned PUT URL, 필요한 헤더, 만료 시각이 담긴다.
- 브라우저가 스토리지에 직접 업로드한 뒤 `PATCH /files/{id}`로 `status: "ready"`를 보낸다. 백엔드는 스토리지에 객체가 실제로 있는지와 크기를 확인한 다음 `ready`로 바꾼다. 확인에 실패하면 `file.upload_incomplete`를 돌려준다.
- 다운로드는 `ready` 파일에 대해 수명이 짧은 presigned GET URL(`meta.downloadUrl`)로 한다.
- 파일을 읽을 수 있는 사람은 소유자, 그리고 그 파일을 참조하는 리소스를 읽을 수 있는 사람이다(예: 발행된 글의 커버 이미지는 누구나 읽는다). 이 규칙을 구현하는 방식과 공개 이미지 전달 방식은 [FastAPI 설계](2026-09-26-fastapi-template-design.md) §6.5에 있다.
- 24시간이 넘도록 `pending`인 파일은 주기 잡이 삭제한다.

### 4.5 메일, 잡, 캐시, 레이트 리밋

- 메일: SMTP로 보낸다. 템플릿(이메일 인증, 비밀번호 재설정, 환영)은 로케일마다 있어야 하며, 빠진 로케일이 있으면 `check`가 실패한다.
- 잡: Redis 큐와 별도 worker 프로세스. 재시도와 지수 백오프, 주기 작업(만료된 토큰과 끝나지 않은 업로드 정리)을 포함한다. 잡은 내부 기능이라 API 계약에 넣지 않는다.
- 캐시: Redis. 골든 모듈의 공개 목록 첫 페이지를 캐시하고, 글이 바뀌면 무효화하는 예시를 둔다.
- 레이트 리밋: Redis. 인증 엔드포인트는 엄격하게, 나머지는 느슨한 전역 제한을 건다. 초과하면 `429`, `Retry-After`, 에러 코드 `rate_limit.exceeded`를 돌려준다.

### 4.6 감사 로그

- 기록 대상: 로그인 성공과 실패, 전체 기기 로그아웃, 비밀번호 변경과 재설정, 역할의 생성·수정·삭제, 사용자의 역할 변경과 비활성화, 회원 탈퇴, 관리자에 의한 글 삭제.
- `GET /audit-logs`(`audit-logs:read` 필요)로 조회하며, 행위자, 행위, 대상 종류, 기간으로 거른다.

### 4.7 실시간 (Socket.IO)

- 전송은 WebSocket만 허용한다(롱 폴링 비활성화).
- 인증
  - 로그인한 사용자는 BFF가 `POST /realtime-tickets`로 1회용 티켓(30초)을 받아 브라우저에 넘기고, 브라우저는 Socket.IO의 `auth.ticket`으로 접속한다. 브라우저는 access token을 모른다.
  - 티켓 없이 접속하면 익명 연결이 되며, 공개 채널만 구독할 수 있다.
- 룸과 채널
  - 로그인 연결은 접속하는 즉시 `user:{id}` 룸에 들어간다.
  - 구독 가능한 채널은 `posts`(발행된 글의 이벤트, 누구나)와 `posts:all`(모든 글의 이벤트, `posts:manage` 필요)이다.
  - 클라이언트는 `subscribe`와 `unsubscribe` 메시지를 보내고, 서버는 ack로 성공 또는 거부를 알린다.
- 서버가 보내는 이벤트

| 이벤트 | 받는 곳 | 페이로드 |
|---|---|---|
| `session.revoked` | `user:{id}` | `meta.reason` |
| `me.updated` | `user:{id}` | `meta.changed`(바뀐 항목). 클라이언트는 `/me`를 다시 조회한다 |
| `post.created` | `posts:all`, 작성자의 `user:{id}` | `posts` 리소스 문서 |
| `post.updated` | 위와 같음. 발행된 글이면 `posts`에도 | `posts` 리소스 문서 |
| `post.published` | `posts`, `posts:all`, 작성자의 `user:{id}` | `posts` 리소스 문서 |
| `post.deleted` | `posts:all`, 작성자의 `user:{id}`. 발행된 글이었으면 `posts`에도 | 리소스 식별자만 |

- 서버를 여러 대 띄우면 Redis 어댑터로 이벤트를 모든 인스턴스에 전파한다. worker처럼 소켓 서버가 아닌 프로세스는 Redis emitter로 이벤트를 보낸다.
- 이벤트 이름, 받는 곳, 페이로드 스키마는 계약에 들어간다(§5.7).

### 4.8 다국어

- 로케일은 `ko`(기본)와 `en`이다. 사용자의 `locale` 속성은 가입할 때 `Accept-Language`로 초기화하고 프로필에서 바꿀 수 있다.
- 백엔드는 API 에러 문장을 번역하지 않는다. 클라이언트가 신뢰할 것은 `errors[].code`와 `errors[].meta.params`뿐이다. `title`과 `detail`은 개발자용 영어 문장이다.
- 백엔드가 번역하는 것은 메일 템플릿뿐이다.
- 프론트엔드는 에러 코드를 메시지 카탈로그로 번역한다. 카탈로그는 타입으로 검사하고, 로케일끼리 키가 일치하는지 `check`가 확인한다.

### 4.9 골든 모듈 `posts`

AI가 새 기능을 만들 때 따라 할 정답 예시다.

- 속성: `title`, `body`(마크다운 텍스트), `status`(`draft` 또는 `published`), `publishedAt`, `createdAt`, `updatedAt`
- 관계: `author`(users), `coverImage`(files)
- 권한
  - 발행된 글은 누구나 읽는다. 초안은 작성자와 `posts:manage`만 본다.
  - 생성에는 `posts:create`가 필요하다.
  - 수정과 삭제는 작성자 또는 `posts:manage`만 할 수 있다.
- 상태 전이: `PATCH`로 `status`를 바꿔 발행하거나 발행을 취소한다. 허용되지 않는 전이는 `post.invalid_transition`으로 거부한다. 발행하면 `publishedAt`을 채운다.
- 목록: `filter[status]`, `filter[author]`, `filter[q]`(제목·본문 검색), `sort`(`createdAt`, `publishedAt`, `title`), 페이지, `include=author,coverImage`, `fields[posts]`를 지원한다.
- 캐시, 감사 로그(관리자가 남의 글을 삭제할 때), 실시간 이벤트(§4.7)를 모두 보여 준다.
- 테스트: 도메인 규칙 단위 테스트, API 통합 테스트, 권한 매트릭스 테스트를 계층별로 둔다.
- web에는 공개 글 목록과 상세(실시간 반영), 내 글 목록·작성·수정·발행·삭제(커버 이미지 업로드 포함)가 들어간다. admin에는 전체 글 관리(필터, 상태 변경, 삭제, 실시간 반영)가 들어간다.

### 4.10 사용자 리소스의 공개 범위

- `users` 리소스의 속성은 보는 사람에 따라 달라진다. 다른 사람과 비로그인 사용자에게는 `name`과 아바타만 보인다. 본인과 `users:read` 권한자에게는 전체 속성이 보인다.
- 이 규칙 때문에 공개 글의 `include=author`로 이메일이 새지 않는다.
- 회원 탈퇴(`DELETE /me`)는 개인정보를 익명화하고 모든 세션을 폐기한다. 보존 정책의 세부는 [FastAPI 설계](2026-09-26-fastapi-template-design.md) §6.4에 있다.

### 4.11 범위 밖

다중 테넌시, 2단계 인증, 결제, 인앱 알림, 기능 플래그, 웹훅, 관리자에 의한 사용자 생성과 초대, 이미지 변환(썸네일), 특정 클라우드용 IaC, Codex·Cursor 전용 설정.

## 5. API 규약 (JSON:API 1.1)

### 5.1 적용 범위

- `/api/v1` 아래의 모든 요청과 응답 본문은 JSON:API 1.1 문서다. 1.2는 아직 출시되지 않았다.
- 예외는 두 가지뿐이다.
  - OAuth 리다이렉트 엔드포인트(`/api/v1/oauth/{provider}/authorize`, `/callback`). 본문이 없다.
  - `/health/live`와 `/health/ready`. API 바깥에 있다.
- 스타일 룰셋은 예외 목록에 없는 위반을 모두 실패시킨다.

### 5.2 문서와 리소스

- 미디어 타입은 `application/vnd.api+json`이다. 415와 406은 스펙에 따라 돌려준다.
- `type`은 복수형 kebab-case이고 URL 경로 세그먼트와 같다(`/audit-logs` ↔ `audit-logs`).
- `id`는 UUIDv7 문자열이다. 예외적으로 코드 식별자를 id로 쓰는 읽기 전용 리소스(`permissions`)가 있다.
- 속성과 관계의 이름은 camelCase다.
- 관계 전용 엔드포인트(`/relationships/...`)는 두지 않는다. 관계는 리소스 `PATCH`의 `relationships`로 바꾼다. 그래서 관계의 `self` 링크도 내보내지 않는다. 스펙상 `self` 링크를 내보내면 그 엔드포인트를 지원해야 하기 때문이다.
- 생성에 성공하면 201과 문서를, 삭제에 성공하면 204를 돌려준다. 동작을 표현한 리소스(§5.5)도 같은 규칙을 따른다. 단, 비동기로 처리하는 생성(비밀번호 재설정 요청, 인증 메일 재발송)은 계정이 있는지 드러내지 않도록 항상 202를 돌려준다.
- JSON:API 확장(Atomic Operations 등)과 프로필은 쓰지 않는다.

### 5.3 쿼리 파라미터

| 파라미터 | 규칙 |
|---|---|
| `include` | 리소스마다 허용 경로를 계약에 명시한다. 허용되지 않은 경로는 400 `jsonapi.unsupported_include` |
| `fields[type]` | 모든 리소스에서 지원한다. 요청이 있으면 스펙대로 그 밖의 필드를 넣지 않는다 |
| `sort` | 리소스마다 허용 필드를 명시하고, `-` 접두사는 내림차순이다. 허용되지 않은 필드는 400 `jsonapi.unsupported_sort` |
| `page[number]`, `page[size]` | 기본값은 1과 20, 최대 크기는 100이다. 응답에 `meta.page{number,size,total,totalPages}`와 `links.first/prev/next/last`를 넣는다 |
| `filter[...]` | 리소스마다 명시한 필터만 받는다. 검색은 `filter[q]`다. 모르는 필터는 400 `jsonapi.invalid_query` |

### 5.4 에러

- 에러 응답의 형식은 `{ "errors": [...], "meta": { "traceId": "..." } }`이다.
- 에러 객체에는 `status`(문자열), `code`(계약의 enum), `title`, `detail`(개발자용 영어), `source.pointer`(본문 필드) 또는 `source.parameter`(쿼리 파라미터), `meta.params`(번역에 쓸 변수)를 담는다.
- 필드 검증 오류는 필드마다 에러 객체를 하나씩 만들어 422로 돌려준다.
- 코드 이름은 `<영역>.<snake_case 사유>` 형식이다. 초기 목록은 아래와 같다.

| 영역 | 코드 |
|---|---|
| JSON:API | `jsonapi.unsupported_media_type`(415), `jsonapi.not_acceptable`(406), `jsonapi.invalid_document`(400), `jsonapi.invalid_query`(400), `jsonapi.unsupported_include`(400), `jsonapi.unsupported_sort`(400) |
| 검증 | `validation.required`, `validation.too_short`, `validation.too_long`, `validation.invalid_format`, `validation.out_of_range`, `validation.invalid_choice`, `validation.already_taken` (모두 422) |
| 인증 | `auth.unauthenticated`(401), `auth.invalid_credentials`(401), `auth.token_expired`(401), `auth.token_invalid`(401), `auth.refresh_token_reused`(401), `auth.oauth_code_invalid`(401), `auth.email_not_verified`(403), `auth.account_deactivated`(403), `auth.verification_token_invalid`(422) |
| 권한 | `permission.denied`(403), `role.system_role_protected`(422) |
| 리소스 | `resource.not_found`(404), `resource.conflict`(409) |
| 도메인 | `post.invalid_transition`(422), `file.too_large`(422), `file.type_not_allowed`(422), `file.upload_incomplete`(422) |
| 기타 | `rate_limit.exceeded`(429), `internal.unexpected`(500), `service.unavailable`(503) |

- 새 코드는 반드시 계약의 enum에 추가한다. 프론트 카탈로그 키 검사가 번역 누락을 잡는다.

### 5.5 동작의 리소스화

CRUD가 아닌 동작도 모두 리소스를 만들거나 고치는 것으로 표현한다. 예외를 없애 규칙을 하나로 만들기 위해서다.

| 동작 | 표현 |
|---|---|
| 가입 | `POST /registrations` |
| 이메일 인증, 인증 메일 재발송 | `POST /email-verifications`, `POST /email-verification-requests` |
| 로그인, 토큰 갱신, 소셜 로그인 완료 | `POST /sessions` (grantType: `password`, `refreshToken`, `oauthCode`) |
| 로그아웃 | `DELETE /sessions/current`, `DELETE /sessions/{id}` |
| 다른 기기·전체 로그아웃 | `POST /session-revocations` (scope: `others`, `all`) |
| 비밀번호 재설정 요청과 완료 | `POST /password-reset-requests`, `POST /password-resets` |
| 비밀번호 변경 | `POST /password-changes` |
| 글 발행과 발행 취소 | `PATCH /posts/{id}`로 `status` 변경 |
| 업로드 완료 확인 | `PATCH /files/{id}`로 `status: "ready"` |
| 실시간 티켓 발급 | `POST /realtime-tickets` |

`sessions` 리소스의 토큰 속성(`accessToken`, `accessTokenExpiresAt`, `refreshToken`, `refreshTokenExpiresAt`)은 `POST /sessions`의 201 응답에만 담긴다. `GET /sessions`에는 토큰이 없다.

### 5.6 초기 엔드포인트 목록

모든 경로 앞에 `/api/v1`이 붙는다.

| 리소스 | 엔드포인트 | 접근 |
|---|---|---|
| registrations | `POST /registrations` | 공개 |
| email-verification-requests | `POST /email-verification-requests` | 공개 |
| email-verifications | `POST /email-verifications` | 공개 |
| sessions | `POST /sessions` | 공개 |
| sessions | `GET /sessions`, `DELETE /sessions/{id}`, `DELETE /sessions/current` | 로그인 |
| session-revocations | `POST /session-revocations` | 로그인 |
| password-reset-requests | `POST /password-reset-requests` | 공개 |
| password-resets | `POST /password-resets` | 공개 |
| password-changes | `POST /password-changes` | 로그인 |
| (OAuth, 예외) | `GET /oauth/{provider}/authorize`, `GET /oauth/{provider}/callback` | 공개 |
| users (본인) | `GET /me`, `PATCH /me`, `DELETE /me` | 로그인 |
| users | `GET /users`, `GET /users/{id}` | `users:read` |
| users | `PATCH /users/{id}` (상태, 역할) | `users:manage` |
| roles | `GET /roles`, `GET /roles/{id}` | `roles:read` |
| roles | `POST /roles`, `PATCH /roles/{id}`, `DELETE /roles/{id}` | `roles:manage` |
| permissions | `GET /permissions` | `roles:read` |
| files | `POST /files`, `PATCH /files/{id}`, `DELETE /files/{id}` | 로그인(소유자) |
| files | `GET /files/{id}` | §4.4의 읽기 규칙(소유자, 또는 파일을 참조하는 리소스를 읽을 수 있는 사람) |
| audit-logs | `GET /audit-logs`, `GET /audit-logs/{id}` | `audit-logs:read` |
| posts | `GET /posts`, `GET /posts/{id}` | 공개(초안은 §4.9 규칙) |
| posts | `POST /posts` | `posts:create` |
| posts | `PATCH /posts/{id}`, `DELETE /posts/{id}` | 작성자 또는 `posts:manage` |
| realtime-tickets | `POST /realtime-tickets` | 로그인 |

### 5.7 계약 작성 (TypeSpec)

- `contract/typespec/`에는 JSON:API 템플릿 라이브러리(리소스, 단건 문서, 컬렉션 문서, 생성 문서, 수정 문서, 에러 문서, 쿼리 모델)와 리소스 정의가 들어간다.
- 컴파일 결과 `contract/openapi.yaml`을 커밋한다. 다시 컴파일했을 때 차이가 생기면 CI가 실패한다.
- 스키마 이름 규칙은 두 백엔드가 그대로 재현해야 한다. `<Name>`은 `type`의 단수형 PascalCase다(`posts` → `Post`, `audit-logs` → `AuditLog`).

| 스키마 | 이름 |
|---|---|
| 속성, 관계 | `<Name>Attributes`, `<Name>Relationships` |
| 리소스 객체 | `<Name>Resource` |
| 단건·컬렉션 문서 | `<Name>Document`, `<Name>CollectionDocument` |
| 생성·수정 요청 문서 | `<Name>CreateDocument`, `<Name>UpdateDocument` |
| 생성·수정 요청 속성 | `<Name>CreateAttributes`, `<Name>UpdateAttributes` |
| 실시간 이벤트 페이로드 | `<Resource><Event>EventDocument` (예: `PostPublishedEventDocument`, `UserMeUpdatedEventDocument`) |

- 그 밖의 보조 스키마(`PostStatus`, `SessionGrant` 등)도 리소스 이름으로 시작한다.
- 리소스에 속하지 않는 공용 스키마는 `ErrorCode`, `ErrorDocument`, `ErrorObject`, `ErrorSource`, `PageMeta`, `PaginationLinks`, `CollectionMeta`, `Locale`, `OAuthProvider`, `HealthReport`, 그리고 실시간 구독 메시지의 `RealtimeChannel`, `RealtimeSubscription`, `RealtimeAck`([FastAPI 설계](2026-09-26-fastapi-template-design.md) §7)뿐이다.
- 실시간 이벤트의 페이로드 스키마도 OpenAPI components에 넣는다. 그래야 프론트엔드가 같은 생성 과정으로 이벤트 타입을 얻는다. 이벤트 목록(이름, 받는 곳, 페이로드)은 OpenAPI 루트의 확장 필드 `x-realtime-events`에 기록한다.

### 5.8 스타일 룰셋 (Redocly)

- `/api/v1` 아래 operation의 요청·응답 미디어 타입은 `application/vnd.api+json`이어야 한다(§5.1 예외 제외).
- 모든 operation에는 `operationId`와 태그가 있어야 하고, 4xx·5xx 응답은 `ErrorDocument`를 참조해야 한다.
- 컬렉션 `GET`은 `page[number]`, `page[size]`, `sort`, `fields[...]` 파라미터를 받고 `*CollectionDocument`를 돌려줘야 한다.
- 속성 이름은 camelCase, 경로 세그먼트는 kebab-case여야 하고, 리소스 `type` 값이 경로와 같아야 한다.
- 스키마 이름은 §5.7 규칙을 따라야 한다.
- 룰셋 자체도 올바른 예시 스펙과 잘못된 예시 스펙으로 테스트한다.
- 룰셋은 백엔드 템플릿에 사본으로 들어가서, 백엔드가 내보낸 `openapi.json`을 매번 `check`에서 검사한다.

### 5.9 적합성 검증

- 구조 검사
  - oasdiff로 백엔드가 내보낸 스펙이 계약을 깨지 않는지(breaking change) 검사한다.
  - 계약의 스키마 이름이 백엔드 스펙에 모두 있는지, operation 집합이 같은지 스크립트로 검사한다. 경로 파라미터 이름(`{id}`와 `{post_id}`)의 차이는 무시한다.
- 동작 검사: `contract/conformance`의 블랙박스 스위트(Vitest, 계약으로 생성한 타입 클라이언트, Socket.IO 클라이언트)를 돌린다.
  - 대상은 `fastapi`, `nestjs`, `mock` 세 곳이다. 대상마다 기동 방법과 부수 채널 어댑터를 둔다. 메일 수신함은 Mailpit API 또는 목의 테스트 전용 엔드포인트로, 소셜 로그인은 모의 OAuth 서버 또는 목의 테스트 전용 흐름으로 확인한다.
  - 범위는 플랫폼 기능의 전체 흐름과 JSON:API 규칙(include, fields, sort·include 400, 415/406, 페이지 링크, 에러 형식)이다. 모든 응답 본문은 계약 스키마로 검증한다.
- 템플릿 저장소 CI가 대상마다 실행한다.

## 6. AI 하네스 표준

원칙: 문서는 짧게, 규칙은 기계가 강제한다. 문서에는 "왜"와 "어디에"만 적는다.

### 6.1 지침 파일

- `AGENTS.md`가 규칙의 단일 원본이다. 루트 AGENTS.md는 200줄 이하로 두고 명령, 구조 지도, 핵심 규칙, 완료 기준, 문서 링크만 담는다.
- 폴더별 규칙은 그 폴더의 `AGENTS.md`에 둔다(모듈 폴더, 마이그레이션 폴더 등).
- 모든 `AGENTS.md` 옆에는 `@AGENTS.md` 한 줄짜리 `CLAUDE.md`를 둔다. 루트의 CLAUDE.md에만 Claude 전용의 짧은 내용을 덧붙일 수 있다.
- 근거(2026-09-26 공식 문서 확인)
  - Claude Code v2.1.277 이상은 작업 디렉터리와 그 상위에 CLAUDE.md가 없을 때만 AGENTS.md를 직접 읽는다. 업그레이드 직후 첫 세션처럼 AGENTS.md를 읽지 못하는 세션도 있다.
  - CLAUDE.md의 `@AGENTS.md` import는 모든 세션에서 동작하고, AGENTS.md를 두 번 읽지 않는다.
  - Windows에서는 심볼릭 링크 대신 import를 써야 한다.
  - 하위 폴더의 CLAUDE.md는 Claude가 그 폴더의 파일을 읽을 때 로드된다.
- `.claude/rules/`는 쓰지 않는다. 규칙의 원본이 AGENTS.md와 둘로 갈라지기 때문이다.
- 긴 설명과 절차는 `docs/`(아키텍처, 레시피, 규약)에 두고 AGENTS.md에서 경로로 연결한다.
- 프레임워크가 에이전트 문서에 자동으로 내용을 써 넣는 기능(Next.js 16.3의 관리 블록 등)은 우리 문서와 충돌하지 않게 처리한다. 방식은 해당 템플릿 사이클에서 정한다.

### 6.2 명령 어휘

모든 템플릿과 조합 루트가 같은 이름을 쓴다. 단, `db:migrate`와 `db:reset`은 DB가 있는 백엔드 템플릿과 조합 루트에만 둔다. 프론트엔드 템플릿의 `setup`과 `dev`는 단독 모드에서 목 서버를 함께 다룬다.

| 명령 | 의미 |
|---|---|
| `setup` | 의존성 설치, 인프라 기동, 마이그레이션, 시드. 여러 번 실행해도 안전하다 |
| `dev` | 개발 서버. 백엔드는 api, worker, scheduler를 함께 띄운다 |
| `check` | 포맷 검사, 린트, 타입, 테스트(E2E 제외), 생성물 최신 여부, 계약 린트, 하네스 자체 검사 |
| `fix` | 포맷과 자동 수정 가능한 린트 오류를 고친다 |
| `test` | 테스트(E2E 제외) |
| `test:e2e` | E2E 테스트 |
| `gen` | 코드 생성(OpenAPI 내보내기, 클라이언트와 타입, ORM 클라이언트 등) |
| `db:migrate` | 마이그레이션 적용 |
| `db:reset` | 로컬 DB를 초기 상태(마이그레이션과 시드)로 되돌린다 |

- 실행기: TS 템플릿과 조합 루트는 `pnpm <명령>`이다. FastAPI는 poethepoet을 `uv run poe <명령>`으로 부른다([FastAPI 설계](2026-09-26-fastapi-template-design.md) F5).
- `check`의 빠른 경로는 포맷 검사, 린트, 타입, 변경과 관련된 테스트, 생성물 최신 여부다. Stop hook이 이 경로를 쓴다. 전체 `check`는 pre-push와 CI가 돌린다. "변경과 관련된 테스트"를 고르는 방식은 템플릿 사이클에서 정한다.
- `check`는 인프라가 필요한 테스트를 돌리기 전에 인프라가 떠 있는지 확인한다. 꺼져 있으면 "`setup`을 실행하라"는 안내와 함께 즉시 실패한다.
- 출력 원칙
  - 성공은 한 줄로 끝낸다.
  - 실패는 `파일:줄 규칙 — 고치는 방법` 형식으로 낸다.
  - 커스텀 규칙의 메시지는 "대신 이렇게 하라"는 대안 제시형 문장으로 쓴다.
- 캐시를 써서 바뀌지 않은 단계는 건너뛴다.

### 6.3 기계적 강제

| 대상 | 장치 |
|---|---|
| 타입 | TS strict(`noUncheckedIndexedAccess` 포함), Python 엄격 모드 |
| 억제 주석 | `any`, `type: ignore`, `eslint-disable`, `noqa`는 사유 주석이 없으면 실패 |
| 아키텍처 | 모듈 경계(다른 모듈의 내부 import 금지, 공개 인터페이스만 사용)와 계층 방향(라우터 → 서비스 → 저장소)을 린트로 검사 |
| API | JSON:API 스타일 룰셋(§5.8), 생성물 최신 여부 |
| 생성물 | 파일 첫 줄에 "직접 수정 금지, `gen`으로 재생성" 헤더. Claude Code 권한으로 생성물 경로의 Edit·Write를 막는다 |
| 다국어 | 프론트 카탈로그의 로케일 간 키 일치, 백엔드 메일 템플릿의 로케일 누락 |
| 설정 | `.env.example`과 설정 검증 스키마의 일치 |
| 지침 파일 | AGENTS.md와 CLAUDE.md의 짝, CLAUDE.md 내용, 루트 AGENTS.md 200줄 이하 |
| 파일 크기 | 소스 400줄, 테스트 600줄을 넘으면 실패(생성물 제외). 수치는 템플릿 사이클에서 조정할 수 있다 |
| 비밀 | 커밋 전에 비밀 정보를 스캔한다 |

### 6.4 Claude Code hooks

모든 hook은 쉘을 거치지 않는 exec form으로 작성한다(`"command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/<이름>.mjs"]`처럼 쓰며, Python 템플릿은 `uv`로 실행한다). 그래서 Windows(Git Bash 또는 PowerShell), macOS, Linux에서 똑같이 동작한다.

| 시점 | 동작 |
|---|---|
| `PostToolUse` (`Edit`, `Write`) | 방금 고친 파일만 포맷하고 빠른 린트를 돌린다. 남은 오류는 Claude에게 바로 전달한다 |
| `Stop` | 입력의 `stop_hook_active`가 참이면 통과시킨다. 이번 턴에 작업 트리 변경이 없으면 통과시킨다. 변경이 있으면 `check`의 빠른 경로를 돌리고, 실패하면 종료를 막고 요약한 오류를 돌려준다. Claude Code는 진전 없이 연속 8번 막히면 hook을 무시한다 |
| `PreToolUse` (`Bash`, `PowerShell`) | 위험한 명령을 차단한다. 원격 DB를 대상으로 한 명령, 강제 푸시, 이미 적용된 마이그레이션의 수정이나 삭제 등이다 |
| `SessionStart` | 인프라가 떠 있는지, 적용 안 된 마이그레이션이 있는지, 생성물이 최신인지를 요약해 넣는다 |

- hook 스크립트도 테스트한다. 입력 JSON 픽스처를 넣고 기대 출력을 확인한다.
- 출력 JSON의 정확한 형식은 구현 계획을 쓸 때 공식 레퍼런스에서 다시 확인한다.
- hook이 없는 AI 도구를 위한 안전망은 §6.8이다.

### 6.5 권한 (`.claude/settings.json`)

- 허용: 명령 어휘(`pnpm check` 등)와 읽기 전용 git 명령. 바이브코딩 중에 승인 프롬프트를 줄이기 위해서다.
- 차단: 비밀이 든 환경 파일 읽기, 생성물 경로의 Edit·Write, 위험한 명령.
- `.env.example`은 AI가 읽어야 하는 파일이다. 차단 패턴이 이 파일을 막지 않도록 정확히 쓴다(`.env*` 같은 넓은 패턴 금지).

### 6.6 골든 모듈, 생성기, 레시피, skill

- 생성기(백엔드 `gen:module <name>`, web `gen:feature <name>`, admin `gen:resource <name>` 등)는 골든 모듈을 복사해 이름을 바꾸고, 등록 작업까지 기계적으로 처리한다. 등록 작업은 라우터와 모듈 등록, 권한 문자열, i18n 키, 마이그레이션 초안, 테스트다. AI는 도메인 로직만 채운다.
- 절차의 단일 원본은 `docs/recipes/*.md`다. 초기 레시피는 모듈 추가, 엔드포인트 추가, 마이그레이션, 실시간 이벤트 추가, 잡 추가, 권한 추가, 번역 추가, admin 리소스 추가다. 템플릿마다 해당되는 것만 둔다.
- Claude Code skill(`.claude/skills/<이름>/SKILL.md`)은 레시피를 불러오고 생성기를 호출하고 검증하는 얇은 포장이다. Codex 같은 도구는 AGENTS.md의 링크를 따라 레시피를 직접 읽는다.
- 공식 제공 skill이 있으면 포함한다. 조사 시점에 확인된 것은 FastAPI의 공식 에이전트 skill, Next.js의 `next-dev-loop` skill, Playwright의 코딩 에이전트용 CLI와 skill이다.

### 6.7 외부 도구 연결

- web과 admin의 `.mcp.json`에 `next-devtools-mcp`를 넣어, 에이전트가 dev 서버의 에러와 라우트를 직접 조회하게 한다. 버전은 고정한다. shadcn MCP를 넣을지는 web 사이클에서 판단한다. 백엔드는 기본으로 MCP를 넣지 않는다.
- 화면 확인은 Playwright가 코딩 에이전트용으로 권장하는 CLI와 skill 방식으로 한다(MCP보다 토큰을 적게 쓴다).
- 설치된 버전의 문서를 보게 한다. Next.js는 설치 버전과 같은 문서를 `node_modules/next/dist/docs`에 함께 배포하므로 AGENTS.md가 이 경로를 가리킨다. 다른 라이브러리는 템플릿마다 `docs/stack.md`에 정확한 버전과 문서 링크를 적고, AGENTS.md에 "기억에 의존하지 말고 설치 버전의 문서를 확인하라"는 규칙을 둔다.

### 6.8 최종 안전망

- Git hooks(lefthook): pre-commit에서 스테이징된 파일의 포맷, 린트, 비밀 스캔을 하고, pre-push에서 `check`를 돌린다.
- CI(§7.5)가 모든 AI 도구의 실수를 마지막으로 잡는다.

### 6.9 하네스 표준 검사 (템플릿 저장소)

`scripts/verify-templates`는 템플릿마다 다음을 검사한다.

- AGENTS.md와 CLAUDE.md의 짝, CLAUDE.md의 내용, 루트 AGENTS.md의 길이
- 템플릿 종류별 필수 명령(§6.2)이 모두 있는지
- `.claude/settings.json`에 필수 hook 4종이 exec form으로 있는지
- `.env.example`, `docs/recipes/`, 골든 모듈이 있는지
- 공유 자산 사본이 원본과 같은지

## 7. 공통 인프라와 품질

### 7.1 로컬 인프라 (docker compose)

백엔드 템플릿과 조합 루트에 둔다. 프론트엔드 템플릿은 단독 모드에서 목 서버만 쓰므로 compose가 필요 없다.

| 서비스 | 용도 |
|---|---|
| PostgreSQL | 주 DB |
| Redis | 큐, 캐시, 레이트 리밋, Socket.IO 인스턴스 간 전파 |
| S3 호환 스토리지 | 파일 저장. MinIO 커뮤니티판은 개발이 중단되어(2025년 10월 이후 이미지 없음) SeaweedFS를 쓴다([FastAPI 설계](2026-09-26-fastapi-template-design.md) F10) |
| Mailpit | 메일 캐처. 테스트가 API로 메일 내용을 확인한다 |
| 모의 OAuth/OIDC 서버 | 소셜 로그인 테스트. navikt/mock-oauth2-server를 쓴다([FastAPI 설계](2026-09-26-fastapi-template-design.md) F12) |
| Grafana LGTM (선택, compose profile) | 트레이스, 메트릭, 로그 확인 |

- `setup` 한 번으로 인프라 기동, 마이그레이션, 시드(관리자 계정, 기본 역할, 예제 데이터)까지 끝난다.
- `db:reset`은 초기 상태로 빠르게 되돌린다. AI가 DB를 망가뜨려도 바로 복구할 수 있다.

### 7.2 설정

- 모든 설정은 환경 변수로 받고, 앱이 시작할 때 스키마로 검증한다. 변수가 빠졌거나 잘못되었으면 어떤 변수가 문제인지 알려 주고 즉시 멈춘다.
- `.env.example`에 설정 목록을 빠짐없이 둔다. 비밀은 `.env`에 두며 git에서 제외하고 AI의 읽기를 막는다.

### 7.3 관측성

- 로그는 JSON으로 구조화한다. 개발 환경에서는 사람이 읽기 좋은 형식으로 보여 준다.
- 모든 로그와 에러 응답에 traceId를 붙인다.
- OpenTelemetry로 HTTP, DB, Redis, 잡, Socket.IO를 추적한다. 기본은 꺼 두고, 켜면 OTLP로 내보낸다(로컬에서는 LGTM).
- 헬스체크는 `/health/live`(프로세스 생존)와 `/health/ready`(DB, Redis, 스토리지 연결)다.

### 7.4 테스트

| 계층 | 대상 | 실행 시점 |
|---|---|---|
| 단위 | 도메인 규칙, 권한 판정 같은 순수 로직 | `check` |
| 통합 | 모듈 단위 API. 실제 Postgres와 Redis를 쓰고 테스트마다 격리한다 | `check` |
| 계약 적합성 | 블랙박스 스위트를 두 백엔드와 목에 똑같이 실행 | 템플릿 저장소 CI |
| E2E | 브라우저 사용자 흐름(Playwright). 목 또는 실제 백엔드에 붙인다 | `test:e2e`, CI |

- 자기 DB와 인프라는 모킹하지 않는다. AI가 모킹으로 테스트를 억지로 통과시키는 것을 막기 위해서다. 모킹은 외부 서비스에만 쓴다(OAuth는 모의 서버, 메일은 Mailpit).
- 테스트 격리 방식(트랜잭션 롤백, 테스트별 DB 등)은 템플릿 사이클에서 정한다.

### 7.5 CI (GitHub Actions)

- 템플릿마다 `check`, `test:e2e`, Docker 이미지 빌드를 돌린다.
- 템플릿 저장소는 여기에 계약 컴파일과 차이 검사, 룰셋 테스트, 적합성 테스트(3개 대상), 하네스 표준 검사, 사본 동기화 검사를 더한다.

### 7.6 보안 기본값

- 비밀번호는 Argon2id로 해시한다.
- access token은 15분짜리 JWT다. refresh token은 불투명 토큰이며, DB에는 해시만 저장하고, 쓸 때마다 회전시키며, 재사용을 감지한다.
- 백엔드는 브라우저가 직접 호출하지 않으므로(BFF) CORS를 기본으로 막는다. Socket.IO 연결만 허용된 Origin인지 검사한다.
- 입력은 모두 스키마로 검증한다.

### 7.7 배포

- Dockerfile은 멀티스테이지로 만들고 비루트 사용자로 실행하며 헬스체크를 넣는다.
- 백엔드는 이미지 하나를 쓰고, 명령만 바꿔 api, worker, scheduler를 띄운다.
- 마이그레이션은 배포 단계에서 별도 명령으로 실행한다. 앱이 시작할 때 자동으로 돌리지 않는 이유는 인스턴스 여러 대가 동시에 마이그레이션을 시도하는 경쟁을 막기 위해서다.

## 8. 스택

버전은 2026-09-26 기준이다. 템플릿 사이클을 시작할 때마다 다시 확인한다.

### 8.1 공통

| 항목 | 선택 |
|---|---|
| 런타임 | Node 24 LTS, Python 3.14, pnpm 12, uv. Node 26이 2026-10-28에 LTS가 되므로 TS 템플릿 사이클 시작 시 전환을 검토한다 |
| TypeScript | 6.0 기준. TS 7은 typescript-eslint와 @nestjs/swagger가 아직 지원하지 않는다. 빠른 타입 검사를 위해 TS 7을 병용할지는 템플릿별로 정한다 |
| TS 린트·포맷 | ESLint 10, typescript-eslint, 경계 린트(eslint-plugin-boundaries 또는 dependency-cruiser), Prettier |
| Python 린트·타입 | Ruff, import-linter, basedpyright(strict) |
| 계약 도구 | TypeSpec(1.x) → OpenAPI 3.1, Redocly CLI(스타일 룰셋), oasdiff(breaking change 검사) |
| 테스트 | Vitest 5, pytest, Playwright |
| 기타 | OpenTelemetry, lefthook, Betterleaks(gitleaks 원작자의 후속 도구. gitleaks는 보안 수정만 받는 상태다) |

### 8.2 템플릿별

| 템플릿 | 핵심 스택 |
|---|---|
| FastAPI | FastAPI 0.141, Pydantic 2, pydantic-settings, SQLAlchemy 2(async)와 Alembic, python-socketio, Taskiq, structlog. 세부 버전과 선택 이유는 [FastAPI 설계](2026-09-26-fastapi-template-design.md) §2, §3 |
| NestJS | NestJS 12(ESM, Express 5), Zod 4와 내장 Standard Schema 검증(nestjs-zod는 NestJS 12를 아직 지원하지 않는다), Prisma 7(`^7`로 고정. `npm i prisma`는 이제 8 RC를 설치한다), BullMQ(@nestjs/bullmq), Socket.IO 게이트웨이와 Redis 어댑터, Vitest, pino |
| Next.js web | Next.js 16.3(보안 릴리스 16.3.7 이상), React 19, Tailwind 4, shadcn, next-intl, `proxy.ts`와 BFF |
| Next.js admin | web과 같은 기반에 TanStack Table 9와 리소스 선언 기반 화면을 더한다 |
| create CLI | Node CLI. 조합 루트는 pnpm workspace와 Turborepo. FastAPI 앱에는 얇은 package.json 래퍼를 둬서 Turborepo 캐시 대상에 넣는다 |

## 9. 하위 프로젝트 0(기반)의 구현 범위

### 9.1 산출물

1. 저장소 뼈대: 템플릿 저장소 작업용 루트 AGENTS.md와 CLAUDE.md, pnpm 워크스페이스, `.gitignore`, `.gitattributes`, `.editorconfig`, lefthook과 Betterleaks, 루트 `check`, 버전과 체크섬을 고정한 외부 바이너리 설치기(`pnpm tool`)
2. 계약: TypeSpec JSON:API 템플릿 라이브러리, 플랫폼 리소스 전체(§4, §5.6), 에러 코드 enum(§5.4), 실시간 이벤트(§4.7)를 담아 `contract/openapi.yaml`로 컴파일
3. 스타일 룰셋: Redocly 규칙(§5.8)과 룰셋 픽스처 테스트. 계약이 룰셋을 위반 없이 통과해야 한다
4. 적합성 테스트 틀: 대상 설정, 계약 타입 클라이언트 생성, JSON:API 공통 검증기(단위 테스트 포함), 부수 채널 어댑터 인터페이스. 플랫폼 흐름 테스트 케이스는 하위 프로젝트 1에서 FastAPI 구현과 함께 작성한다
5. 구조 비교 도구: oasdiff 래퍼와 스키마 이름·경로 일치 스크립트, 그리고 픽스처 테스트
6. 하네스 표준 문서(`docs/harness/`)와 `scripts/verify-templates`, 그리고 픽스처 템플릿을 이용한 테스트
7. 규약 문서: `docs/conventions/jsonapi.md`(§5의 상세)와 에러 코드 목록
8. 저장소 CI: 계약 컴파일과 차이 검사, 계약 린트, 룰셋 테스트, 스크립트 테스트

### 9.2 완료 조건

- 저장소 루트의 `pnpm check`와 CI가 통과한다.
- `contract/openapi.yaml`이 TypeSpec 컴파일 결과와 같고, 룰셋 위반이 0건이다.
- 룰셋, 구조 비교 스크립트, `verify-templates`가 각자의 픽스처 테스트로 "잡아야 할 위반을 실제로 잡는다"는 것을 증명한다.
- 계약이 §4의 기능, §5.6의 엔드포인트, §5.4의 에러 코드, §4.7의 이벤트를 모두 담고 있다.

## 10. 사이클별로 미룬 결정

| 사이클 | 결정할 것 |
|---|---|
| 1. FastAPI | 모두 정했다. 결정은 [FastAPI 설계](2026-09-26-fastapi-template-design.md) §2와 §7에 있다 |
| 2. web | API 클라이언트 생성기(openapi-fetch 또는 orval)와 JSON:API 역직렬화 헬퍼 설계, 데이터 패칭 패턴(RSC와 Server Actions, 클라이언트 쿼리의 역할 분담), 폼 라이브러리(TanStack Form 또는 React Hook Form), shadcn 기반(Base UI 또는 Radix), Next.js 관리 블록 처리(수용 또는 `agentRules: false`), i18n URL 전략, 목 서버 구현 방식, 단독 프론트에서 계약을 확장하는 방법(TypeSpec 원본 동봉 여부), TS 7 병용, Node 26 전환, 템플릿 안 계약 사본(`openapi.yaml`)을 비밀 스캔에서 빼는 방법 |
| 3. create CLI | 배포 방식(GitHub에서 npx 실행 또는 로컬 clone), 조합 루트의 세부 구성, 포트 배정 |
| 4. admin | 리소스 선언 형식, 범용 목록·상세·폼 화면의 범위 |
| 5. NestJS | ORM 최종 확인(Prisma 7), JSON:API DTO와 swagger 스키마 이름을 맞추는 방법, 린터 구성(TS 6 제약 아래 ESLint 또는 oxlint) |

## 11. 확인한 사실과 출처 (2026-09-26)

| 사실 | 출처 |
|---|---|
| Claude Code는 CLAUDE.md가 없을 때만 AGENTS.md를 직접 읽고(v2.1.277 이상), `@AGENTS.md` import를 권장 방식으로 안내한다 | https://code.claude.com/docs/en/memory.md |
| hook의 exec form(`command` + `args`, `${CLAUDE_PROJECT_DIR}` 치환), Windows에서의 쉘 선택, Stop hook의 연속 8회 상한과 `stop_hook_active` | https://code.claude.com/docs/en/hooks-guide.md, https://code.claude.com/docs/en/hooks.md |
| JSON:API 최신판은 1.1이고 1.2는 출시 전이다. include 미지원 시 400, 요청된 sparse fieldset 준수, 미지원 sort 시 400 | https://jsonapi.org/format/ |
| TypeSpec은 1.x 안정판이며 제네릭 모델을 지원한다 | https://typespec.io/ |
| Next.js 16.3: 16.3.7 보안 릴리스 예정, `next dev`가 AGENTS.md에 관리 블록을 씀, 버전 일치 문서 동봉, next-devtools-mcp | https://nextjs.org/blog/upcoming-nextjs-security-release-september-2026, https://nextjs.org/docs/app/guides/ai-agents, https://nextjs.org/docs/app/guides/mcp |
| NestJS 12(ESM 우선, Vitest 기본), nestjs-zod 미지원 | https://github.com/nestjs/nest/releases/tag/v12.0.0, https://github.com/BenLorantfy/nestjs-zod/issues/471 |
| Prisma 7이 프로덕션용이고 8은 RC다 | https://www.prisma.io/docs/orm/release-status |
| MinIO 커뮤니티판 중단 | https://github.com/minio/minio |
| ARQ는 유지보수만 하는 상태다 | https://github.com/python-arq/arq/issues/510 |
| Playwright는 코딩 에이전트에 CLI와 skill 방식을 권장한다 | https://github.com/microsoft/playwright-mcp |
| Turborepo는 package.json 래퍼로 다른 언어 작업도 캐시한다 | https://turborepo.dev/docs/guides/multi-language |
