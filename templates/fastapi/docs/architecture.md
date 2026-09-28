# 아키텍처

JSON:API 규약을 따르는 FastAPI 백엔드의 구조다. 규칙 대부분은 `uv run poe check`가 기계로 검사한다. 버전과 라이브러리 문서는 [stack.md](stack.md)에 있다.

## 계층과 모듈

- `src/app/core/`: 도메인을 모르는 기반이다. 설정, 로그, DB, Valkey, 스토리지, JSON:API 공통 계층이 있다. `app.modules`를 import하지 않는다(import-linter 계약 `core-knows-no-modules`). core가 모듈의 기능을 불러야 하면 core에 등록 지점(콜백, 레지스트리)을 두고 모듈이 등록한다.
- `src/app/modules/<이름>/`: 도메인 모듈이다. 쓰는 파일만 만든다. 골든 모듈 `posts`가 모든 파일을 갖춘 정답 예시다(M3에서 채운다).

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
- 모듈 등록은 `src/app/modules/registry.py` 한 곳에서 한다. 모듈은 공개 인터페이스(`__init__.py`)로 `ROUTERS`, `PERMISSIONS`, `JOBS`를 내보내고, 등록부가 모은다. 등록부도 모듈의 공개 인터페이스만 import한다(`module-boundary`는 `src/app/` 아래의 조립 파일도 본다).
- 잡은 `app.core.jobs.Job(이름, 함수, cron=...)`으로 선언한다. 이름(`<모듈>.<동사구>`)이 큐의 task_name이다. 잡 함수는 설정과 DB 세션을 `context: JobContext = JOB_CONTEXT`로 받고, api는 요청에서 `JobsDep`으로 잡을 보낸다.

## 플랫폼 모듈

| 모듈         | 하는 일                                                                    | 쓰는 모듈    |
| ------------ | -------------------------------------------------------------------------- | ------------ |
| `roles`      | 역할과 권한 API, 실제 권한 계산, 권한 상승 판정(`within`)                  | 없음         |
| `users`      | 내 정보, 탈퇴, 사용자 관리, 다른 리소스에 넣을 공개 사용자(`public_users`) | roles, files |
| `auth`       | 가입, 이메일 인증, 세션, 비밀번호, 요청의 인증기(`authenticate`)           | users, roles |
| `audit_logs` | 감사 로그 읽기. 기록은 각 모듈이 `app.core.audit.record_audit`로 한다      | users        |

- 의존은 한쪽으로만 흐른다. 반대 방향이 필요하면 등록으로 뒤집는다. 계정을 닫을 때(비활성화, 탈퇴) users가 부를 처리를 auth가 `users.on_account_closed`로 등록한다(등록은 `registry.py`).
- 감사 로그 테이블과 기록 함수는 core(`app.core.audit`)에 있다. 여러 모듈이 기록하고, 읽기 API(audit_logs)가 users를 포함하기 때문이다.
- 인증기는 요청마다 access token의 서명을 검증하고, 세션이 살아 있는지(`revoked_at`)와 사용자, 역할을 DB에서 읽는다. 그래서 폐기와 권한 변경이 곧바로 효과를 낸다.

## 요청 흐름

1. `TraceIdMiddleware`(`app.core.logging`)가 요청마다 traceId(32자리 16진수)를 만들어 로그 문맥과 요청 상태에 둔다.
2. `GlobalRateLimitMiddleware`(`app.core.ratelimit`)가 `/api/` 아래 요청을 IP별로 센다. 분당 한도(`RATE_LIMIT_GLOBAL`)를 넘으면 429와 `Retry-After`다. Valkey에 닿지 못하면 세지 않고 통과시킨다.
3. `JsonApiNegotiationMiddleware`가 `/api/` 아래 요청의 `Content-Type`(415)과 `Accept`(406)를 본다.
4. 라우트 선언의 `auth`와 `permission`을 인증 검사(`app.core.access`)가 강제한다. Bearer 토큰을 인증기(auth 모듈)가 검증해 주체(`Principal`)를 만들고, 권한이 없으면 403이다. 토큰이 없거나 틀리면 401이다.
5. 라우트 선언(`Operation`, `CollectionOperation`)이 쿼리 파라미터를 파싱한다. 선언에 없는 파라미터, 허용하지 않은 include·sort, 틀린 filter·page는 400이다.
6. router는 service를 부르고, service가 트랜잭션을 연다(`SessionDep`의 세션으로 commit). repository가 DB를 읽고 쓴다.
7. router는 문서 모델을 만들어 `render()`로 응답한다. 에러는 `ApiError(상태, ErrorCode.<코드>, 영어 detail)`를 던지면 에러 문서(`meta.traceId` 포함)가 된다. 예상하지 못한 예외는 500 에러 문서다.

`/health/live`, `/health/ready`(`src/app/health.py`)는 JSON:API가 아니라 `application/json`이다.

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
- 확인한 잡은 스트림에서 지운다(XACK와 XDEL을 한 트랜잭션으로). 스트림이나 스케줄 소스(재시도)에서 기다리는 잡은 처리할 때까지 내용(메일 잡이면 받는 사람과 링크)을 담고 있다.
- 주기 작업은 잡에 `schedule` 라벨로 선언하고 scheduler가 보낸다(`src/app/scheduler.py`).
- 메일은 보내는 모듈의 템플릿(`templates/<ko|en>/<메일>.subject.txt, .txt, .html`)으로 만들고(`app.core.mail.MailTemplates`), 잡 `mail.send`(`SEND_MAIL`)가 SMTP로 보낸다. 요청은 SMTP를 기다리지 않고, 실패하면 worker가 재시도한다. 개발과 테스트의 메일은 Mailpit(http://127.0.0.1:28025)이 받는다.

### 프록시 뒤에서 운영할 때

레이트 리밋의 IP별 한도와 감사 로그의 `ipAddress`는 클라이언트 IP(`app.core.clients`)를 쓴다. uvicorn은 `FORWARDED_ALLOW_IPS`에 있는 주소(기본값 `127.0.0.1,::1`)가 보낸 `X-Forwarded-For`만 믿는다.

- 로드 밸런서 뒤에서 이 값을 두지 않으면 모든 클라이언트가 로드 밸런서의 주소로 보인다. IP별 한도가 사이트 전체의 한도가 되고(가입은 사이트 전체에 시간당 10회, 로그인은 분당 10회), 감사 로그에는 로드 밸런서의 주소가 남는다.
- api 프로세스의 환경 변수 `FORWARDED_ALLOW_IPS`에 로드 밸런서의 주소나 대역을 쉼표로 적는다(예: `10.0.0.0/8`). uvicorn이 환경 변수에서 읽는 값이라 설정 스키마에 없고, `.env`에 적어도 전해지지 않는다.
- `*`(모두 믿기)는 쓰지 않는다. 클라이언트가 보낸 `X-Forwarded-For`의 첫 주소를 믿게 되어, 주소를 바꿔 가며 IP별 한도를 피할 수 있다.

## JSON:API 공통 계층 쓰는 법

라우트 선언 하나에서 operationId, 에러 응답, 쿼리 파라미터(OpenAPI)와 쿼리 파서가 함께 나온다. 전체 예시는 테스트 전용 샘플 `src/app/core/jsonapi/tests/sample.py`다.

1. 문서 모델: `app.core.jsonapi.models`의 제네릭(`ResourceWithRelationships`, `Document`, `CollectionDocument`, `CreateDocument` 등)을 상속해 계약과 같은 이름의 클래스를 만든다. 선택 필드는 `Omittable[T] = MISSING`이다.
2. 선언: `Operation(name=..., errors=..., include=..., fields=..., permission=...)`이나 `CollectionOperation(..., sort=..., filter=<FilterModel>)`. 에러 묶음은 `COMMON_ERRORS`, `BODY_ERRORS`, `AUTH_ERRORS`, `NOT_FOUND`, `CONFLICT`, `CREATE_ERRORS`다.
   - POST는 `CREATE_ERRORS`(클라이언트가 만든 id 403, type 불일치 409)를, PATCH는 `CONFLICT`(type·id 불일치 409)를 반드시 넣는다. 빠지면 라우트를 달 때 `ValueError`가 난다.
   - PATCH 핸들러는 `require_matching_id(document.data.id, 경로의 id)`로 본문의 id를 확인한다. 관계가 가리키는 리소스가 없으면 404이므로, 관계를 받는 선언에는 `NOT_FOUND`도 넣는다.
3. 라우터: `router = JsonApiRouter(prefix="/api/v1/posts", tag="posts", interface="Posts")`. operationId는 `<interface>_<name>`이다.
4. 엔드포인트: `@router.route("GET", "", LIST, response_model=PostCollectionDocument)`로 달고, 쿼리는 `query: Annotated[CollectionQuery[PostFilter], Depends(LIST)]`로 받는다.
5. 응답: `render(document, fields=query.fields)`. 페이지 링크와 `meta.page`는 `pagination(request, query.page, total)`, 포함 리소스는 `load_included(query.include, {"author": load_authors})`로 만든다.
6. 라우트나 문서 모델을 바꾸면 `uv run poe gen`으로 `openapi.json`을 다시 쓴다. check의 `generated` 단계가 최신인지, `contract` 단계가 계약 룰셋을 지키는지 본다.

## 공개 파일 전달을 바꾸는 방법

지금 규칙은 ready 상태의 파일을 모두 presigned GET(10분)으로 준다. 공개 버킷과 CDN으로 바꾸는 방법은 M3에서 files 모듈과 함께 이 자리에 적는다.
