# 아키텍처

JSON:API 규약을 따르는 FastAPI 백엔드의 구조다. 규칙 대부분은 `uv run poe check`가 기계로 검사한다. 버전과 라이브러리 문서는 [stack.md](stack.md)에 있다.

## 계층과 모듈

- `src/app/core/`: 도메인을 모르는 기반이다. 설정, 로그, DB, Valkey, 스토리지, JSON:API 공통 계층이 있다. `app.modules`를 import하지 않는다(import-linter 계약 `core-knows-no-modules`). core가 모듈의 기능을 불러야 하면 core에 등록 지점(콜백, 레지스트리)을 두고 모듈이 등록한다.
- `src/app/modules/<이름>/`: 도메인 모듈이다. 쓰는 파일만 만든다. 골든 모듈 `posts`가 모든 파일을 갖춘 정답 예시다. 새 모듈은 `uv run poe gen:module <이름>`으로 posts를 복사해 만든다.

| 파일             | 하는 일                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| `__init__.py`    | 공개 인터페이스. 다른 모듈은 여기서 내보낸 이름만 쓴다                   |
| `router.py`      | 라우트, 권한 선언, 쿼리 허용 목록, 응답 문서 조립                        |
| `schemas.py`     | JSON:API 문서 모델(계약과 같은 이름)                                     |
| `service.py`     | 유스케이스, 트랜잭션 경계(commit), 이벤트 발행, 감사 기록                |
| `repository.py`  | DB 접근                                                                  |
| `models.py`      | SQLAlchemy 모델(`app.core.db.Base`를 상속)                               |
| `policies.py`    | 소유권 같은 권한 판정(순수 함수)                                         |
| `permissions.py` | 이 모듈의 권한 상수(`Permission`)와 `PERMISSIONS`                        |
| `events.py`      | 이 모듈의 실시간 이벤트와 페이로드                                       |
| `jobs.py`        | 이 모듈의 잡                                                             |
| `templates/`     | 이 모듈이 보내는 메일 템플릿(`<ko\|en>/<메일>.subject.txt, .txt, .html`) |
| `tests/`         | 이 모듈의 테스트                                                         |

- 모듈 안의 방향은 `router → service → repository → models` 하나다. `schemas`는 router와 service가, `policies`와 `events`는 service가 쓴다. 아래 계층은 위 계층을 import하지 않는다(import-linter 계약 `module-layers`).
- 다른 모듈은 `app.modules.<이름>` 패키지만 import한다. 내부 파일(`app.modules.users.repository` 등)은 import하지 않는다(`tools/checks/boundaries.py`). 모듈 사이의 순환 import는 basedpyright의 `reportImportCycles`가 막는다.
- 모듈 등록은 `src/app/modules/registry.py` 한 곳에서 한다. 모듈은 공개 인터페이스(`__init__.py`)로 `ROUTERS`, `PERMISSIONS`, `JOBS`, `CHANNELS`, `EVENTS`를 내보내고, 등록부가 모은다. 등록부도 모듈의 공개 인터페이스만 import한다(`module-boundary`는 `src/app/` 아래의 조립 파일도 본다).
- 잡은 `app.core.jobs.Job(이름, 함수, cron=...)`으로 선언한다. 이름(`<모듈>.<동사구>`)이 큐의 task_name이다. 잡 함수는 설정과 DB 세션을 `context: JobContext = JOB_CONTEXT`로 받고, api는 요청에서 `JobsDep`으로 잡을 보낸다.

## 플랫폼 모듈

| 모듈         | 하는 일                                                                                            | 쓰는 모듈    |
| ------------ | -------------------------------------------------------------------------------------------------- | ------------ |
| `roles`      | 역할과 권한 API, 실제 권한 계산, 권한 상승 판정(`within`)                                          | 없음         |
| `users`      | 내 정보, 탈퇴, 사용자 관리, 다른 리소스에 넣을 공개 사용자(`public_users`)                         | roles, files |
| `auth`       | 가입, 이메일 인증, 세션, 비밀번호, 소셜 로그인(제공자는 `auth/providers/`), 인증기(`authenticate`) | users, roles |
| `audit_logs` | 감사 로그 읽기. 기록은 각 모듈이 `app.core.audit.record_audit`로 한다                              | users        |
| `files`      | 업로드(presigned PUT), 완료 확인, 다운로드 URL, 읽기 규칙과 참조 확인의 등록 지점, 정리 잡         | 없음         |
| `realtime`   | 실시간 티켓, Socket.IO 연결(티켓 → 사용자 룸)과 구독(채널 권한)                                    | auth         |
| `posts`      | 골든 모듈. 글 목록·조회·쓰기, 전이 표, 공개 목록 캐시, 커버 이미지, 실시간 이벤트                  | users, files |

- 의존은 한쪽으로만 흐른다. 반대 방향이 필요하면 등록으로 뒤집는다. 계정을 닫을 때(비활성화, 탈퇴) users가 부를 처리를 auth가 `users.on_account_closed`로, 역할의 권한이 바뀌거나 역할이 지워질 때 그 멤버에게 알릴 처리를 users가 `roles.on_members_changed`로 등록한다(등록은 `registry.py`).
- files는 다른 모듈을 모른다. 소유자가 아닌 사람이 파일을 읽게 할 규칙(`files.add_read_rule`)과, 탈퇴 때 남길 파일을 가리는 참조 확인(`files.add_reference_check`)을 users와 posts가 등록한다.
- 감사 로그 테이블과 기록 함수는 core(`app.core.audit`)에 있다. 여러 모듈이 기록하고, 읽기 API(audit_logs)가 users를 포함하기 때문이다.
- 인증기는 요청마다 access token의 서명을 검증하고, 세션이 살아 있는지(폐기되지도 만료되지도 않았는지: `revoked_at`, `expires_at`)와 사용자, 역할을 DB에서 읽는다. 그래서 폐기와 권한 변경이 곧바로 효과를 낸다.

## 요청 흐름

1. OpenTelemetry를 켰으면 가장 바깥 미들웨어가 요청 span을 연다(`app.core.telemetry`). `TraceIdMiddleware`(`app.core.logging`)가 요청마다 traceId(32자리 16진수)를 정해 로그 문맥과 요청 상태에 둔다. span이 있으면 그 trace id이고, 없으면 새로 만든다.
2. `GlobalRateLimitMiddleware`(`app.core.ratelimit`)가 `/api/` 아래 요청을 IP별로 센다. 분당 한도(`RATE_LIMIT_GLOBAL`)를 넘으면 429와 `Retry-After`다. Valkey에 닿지 못하면 세지 않고 통과시킨다.
3. `JsonApiNegotiationMiddleware`가 `/api/` 아래 요청의 `Content-Type`(415)과 `Accept`(406)를 본다.
   그다음 `BodyLimitMiddleware`(`app.core.jsonapi.body_limit`)가 본문을 1 MiB까지 읽어 두고, 넘으면 413 `jsonapi.content_too_large`다. `Content-Length`가 넘으면 읽지 않고 거절한다. 한도는 코드 상수(`MAX_BODY_SIZE`)다.
4. 라우트 선언의 `auth`와 `permission`을 인증 검사(`app.core.access`)가 강제한다. Bearer 토큰을 인증기(auth 모듈)가 검증해 주체(`Principal`)를 만들고, 권한이 없으면 403이다. 토큰이 없거나 틀리면 401이다.
5. 라우트 선언(`Operation`, `CollectionOperation`)이 쿼리 파라미터를 파싱한다. 선언에 없는 파라미터, 허용하지 않은 include·sort, 틀린 filter·page는 400이다.
6. router는 service를 부르고, service가 트랜잭션을 연다(`SessionDep`의 세션으로 commit). repository가 DB를 읽고 쓴다.
7. router는 문서 모델을 만들어 `render()`로 응답한다. 에러는 `ApiError(상태, ErrorCode.<코드>, 영어 detail)`를 던지면 에러 문서(`meta.traceId` 포함)가 된다. 예상하지 못한 예외는 500 에러 문서다.
   에러 문서는 한 곳(`error_response`)에서 만든다. 401이면 `WWW-Authenticate: Bearer`를 더하고(이미 challenge를 넣었으면 그대로 둔다), 응답 클래스(`JsonApiResponse`)는 짝 없는 서로게이트를 `\uXXXX`로 이스케이프한다. 그래서 detail이 요청의 값을 그대로 담아도(예: `require_matching_id`) 500이 나지 않는다.

`/health/live`, `/health/ready`(`src/app/health.py`)는 JSON:API가 아니라 `application/json`이다. Socket.IO는 같은 api 프로세스의 `/socket.io/`에서 받는다(아래 "실시간").

## 프로세스

이미지 하나를 명령만 바꿔 띄운다(`Dockerfile`, compose의 `app` 프로필).

| 프로세스  | 운영 명령                                                                                     | 개발(`poe dev`)·E2E(`poe test:e2e`)                     | 비고                         |
| --------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------- |
| api       | `uvicorn app.main:app --host 0.0.0.0 --port 8000`                                             | `uvicorn app.main:app --loop asyncio:SelectorEventLoop` | 시작할 때 연결 자원을 만든다 |
| worker    | `taskiq worker app.worker:create_broker --no-configure-logging`                               | `python -m app.worker`                                  | 여러 개 띄울 수 있다         |
| scheduler | `taskiq scheduler app.scheduler:create_scheduler --no-configure-logging --update-interval=10` | 같다                                                    | 반드시 하나만 띄운다         |
| migrate   | `alembic upgrade head && python -m app.seed`                                                  | `uv run poe db:migrate`                                 | 배포 단계에서 api보다 먼저   |

- taskiq CLI(`taskiq worker`, `taskiq scheduler`)는 `create_broker`, `create_scheduler`를 인자 없이 부른다. 그 경로에서는 두 함수가 structlog 로그 설정을 스스로 하므로, CLI 자체의 로그 설정은 `--no-configure-logging`으로 끈다.
- Windows 기본 이벤트 루프(Proactor)에서는 psycopg의 비동기 모드가 돌지 않는다. 그래서 개발과 E2E는 api를 셀렉터 루프로, worker를 셀렉터 루프 한 프로세스(`python -m app.worker`)로 띄운다. Linux(이미지)는 기본 루프가 셀렉터다.
- 잡은 Valkey 스트림으로 주고받고, worker가 잡을 끝낸 뒤에 확인한다. 실패한 잡은 재시도가 Valkey 스케줄 소스에 들어가고 scheduler가 때가 되면 다시 보낸다(`src/app/worker.py`). scheduler는 스케줄을 10초마다 다시 읽는다(`--update-interval=10`). 첫 재시도 지연이 5초라 기본값(1분)이면 재시도가 크게 늦는다.
- 확인한 잡은 스트림에서 지운다(XACK와 XDEL을 한 트랜잭션으로). 스트림이나 스케줄 소스(재시도)에서 기다리는 잡은 처리할 때까지 인자를 담고 있다. 그래서 잡 인자는 id뿐이고, 개인정보(메일 주소)와 비밀(1회용 토큰)은 잡 안에서 읽거나 만든다.
- 주기 작업은 잡에 `schedule` 라벨로 선언하고 scheduler가 보낸다(`src/app/scheduler.py`).
- 메일은 보내는 모듈의 잡이 보낸다(예: auth의 `auth.send_verification_mail`). 잡이 실행될 때 사용자 id로 받는 사람을 읽고 보낼 조건을 다시 본 뒤, 토큰이 필요하면 발급해 commit하고, 모듈의 템플릿(`templates/<ko|en>/<메일>.subject.txt, .txt, .html`, `app.core.mail.MailTemplates`)으로 만들어 SMTP로 보낸다(`app.core.mail.send`). 요청은 SMTP를 기다리지 않고, 실패하면 worker가 재시도한다(재시도하면 토큰을 새로 발급한다). 개발과 테스트의 메일은 Mailpit(http://127.0.0.1:28025)이 받는다.

### 프록시 뒤에서 운영할 때

레이트 리밋의 IP별 한도와 감사 로그의 `ipAddress`는 클라이언트 IP(`app.core.clients`)를 쓴다. uvicorn은 `FORWARDED_ALLOW_IPS`에 있는 주소(기본값 `127.0.0.1,::1`)가 보낸 `X-Forwarded-For`만 믿는다.

- 로드 밸런서 뒤에서 이 값을 두지 않으면 모든 클라이언트가 로드 밸런서의 주소로 보인다. IP별 한도가 사이트 전체의 한도가 되고(가입은 사이트 전체에 시간당 10회, 로그인은 분당 10회), 감사 로그에는 로드 밸런서의 주소가 남는다.
- api 프로세스의 환경 변수 `FORWARDED_ALLOW_IPS`에 로드 밸런서의 주소나 대역을 쉼표로 적는다(예: `10.0.0.0/8`). uvicorn이 환경 변수에서 읽는 값이라 설정 스키마에 없고, `.env`에 적어도 전해지지 않는다.
- `*`(모두 믿기)는 쓰지 않는다. 클라이언트가 보낸 `X-Forwarded-For`의 첫 주소를 믿게 되어, 주소를 바꿔 가며 IP별 한도를 피할 수 있다.

## JSON:API 공통 계층 쓰는 법

라우트 선언 하나에서 operationId, 에러 응답, 쿼리 파라미터(OpenAPI)와 쿼리 파서가 함께 나온다. 전체 예시는 테스트 전용 샘플 `src/app/core/jsonapi/tests/sample.py`다.

1. 문서 모델: `app.core.jsonapi.models`의 제네릭(`ResourceWithRelationships`, `Document`, `CollectionDocument`, `CreateDocument` 등)을 상속해 계약과 같은 이름의 클래스를 만든다. 선택 필드는 `Omittable[T] = MISSING`이다. 정수는 `Int32`·`Int64`(strict)로 쓰고, DB에 저장하는 문자열에는 길이 제약을 둔다([엔드포인트 추가](recipes/endpoint.md)의 규칙).
2. 선언: `Operation(name=..., errors=..., include=..., fields=..., permission=...)`이나 `CollectionOperation(..., sort=..., filter=<FilterModel>)`. 에러 묶음은 `COMMON_ERRORS`, `BODY_ERRORS`, `AUTH_ERRORS`, `NOT_FOUND`, `CONFLICT`, `CREATE_ERRORS`다.
   - POST는 `CREATE_ERRORS`(클라이언트가 만든 id 403, type 불일치 409)를, PATCH는 `CONFLICT`(type·id 불일치 409)를 반드시 넣는다. 빠지면 라우트를 달 때 `ValueError`가 난다.
   - PATCH 핸들러는 `require_matching_id(document.data.id, 경로의 id)`로 본문의 id를 확인한다. 관계가 가리키는 리소스가 없으면 404이므로, 관계를 받는 선언에는 `NOT_FOUND`도 넣는다.
3. 라우터: `router = JsonApiRouter(prefix="/api/v1/posts", tag="posts", interface="Posts")`. operationId는 `<interface>_<name>`이다.
4. 엔드포인트: `@router.route("GET", "", LIST, response_model=PostCollectionDocument)`로 달고, 쿼리는 `query: Annotated[CollectionQuery[PostFilter], Depends(LIST)]`로 받는다.
5. 응답: `render(document, fields=query.fields)`. 페이지 링크와 `meta.page`는 `pagination(request, query.page, total)`, 포함 리소스는 `load_included(query.include, {"author": load_authors})`로 만든다.
6. 라우트나 문서 모델을 바꾸면 `uv run poe gen`으로 `openapi.json`을 다시 쓴다. check의 `generated` 단계가 최신인지, `contract` 단계가 계약 룰셋을 지키는지 본다.
7. JSON:API 밖의 리다이렉트(소셜 로그인)는 `RedirectOperation(name=..., errors=REDIRECT_ERRORS, query=(QueryParameter(...), ...), callback=...)`으로 선언한다. 성공은 본문 없는 302와 `Location`이고, 핸들러는 `RedirectResponse`를 돌려준다. `callback=True`면 제공자가 덧붙이는 파라미터를 받아들인다.

## 파일

브라우저가 스토리지(S3 호환, 개발은 SeaweedFS)에 직접 올리고 내려받는다. 앱은 presigned URL을 만들고 상태를 확인한다.

1. 만들기(`POST /files`): 크기(`FILE_MAX_SIZE`), 타입(`FILE_ALLOWED_TYPES`), 사용자별 한도(`FILE_USER_QUOTA`, 가진 파일 크기의 합)를 검사하고 `pending` 행을 만든다. 한도 검사는 사용자별 advisory lock으로 줄 세워 동시 요청도 한도를 넘지 않는다. `meta.upload`에 presigned PUT(15분)을 담는다. 서명은 SigV4라 `Content-Type`과 `Content-Length`가 서명에 들어가고, 선언과 다른 크기나 타입의 본문은 스토리지가 403으로 거절한다.
2. 올리기: 브라우저가 `meta.upload.url`에 `meta.upload.headers`(`Content-Type`)를 붙여 PUT한다. `uv run poe setup`과 이미지의 `python -m app.storage_setup`이 같은 코드로 버킷과 CORS를 준비한다. 허용 Origin은 `STORAGE_ALLOWED_ORIGINS`로 정한다.
3. 완료(`PATCH /files/{id}`, `status: "ready"`): 소유자만 한다. HEAD로 크기를 확인하고, 다르면 객체를 지우고 `file.upload_incomplete`다.
4. 내려받기: ready 파일의 `meta.downloadUrl`은 presigned GET(10분)이다. 포함 리소스(아바타, 커버 이미지)에도 채운다. presign은 네트워크 호출 없이 계산만 한다.
5. 정리: 24시간이 넘도록 pending인 파일은 잡 `files.purge_pending`(매시간 정각, UTC)이 지운다. 탈퇴하면 다른 리소스가 가리키지 않는 본인 파일을 지운다. 관계에서 풀린 파일(바꾸거나 뺀 아바타·커버, 지운 글의 커버)도 다른 리소스가 가리키지 않으면 지운다(`files.release`, 소유자가 탈퇴했어도 같다). 행은 같은 트랜잭션에서, 객체는 commit한 뒤에 지운다.

- 읽기: 소유자는 읽는다. 그 밖에는 모듈이 등록한 규칙 중 하나가 허용하면 읽는다(아바타는 공개, 볼 수 있는 글의 커버). 볼 수 없으면 404, 볼 수 있지만 소유자가 아닌 사람이 고치거나 지우면 403이다.
- 다른 리소스에 거는 파일(아바타, 커버)은 `files.attachable_file`로 검사한다. 요청한 사람 소유의 ready 이미지여야 한다.
- 허용 타입(`FILE_ALLOWED_TYPES`)에 `image/svg+xml`이나 HTML 타입을 넣지 않는다. 스크립트를 담을 수 있는 문서라 presigned URL을 열면 스토리지 출처에서 실행되고, SVG는 이미지로 통과해 공개 아바타나 커버가 될 수도 있다. 꼭 받아야 하면 그 타입의 presigned GET에 `ResponseContentDisposition=attachment`를 줘 내려받게만 한다.
- 객체 키는 `files/<id>`다. 테스트는 테스트마다 다른 키 prefix(`tests/<uuid>/`)를 쓴다(`storage` fixture).
- `STORAGE_ALLOWED_ORIGINS`는 쉼표로 구분하며 `REALTIME_ALLOWED_ORIGINS`와 같은 Origin 정규화·검증을 쓴다. 생략하면 `http://localhost:3000`, `http://localhost:3001`이다. `*`는 거절한다. 운영·E2E에는 실제 web Origin을 명시하고, 스토리지가 준비된 뒤 `python -m app.storage_setup`을 한 번 실행한다.
- 초기화는 버킷이 없을 때만 만들고 매번 CORS를 설정한 Origin으로 덮어쓴다. 기존 객체는 건드리지 않는다. GET·PUT·HEAD, 모든 요청 헤더, 응답 ETag, preflight 캐시 3000초를 허용한다. 권한·접속 오류는 실패로 끝나므로 배포에서 초기화 성공 뒤 앱을 시작한다. 초기화 명령은 `tools/`나 DB·Valkey에 의존하지 않는다.

### 공개 파일 전달로 바꾸는 방법

지금은 ready 파일을 모두 presigned GET으로 준다. 누구나 읽는 파일(아바타, 커버)이 많아지면 공개 버킷이나 CDN으로 바꾼다.

1. 공개할 파일을 공개 prefix(예: `public/<id>`)나 공개 버킷에 둔다. 걸 때(`attachable_file`) 복사하거나 옮긴다. 비공개 파일은 presigned GET을 그대로 쓴다.
2. 공개 prefix를 버킷 정책으로 공개하거나, 원본 접근을 CDN만 하게 막고 CDN을 앞에 둔다.
3. `files.service.file_resource`가 공개 파일에는 presign 대신 `<공개 주소>/<키>`를 `downloadUrl`로 주고 `downloadUrlExpiresAt`은 뺀다(계약에서 선택 필드다). 공개 주소는 설정에 더하고 `.env.example`도 고친다.
4. 공개 URL은 만료되지 않으므로 캐시 수명을 URL 수명에 맞출 필요가 없다. 반대로 한번 새면 되돌릴 수 없으므로 공개해도 되는 파일만 옮긴다.

## 캐시

`app.core.cache.Cache(redis, 이름공간, 모양)`은 Valkey 위의 cache-aside다.

- `get_or_set(키, 수명, 만들기)`는 캐시에 있으면 그 값을, 없으면 만들어 넣은 값을 돌려준다. 값은 JSON으로 오갈 수 있는 것이다.
- Valkey 키는 `cache:<이름공간>:<모양>:<세대>:<키>`다. `clear()`는 이름공간의 세대(`cache:<이름공간>:generation`)를 1 올린다. 키를 찾아 지우지 않고(SCAN이 없다), 옛 세대의 값은 수명이 지나면 사라진다.
- 채우기는 처음에 읽은 세대의 키에 쓴다. 채우는 사이에 `clear()`했으면 그 값은 옛 세대에 쓰이고 아무도 읽지 않는다.
- 모양은 캐시하는 값의 모양이다. 문서를 캐시하면 문서 모델의 JSON 스키마 해시(`schema_shape`)를 쓴다. 응답 모양을 바꾼 배포는 다른 키를 쓰므로 새 인스턴스가 옛 모양의 값을 읽지 않는다.
- Valkey에 닿지 못하면 캐시 없이 만들기를 부르고 경고만 남긴다.
- 예시는 posts의 공개 목록 첫 페이지(60초)다. 초안이 보이지 않는 요청 가운데 `include` 말고는 쿼리가 없는 요청(필터와 `fields` 없음, 기본 정렬, 기본 크기)만 캐시한다. 글을 쓰면 commit한 뒤에 캐시를 지운다(세대를 올린다).
- 키는 검증을 마친 값으로만 만든다. posts의 키는 검증한 `include` 경로를 정렬한 값이라, 키의 수가 include 조합 수를 넘지 않는다. 검증하지 않는 값(`fields` 등)이 키에 들어가면 값만 바꾼 요청마다 새 키가 생겨 캐시를 우회하고 메모리를 늘린다.
- 캐시한 문서에 presigned URL이 들어 있으면 캐시 수명을 URL 수명(10분)보다 짧게 둔다.

## 실시간

Socket.IO 서버(`app.core.realtime`)가 api 프로세스의 `/socket.io/`에서 WebSocket 연결만 받는다. 브라우저 연결의 Origin은 `REALTIME_ALLOWED_ORIGINS`로 본다. python-engineio는 Origin 헤더를 목록과 글자 그대로 비교하고 `*`를 모두 허용으로 읽으므로, 설정(`app.core.config`의 `Origins`)이 값마다 브라우저가 보내는 Origin(`스킴://호스트[:포트]`)으로 바꾼다. 경로와 끝의 `/`, 쿼리, 조각, 계정은 떼고, 호스트는 소문자로, 기본 포트(80, 443)는 뺀다. `*`, http(s)가 아닌 값, `\`가 든 값(urlsplit은 `\`에서 authority를 끝내지 않아 브라우저와 다른 호스트로 읽을 수 있다), 브라우저가 다른 모양으로 보내는 호스트(ASCII가 아닌 호스트, 줄여 쓴 IPv4 등)는 설정 오류다. 국제화 도메인은 punycode(`xn--…`)로 적는다.

- 연결: 로그인한 브라우저는 BFF가 받은 티켓(`POST /realtime-tickets`, 30초, 1회용)을 `auth.ticket`으로 보낸다. 서버는 티켓을 꺼내 지우고, 세션이 살아 있으면 그 연결을 `user:{id}` 룸에 넣는다. 틀린 티켓(ASCII가 아닌 값 포함)은 연결을 거부한다(`connect_error`의 message `auth.token_invalid`, data 에러 객체). 티켓이 없으면 익명 연결이다(realtime 모듈의 `gateway.py`).
- 구독: `subscribe`와 `unsubscribe`에 페이로드 `{ channel }` 하나를 보내고 ack(`RealtimeAck`)를 받는다. 페이로드가 없거나 둘 이상이면 모르는 채널처럼 422 `validation.invalid_choice`(`source.pointer` `/channel`) ack다. python-socketio는 페이로드를 하나씩 인자로 넘기므로 처리기는 `*payloads`로 받는다(인자가 맞지 않으면 처리기가 `TypeError`로 끝나 ack를 보내지 못한다). 채널은 모듈이 선언한다(`Channel`, posts는 `posts`와 `posts:all`). 권한이 필요한 채널은 구독할 때 DB에서 권한을 계산한다.
- 연결 재검사: 세션을 폐기하거나(`session.revoked`) 역할·상태를 바꾸면(`me.updated`의 `roles`, `status`) 모듈이 `queue_recheck(session, 사용자 id)`를 넣고, commit한 뒤에 발행기가 제어 채널(`<pub/sub 채널>:control`, `app.core.realtime_pubsub.ControlChannel`)로 알린다. 여러 세션을 폐기하는 요청(다른 기기·전체 로그아웃, 비밀번호 변경·재설정, 계정 닫기)은 폐기한 세션이 없어도 재검사를 넣는다(auth의 `events.session_revoked`). 만료되기 전에 붙은 연결이 남아 있을 수 있기 때문이다. api 인스턴스마다 제어 채널을 듣다가, 자기 인스턴스에 있는 그 사용자의 연결(`user:{id}` 룸의 참가자)을 다시 검사해 세션이 끝났거나(폐기, 만료) 구독한 채널의 권한을 잃은 연결을 끊는다(realtime 모듈의 `Gateway.recheck`). 사용자별 소켓 id를 인스턴스 밖에 기록하지 않는다. 끊긴 클라이언트는 새 티켓으로 다시 붙는다. 세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독이 `permission.denied`다. 제어 채널을 듣지 못한 동안(Valkey 장애)의 알림은 잃는다. 연결 하나를 다시 검사하다 끝내지 못하면(예: DB 장애) 그 연결은 끊지 않고 남겨 두고(fail-open) 나머지 연결을 이어서 검사한다.
- 발행: 모듈이 쓰기의 commit 전에 `queue(session, 이름, 룸, 페이로드를 만드는 함수)`로 넣으면, 세션(`EventSession`)이 commit이 성공한 뒤 페이로드를 만들어 발행기로 보낸다. rollback하면 버려지고, 발행에 실패해도 요청은 성공한다. 계정 닫기 같은 훅 안에서 넣은 이벤트도 부른 쪽의 commit 뒤에 나간다. 룸이 없는 이벤트는 보내지 않는다(빈 룸 목록을 그대로 넘기면 Socket.IO가 room 전체 브로드캐스트로 다루기 때문이다).
- 인스턴스 사이: api의 발행기는 이 인스턴스의 연결에 보내고 Valkey pub/sub으로 다른 인스턴스에 알린다. python-socketio 매니저는 발행이 실패하거나 수신을 다시 시작할 때마다 Valkey 클라이언트를 새로 만든다. `TrackedRedisManager`는 클라이언트를 하나만 만들어 다시 쓰고(redis-py가 다시 연결한다) 닫을 때 닫는다. worker와 scheduler는 소켓 서버가 아니라 쓰기 전용 발행기(`JobContext.realtime`)로 보낸다. pub/sub 채널 이름에는 Valkey DB 번호를 넣어 개발, 테스트, E2E를 나눈다.
- 계약: 채널, 이벤트, 메시지는 계약의 `x-realtime-channels`, `x-realtime-events`, `x-realtime-messages`와 같다. 앱이 `openapi.json`에 이 확장과 페이로드 스키마를 내고(`realtime_openapi`), 저장소의 구조 비교(`pnpm spec-compare`)가 계약과 같은지 본다.

## E2E

`uv run poe test:e2e`는 api, worker, scheduler를 E2E 설정으로 띄우고 `tests/e2e`를 돌린다.
외부 web E2E 등은 같은 서버 준비 경로를 쓰는 다음 명령으로 실행한다.

```text
uv run poe e2e:serve [--web-url <주소>] -- <명령> [인자...]
```

- 인프라가 꺼져 있으면 `uv run poe setup`을 안내하고 실패한다. 인프라를 직접 띄우지 않는다.
- DB `app_e2e`를 마이그레이션·시드하고 Valkey DB 14만 비운다. 개발 DB와 Valkey DB 0, Mailpit 메일은 보존한다.
- api는 `http://127.0.0.1:18000`, 레이트 리밋은 테스트 한도, 최근 로그인 창은 10초다.
- web 기본 주소는 `http://localhost:3100`이다. `--web-url`은 경로·쿼리·조각·계정 없는 http(s) Origin만 받는다.
  메일의 `FRONTEND_URL`, 실시간 Origin, OAuth의 `<web 주소>/oauth/callback`을 맞춘다.
  스토리지 Origin은 기존 개발 Origin과 web Origin의 합집합이며, `app.storage_setup.ensure_bucket`으로 버킷 CORS를 적용한 뒤 readiness를 기다린다. 기존 객체는 보존한다.
- `/health/ready`가 200이면 명령을 실행한다. 명령의 작업 폴더는 poe의 `POE_PWD`(명령을 호출한 폴더)다.
  호출자의 환경에 아래 값만 더하며, web 전용 변수로 바꾸는 일은 호출자가 맡는다.

| 변수                       | 값                                       |
| -------------------------- | ---------------------------------------- |
| `E2E_API_URL`              | `http://127.0.0.1:18000`                 |
| `E2E_WEB_URL`              | web Origin(기본 `http://localhost:3100`) |
| `E2E_MAILPIT_URL`          | `http://127.0.0.1:28025`(Mailpit API)    |
| `E2E_OAUTH_URL`            | `http://127.0.0.1:28080`(모의 OAuth)     |
| `E2E_RECENT_LOGIN_SECONDS` | `10`                                     |

명령의 입출력을 그대로 연결하고 종료 코드로 끝난다. Ctrl+C·종료 신호도 명령과 세 서버의 자손까지 내린다.
준비가 60초 안에 끝나지 않으면 로그(`.cache/e2e/processes.log`)의 끝부분을 보여 주고 종료 코드 1로 끝난다.
`test:e2e`와 `e2e:serve`는 같은 포트·격리 DB를 쓰므로 차례로 실행한다.

## 소셜 로그인

auth 모듈의 `service/oauth.py`와 `providers/`다. 제공자는 파일 하나씩이고(`google.py`, `kakao.py`, `naver.py`) 인가 주소와 코드 교환은 httpx-oauth가, 신원 조회는 설정의 프로필 주소를 GET으로 읽는다. 로그인은 BFF가 쥔 PKCE 쌍에 묶어 로그인 CSRF를 막는다.

1. BFF가 로그인 시도마다 code verifier를 만들어 시작한 브라우저에 연결해 두고(예: httpOnly 쿠키), `GET /api/v1/oauth/{provider}/authorize?redirectUri=&codeChallenge=`로 이동시킨다(`codeChallenge`는 그 verifier의 S256, base64url 43자). `redirectUri`가 `OAUTH_REDIRECT_URIS`에 없거나 URL 형식이 아니면(urlparse가 읽지 못하면) 400이고, `codeChallenge`가 없거나 형식이 틀려도 400이다. state, 받은 `codeChallenge`, 제공자와 주고받을 자신의 PKCE verifier, `redirectUri`를 Valkey에 10분 두고 제공자 로그인 화면으로 302를 보낸다. 세 제공자 모두 OIDC 인가(scope에 openid)와 PKCE(S256)를 쓴다.
2. 제공자가 `<API_URL>/api/v1/oauth/{provider}/callback`으로 돌아온다. state가 없거나 만료됐으면 400이다. 사용자의 거부(제공자의 `error=access_denied`)는 `redirectUri?error=auth.oauth_denied`, 제공자의 다른 에러와 코드 교환·신원 조회 실패는 `auth.oauth_failed`, 비활성 계정은 `auth.account_deactivated`로 보낸다.
3. 계정 연결: (제공자, 제공자의 사용자 id)로 연결된 계정 → 제공자가 검증한 이메일이면 같은 이메일의 계정(인증하지 않고 먼저 가입한 계정이면 그 비밀번호를 지운다) 또는 인증을 마친 새 계정 → 그 밖에는 이메일 없는 새 계정. 이메일 검증은 구글은 `email_verified`가 참이고 `gmail.com` 주소이거나 `hd`(구글 워크스페이스)가 있을 때, 카카오는 `is_email_valid`와 `is_email_verified`가 모두 참일 때, 네이버는 늘 미검증이다. 구글의 다른 주소는 `email_verified`만으로 그 이메일의 주인을 보증하지 않는다(메일함 주인이 바뀐 뒤에도 참으로 남을 수 있다).
4. 성공하면 1회용 코드(60초)에 `codeChallenge`를 실어 `redirectUri?code=`로 보낸다. BFF가 `POST /sessions`의 `oauthCode` grant에 `code`와 `codeVerifier`를 보내 토큰을 받는다. `codeVerifier`가 RFC 7636 모양(`[A-Za-z0-9._~-]` 43~128자)이 아니거나 `codeChallenge`를 만들지 못하면 코드를 소비하고 `auth.oauth_code_invalid`다. BFF는 자기가 verifier를 쥐지 않은 프론트 콜백 `code`를 거부한다(그러지 않으면 공격자가 완성된 콜백 URL을 피해자에게 넘길 수 있다). 로그인 성공 감사 로그(`method: oauth`, `provider`)는 이때 남긴다.

- 설정: 제공자마다 `OAUTH_<제공자>_CLIENT_ID`, `_CLIENT_SECRET`, `_AUTHORIZE_URL`(브라우저가 부른다), `_TOKEN_URL`, `_PROFILE_URL`(서버가 부른다). 운영 주소는 `.env.example`의 주석에 있다. 카카오는 콘솔에서 OpenID Connect를 켜야 한다.
- 개발과 테스트는 모의 OAuth 서버(compose의 `oauth`, 28080)를 쓴다. 로그인 폼에 신원(claims)을 보내면 그대로 토큰과 userinfo에 담는다. 제공자마다 다른 프로필 응답(카카오 `kakao_account`, 네이버 `response`)을 claims로 흉내 낸다(`app.tests.oauth`). 비ASCII 값은 깨지므로 테스트의 이름은 ASCII로 쓴다.
- 새 제공자는 `providers/`에 파일 하나(`Provider` 값), 설정(`OAUTH_<이름>_*`), 계약의 `OAuthProvider` 값으로 더한다.

## 관측성

- 로그는 structlog JSON(개발은 콘솔 형식)이고, 요청마다 traceId가 붙는다. 에러 문서의 `meta.traceId`도 같은 값이다.
- Uvicorn 접근 로그는 모든 환경에서 쿼리를 빼고 클라이언트·메서드·경로·HTTP 버전·상태만 남긴다.
- OpenTelemetry는 기본으로 꺼 둔다. `OTEL_ENABLED=true`면 프로세스가 시작할 때 `configure_telemetry`가 tracer를 설정하고 트레이스를 OTLP(HTTP, `OTEL_EXPORTER_OTLP_ENDPOINT`)로 보낸다. 서비스 이름은 `OTEL_SERVICE_NAME`에 역할을 붙인 것이다(예: `app-api`, `app-worker`).
- 계측: FastAPI(요청), SQLAlchemy와 psycopg(쿼리), Redis(Valkey 명령), httpx(소셜 로그인 제공자 호출), Taskiq(잡 보내기와 실행, broker 미들웨어). python-socketio에는 계측이 없어 연결과 구독 처리에 수동 span(`realtime.connect`, `realtime.subscribe`)을 둔다.
- 헬스 체크(`/health/live`, `/health/ready`)는 span을 만들지 않는다(자주 와서 잡음이다). 제외 URL은 `OTEL_PYTHON_FASTAPI_EXCLUDED_URLS`(없으면 `OTEL_PYTHON_EXCLUDED_URLS`)에 헬스 경로를 더한 값이다(`excluded_urls`). 준비 검사 안의 DB·Valkey 호출도 계측을 끈 채 돌아, 따로 루트 trace가 되지 않는다.
- 로컬에서 보려면 `docker compose --profile observability up -d`로 Grafana LGTM을 띄우고 `OTEL_ENABLED=true`로 api를 다시 띄운다. 화면은 http://127.0.0.1:23000 이다.

## 설정과 비밀

- 설정은 `app.core.config.Settings` 하나다. 비밀(키, 비밀번호, 계정이 든 `DATABASE_URL`, `REDIS_URL`, `SMTP_URL`)은 `SecretStr`로 받아 repr과 로그에 값이 드러나지 않는다. 쓰는 곳에서만 `get_secret_value()`로 꺼낸다.
- `RECENT_LOGIN_SECONDS`는 탈퇴에 필요한 최근 로그인 창이다(초, 1 이상의 정수, 기본 600). 재인증 E2E에서만 줄인다. 창의 경계까지 허용하고, 지나면 401 `auth.reauthentication_required`와 같은 초를 담은 `WWW-Authenticate`의 `max_age`를 돌려준다. 세션의 최초 로그인 시각으로 검사하므로 refresh로는 풀리지 않으며, 다시 로그인해야 한다.

web의 재인증·브라우저 업로드를 맞출 때는 다음 두 설정을 명시한다. 이름·공개 기본값은 `.env.example`, 검증은 `app.core.config.Settings`를 따른다.

| 변수                      | 생략할 때                                     | web E2E 예시            | 적용                                                                                                 |
| ------------------------- | --------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `RECENT_LOGIN_SECONDS`    | `600`초                                       | `10`                    | 탈퇴 검사와 `WWW-Authenticate`의 `max_age`. web 어댑터의 `E2E_RECENT_LOGIN_SECONDS`도 같은 초로 둔다 |
| `STORAGE_ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:3001` | `http://localhost:3100` | 스토리지 준비 뒤 `python -m app.storage_setup`으로 버킷 CORS를 적용한다                              |

최근 로그인 창은 1 이상의 정수만 받으며 refresh로 늘어나지 않는다. 스토리지 Origin은 쉼표 목록을 정규화하고 빈 목록·wildcard·잘못된 주소를 거절한다.
Origin을 바꾸면 초기화 명령을 다시 실행해 CORS를 맞춘다. 반복해도 기존 객체는 보존하며 버킷 생성·CORS 오류는 실패로 끝난다.
메일의 `FRONTEND_URL`, `REALTIME_ALLOWED_ORIGINS`, `OAUTH_REDIRECT_URIS`도 같은 web Origin과 `/oauth/callback`에 맞춘다. S3 public endpoint는 브라우저가 접근할 주소로 둔다.

- 운영(`APP_ENV=production`)에서는 앱이 스스로 정하는 비밀(`JWT_SECRET`, `IDENTIFIER_HASH_SECRET`, `SEED_ADMIN_PASSWORD`)이 `.env.example`의 값이면 설정 검증이 실패해 시작하지 않는다. `.env.example`을 그대로 옮긴 실수를 막는다. DB, S3, SMTP, OAuth의 자격 증명은 그 서비스가 예시 값을 거절하므로 보지 않는다. compose의 app 프로필도 운영 모드라 이 셋에 따로 값을 둔다.
- 이메일처럼 추측할 수 있는 식별자는 원문 대신 `IDENTIFIER_HASH_SECRET` 키의 HMAC-SHA256(`app.core.security.identifier_hash`)으로 남긴다. 로그인의 식별자별 레이트 리밋 키, 메일 요청의 이메일별 레이트 리밋 키, 로그인 실패 감사 로그의 `identifierHash`가 이 값이다. 키 없는 해시는 흔한 주소 목록으로 되돌릴 수 있다.
- 이 키를 바꾸면 이전 감사 로그의 `identifierHash`와 새 값이 이어지지 않고, 식별자별 레이트 리밋 창이 새로 시작한다.
- 무작위 토큰(refresh token, 1회용 토큰, 실시간 티켓, OAuth 1회용 코드)은 추측할 수 없으므로 키 없이 SHA-256(`digest`)만 저장한다.
