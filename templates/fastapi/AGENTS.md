# FastAPI 템플릿

JSON:API 규약을 따르는 FastAPI 백엔드다. Python 3.14와 uv를 쓰고, 명령은 `uv run poe <명령>`으로 부른다. 인프라는 Docker compose로 띄운다.

## 명령

| 명령                                | 하는 일                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `uv run poe setup`                  | `.env`, 인프라(compose), 버킷, DB(개발·테스트·E2E), 마이그레이션, 시드를 준비한다 |
| `uv run poe check`                  | 완료 기준. 포맷, 린트, 타입, 아키텍처, 하네스 검사, 테스트를 차례로 돌린다        |
| `uv run poe fix`                    | 포맷과 린트 자동 수정                                                             |
| `uv run poe test`                   | 테스트(`src`와 `tools`의 `tests/`, E2E 제외)                                      |
| `uv run poe db:migrate`             | 개발 DB에 마이그레이션을 적용한다                                                 |
| `uv run poe db:revision "<메시지>"` | 모델과 개발 DB를 비교해 마이그레이션 초안을 만든다                                |
| `uv run poe db:reset`               | 로컬 개발 DB를 지우고 다시 만든 뒤 마이그레이션과 시드를 한다                     |

- `setup`은 여러 번 돌려도 안전하다. Docker가 켜져 있어야 한다.
- `check`는 성공하면 한 줄, 실패하면 실패한 단계의 출력과 `check 실패: <단계>`만 보여 준다. 입력 파일이 마지막 성공 때와 같은 단계는 건너뛴다(`.cache/check/`).
- 직접 만든 검사는 `파일:줄 규칙 — 고치는 방법` 한 줄씩 알린다. 고치는 방법대로 고친다.
- `check --fast`는 Stop hook이 쓰는 빠른 경로다. 바뀐 모듈의 테스트만 돌린다.
- 테스트가 "인프라가 꺼져 있다"로 멈추면 `uv run poe setup`을 돌린다.
- `dev`, `test:e2e`, `gen`은 선언만 있다. 부르면 구현할 계획 태스크를 알리고 실패한다.

## 구조

- `src/app/main.py`: 앱 조립(`create_app`). `uvicorn app.main:app`으로 띄운다.
- `src/app/core/`: 도메인을 모르는 기반. 설정(`config.py`의 `Settings` 하나), 로그(`logging.py`), DB(`db.py`), Valkey(`redis.py`), 스토리지(`storage.py`).
- `src/app/core/jsonapi/`: JSON:API 공통 계층. 문서 모델(`models.py`), 에러(`errors.py`), 협상(`negotiation.py`), OpenAPI 후처리(`openapi.py`), 라우트 선언(`operation.py`), 쿼리 파서(`query.py`), 렌더링(`rendering.py`). 쓰는 예는 테스트 전용 샘플 `jsonapi/tests/sample.py`.
- `src/app/modules/`: 도메인 모듈. `posts`는 골든 모듈 자리다.
- `src/app/seed.py`: 개발용 시드. 여러 번 돌려도 안전하게 쓴다.
- `migrations/`: Alembic 마이그레이션. 절차는 `docs/recipes/migration.md`.
- `conftest.py`: 테스트 공용 fixture(`settings`, `infra`, `db`, `redis`).
- `compose.yaml`: 개발 인프라(PostgreSQL, Valkey, SeaweedFS, Mailpit, 모의 OAuth). 포트는 127.0.0.1에만 열고, 호스트 포트는 기본 포트에 20000을 더한 번호다(PostgreSQL 25432, Valkey 26379, SeaweedFS 28333, Mailpit SMTP 21025·웹 28025, 모의 OAuth 28080).
- `tools/`: 하네스 도구. `cli.py`가 poe 명령의 입구이고, `infra.py`가 인프라 준비, `check/`가 check 실행기, `checks/`에 검사가 있다.
- `api-style/lint.mjs`: 저장소가 넣는 API 스타일 룰셋 번들의 사본이다.
- `docs/recipes/`: 작업 절차.

## 규칙

- 모듈 안의 계층은 `router → service → repository → models` 한 방향이다. `schemas`는 router와 service가, `policies`와 `events`는 service가 쓴다.
- `app.core`는 `app.modules`를 import하지 않는다.
- 다른 모듈은 `app.modules.<이름>` 패키지만 import한다. 필요한 이름은 그 모듈의 `__init__.py`가 내보낸다.
- 억제 주석은 `# noqa: <코드>`와 `# pyright: ignore[<규칙>]`만 쓰고, 같은 줄에 이어서 `# 사유: <이유>`를 단다. `# type: ignore`와 파일 전체를 끄는 주석은 쓰지 않는다.
- 파일은 소스 400줄, 테스트 600줄 이하다(생성물 제외).
- 메일 템플릿은 `src/app/modules/<이름>/templates/<ko|en>/<메일>.subject.txt`, `.txt`, `.html`이고 로케일마다 세 파일을 모두 둔다.
- 모든 `AGENTS.md` 옆에 `@AGENTS.md` 한 줄짜리 `CLAUDE.md`를 둔다.
- `/api/v1` 아래 응답은 JSON:API 문서다. 에러는 `ApiError(상태, ErrorCode.<코드>, 영어 detail)`로 던지고, 에러 코드는 `ErrorCode`(계약의 목록)만 쓴다.
- 문서 모델은 제네릭(`Document[...]`)을 라우트에 직접 쓰지 않고 계약과 같은 이름의 서브클래스를 쓴다. 선택 필드는 `Omittable[T] = MISSING`이다.
- 라우트는 `JsonApiRouter.route(메서드, 경로, 선언, response_model=...)`로 만든다. 선언(`Operation`, 컬렉션은 `CollectionOperation`)이 operationId, 에러 응답, 쿼리 허용 목록(include, fields, sort, filter)을 함께 정한다. 쿼리는 `Depends(선언)`으로 받고, 응답은 `render()`로, 페이지는 `pagination()`으로, 포함 리소스는 `load_included()`로 만든다.
- 로그는 `structlog.get_logger(__name__)`로 쓰고, 이벤트 이름은 영어 snake_case다. 요청의 trace id는 자동으로 붙는다.
- 설정 필드를 더하거나 빼면 `.env.example`도 같이 고친다.
- 커밋된 마이그레이션(`migrations/versions/`)은 고치거나 지우지 않는다. 바꿀 것이 있으면 새 리비전을 만든다.
- 테스트는 대상 코드 옆의 `tests/`에 둔다: `src/app/tests/`(앱 조립), `src/app/core/tests/`, `src/app/modules/<이름>/tests/`, `tools/tests/`.
- 테스트는 자기 인프라(DB, Valkey, 스토리지, 메일)를 모킹하지 않는다. 테스트 DB는 `app_test`, Valkey는 DB 15다. DB는 `db` fixture(테스트마다 롤백), Valkey는 `redis` fixture(테스트마다 비움)로 쓴다.
- 생성물은 직접 고치지 않는다: `uv.lock`(`uv add`, `uv lock`), `api-style/lint.mjs`(저장소의 `pnpm sync`).
- 문서, 주석, 도구 메시지는 한국어로, 식별자는 영어로 쓴다.
- 작업을 끝내기 전에 `uv run poe check`를 통과시킨다.
