# FastAPI 템플릿

JSON:API 규약을 따르는 FastAPI 백엔드다. Python 3.14와 uv를 쓰고, 명령은 `uv run poe <명령>`으로 부른다. 인프라는 Docker compose로 띄운다.

- 라이브러리 API는 기억에 의존하지 말고 [docs/stack.md](docs/stack.md)에 적힌 버전의 문서를 확인한다.
- FastAPI 코드를 쓰기 전에 FastAPI 공식 skill(`.claude/skills/fastapi/SKILL.md`)을 읽는다.

## 명령

| 명령                                | 하는 일                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `uv run poe setup`                  | `.env`, Betterleaks, git hook, 인프라(compose), 버킷, DB(개발·테스트·E2E), 마이그레이션, 시드, FastAPI skill 사본을 준비한다 |
| `uv run poe dev`                    | api(`http://127.0.0.1:8000`, 코드가 바뀌면 다시 시작), worker, scheduler를 함께 띄운다                                       |
| `uv run poe check`                  | 완료 기준. 모든 검사를 차례로 돈다                                                                                           |
| `uv run poe fix`                    | 포맷과 린트 자동 수정                                                                                                        |
| `uv run poe test`                   | 테스트(`src`와 `tools`의 `tests/`, E2E 제외)                                                                                 |
| `uv run poe test:e2e`               | api, worker, scheduler를 따로 띄우고 `tests/e2e`를 돌린 뒤 내린다                                                            |
| `uv run poe gen`                    | 앱을 띄우지 않고 `openapi.json`을 다시 쓴다                                                                                  |
| `uv run poe db:migrate`             | 개발 DB에 마이그레이션을 적용한다                                                                                            |
| `uv run poe db:revision "<메시지>"` | 모델과 개발 DB를 비교해 마이그레이션 초안을 만든다                                                                           |
| `uv run poe db:reset`               | 로컬 개발 DB를 지우고 다시 만든 뒤 마이그레이션과 시드를 한다                                                                |

- `setup`은 여러 번 돌려도 안전하다. Docker가 켜져 있어야 한다. git hook은 이 폴더가 git 저장소의 최상위일 때만 건다.
- `.env`가 있으면 적힌 값은 그대로 두고, 설정에 새로 생긴 키만 `.env.example`의 값으로 더한다. 설정 오류로 멈추면 `uv run poe setup`을 다시 돌린다.
- 테스트가 "인프라가 꺼져 있다"로 멈추면 `uv run poe setup`을 돌린다.
- `dev`는 출력 앞에 프로세스 이름을 붙이고, 하나가 끝나거나 Ctrl+C를 누르면 모두 내린다.
- `test:e2e`는 개발 인프라에 DB `app_e2e`, Valkey DB 14, api 포트 18000으로 띄운다. 실패하면 프로세스 출력(`.cache/e2e/processes.log`)의 끝부분을 보여 준다.

## 완료 기준

- 작업을 끝내기 전에 `uv run poe check`를 통과시킨다. 통과하면 `check 통과: 9단계, <초>s` 한 줄이다.
- 단계는 `format`, `lint`, `type`(basedpyright strict), `architecture`(import-linter와 모듈 경계), `harness`(파일 크기, 억제 주석, 메일 템플릿, 지침 파일, `.env.example`), `generated`(`openapi.json`이 코드와 같은지), `contract`(계약 룰셋), `skills`(FastAPI skill 사본), `test` 순서다.
- 실패하면 그 단계의 출력과 `check 실패: <단계> — <고치는 방법>`만 보여 준다. 직접 만든 검사는 `파일:줄 규칙 — 고치는 방법` 한 줄씩 알린다. 고치는 방법대로 고친다.
- 입력 파일이 마지막 성공 때와 같은 단계는 건너뛴다(`.cache/check/`). `check --fast`는 Stop hook이 쓰는 빠른 경로로, 바뀐 모듈의 테스트만 돌린다.

## 구조

- `src/app/main.py`: 앱 조립(`create_app`). 시작할 때 연결 자원을 `app.state`에 둔다.
- `src/app/health.py`: 헬스체크 `/health/live`, `/health/ready`(DB, Valkey, 스토리지). JSON:API가 아니라 `application/json`이다.
- `src/app/worker.py`, `src/app/scheduler.py`: Taskiq broker(Valkey 스트림, 재시도)와 scheduler(주기 작업, 지연 재시도). scheduler는 반드시 하나만 띄운다.
- `src/app/seed.py`: 개발용 시드. 여러 번 돌려도 안전하게 쓴다.
- `src/app/core/`: 도메인을 모르는 기반(설정, 로그, DB, Valkey, 스토리지, `jsonapi/` 공통 계층). [src/app/core/AGENTS.md](src/app/core/AGENTS.md)
- `src/app/modules/`: 도메인 모듈. `auth`(가입, 이메일 인증, 세션, 비밀번호), `users`(내 정보, 탈퇴, 사용자 관리), `roles`(역할, 권한), `audit_logs`(감사 로그 읽기), `files`(업로드, 완료 확인, 다운로드 URL, 읽기 규칙), `posts`(골든 모듈: 글 목록·조회·쓰기, 전이 표, 권한 매트릭스 테스트). [src/app/modules/AGENTS.md](src/app/modules/AGENTS.md)
- `migrations/`: Alembic 마이그레이션. [migrations/AGENTS.md](migrations/AGENTS.md)
- `tools/`: 하네스 도구(명령, check, 검사, hook, 인프라, 프로세스). [tools/AGENTS.md](tools/AGENTS.md)
- `conftest.py`: 테스트 공용 fixture(`settings`, `infra`, `db`, `redis`, `storage`). `tests/e2e/`: E2E 테스트.
- `compose.yaml`: 개발 인프라(PostgreSQL, Valkey, SeaweedFS, Mailpit, 모의 OAuth). 포트는 127.0.0.1에만 열고, 호스트 포트는 기본 포트에 20000을 더한 번호다(PostgreSQL 25432, Valkey 26379, SeaweedFS 28333, Mailpit SMTP 21025·웹 28025, 모의 OAuth 28080). `app` 프로필은 이미지로 migrate, api(8000), worker, scheduler를 띄운다.
- `Dockerfile`: 운영 이미지. 명령만 바꿔 api(기본), worker, scheduler, migrate로 띄운다.
- `.claude/settings.json`: Claude Code의 hook과 권한. `.claude/skills/fastapi/`, `.agents/skills/fastapi/`: FastAPI 공식 skill 사본.
- `lefthook.yml`, `.betterleaks.toml`: git hook과 비밀 스캔 설정.
- `openapi.json`: 앱이 내보낸 OpenAPI 문서. `api-style/lint.mjs`: 저장소가 넣는 API 스타일 룰셋 번들의 사본.
- `docs/`: [architecture.md](docs/architecture.md)(계층, 요청 흐름, 프로세스, JSON:API 쓰는 법), [stack.md](docs/stack.md)(버전과 문서), `recipes/`(작업 절차).

## 규칙

### 계층과 경계

- 모듈 안의 방향은 `router → service → repository → models` 하나다. `schemas`는 router와 service가, `policies`와 `events`는 service가 쓴다.
- `app.core`는 `app.modules`를 import하지 않는다.
- 다른 모듈은 `app.modules.<이름>` 패키지만 import한다. 필요한 이름은 그 모듈의 `__init__.py`가 내보낸다.

### JSON:API

- `/api/v1` 아래 응답은 JSON:API 문서다. 에러는 `ApiError(상태, ErrorCode.<코드>, 영어 detail)`로 던지고, 에러 코드는 `ErrorCode`(계약의 목록)만 쓴다.
- 문서 모델은 제네릭(`Document[...]`)을 라우트에 직접 쓰지 않고 계약과 같은 이름의 서브클래스를 쓴다. 선택 필드는 `Omittable[T] = MISSING`이다.
- 라우트는 `JsonApiRouter.route(메서드, 경로, 선언, response_model=...)`로 만든다. 선언(`Operation`, 컬렉션은 `CollectionOperation`)이 operationId, 에러 응답, 쿼리 허용 목록(include, fields, sort, filter)을 함께 정한다. 쿼리는 `Depends(선언)`으로 받고, 응답은 `render()`로, 페이지는 `pagination()`으로, 포함 리소스는 `load_included()`로 만든다.
- POST 선언에는 `CREATE_ERRORS`(403, 409), PATCH 선언에는 `CONFLICT`(409)를 넣는다(JSON:API 1.1). PATCH 핸들러는 `require_matching_id()`로 본문의 id가 경로의 리소스와 같은지 본다.

### 생성물

- 직접 고치지 않는다: `openapi.json`(`uv run poe gen`), `uv.lock`(`uv add`, `uv lock`), `api-style/lint.mjs`(저장소의 `pnpm sync`), FastAPI skill 사본(`uv run poe setup`).
- 라우트나 문서 모델을 바꾸면 `uv run poe gen`을 돌린다.

### 억제 주석

- `# noqa: <코드>`와 `# pyright: ignore[<규칙>]`만 쓰고, 같은 줄에 이어서 `# 사유: <이유>`를 단다.
- `# type: ignore`와 파일 전체를 끄는 주석(`# ruff: noqa`, `# pyright: basic` 등)은 쓰지 않는다.

### 테스트

- 테스트는 대상 코드 옆의 `tests/`에 둔다: `src/app/tests/`(앱 조립), `src/app/core/tests/`, `src/app/modules/<이름>/tests/`, `tools/tests/`.
- 자기 인프라(DB, Valkey, 스토리지, 메일)를 모킹하지 않는다. 테스트 DB는 `app_test`, Valkey는 DB 15다. DB는 `db` fixture(테스트마다 롤백), Valkey는 `redis` fixture(테스트마다 비움), 스토리지는 `storage` fixture(테스트마다 다른 키 prefix, 끝나면 지움)로 쓴다.
- 잡은 `create_broker(settings, in_memory=True)`로 그 자리에서 돌린다.
- 모듈 API는 `api`(httpx 클라이언트)와 `accounts`(`app.tests.accounts.Accounts`)로 테스트한다. 계정은 `await accounts.create(permissions={"users:read"})`, 로그인 헤더는 `await accounts.sign_in(user)`로 만든다. 메일은 `mailbox`(Mailpit)로 읽는다.
- 가짜 비밀 값을 써야 하면 그 줄 끝에 `betterleaks:allow` 주석을 단다.

### 설정과 DB

- 설정은 `app.core.config.Settings` 하나다. 필드를 더하거나 빼면 `.env.example`도 같이 고친다.
- 커밋된 마이그레이션(`migrations/versions/`)은 고치거나 지우지 않는다. 바꿀 것이 있으면 새 리비전을 만든다.
- Windows 기본 이벤트 루프에서는 psycopg 비동기 모드가 돌지 않는다. api는 `--loop asyncio:SelectorEventLoop`으로, worker는 `python -m app.worker`로 띄운다(`dev`와 `test:e2e`가 이렇게 한다).

### 파일과 언어

- 파일은 소스 400줄, 테스트 600줄 이하다(생성물 제외).
- 메일 템플릿은 `src/app/modules/<이름>/templates/<ko|en>/<메일>.subject.txt`, `.txt`, `.html`이고 로케일마다 세 파일을 모두 둔다.
- 모든 `AGENTS.md` 옆에 `@AGENTS.md` 한 줄짜리 `CLAUDE.md`를 둔다.
- 로그는 `structlog.get_logger(__name__)`로 쓰고, 이벤트 이름은 영어 snake_case다. 요청의 trace id는 자동으로 붙는다.
- 문서, 주석, 도구 메시지는 한국어로, 식별자는 영어로 쓴다.

### 하네스

- Claude Code hook: `.py`를 고치면 그 파일만 포맷하고 자동 수정한 뒤 남은 린트 오류를 알린다. 끝낼 때 `check --fast`가 실패하면 끝나지 않는다. 강제 푸시, `--no-verify`와 git hook 끄기(`LEFTHOOK=0`, `core.hooksPath`), 이 PC가 아닌 DB를 가리키는 명령(주소, `psql -h`), 커밋된 마이그레이션을 지우거나 고치는 것, 셸로 `.env`를 읽는 것은 막힌다. `bash -c "..."`처럼 감싼 명령도 같은 규칙으로 본다. `.env` 읽기 검사는 명령의 단어만 보는 최선의 검사라, 파일을 스스로 여는 프로그램(`cp`, `python -c "open('.env')"`)은 잡지 못한다. 세션을 시작하면 인프라, 마이그레이션, `openapi.json` 상태를 알린다.
- Claude Code 권한은 생성물의 수정과 `.env`, `.env.local` 읽기를 막는다(설정의 예시는 `.env.example`).
- git hook(`lefthook.yml`): 커밋 전에는 스테이징한 `.py`의 포맷(고친 결과를 다시 스테이징)과 린트, 비밀 스캔(Betterleaks)을, 푸시 전에는 `uv run poe check`를 돈다.
