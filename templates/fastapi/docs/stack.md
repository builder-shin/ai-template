# 스택과 버전

이 템플릿이 쓰는 버전과 그 문서다. 라이브러리의 API는 기억에 의존하지 말고 여기 적힌 버전의 문서를 확인한다. 버전은 `pyproject.toml`과 `uv.lock`(파이썬 패키지), `compose.yaml`과 `Dockerfile`(이미지), `tools/binaries.py`와 `tools/cli.py`(바이너리)가 정한다. `tools/tests/test_stack_doc.py`가 이 표와 실제 버전을 맞춰 본다.

FastAPI의 공식 skill은 `.claude/skills/fastapi/SKILL.md`에 있다. FastAPI 코드를 쓰기 전에 읽는다.

## 런타임

| 이름                | 버전    | 쓰는 곳                                   | 문서                                                                              |
| ------------------- | ------- | ----------------------------------------- | --------------------------------------------------------------------------------- |
| `Python`            | 3.14    | 언어. uv가 `.python-version`대로 설치한다 | https://docs.python.org/3.14/                                                     |
| `fastapi`           | 0.141.1 | 웹 프레임워크                             | https://fastapi.tiangolo.com/ (변경: https://fastapi.tiangolo.com/release-notes/) |
| `starlette`         | 1.7.0   | FastAPI의 ASGI 기반(미들웨어, 응답)       | https://starlette.dev/                                                            |
| `uvicorn`           | 0.54.0  | ASGI 서버(api 프로세스)                   | https://uvicorn.dev/                                                              |
| `pydantic`          | 2.13.5  | 문서 모델과 검증                          | https://docs.pydantic.dev/2.13/                                                   |
| `pydantic-settings` | 2.15.0  | 설정(`app.core.config.Settings`)          | https://docs.pydantic.dev/latest/concepts/pydantic_settings/                      |
| `sqlalchemy`        | 2.0.54  | ORM과 비동기 엔진                         | https://docs.sqlalchemy.org/en/20/                                                |
| `psycopg`           | 3.3.6   | PostgreSQL 드라이버(동기·비동기)          | https://www.psycopg.org/psycopg3/docs/                                            |
| `alembic`           | 1.20.0  | 마이그레이션                              | https://alembic.sqlalchemy.org/en/latest/                                         |
| `redis`             | 8.1.0   | Valkey 클라이언트(redis-py)               | https://redis.readthedocs.io/en/v8.1.0/                                           |
| `structlog`         | 26.1.0  | 로그                                      | https://www.structlog.org/en/26.1.0/                                              |
| `taskiq`            | 0.12.6  | 잡(broker, worker, scheduler, 재시도). extra `opentelemetry` | https://taskiq-python.github.io/                                                  |
| `taskiq-redis`      | 1.2.3   | Valkey 스트림 broker와 스케줄 소스        | https://github.com/taskiq-python/taskiq-redis                                     |
| `boto3`             | 1.43.93 | S3 호환 스토리지 클라이언트               | https://boto3.amazonaws.com/v1/documentation/api/1.43.93/index.html               |
| `aiosmtplib` | 5.1.3 | 메일 발송(SMTP, `app.core.mail`) | https://aiosmtplib.readthedocs.io/en/stable/ |
| `email-validator` | 2.3.0 | 이메일 형식 검사(Pydantic `EmailStr`) | https://github.com/JoshData/python-email-validator |
| `jinja2` | 3.1.6 | 메일 템플릿(`app.core.mail`) | https://jinja.palletsprojects.com/en/stable/ |
| `pwdlib` | 0.3.1 | 비밀번호 해시(Argon2id, `app.core.security`) | https://frankie567.github.io/pwdlib/ |
| `pyjwt` | 2.15.0 | access token(JWT, `app.core.security`) | https://pyjwt.readthedocs.io/en/2.15.0/ |
| `httpx` | 0.28.1 | HTTP 클라이언트(소셜 로그인 제공자 호출, 테스트의 `ASGITransport`) | https://www.python-httpx.org/ |
| `httpx-oauth` | 0.17.0 | 소셜 로그인의 인가 URL과 코드 교환(`auth/providers`) | https://frankie567.github.io/httpx-oauth/ |
| `opentelemetry-api` | 1.45.0 | 트레이스 API(`app.core.telemetry`, Socket.IO 수동 span) | https://opentelemetry-python.readthedocs.io/en/stable/ |
| `opentelemetry-sdk` | 1.45.0 | tracer provider와 span 내보내기 | https://opentelemetry-python.readthedocs.io/en/stable/sdk/ |
| `opentelemetry-exporter-otlp-proto-http` | 1.45.0 | OTLP(HTTP)로 내보내기 | https://opentelemetry-python.readthedocs.io/en/stable/exporter/otlp/otlp.html |
| `opentelemetry-instrumentation-fastapi` | 0.66b0 | 요청 span | https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/fastapi/fastapi.html |
| `opentelemetry-instrumentation-sqlalchemy` | 0.66b0 | SQLAlchemy 쿼리 span(엔진마다) | https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/sqlalchemy/sqlalchemy.html |
| `opentelemetry-instrumentation-psycopg` | 0.66b0 | psycopg 쿼리 span | https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/psycopg/psycopg.html |
| `opentelemetry-instrumentation-redis` | 0.66b0 | Valkey 명령 span | https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/redis/redis.html |
| `opentelemetry-instrumentation-httpx` | 0.66b0 | httpx 요청 span(소셜 로그인 제공자) | https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/httpx/httpx.html |
| `python-socketio` | 5.17.0 | 실시간 서버와 발행기(`app.core.realtime`). 타입 스텁은 `typings/socketio/` | https://python-socketio.readthedocs.io/en/stable/ |

## 개발 도구

| 이름                    | 버전    | 쓰는 곳                              | 문서                                           |
| ----------------------- | ------- | ------------------------------------ | ---------------------------------------------- |
| `poethepoet`            | 0.48.0  | 명령(`uv run poe <명령>`)            | https://poethepoet.natn.io/                    |
| `ruff`                  | 0.16.9  | 포맷과 린트                          | https://docs.astral.sh/ruff/                   |
| `basedpyright`          | 1.40.1  | 타입 검사(strict)                    | https://docs.basedpyright.com/                 |
| `import-linter`         | 2.15    | 아키텍처 계약(`[tool.importlinter]`) | https://import-linter.readthedocs.io/en/v2.15/ |
| `pytest`                | 9.1.1   | 테스트                               | https://docs.pytest.org/en/stable/             |
| `anyio`                 | 4.15.1  | 비동기 테스트(pytest 플러그인)       | https://anyio.readthedocs.io/en/stable/        |
| `lefthook`              | 2.1.14  | git hook(`lefthook.yml`)             | https://lefthook.dev/                          |
| `nodejs-wheel-binaries` | 24.19.0 | 계약 린트를 돌리는 Node              | https://github.com/njzjz/nodejs-wheel          |
| `types-boto3-lite`      | 1.43.93 | boto3의 S3 타입                      | https://youtype.github.io/types_boto3_docs/    |
| `aiohttp` | 3.14.3 | 테스트의 Socket.IO 클라이언트(`app.tests.sockets`) | https://docs.aiohttp.org/en/v3.14.3/ |

## 이미지와 바이너리

| 이름                                | 버전               | 쓰는 곳                          | 문서                                                 |
| ----------------------------------- | ------------------ | -------------------------------- | ---------------------------------------------------- |
| `postgres`                          | 18.6-alpine        | DB(compose)                      | https://www.postgresql.org/docs/18/                  |
| `valkey/valkey`                     | 9.1.2              | Redis 호환 저장소(compose)       | https://valkey.io/docs/                              |
| `chrislusf/seaweedfs`               | 4.47               | S3 호환 스토리지(`weed mini`)    | https://github.com/seaweedfs/seaweedfs/wiki          |
| `axllent/mailpit`                   | v1.31.2            | 메일 받기와 조회(compose)        | https://mailpit.axllent.org/docs/                    |
| `ghcr.io/navikt/mock-oauth2-server` | 6.0.3              | 모의 OAuth 서버(compose)         | https://github.com/navikt/mock-oauth2-server         |
| `grafana/otel-lgtm`                 | 0.34.0             | 관측성(`observability` 프로필)   | https://github.com/grafana/docker-otel-lgtm          |
| `python`                            | 3.14.7-slim-trixie | 운영 이미지의 기반(`Dockerfile`) | https://hub.docker.com/_/python                      |
| `ghcr.io/astral-sh/uv`              | 0.12.19            | 운영 이미지 빌드(`Dockerfile`)   | https://docs.astral.sh/uv/guides/integration/docker/ |
| `uv`                                | 0.12               | 가상환경, 의존성, 실행           | https://docs.astral.sh/uv/                           |
| `betterleaks`                       | 1.8.1              | 비밀 스캔(`tools/binaries.py`)   | https://github.com/betterleaks/betterleaks           |
| `library-skills`                    | 0.0.19             | FastAPI skill 복사(`uvx`)        | https://github.com/tiangolo/library-skills           |

## 규약과 도구 문서

- JSON:API 1.1: https://jsonapi.org/format/1.1/
- Claude Code hook: https://code.claude.com/docs/en/hooks
- Claude Code 권한: https://code.claude.com/docs/en/permissions
