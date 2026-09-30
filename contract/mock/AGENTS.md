# contract/mock

플랫폼 API를 메모리로 구현한 목 서버다(Hono와 Socket.IO, Node 24에서 tsx로 실행). 단독 web의 개발·E2E 백엔드이고 적합성 스위트의 `mock` 대상이다. 설계는 `docs/superpowers/specs/2026-09-30-nextjs-web-design.md` §8이다.

## 원칙

- FastAPI 템플릿(`templates/fastapi/src/app`)과 똑같이 동작한다. 상태, 에러 코드와 우선순위, detail, JSON:API 규칙, 레이트 리밋, 메일, 실시간 이벤트까지 FastAPI 코드를 읽고 맞춘다. 파일 첫 주석에 대응하는 FastAPI 파일과 규칙을 적는다.
- 요청은 계약(`contract/openapi.yaml`)으로 검증한다. 라우트는 operationId로 경로, 메서드, 인증, 권한, 쿼리 파라미터, 요청 문서를 계약에서 읽는다(`src/jsonapi/operations.ts`, `router.ts`). 계약으로 적을 수 없는 FastAPI 동작(공백 지우기, 짝 없는 서로게이트 등)만 코드로 둔다(`src/jsonapi/validation.ts`).
- 타입은 계약에서 만든 `src/generated/api.ts`를 쓴다(직접 고치지 않는다). 에러는 `ApiError`와 계약의 에러 코드만 쓴다.
- 데이터는 프로세스 메모리에 있다. 재시작하면 시드(admin·member 역할, 관리자, 예제 글)만 남는다.
- 시각은 `state.clock`으로 얻는다(테스트가 시간을 돌린다). 요청 하나는 await 없이 끝나므로 트랜잭션이 없다. 여러 행을 바꾸는 처리는 검사를 모두 마친 뒤 바꾼다(`src/store.ts`).

## 구조

| 경로                                          | 내용                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`, `src/app.ts`                   | 진입점, 앱 조립(미들웨어 순서가 FastAPI와 같다)                                                                        |
| `src/context.ts`, `src/trace-id.ts`           | 요청 문맥(`AppEnv`, `Variables.traceId`)과 trace id 규칙(traceparent를 읽어 `meta.traceId`를 정한다)                   |
| `src/health.ts`                               | 헬스체크(`/health/live`, `/health/ready`)                                                                              |
| `src/html.ts`, `src/json.ts`                  | 사람이 보는 화면의 HTML 도우미(`escapeHtml`, `htmlPage`)와 JSON 값 도우미(`isRecord`)                                  |
| `src/config.ts`                               | 설정(환경 변수)                                                                                                        |
| `src/state.ts`, `src/store.ts`, `src/seed.ts` | 메모리 상태, 테이블, 시드                                                                                              |
| `src/core/`                                   | 도메인을 모르는 기반: 시계, id, 보안, 클라이언트 IP, 레이트 리밋, 권한, 감사 로그, 목록, 실시간 허브                   |
| `src/jsonapi/`                                | JSON:API 공통 계층: 협상, 본문 한도, 계약 검증, 에러 문서, 쿼리, 렌더링, operation 라우터                              |
| `src/modules/`                                | FastAPI와 같은 단위의 모듈(auth, users, roles, files, posts, audit-logs, realtime). `registry.ts`가 모듈 사이를 잇는다 |
| `src/modules/realtime/`                       | 실시간: Socket.IO(`/socket.io`, API와 같은 포트), 티켓, 구독, 연결 재검사                                              |
| `src/storage/`                                | 가짜 스토리지(presigned URL, `/_storage`)                                                                              |
| `src/mail/`                                   | 가짜 메일 보관함(발신함). `/_test/mail`, `/_mock/mail`이 읽는다                                                        |
| `src/oauth-server/`                           | 가짜 OAuth 서버(google, kakao, naver)                                                                                  |
| `src/test-endpoints/`                         | 테스트 통로(`/_test/mail`, `/_mock/mail`)                                                                              |
| `test/`                                       | 단위 테스트. 앱을 `app.request`로 부른다(`test/support.ts`의 `testApp`, `testClock`)                                   |

## 명령

| 명령                                    | 하는 일                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm --filter @ai-template/mock start` | 목을 띄운다(기본 http://localhost:4010)                                               |
| `pnpm --filter @ai-template/mock test`  | 단위 테스트                                                                           |
| `pnpm --filter @ai-template/mock check` | 생성물 최신 여부, 타입, 단위 테스트. 루트 `pnpm check`에 들어 있다                    |
| `pnpm --filter @ai-template/mock gen`   | 계약에서 타입을 다시 만든다. 루트 `pnpm gen`도 한다                                   |
| `pnpm conformance mock [흐름 파일...]`  | 목을 띄우고 적합성 흐름을 돌린 뒤 내린다. Docker가 필요 없다(CI의 `conformance-mock`) |

## 설정

없거나 빈 변수는 FastAPI 템플릿 `.env.example`의 개발용 값을 쓰고, 틀린 변수는 한 줄씩 알리고 멈춘다(`src/config.ts`).

| 변수                                                     | 뜻                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `PORT`, `API_URL`                                        | 포트(기본 4010)와 브라우저가 보는 목의 주소(presigned URL, OAuth 화면)            |
| `HOST`                                                   | 들을 인터페이스(기본 127.0.0.1). 컨테이너는 `HOST=0.0.0.0`으로 연다               |
| `MOCK_TEST_ENDPOINTS`                                    | 테스트 통로를 연다(기본 켜짐)                                                     |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`                | 시드 관리자                                                                       |
| `FRONTEND_URL`, `OAUTH_REDIRECT_URIS`                    | 메일 링크의 프론트 주소, 소셜 로그인 뒤 돌아갈 프론트 콜백                        |
| `IDENTIFIER_HASH_SECRET`                                 | 이메일 해시(HMAC) 키                                                              |
| `RATE_LIMIT_*`                                           | 레이트 리밋 한도: `GLOBAL`(IP별 분당 600), 로그인, 가입, 메일 요청, 비밀번호 변경 |
| `FILE_MAX_SIZE`, `FILE_ALLOWED_TYPES`, `FILE_USER_QUOTA` | 업로드 한도                                                                       |
| `STORAGE_ALLOWED_ORIGINS`, `REALTIME_ALLOWED_ORIGINS`    | 가짜 스토리지의 CORS와 Socket.IO 연결이 받는 브라우저 Origin                      |

## 테스트 통로와 화면

`/_storage`만 늘 뜨고 나머지는 `MOCK_TEST_ENDPOINTS`가 켜져 있을 때만 뜬다.

- `GET /_test/mail[?to=주소]`, `DELETE /_test/mail`: 보낸 메일(JSON, 최신순). 적합성 키트와 E2E가 읽는다.
- `/_mock/mail`: 사람이 보는 메일 보관함(Mailpit 대신). 본문의 링크를 누르고 모두 지운다.
- `/_mock/oauth/{provider}/authorize`: 가짜 제공자의 로그인 화면. 사람이 신원을 고르거나 E2E가 모의 OAuth 서버와 같은 폼(username, claims)을 보낸다.
- `/_storage/<키>`: presigned URL로 올리고 내려받는다. 서명과 만료를 보고 CORS를 허용한다.

## 리소스 더하기

1. 계약(`contract/typespec/src/`)을 고치고 `pnpm gen`한다.
2. FastAPI 모듈을 읽고 `src/modules/<이름>/`에 같은 단위로 만든다: `model.ts`(행), `service.ts`(규칙, 에러, 감사 로그, 이벤트), `documents.ts`(리소스), `routes.ts`(`api.route("<operationId>", { auth, filters }, handler)`). 예시는 `posts`다.
3. 테이블은 `src/store.ts`, 그 밖의 상태는 `src/state.ts`, 시드는 `src/seed.ts`에 더하고, 라우트는 `src/app.ts`에서 단다.
4. 다른 모듈과 얽히는 처리(계정 닫기, 파일 읽기 규칙과 참조 확인, 역할 변경)는 등록 지점에 걸고 `src/modules/registry.ts`에서 잇는다.
5. 알림(`realtime.publish`)과 재검사(`realtime.recheck`)는 그 상태를 바꾼 뒤에 보낸다. 한 처리가 여러 곳을 바꾸며 알리면 `state.realtime.batch`로 전체를 감싸 재검사가 이미 바뀐 상태를 보게 한다(FastAPI의 commit 뒤 발행과 같다. 예: `modules/roles/management.ts`의 `deleteRole`).
6. `test/`에 단위 테스트를 둔다. 기대값은 FastAPI에 같은 요청을 보내 얻은 응답이다.
7. 적합성 흐름(`contract/conformance/test/flows/`)을 더해 `pnpm conformance mock`과 `pnpm conformance fastapi`에서 통과시킨다.

## FastAPI와 다른 점

- access token은 JWT가 아닌 불투명한 문자열이다. 만료는 세션 응답의 `accessTokenExpiresAt`, `refreshTokenExpiresAt`으로 본다.
- 메일은 요청 안에서 바로 보관함에 들어가고(FastAPI는 요청 뒤 잡으로 보낸다) 텍스트 본문만 있다.
- 비밀번호 해시(scrypt), 소셜 로그인 제공자(가짜 OAuth 서버), 스토리지(메모리 버킷)는 개발용이다. 재시작하면 옛 presigned URL은 맞지 않는다.
- 스케줄 잡이 없다. `modules/files/service.ts`의 `purgePending`은 떠 있는 프로세스가 부르지 않아 24시간이 지난 pending 업로드도 계속 사용자 쿼터를 차지한다. 만료된 세션과 토큰도 지우지 않는다(FastAPI는 각각 매일 03:00 UTC, 매시간 정각 잡으로 지운다).
- 공개 글 목록 첫 페이지를 캐시하지 않는다(FastAPI는 `posts/service.ts`가 60초 캐시한다). 그래서 저자 이름 변경처럼 다른 모듈이 일으킨 변화가 목에는 바로 보이고 FastAPI에는 최대 60초 늦게 보인다.
- 비밀번호의 짝 없는 서로게이트를 FastAPI는 surrogatepass로 인코딩해 해시하고, 목의 scrypt(`src/core/security.ts`)는 UTF-8로 인코딩하면서 U+FFFD로 대신한다. 그래서 U+FFFD가 든 비밀번호의 그 자리를 짝 없는 서로게이트로 바꿔 로그인하면 목은 통과하고 FastAPI는 401이다.
- `REALTIME_ALLOWED_ORIGINS`는 두 쪽 모두 값마다 Origin(스킴://호스트[:포트])으로 정규화하고 `*`와 http(s) 주소가 아닌 값을 설정 오류로 거절한다. 다만 목은 호스트를 WHATWG URL로 읽어 브라우저가 보낼 모양으로 바꿔 받고(ASCII가 아닌 호스트는 punycode로, `127.1`은 `127.0.0.1`로), FastAPI(`core/config.py`의 `Origins`)는 그렇게 바꿔야 하는 호스트를 설정 오류로 거절한다. 반대로 `xn--` 라벨이 올바른 punycode인지는 목만 본다(`http://xn--a.com`은 목에서 설정 오류, FastAPI에서는 어느 브라우저와도 맞지 않는 값).
- 본문 인코딩이 다르다: JSON의 `NaN`·`Infinity`는 목에서 400이다(Python의 `json`은 받아들인다). CESU-8로 짝을 이룬 서로게이트 바이트, UTF-16·UTF-32 본문도 Python의 `json.loads`와 다르게 다룬다(`src/jsonapi/validation.ts`, `src/jsonapi/surrogates.ts`).
- snake_case 속성 이름을 FastAPI(`validate_by_name`)는 camelCase와 함께 받지만, 목은 스키마에 없는 속성으로 보고 조용히 버린다(`removeAdditional`). 그 속성이 필수면 422가 난다.
- 설정 검증이 FastAPI보다 빡빡하다: `OAUTH_REDIRECT_URIS`의 각 값은 http(s) 주소여야 하고 `SEED_ADMIN_EMAIL`은 이메일 형식이어야 한다. FastAPI는 값을 그대로 받는다(각각 CommaSeparated, 빈 문자열만 아니면 되는 문자열).
- 끝에 슬래시가 붙은 경로는 목에서 404다(FastAPI/Starlette는 307로 리다이렉트한다).
- GET만 선언한 라우트에 HEAD로 요청하면 목은 200이다(Hono가 GET 처리기로 넘긴다). FastAPI는 404다.
- 이메일 형식은 흔한 경우만 email-validator와 같다(`src/jsonapi/email.ts`).
- 요청 검증의 나머지 두 경계는 FastAPI(Pydantic) 대신 계약대로 한다(`src/jsonapi/validation.ts`). 정수 자리에 소수점이나 지수로 쓴 정수(`10.0`, `1e3`)를 목은 받는다(JSON Schema의 integer, `JSON.parse`가 `10`과 구별하지 못한다). FastAPI는 422 `validation.invalid_format`이다(`json.loads`가 float로 읽고 정수는 strict다). 판별자 값과 이름이 같은 grant 필드(password grant의 `password`)에 객체나 배열을 보내면 FastAPI는 그 grant의 필드 오류를 그 값 아래로 가리키고(`/data/attributes/password/email`) 목은 실제 위치(`/data/attributes/email`)를 가리킨다.
