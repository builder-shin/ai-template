# src/app/core

도메인을 모르는 기반이다. 모든 모듈이 쓴다.

- `config.py`: 설정 스키마 `Settings` 하나. 값은 환경 변수와 `.env`에서 온다. `load_settings()`는 틀린 값을 변수마다 한 줄씩 알리고 멈춘다.
- `logging.py`: structlog 설정과 traceId 미들웨어.
- `db.py`: 비동기 엔진, 세션 팩토리, 모델의 기반 `Base`(제약 이름 규칙 포함), 요청 세션 `SessionDep`, 모델 시각의 기본값 `utc_now`.
- `redis.py`: Valkey 클라이언트와 요청 의존성 `RedisDep`.
- `storage.py`: S3 클라이언트(`create_client`)와 버킷 확인(`check_bucket`).
- `jsonvalue.py`: JSON 값 좁히기(`is_object`, `is_array`).
- `security.py`: 비밀번호 해시(Argon2id), access token(JWT) 발급과 검증, 1회용 토큰과 SHA-256(`digest`).
- `permissions.py`: 권한(`Permission`)과 레지스트리(`PermissionRegistry`). 권한은 모듈이 내보내고 `app.modules.registry`가 모은다.
- `clients.py`: 요청을 보낸 쪽(IP, User-Agent). `ClientDep`으로 받는다.
- `ratelimit.py`: 레이트 리밋(Valkey 고정 윈도). 엄격한 한도는 service가 `enforce(redis, Limit(...), 대상)`로 걸고, IP별 전역 한도는 미들웨어가 건다.
- `jobs.py`: 잡 선언(`Job`), 등록(`register`), 잡의 문맥(`JobContext`, `JOB_CONTEXT`), 보내기(`JobQueue`, `JobsDep`).
- `mail.py`: 메일 템플릿 렌더링(`MailTemplates`, 로케일이 없으면 ko)과 SMTP 발송. 서비스는 메일을 만들어 잡 `SEND_MAIL`로 보낸다.
- `audit.py`: 감사 로그 테이블(`AuditLog`)과 기록(`record_audit`), 계약의 행위·대상 어휘(`AuditLogAction`, `AuditLogTargetType`). 여러 모듈이 기록하고 읽기 API(audit_logs 모듈)가 users를 포함하므로 core에 둔다.
- `access.py`: 인증과 권한 검사. 인증기와 레지스트리는 `install_access`로 앱에 건다. 라우트 선언의 `auth`, `permission`을 라우터가 강제하고, 엔드포인트는 `PrincipalDep`, `OptionalPrincipalDep`으로 주체를 받는다.
- `jsonapi/`: JSON:API 공통 계층(문서 모델, 에러, 협상, 라우트 선언, 쿼리 파서, 렌더링, OpenAPI 후처리). 쓰는 법은 `docs/architecture.md`, 예시는 `jsonapi/tests/sample.py`.

## 규칙

- `app.modules`를 import하지 않는다(import-linter 계약 `core-knows-no-modules`). 모듈의 기능을 불러야 하면 core에 등록 지점(콜백, 레지스트리)을 두고 모듈이 등록한다.
- 도메인 용어(사용자, 글, 역할 등)를 넣지 않는다. 도메인은 `src/app/modules/`에 둔다.
- 설정 필드를 더하거나 빼면 `.env.example`도 같이 고친다(하네스 검사 `env-example`).
- boto3 호출은 블로킹이다. 요청을 처리하는 코드에서는 `asyncio.to_thread`로 넘긴다.
- 테스트는 `core/tests/`와 `core/jsonapi/tests/`에 둔다. core의 테스트는 `app.main`을 import하지 않는다. `app.main`은 모듈을 거쳐 `app.modules`를 import하게 되고, import-linter는 간접 import도 센다.
