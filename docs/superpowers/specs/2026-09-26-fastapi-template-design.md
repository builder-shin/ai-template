# FastAPI 템플릿 설계 (하위 프로젝트 1)

- 작성일: 2026-09-26
- 상태: 승인됨. 마일스톤 M1~M5 구현 완료(§1.2의 완료 조건 통과)
- 상위 문서: [기반 설계](2026-09-26-ai-template-foundation-design.md)
  - 이 문서는 기반 설계 §10에서 사이클 1로 미룬 결정을 내리고, `templates/fastapi`와 이번 사이클의 저장소 변경을 설계한다.
  - 기반 설계의 규칙은 그대로 따른다: 플랫폼 기능(§4), API 규약(§5), 하네스(§6), 인프라(§7). 이 문서는 그 규칙을 구현하는 방법과 계약 변경을 정한다.
  - 기반 설계와 달라진 것은 §7의 계약 변경뿐이다.
- 구현 계획: [M1](../plans/2026-09-26-fastapi-m1.md), [M2](../plans/2026-09-27-fastapi-m2.md), [M3](../plans/2026-09-28-fastapi-m3.md), [M4](../plans/2026-09-28-fastapi-m4.md), [M5](../plans/2026-09-29-fastapi-m5.md)
- 다음 단계: 이 사이클은 끝났다. §12.1의 "나중" 목록은 M5(보강, [보강 설계](2026-09-29-fastapi-hardening-design.md))에서 처리했다. 다음 하위 프로젝트는 기반 설계 §3.4의 2(Next.js web)다.

## 1. 목표와 범위

### 1.1 산출물

1. `templates/fastapi`: 기반 설계 §4의 플랫폼 기능과 §5.6의 엔드포인트 전체를 계약대로 구현하고 §6의 하네스를 적용한 독립 프로젝트
2. 계약 변경: §7의 목록
3. 적합성 스위트: 플랫폼 흐름 테스트, 부수 채널 어댑터(Mailpit, 모의 OAuth), 모든 응답의 계약 스키마 검증(§10)
4. 템플릿 저장소 변경: 룰셋 보강과 번들, 공유 자산, `verify-templates`의 uv 지원, 파일 탐색 방식, CI(§11)

### 1.2 완료 조건

- FastAPI 대상 적합성 스위트 전체가 통과한다.
- 템플릿 폴더에서 `uv run poe check`와 `uv run poe test:e2e`가 통과한다.
- 템플릿이 내보낸 `openapi.json`이 계약과의 구조 비교를 통과한다.
  - 계약의 스키마 이름이 모두 있다.
  - operation 집합이 같다.
  - oasdiff가 찾은 breaking change가 없다.
- 저장소 루트의 `pnpm check`(verify-templates 포함)와 CI가 통과한다.

### 1.3 범위 밖

기반 설계 §4.11에 더해 다음은 이번 사이클에서 다루지 않는다.

- 소셜 계정의 수동 연결과 해제
- 이메일 없는 계정에 나중에 이메일을 추가하는 흐름
- 공개 버킷과 CDN
- 테스트 병렬 실행

## 2. 결정 기록

| #   | 주제                | 결정                                                                                                                                                           | 이유                                                                                                                                                                             |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | 진행 단위           | 스펙 하나, 구현 계획은 마일스톤(§12)마다 하나                                                                                                                  | 설계 결정이 서로 얽혀 있어 한 문서로 정한다. 구현은 나눠야 계획이 다룰 만한 크기가 된다                                                                                          |
| F2  | 역할 부여           | 권한 상승 금지(§6.3)                                                                                                                                           | `users:manage`나 `roles:manage`를 가진 사람이 스스로 admin이 되는 것을 막는다                                                                                                    |
| F3  | 회원 탈퇴           | 즉시 익명화하고 글은 남긴다(§6.4)                                                                                                                              | 개인정보는 바로 지우고, 다른 사람이 보는 콘텐츠와 참조 무결성은 유지한다. 모듈마다 탈퇴 정리 훅을 둘 필요가 없다                                                                 |
| F4  | 소셜 계정 연결      | 제공자가 검증한 이메일만 같은 이메일의 기존 계정에 연결한다. 그 밖의 경우(네이버 전부, 카카오의 미검증 이메일, 이메일 미제공)는 이메일 없는 별도 계정을 만든다(§6.2) | 미검증 이메일을 계정에 저장하면 남의 이메일로 먼저 가입해 두는 선점 탈취가 가능하다. 충돌을 에러로 알리면 가입 여부가 드러난다                                                  |
| F5  | 명령 실행기         | poethepoet. `uv run poe <명령>`으로 부른다                                                                                                                     | uv에는 태스크 실행기가 없고, just와 Make는 `test:e2e` 같은 콜론 이름을 쓸 수 없다. poe는 `uv sync`로 설치된다. Windows에서 콜론 이름이 동작함을 확인했고, 태스크 목록을 `pyproject.toml`에서 기계가 읽을 수 있다 |
| F6  | 잡                  | Taskiq. scheduler는 인스턴스 하나만 띄운다                                                                                                                     | FastAPI 의존성 주입과 OpenTelemetry를 공식 지원한다. Taskiq는 scheduler 중복 실행을 막지 않으므로 compose와 배포 문서에서 단일 인스턴스로 고정한다                               |
| F7  | SQLAlchemy          | 2.0.54에 고정한다                                                                                                                                              | 2.1.0은 2026-09-24에 나와 이틀째이고, 다음 날 바로 패치가 나왔다. 다음 사이클을 시작할 때 다시 본다                                                                              |
| F8  | DB 드라이버         | psycopg 3(async)                                                                                                                                               | asyncpg는 10개월째 릴리스가 없고 유지보수 여력 문제가 열려 있다. psycopg는 Alembic의 동기 연결에도 같은 드라이버를 쓸 수 있다                                                    |
| F9  | 타입 검사기         | basedpyright strict. CI와 Stop hook에서 같은 것을 쓴다                                                                                                          | 안정판이고 PyPI만으로 설치된다(Node 휠을 의존성으로 가져온다). 검사기를 둘로 나누면 같은 코드에 서로 다른 진단이 나와 AI가 헷갈린다                                             |
| F10 | 로컬 S3             | SeaweedFS(`weed mini` 단일 컨테이너)                                                                                                                           | Apache-2.0이다. S3 API로 CORS를 설정하는 기능, presigned 요청, 체크섬 헤더 처리를 소스로 확인했다. RustFS는 1.0이 나온 지 열흘이고 Garage는 AGPL이다                             |
| F11 | Redis 이미지        | Valkey 9.1. 클라이언트는 redis-py                                                                                                                              | Redis 8은 AGPL·SSPL·RSAL 삼중 라이선스다. 템플릿 사용자에게 라이선스 부담을 넘기지 않는다                                                                                        |
| F12 | 모의 OAuth          | navikt/mock-oauth2-server 6.0.3 하나에 발급자 셋(google, kakao, naver)을 둔다                                                                                  | 가볍고, 다중 발급자, PKCE, 발급자별 클레임을 지원한다                                                                                                                            |
| F13 | OAuth 클라이언트    | httpx-oauth의 OAuth2 클라이언트(주소는 설정)로 인가 URL과 코드 교환을 한다. 세 제공자 모두 OIDC 인가(scope에 openid)와 PKCE(S256)를 쓴다 | 구글·카카오·네이버의 OIDC discovery가 모두 S256을 알린다(M4에서 확인, §14). 처음에는 카카오가 PKCE를 지원하지 않고 네이버 문서에 PKCE가 없다고 보아 구글에만 쓰려 했다. 제공자별 클라이언트는 주소를 바꿀 수 없고 프로필을 POST로 읽어 쓰지 않는다 |
| F14 | 업로드              | 계약대로 presigned PUT이다. `Content-Type`과 `Content-Length`를 서명에 넣는다                                                                                  | 선언한 크기와 정확히 같은 크기만 올라간다. 완료 확인의 HEAD 검사가 한 번 더 막으므로 계약을 바꿀 필요가 없다                                                                     |
| F15 | 파일 전달           | ready 파일은 모두 presigned GET(10분)으로 준다. `included`에 들어간 파일에도 `meta.downloadUrl`을 채운다                                                       | 공개 이미지도 같은 경로로 전달해 규칙을 하나로 둔다. 공개 버킷과 CDN은 운영 선택이라 전환 방법만 문서로 남긴다                                                                   |
| F16 | Node 기반 도구      | PyPI의 `nodejs-wheel-binaries`(Node 24)를 `python -m nodejs_wheel`로 실행하고(명령 셸이 없다), API 스타일 룰셋은 설정까지 담은 한 파일짜리 번들로 넣는다                                                                | 시스템 Node 없이 uv만으로 셋업한다. 번들이면 템플릿 안에서 npm을 설치할 필요가 없다                                                                                              |
| F17 | git hook과 비밀 스캔 | lefthook은 PyPI 휠로, Betterleaks는 버전과 SHA-256을 고정한 바이너리 설치기로 받는다                                                                          | lefthook은 공식 저장소가 PyPI에 휠을 올린다. Betterleaks는 바이너리로만 배포된다                                                                                                |
| F18 | 통합 테스트 격리    | 테스트마다 바깥 트랜잭션과 SAVEPOINT를 롤백하고, Valkey는 테스트 전용 DB 번호를 비운다. 처음에는 직렬로 돌린다                                                  | 가장 빠르고 결정적이다. 병렬화가 필요해지면 워커마다 DB와 Valkey 번호를 따로 붙인다                                                                                              |
| F19 | 응답 스키마 검증    | 적합성 스위트의 openapi-fetch 미들웨어가 모든 응답을 계약 스키마로 검증한다(Ajv, JSON Schema 2020-12)                                                          | 테스트를 쓸 때마다 검증을 잊지 않도록 클라이언트 층에서 강제한다                                                                                                                 |
| F20 | 페이지 링크         | 상대 경로(URI-reference)로 쓰고, 대괄호는 퍼센트 인코딩한다                                                                                                    | JSON:API 1.1이 허용하고, BFF 뒤에서 백엔드 호스트를 드러내지 않는다                                                                                                              |
| F21 | 감사 로그 값        | `action`과 `targetType`을 계약 enum으로 고정한다                                                                                                               | 두 백엔드와 admin이 같은 값을 쓰게 한다. 백엔드를 구현하기 전에 바꾸는 것이 가장 싸다                                                                                            |
| F22 | 실시간 구독 계약    | 구독 메시지와 ack 스키마, 루트 확장 `x-realtime-messages`를 계약에 넣는다                                                                                      | 서버가 보내는 이벤트뿐 아니라 클라이언트가 보내는 메시지도 기계가 읽을 수 있어야 두 백엔드가 똑같이 구현한다                                                                     |
| F23 | api-style 공유 자산 | 번들 파일(`lint.mjs`) 하나만 사본으로 넣는다. 규칙 설정은 빌드할 때 번들에 들어간다                                                                                                                        | 룰셋의 테스트, 픽스처, TS 설정은 템플릿에 필요 없고 저장소 밖을 참조한다                                                                                                         |
| F24 | 파일 탐색           | 지침 검사와 verify-templates는 `git ls-files --cached --others --exclude-standard`로 파일을 고른다                                                              | `.venv` 같은 무시된 큰 폴더를 걷지 않는다                                                                                                                                        |
| F25 | uv 명령 검사        | verify-templates는 runner가 `uv`인 템플릿의 명령 어휘를 `pyproject.toml`의 `[tool.poe.tasks]` 키로 검사한다                                                    | F5와 짝이 되는 결정이다                                                                                                                                                          |
| F26 | 레이트 리밋과 캐시  | redis-py로 직접 쓴다(고정 윈도 카운터, cache-aside)                                                                                                            | 관련 라이브러리는 낡았거나(slowapi, fastapi-cache2) 이 용도에 과하다. 코드가 짧아 AI가 읽고 고치기 쉽다                                                                          |
| F27 | `test:e2e`          | 실제 프로세스를 띄워 프로세스 경계를 넘는 흐름만 본다                                                                                                          | 계약 전체 검증은 적합성 스위트가 맡는다                                                                                                                                          |
| F28 | 로컬 인프라 포트    | 호스트 포트는 기본 포트에 20000을 더한 번호다(PostgreSQL 25432, Valkey 26379, SeaweedFS 28333, Mailpit 21025·28025, 모의 OAuth 28080). API는 계약의 서버 주소대로 8000이다 | 개발자 PC에 흔히 떠 있는 Postgres·Redis와 겹치지 않게 한다. 계획을 검증하던 PC에서는 다른 프로젝트가 기본 포트와 +10000 포트(6379, 15432)를 이미 쓰고 있었다 |

## 3. 스택

버전은 2026-09-26 기준이다. 모두 정확한 버전으로 고정하고, `uv.lock`을 커밋한다.

| 영역             | 선택                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 런타임과 실행기  | Python 3.14.7, uv 0.12, poethepoet 0.48                                                                                          |
| 웹               | FastAPI 0.141(`[standard]`), Pydantic 2.13, pydantic-settings 2.15, uvicorn                                                      |
| DB               | PostgreSQL 18, SQLAlchemy 2.0.54(async), psycopg 3.3, Alembic 1.20                                                               |
| 잡               | Taskiq 0.12, taskiq-redis, taskiq-fastapi                                                                                        |
| Redis            | Valkey 9.1 이미지, redis-py 8.1                                                                                                  |
| 실시간           | python-socketio 5.17                                                                                                             |
| 스토리지         | SeaweedFS 4.47(`chrislusf/seaweedfs`), boto3 1.43(스레드 풀에서 호출)                                                            |
| 메일             | aiosmtplib 5.1, Jinja2 3.1, Mailpit 1.31(`axllent/mailpit`)                                                                      |
| 소셜 로그인      | httpx-oauth 0.17, 모의 서버 `ghcr.io/navikt/mock-oauth2-server:6.0.3`                                                            |
| 보안             | pwdlib(Argon2id), PyJWT                                                                                                          |
| 품질             | Ruff 0.16, basedpyright 1.40, import-linter 2.15, pytest 9.1과 anyio 플러그인, httpx                                             |
| 관측성           | structlog 26.1, OpenTelemetry SDK 1.45와 계측 패키지 0.66b0(beta라 기본으로 꺼 둔다)                                             |
| 하네스 도구      | lefthook 2.1.14(PyPI 휠), Betterleaks 1.8.1(고정 바이너리), Node 24.19(`nodejs-wheel-binaries`)                                  |

- uvloop는 Windows 휠이 없어 기본으로 쓰지 않는다. `uvicorn[standard]`가 Linux 이미지에서만 설치되도록 표시해 두면 그대로 둔다.
- 관리 명령에 필요한 외부 프로그램은 uv와 Docker뿐이다.

## 4. 템플릿 구조

### 4.1 폴더

```
templates/fastapi/
├── AGENTS.md, CLAUDE.md, README.md, template.json
├── pyproject.toml, uv.lock, .python-version, .env.example, .gitignore
├── compose.yaml, Dockerfile, .dockerignore, lefthook.yml, .betterleaks.toml
├── .claude/          # settings.json, skills/(레시피 포장과 FastAPI 공식 skill). hook 본문은 tools/hooks/
├── api-style/        # 공유 자산 사본: 룰셋 번들과 설정(직접 수정 금지)
├── openapi.json      # gen 생성물(커밋)
├── docs/             # architecture.md, stack.md, recipes/*.md
├── migrations/       # Alembic. 폴더 AGENTS.md가 "커밋된 마이그레이션은 고치지 않는다"를 적는다
├── tools/            # 하네스 도구: check 실행기, 생성기, 바이너리 설치기, 각종 검사, dev 프로세스 관리자. 이미지에 넣지 않는다
└── src/app/
    ├── main.py       # FastAPI와 Socket.IO를 조립한 ASGI 앱
    ├── worker.py     # Taskiq broker와 worker 진입점
    ├── scheduler.py  # Taskiq scheduler 진입점
    ├── core/         # 도메인을 모르는 기반
    └── modules/      # 도메인 모듈
```

- `template.json`은 `{"name": "fastapi", "kind": "backend", "runner": "uv", "goldenModule": "src/app/modules/posts"}`이다.
- `core/`에는 설정, 로그, DB, Redis, 에러, `jsonapi/`, 보안(JWT·비밀번호), 권한 레지스트리, 실시간 서버와 발행기, 잡 broker, 메일 발송, 스토리지, 캐시, 레이트 리밋, 텔레메트리가 들어간다.
- 모듈은 `auth`, `users`, `roles`, `files`, `audit_logs`, `realtime`, `posts`다.

### 4.2 모듈 구조

```
src/app/modules/posts/
├── __init__.py    # 공개 인터페이스. 다른 모듈은 여기서만 import한다
├── router.py      # 라우트, 권한 선언, 쿼리 허용 목록, 문서 조립
├── schemas.py     # JSON:API 문서 모델(계약과 같은 이름)
├── service.py     # 유스케이스, 트랜잭션 경계, 이벤트 발행, 감사 기록
├── repository.py  # DB 접근
├── models.py      # SQLAlchemy 모델
├── policies.py    # 소유권 등 권한 판정(순수 함수)
├── events.py      # 이 모듈의 실시간 이벤트 정의와 페이로드
├── jobs.py        # 이 모듈의 잡
├── templates/     # 이 모듈이 보내는 메일 템플릿(로케일별). 메일이 없는 모듈에는 없다
└── tests/         # 이 모듈의 단위·통합 테스트
```

- 쓰지 않는 파일은 만들지 않는다. 골든 모듈 `posts`는 모듈의 계층(router부터 models까지), policies, permissions, 테스트를 모두 갖춘 정답 예시다. 잡(`jobs.py`)의 예는 files와 auth에, 메일 템플릿(`templates/`)의 예는 auth에 있고, 실시간 이벤트(`events.py`)는 M4에서 더한다.
- 모듈 등록은 `src/app/modules/registry.py` 한 곳에서 한다. 라우터, 이벤트, 잡, 파일 참조 판정기(§6.5)를 여기서 모은다.

### 4.3 계층과 경계

`check`가 강제한다.

- 모듈 안의 방향은 `router → service → repository → models`다. `schemas`는 router와 service가, `policies`와 `events`는 service가 쓴다.
- 다른 모듈은 공개 인터페이스(`app.modules.users`)만 import한다. 내부 파일(`app.modules.users.repository` 등)은 import하지 않는다. 모듈 사이 순환 import도 금지한다.
- `app.core`는 `app.modules`를 import하지 않는다.
- 계층 방향과 core 금지는 import-linter(layers, forbidden 계약)로 검사한다.
- import-linter로 표현하기 어려운 규칙(다른 모듈은 공개 인터페이스만 import)은 `tools/`의 AST 검사로 막는다. 순환 import는 basedpyright의 `reportImportCycles`가 막는다.
- 어느 쪽이든 실패 메시지는 "대신 이렇게 하라" 형식이다.

### 4.4 프로세스

이미지 하나를 명령만 바꿔 띄운다.

| 프로세스  | 명령                                           | 비고                                                            |
| --------- | ---------------------------------------------- | --------------------------------------------------------------- |
| api       | `uvicorn app.main:app`                         | FastAPI 앱을 Socket.IO ASGI 앱이 감싼다                         |
| worker    | `taskiq worker app.worker:create_broker`       | 여러 개 띄울 수 있다                                            |
| scheduler | `taskiq scheduler app.scheduler:create_scheduler` | 반드시 하나만 띄운다(F6)                                     |
| migrate   | 마이그레이션과 시드를 실행하고 끝난다          | 배포 단계의 별도 명령. compose `app` 프로필에서는 api보다 먼저 돈다 |

- `dev`는 api, worker, scheduler를 함께 띄우고 api만 리로드한다. `tools/`의 작은 프로세스 관리자가 세 프로세스의 출력 앞에 이름을 붙이고, 하나가 죽으면 모두 내린다.
- worker와 scheduler의 진입점은 부를 때 설정을 읽는 팩토리 함수다. 그래서 두 모듈은 `.env` 없이 import된다.
- Windows에서 `taskiq worker`는 잡을 기본 루프(Proactor)에서 돌려 psycopg 비동기 모드가 동작하지 않는다. 그래서 `dev`와 `test:e2e`는 worker를 `python -m app.worker`(셀렉터 루프, 한 프로세스)로 띄운다. 운영 이미지는 `taskiq worker`다.
- compose의 기본 프로필은 인프라만 띄운다: PostgreSQL, Valkey, SeaweedFS, Mailpit, 모의 OAuth 서버. LGTM은 `observability` 프로필이다.
- 인프라는 `127.0.0.1`에만, 기본 포트에 20000을 더한 호스트 포트로 연다(F28).
- `app` 프로필은 migrate, api, worker, scheduler를 이미지로 띄운다. 적합성 스위트와 배포 확인에 쓴다.

## 5. JSON:API 공통 계층과 OpenAPI

### 5.1 문서 모델과 스키마 이름

- `core/jsonapi/`에 제네릭 기반 모델을 둔다: 리소스, 단건 문서, 컬렉션 문서, 생성 문서, 수정 문서, 에러 문서.
- 리소스마다 계약과 똑같은 이름의 구체 클래스를 `schemas.py`에 둔다. 예: `PostAttributes`, `PostResource`, `PostDocument`, `PostCollectionDocument`, `PostCreateDocument`, `PostUpdateAttributes`.
- 제네릭 모델을 라우트에 직접 쓰지 않는다. `Document[PostResource]` 같은 이름이 스키마로 새지 않게 하기 위해서다.
- FastAPI는 입력용과 출력용 스키마를 나누지 않도록 설정한다(`separate_input_output_schemas=False`). `-Input`, `-Output` 접미사가 붙지 않는다.

### 5.2 협상과 에러

- JSON:API 1.1의 협상 규칙을 따른다. 확장(`ext`)은 지원하지 않고, `profile` 매개변수는 무시한다.
  - 415 `jsonapi.unsupported_media_type`: 본문이 있는 요청의 `Content-Type`이 JSON:API 미디어 타입이 아니거나, `profile` 밖의 매개변수가 붙어 있을 때
  - 406 `jsonapi.not_acceptable`: `Accept`에 JSON:API 미디어 타입이 있는데, 그 인스턴스 모두에 `profile` 밖의 매개변수가 붙어 있을 때
  - 413 `jsonapi.content_too_large`: 요청 본문이 1 MiB(1,048,576바이트)를 넘을 때. 협상(415·406) 다음, 본문 JSON 검사 앞이다. `Content-Length`가 넘으면 본문을 읽지 않고, 길이를 알리지 않은 본문은 읽으면서 센다(M5).
  - `Accept`가 없거나 JSON:API 미디어 타입을 담지 않으면(예: `*/*`) 통과한다.
- 응답은 `application/vnd.api+json` 전용 응답 클래스로 보낸다.
- 모든 예외는 `ErrorDocument`와 `meta.traceId`로 바꾼다.
  - 도메인 예외는 코드, 상태, 영어 detail, `source`, `meta.params`를 담는 예외 클래스 하나로 표현한다.
  - Pydantic 검증 오류는 필드마다 에러 객체를 만들어 422로 돌려준다. `source.pointer`(예: `/data/attributes/title`)를 채우고, 오류 종류를 `validation.required`, `validation.too_short` 등으로 바꾼다.
  - JSON이 아니거나 문서 구조가 틀리면 400 `jsonapi.invalid_document`다.
  - JSON:API 1.1이 반드시 쓰라는 상태를 따른다: 본문의 `type` 불일치는 409 `resource.conflict`, 생성 요청의 클라이언트가 만든 `id`는 403 `permission.denied`, 관계가 가리키는 리소스가 없으면 404 `resource.not_found`다. 요청 문서 전체를 가리키는 pointer는 `""`다.
  - 예상하지 못한 예외는 500 `internal.unexpected`다. 원인은 로그에만 남긴다.

### 5.3 쿼리 파라미터

- 엔드포인트마다 허용 목록을 선언한다: include 경로, sort 필드, filter 이름과 형식, fields 타입.
- 공통 의존성이 `include`, `sort`, `fields[type]`, `page[number]`, `page[size]`, `filter[...]`를 파싱한다. 목록에 없으면 해당 400 코드(`jsonapi.unsupported_include`, `jsonapi.unsupported_sort`, `jsonapi.invalid_query`)를 돌려준다.
- 같은 선언에서 OpenAPI 파라미터와 `x-jsonapi-include`, `x-jsonapi-sort` 확장을 만든다. 코드와 문서가 어긋날 수 없다.
- 관계로 거르는 필터(`filter[role]`, `filter[author]`, `filter[actor]`)는 관련 리소스의 id(uuid)를 받는다. 기간 필터(`filter[createdFrom]`, `filter[createdTo]`)는 시작을 포함하고 끝을 포함하지 않으며, 오프셋이 없는 시각은 400이다(`docs/conventions/jsonapi.md`).

### 5.4 직렬화

- 모듈은 `to_resource(모델, 보는 사람)`을 제공한다. 보는 사람에 따라 속성이 달라지는 규칙(§6.4의 공개 사용자)은 여기서 처리한다.
- sparse fieldset 적용과 include(복합 문서) 조립은 공통 계층이 한다.
  - include 경로마다 모듈이 로더를 등록한다.
  - 공통 계층이 요청된 경로의 리소스를 모아 `(type, id)`로 중복을 없애고, `included`에 넣는다.

### 5.5 페이지

- `page[number]`와 `page[size]`의 기본값은 1과 20, 최대 크기는 100이다.
- 응답의 `meta.page`에는 `number`, `size`, `total`, `totalPages`를 넣는다.
- `links.first/prev/next/last`는 요청 경로에서 만든 상대 경로다(F20). 대괄호를 퍼센트 인코딩하고, 원래 요청의 다른 쿼리 파라미터를 유지한다.
- id는 Python 3.14 표준 라이브러리의 `uuid.uuid7()`로 만든다.

### 5.6 OpenAPI 내보내기

- `gen`은 앱을 띄우지 않고 `openapi.json`을 내보낸다. `check`는 다시 내보낸 결과가 커밋된 파일과 같은지 확인하고, 룰셋 번들로 검사한다.
- operationId는 계약과 같게 만든다. 라우터마다 계약의 인터페이스 이름(`Posts`, `EmailVerificationRequests` 등)을 선언하고 `<인터페이스>_<operation>`으로 만든다. 태그에서 만들 수 없는 경우가 있다(예: `EmailVerificationRequests_create`의 태그는 `email-verifications`).
- `x-permission`은 라우트의 권한 선언에서 만든다. `x-realtime-channels`, `x-realtime-events`, `x-realtime-messages`는 실시간 레지스트리에서 만든다.
- 루트에 `x-generated: "직접 수정 금지. uv run poe gen으로 다시 만든다"`를 넣는다. JSON은 주석을 달 수 없기 때문이다.

## 6. 기능

기반 설계 §4의 요구를 구현하는 방법만 적는다.

### 6.1 인증과 세션

- access token은 JWT(HS256, 15분)이고 `sub`(사용자 id)와 `sid`(세션 id)를 담는다.
- 인증이 필요한 요청마다 서명을 검증하고, 세션이 살아 있는지(세션 행의 `revoked_at`)를 DB에서 확인한다.
  - 요청마다 사용자와 역할을 DB에서 읽으므로(§6.3) 같은 조회로 확인한다. Valkey에 폐기 목록을 따로 두지 않는다.
  - 그래서 로그아웃과 폐기가 access token 만료를 기다리지 않고 즉시 효과를 낸다.
- refresh token
  - 불투명 토큰(32바이트)이고, DB에는 SHA-256 해시만 저장한다.
  - 회전할 때마다 새 토큰을 30일짜리로 발급하고, 이전 토큰은 "사용됨"으로 남긴다. 세션의 `lastUsedAt`은 이때 갱신한다.
  - 사용된 토큰이 다시 들어오면 그 세션을 폐기하고 `auth.refresh_token_reused`를 돌려준다.
- 이메일 인증 토큰(24시간)과 비밀번호 재설정 토큰(1시간)은 해시로 저장하는 1회용 토큰이다. 잘못됐거나 만료됐으면 `auth.verification_token_invalid`다. 토큰은 메일 잡이 실행될 때 발급한다(§6.9).
- 세션을 폐기하면 그 사용자 룸에 `session.revoked`를 보내고, 그 세션으로 맺은 실시간 연결을 서버가 끊는다(§6.8). `meta.reason`은 다음과 같다.

| 사유                   | 경우                                                   |
| ---------------------- | ------------------------------------------------------ |
| `logout`               | 본인이 로그아웃했다                                    |
| `revoked`              | 다른 기기에서 이 세션을 지웠거나, 다른 기기·전체 로그아웃 |
| `password_reset`       | 비밀번호를 재설정했다                                  |
| `password_changed`     | 비밀번호를 바꿨다(현재 세션은 남는다)                  |
| `refresh_token_reused` | refresh token 재사용이 감지됐다                        |
| `account_deactivated`  | 관리자가 계정을 비활성화했다                           |
| `account_deleted`      | 탈퇴했다                                               |

- 비밀번호가 없는 계정(소셜 전용)은 `password` grant와 비밀번호 변경에서 `auth.invalid_credentials`를 받는다. 이메일이 없는 계정에는 재설정 메일을 보내지 않는다. 재설정 요청 자체는 계정 존재와 무관하게 늘 202다.
- 비밀번호를 바꾸면(`POST /password-changes`) 남은 재설정 토큰을 지운다. 비밀번호 변경에는 사용자별 엄격한 레이트 리밋이 있다(§6.10, M5).

### 6.2 소셜 로그인

- 제공자 인터페이스: 인가 URL 만들기, 코드 교환, 신원 조회(`subject`, `email`, `emailVerified`, `name`). 제공자마다 파일 하나로 구현하고 레지스트리에 등록한다.
- httpx-oauth의 OAuth2 클라이언트로 인가 URL을 만들고 코드를 교환한다. 신원은 설정의 프로필 주소를 GET으로 읽는다. 제공자의 주소(인가, 토큰, 프로필)는 설정이라, 개발과 테스트에서는 모의 OAuth 서버를 가리킨다.
- 제공자별 신원 판정

| 제공자 | 이메일 검증 판정                                     | PKCE |
| ------ | ---------------------------------------------------- | ---- |
| google | `email_verified`가 참이고 `gmail.com` 주소이거나 `hd`가 있음 | 쓴다 |
| kakao  | `kakao_account.is_email_valid`와 `is_email_verified`가 모두 참 | 쓴다 |
| naver  | 검증 플래그가 없으므로 항상 미검증                   | 쓴다(OIDC 경로 `/oauth2/authorize`, `/oauth2/token`) |

- `authorize`
  - `redirectUri`를 설정의 허용 목록으로 검사한다. 목록에 없으면 400 `jsonapi.invalid_query`(`source.parameter`: `redirectUri`)다.
  - BFF가 로그인 시도마다 만든 code verifier의 S256인 `codeChallenge`(base64url 43자)를 함께 받는다. 없거나 형식이 틀리면 400 `jsonapi.invalid_query`(`source.parameter`: `codeChallenge`)다.
  - state, 제공자와 주고받을 자신의 PKCE verifier, 받은 `codeChallenge`, `redirectUri`, 제공자를 Valkey에 10분 두고 제공자로 302 리다이렉트한다.
- `callback`
  - state가 없거나 만료됐거나 다른 제공자의 것이면 돌려보낼 곳을 모르므로 400 `jsonapi.invalid_query`(`source.parameter`: `state`)다. 제공자가 덧붙이는 쿼리 파라미터(scope 등)는 받아들인다.
  - 제공자가 `error=access_denied`로 돌아왔으면(사용자가 제공자 화면에서 거부했다) `redirectUri?error=auth.oauth_denied`로 보낸다. `auth.oauth_denied`는 이 경우뿐이다.
  - 제공자가 그 밖의 `error`(`server_error`, `invalid_scope` 등)로 돌아왔거나, 코드 교환이나 신원 조회에 실패하면 `redirectUri?error=auth.oauth_failed`로 보낸다.
  - 비활성 계정이면 `redirectUri?error=auth.account_deactivated`로 보낸다.
- 계정 연결 순서(F4)
  1. (제공자, subject)로 연결된 계정이 있으면 그 계정이다.
  2. 없고 이메일이 검증됐으면, 같은 이메일의 계정에 연결한다. 그 계정이 이메일 인증 전이면(누군가 먼저 가입해 두었을 수 있다) 비밀번호를 지우고 인증을 마친 것으로 둔다. 그런 계정도 없으면 이메일 인증을 마친 새 계정을 만든다.
  3. 이메일이 검증되지 않았거나 없으면, 이메일 없는 새 계정을 만든다. 미검증 이메일은 저장하지 않는다.
- 새 계정의 `name`은 제공자가 준 이름이고, 없으면 null이다. 역할은 `member`다.
- 성공하면 1회용 코드(60초, Valkey)에 `codeChallenge`를 실어 `redirectUri?code=...`로 보낸다. BFF가 `POST /sessions`의 `oauthCode` grant에 `code`와 `codeVerifier`를 보내 토큰을 받는다. `codeVerifier`는 RFC 7636의 code verifier(`[A-Za-z0-9._~-]` 43~128자)여야 한다. 그 형식이 아니거나 `codeChallenge`를 만들지 못하면 코드를 소비하고 401 `auth.oauth_code_invalid`다. 빈 문자열의 S256도 43자라 `authorize`의 형식 검사를 지나므로, verifier가 없는 BFF가 보낸 빈 값이나 짧은 자리표시 값으로 공격자의 코드가 풀리지 않게 형식을 본다. BFF는 자기가 verifier를 쥐지 않은 콜백 `code`를 거부해야 한다(로그인 CSRF 방지, RFC 6749 §10.12).

### 6.3 RBAC

- 권한은 코드의 상수이고, 모듈이 자기 권한을 레지스트리에 등록한다. `GET /permissions`는 레지스트리의 목록을 돌려준다.
- 시드 역할 두 개는 시스템 역할이다.
  - `admin`의 권한은 "등록된 모든 권한"으로 계산한다. 권한이 새로 생겨도 자동으로 포함되고, 권한 목록은 고칠 수 없다.
  - `member`는 가입할 때 자동으로 부여된다. 권한은 고칠 수 있지만 삭제할 수 없다.
  - 시스템 역할을 삭제하거나 `admin`의 권한을 고치려 하면 `role.system_role_protected`다.
- 권한 상승 금지(F2). 위반은 모두 `permission.denied`다.
  - 자기 권한을 넘는 역할은 만들거나, 고치거나, 부여하거나, 회수하지 못한다. 기준은 "역할의 권한이 내 실제 권한의 부분집합인가"이고, 수정은 고치기 전과 후 모두 검사한다.
  - 자기보다 권한이 큰 사용자(그 사용자의 실제 권한이 내 권한의 부분집합이 아닌 경우)의 역할과 상태를 바꾸지 못한다.
  - 자기 자신의 역할과 상태는 바꾸지 못한다.
- 마지막 활성 admin의 admin 역할 회수, 비활성화, 탈퇴는 새 코드 `role.last_admin_protected`(422)로 막는다.
- 역할이 바뀐 사용자에게는 `me.updated`(`meta.changed`: `roles`)를 보낸다. 역할의 권한이 바뀌거나 역할이 지워지면 그 역할을 가진 사용자에게도 보낸다(계약의 `changed`에는 `permissions`가 없다).
- 비활성화하면 그 사용자의 세션을 모두 폐기한다(`account_deactivated`).
- 실제 권한은 요청마다 사용자의 역할에서 계산한다. 캐시하지 않는다.

### 6.4 사용자와 탈퇴

- 이메일은 앞뒤 공백을 지우고 소문자로 저장한다. 이메일에는 유일 제약(`uq_users_email`)을 건다. PostgreSQL은 NULL끼리 같다고 보지 않으므로, 이메일이 NULL인 탈퇴 계정끼리는 부딪치지 않는다.
- 공개 속성(`UserPublicResource`)은 `name`과 아바타뿐이다. 본인과 `users:read` 권한자는 전체 속성을 본다. 다른 리소스의 `included`에는 늘 공개 형태로 들어간다.
- `PATCH /me`로 이름, 로케일, 아바타를 바꾼다. 아바타는 본인 소유의 ready 이미지 파일이어야 한다. 바꾸거나 뺀 아바타는 다른 리소스가 가리키지 않으면 지운다(§6.5).
- 탈퇴(`DELETE /me`, F3)는 로그인한 지 10분 안의 세션만 할 수 있다. 지났으면 401 `auth.reauthentication_required`이고, 클라이언트는 다시 로그인해 받은 새 세션으로 부른다(refresh로는 풀리지 않는다, M5). 탈퇴는 한 트랜잭션에서 다음을 한다.
  1. `email`과 `name`을 null로, `status`를 `deleted`로 바꾼다.
  2. 비밀번호 해시, 소셜 연결, 역할, 남은 인증·재설정 토큰을 지운다.
  3. 아바타와, 다른 리소스가 참조하지 않는 본인 소유 파일을 지운다. 글의 커버 이미지처럼 남는 리소스가 참조하는 파일은 남긴다. 그 파일도 참조하던 리소스가 지워지면 함께 지운다(§6.5).
  4. 세션을 모두 폐기하고(`account_deleted`), 감사 로그 `user.deleted`를 남긴다.
- 탈퇴한 사용자의 글은 남는다. 작성자는 `name`이 null인 공개 사용자로 보이고, 프론트는 이를 "탈퇴한 사용자"처럼 번역해 보여 준다.
- 같은 이메일로 바로 다시 가입할 수 있다.
- `GET /users`는 탈퇴한 사용자도 `status: deleted`로 보여 준다. `filter[q]`는 이름과 이메일에서 찾는다.

### 6.5 파일

- 생성(`POST /files`)
  - 크기와 MIME을 설정의 한도와 허용 목록으로 검사한다. 기본값은 10 MiB와 `image/png`, `image/jpeg`, `image/webp`, `image/gif`다.
  - 위반하면 `file.too_large` 또는 `file.type_not_allowed`다.
  - 한 사용자가 가진 파일(pending과 ready)의 크기 합은 `FILE_USER_QUOTA`(기본 1 GiB)를 넘지 못한다. 넘으면 422 `file.quota_exceeded`(`meta.params.quota`)다. 사용자별 advisory lock으로 동시 생성도 한도 안에 둔다(M5).
  - `pending` 파일을 만들고, 객체 키는 `files/{id}`로 한다.
  - `meta.upload`에 presigned PUT(15분)을 담는다. `Content-Type`과 `Content-Length`를 서명에 넣고, 브라우저가 붙일 헤더는 `Content-Type`뿐이다.
  - 서명은 SigV4로 한다. 서명 버전을 정하지 않으면 boto3가 SigV2 쿼리 서명을 써서 크기가 서명에 들어가지 않는다(§14). 선언과 크기나 타입이 다른 PUT은 스토리지가 403으로 거절한다.
- 완료 확인(`PATCH /files/{id}`, `status: "ready"`)은 소유자만 한다. HEAD로 객체가 있는지, 크기가 선언과 같은지 확인한다. 다르면 객체를 지우고 `file.upload_incomplete`다.
- 읽기 규칙
  - 소유자는 읽는다.
  - 그 밖에는 모듈이 등록한 파일 참조 판정기에 묻는다. 하나라도 "이 파일을 참조하는 리소스를 이 사람이 볼 수 있다"고 답하면 읽는다.
  - posts는 "볼 수 있는 글의 커버 이미지", users는 "사용자의 아바타는 공개"를 등록한다(`files.add_read_rule`, 등록은 `registry.py`).
  - 읽을 수 없으면 404다. 읽을 수 있지만 소유자가 아닌 사람의 완료 확인과 삭제는 403이다.
- 다른 리소스에 거는 파일(아바타, 커버 이미지)은 요청한 사람 소유의 ready 이미지여야 한다(`files.attachable_file`). 없거나 남의 것이면 404(pointer `/data/relationships/<관계>/data`), pending이면 422 `file.upload_incomplete`, 이미지가 아니면 422 `file.type_not_allowed`다.
- 전달(F15)
  - ready 파일의 `meta.downloadUrl`은 presigned GET(10분)이다.
  - `included`에 들어간 파일에도 채운다. presign은 네트워크 호출 없이 계산만 하므로 비용이 거의 없다.
  - 공개 버킷이나 CDN으로 바꾸는 방법은 `docs/architecture.md`에 적는다.
- 삭제는 소유자만 한다. 객체와 행을 지우고, 참조하던 관계는 null이 된다.
- 24시간이 넘은 `pending` 파일은 주기 잡(`files.purge_pending`, 매시간 정각 UTC)이 지운다.
- 탈퇴 때 남길 파일(다른 리소스가 가리키는 파일)은 모듈이 등록한 참조 확인(`files.add_reference_check`)으로 가린다. users는 아바타를, posts는 커버 이미지를 등록한다.
- 관계에서 풀린 파일(바꾸거나 뺀 아바타·커버, 지운 글의 커버)은 참조 확인이 남기라고 하지 않으면 지운다(`files.release`). 소유자가 탈퇴했어도 같다. 행은 같은 트랜잭션에서, 객체는 commit한 뒤에 지운다(M5).
- 스토리지 설정
  - boto3의 체크섬 기본값을 `when_required`로 낮춘다. S3 호환 서버와의 호환 때문이다.
  - presign에는 브라우저가 접근하는 공개 엔드포인트를 따로 쓴다. compose 안의 주소와 브라우저가 보는 주소가 다르기 때문이다.
  - `setup`이 버킷과 CORS를 S3 API로 준비한다.

### 6.6 posts

기반 설계 §4.9를 그대로 구현한다.

- 글 본문은 100,000자까지다(`validation.too_long`, M5).
- 상태 전이는 도메인 규칙의 전이 표(`draft ↔ published`)로 판정한다. 표에 없는 전이는 `post.invalid_transition`이다. 같은 상태로 PATCH하는 것은 전이가 아니므로 에러가 아니다.
- 발행하면 `publishedAt`을 채우고, 발행을 취소하면 null로 되돌린다.
- 목록은 발행된 글만 준다. 초안이 보이는 쿼리는 `filter[author]`가 보는 사람 자신이거나 보는 사람이 `posts:manage`일 때다. 그때 `filter[status]`가 없으면 모든 상태를 준다. 초안이 보이지 않는 쿼리의 `filter[status]=draft`는 빈 목록이다(에러가 아니다).
- 조회는 발행된 글이면 누구나, 초안이면 작성자와 `posts:manage`만 한다. 볼 수 없으면 404, 볼 수 있지만 고칠 수 없으면 403이다.
- 공개 목록의 첫 페이지(필터와 `fields` 없음, 기본 정렬, 기본 크기. `include`는 달라도 된다)를 60초 캐시한다. 키는 검증을 마친 `include` 경로를 정렬한 값이라, 키의 수가 include 조합 수를 넘지 않는다. 초안이 보이는 사람(`posts:manage`)의 요청은 캐시하지 않는다. 글이 생기거나 바뀌거나 지워지면 commit한 뒤에 캐시를 지운다(세대를 올린다, §6.10). 캐시 수명은 presigned URL 수명보다 짧다.
- 관리자가 남의 글을 지우면 감사 로그 `post.deleted_by_admin`을 남긴다.
- 실시간 이벤트는 계약의 `rooms`와 `conditionalRooms`대로 보낸다. 발행을 취소하면 `posts`에 `post.unpublished`(리소스 식별자만)를 보낸다(M5).
- 테스트는 도메인 규칙 단위 테스트, API 통합 테스트, 권한 매트릭스 테스트로 나눈다.

### 6.7 감사 로그

- 기록은 행위와 같은 트랜잭션에서 한다. 로그인 실패처럼 트랜잭션이 없는 경우는 따로 기록한다.
- `metadata`에 이메일 같은 개인정보를 넣지 않는다. 로그인 실패는 입력된 식별자의 해시(`IDENTIFIER_HASH_SECRET` 키의 HMAC-SHA256, M5)만 남겨, 같은 대상에 대한 반복 시도를 추적할 수 있게 한다.
- `ipAddress`는 요청의 클라이언트 주소다. 프록시 헤더를 믿을지는 설정으로 정한다.
- 기록하는 행위(계약 enum, §7)

| action                    | 경우                             | targetType |
| ------------------------- | -------------------------------- | ---------- |
| `session.login_succeeded` | 로그인 성공(비밀번호, 소셜)      | `users`    |
| `session.login_failed`    | 로그인 실패                      | `users` 또는 없음 |
| `session.all_revoked`     | 전체 기기 로그아웃               | `users`    |
| `user.password_changed`   | 비밀번호 변경                    | `users`    |
| `user.password_reset`     | 비밀번호 재설정                  | `users`    |
| `user.roles_changed`      | 사용자의 역할 변경               | `users`    |
| `user.deactivated`        | 비활성화                         | `users`    |
| `user.reactivated`        | 다시 활성화                      | `users`    |
| `user.deleted`            | 회원 탈퇴                        | `users`    |
| `role.created`            | 역할 생성                        | `roles`    |
| `role.updated`            | 역할 수정                        | `roles`    |
| `role.deleted`            | 역할 삭제                        | `roles`    |
| `post.deleted_by_admin`   | 관리자가 남의 글을 삭제          | `posts`    |

### 6.8 실시간

- Socket.IO 서버는 `/socket.io/`에 있고 WebSocket 전송만 허용한다. 연결의 Origin은 설정의 허용 목록으로 검사한다.
- 티켓(`POST /realtime-tickets`)은 Valkey에 30초 두는 1회용 값이고, 사용자 id와 세션 id를 담는다.
- 접속할 때 `auth.ticket`이 있으면 티켓을 꺼내 지우고, 세션이 살아 있으면 그 연결을 `user:{id}` 룸에 넣는다. 티켓이 없으면 익명 연결이다. 티켓이 틀렸거나 만료됐거나 세션이 끝났으면 연결을 거부한다. `connect_error`의 message는 `auth.token_invalid`, data는 에러 객체다.
- 클라이언트 메시지(F22)
  - `subscribe`와 `unsubscribe`, 페이로드는 `RealtimeSubscription`(`{ "channel": "posts" }`)이다.
  - ack는 `RealtimeAck`로, 성공이면 `{ "ok": true }`다. 실패면 `{ "ok": false, "error": ErrorObject }`이고, 권한이 없으면 `permission.denied`, 모르는 채널이면 `validation.invalid_choice`다.
  - 익명 연결은 `posts`만 구독할 수 있다. `posts:all`에는 `posts:manage`가 필요하다. 권한은 구독할 때 DB에서 계산한다.
  - 연결 재검사(M5): 세션을 폐기하거나 사용자의 역할·상태가 바뀌면(`session.revoked`, `me.updated`의 `roles`·`status`) commit한 뒤 Valkey pub/sub 제어 채널(`<pub/sub 채널>:control`)로 사용자 id를 알린다. api 인스턴스마다 자기 연결(`user:{id}` 룸의 참가자)만 다시 검사해, 세션이 끝났거나 구독한 채널의 권한을 잃은 연결을 끊는다. 사용자별 소켓 id를 인스턴스 밖에 기록하지 않는다. 끊긴 클라이언트는 새 티켓으로 다시 붙는다.
  - ack의 에러 객체는 권한 없음 403, 모르는 채널이나 틀린 페이로드 422이고 `source.pointer`는 `/channel`이다.
- api는 `AsyncRedisManager`로 인스턴스 사이에 이벤트를 전파한다. worker와 scheduler는 쓰기 전용 매니저로 이벤트를 보낸다. 매니저는 Valkey 클라이언트를 하나만 만들어 다시 쓰고 닫을 때 닫는다(python-socketio는 발행이 실패하거나 수신을 다시 시작할 때마다 새로 만든다, M5).
- 이벤트 페이로드는 모듈의 직렬화 함수로 만든 JSON:API 문서다.
- 이벤트는 쓰기가 commit된 뒤에 나간다. 모듈이 트랜잭션에 넣고(`queue`) 세션이 commit한 뒤에 페이로드를 만들어 보낸다. 한 연결이 여러 룸에 있어도 한 번 받는다.
- `session.revoked`는 그 사용자의 모든 연결이 받는다(페이로드에 세션 id가 없다). 클라이언트는 자기 세션이 살아 있는지 확인한다.
- python-socketio에는 OpenTelemetry 계측이 없으므로, 연결과 메시지 처리에 로그와 수동 span을 둔다.

### 6.9 잡, 메일, 스케줄러

- broker는 taskiq-redis의 스트림 broker(`RedisStreamBroker`)다. 처리 중에 worker가 죽으면 확인하지 않은 잡을 다른 worker가 가져간다.
  - 확인한 잡은 스트림에서 지운다(XACK와 XDEL을 한 트랜잭션으로). taskiq-redis의 확인은 XACK만 하므로 확인 함수(`_ack_generator`)를 재정의하고, 통합 테스트로 고정한다. 스트림이나 스케줄 소스(재시도)에서 기다리는 잡은 처리할 때까지 인자를 담고 있다. 그래서 잡 인자는 id뿐이다(M5).
- 재시도는 `SmartRetryMiddleware`(처음 실행을 포함해 최대 5번)다. 지연은 재시도마다 5초씩 늘고(최대 60초) 0~1초 지터가 붙는다.
  - taskiq-redis broker는 지연을 지키지 않는다. 그래서 재시도를 Valkey 스케줄 소스에 넣고 scheduler가 때가 되면 보낸다.
  - scheduler는 스케줄을 10초마다 다시 읽는다(`--update-interval=10`). 기본값(1분)이면 5초 뒤의 첫 재시도가 1분 가까이 늦기 때문이다.
  - 이미 읽은 분에 나중에 들어온 예약은 다음에 읽을 때 지난 예약으로 함께 읽힌다(taskiq-redis 1.2.3). 이 동작을 통합 테스트로 고정하고, 한 번 실패한 메일이 다시 나가는지를 E2E로 본다.
- 잡은 메일 발송, `pending` 파일 정리(매시간), 만료된 토큰과 세션 정리(매일)다.
- 주기 작업은 작업 정의에 붙인 라벨로 선언하고, scheduler 하나가 실행한다(F6).
- 메일
  - 메일 잡(인증, 재설정, 환영)은 사용자 id만 받는다. 잡이 실행될 때 사용자를 읽어 보낼 조건을 다시 보고, 토큰이 필요하면 발급해 commit한 뒤 렌더해 보낸다. 재시도하면 토큰을 새로 발급한다(M5).
  - 템플릿은 메일을 보내는 모듈의 `templates/<로케일>/<이름>.{subject.txt,txt,html}`에 둔다. 인증, 재설정, 환영 메일은 `auth` 모듈에 있다.
  - 로케일(`ko`, `en`)마다 세 파일이 모두 있어야 한다. 빠지면 `check`가 실패한다.
  - 받는 사람의 로케일로 고르고, 없으면 `ko`를 쓴다.
  - 링크는 설정의 프론트 주소에 경로(`/verify-email`, `/reset-password`)와 `?token=`을 붙여 만든다(`docs/conventions/jsonapi.md`의 메일 링크). 적합성 스위트가 이 경로로 메일을 가리고 토큰을 꺼낸다.
- 테스트는 Taskiq의 InMemoryBroker로 잡을 그 자리에서 실행한다. 메일은 실제 Mailpit으로 보낸다.

### 6.10 레이트 리밋과 캐시

- 레이트 리밋(F26)은 Valkey 고정 윈도 카운터다. `INCR`과 만료를 파이프라인으로 원자적으로 건다.
  - 엄격: 로그인(IP별, 식별자 해시별), 가입(IP별), 재설정 요청과 인증 메일 재발송(IP별, 이메일 해시별), 비밀번호 변경(사용자별, M5)
  - 느슨: 그 밖의 모든 요청에 IP별 전역 제한
  - 한도는 설정 값이다. 기본값은 로그인 IP별 분당 10회와 식별자별 분당 5회, 가입 IP별 시간당 10회, 재설정 요청과 재발송 IP별 시간당 5회와 이메일별 시간당 3회, 비밀번호 변경 사용자별 시간당 5회, 전역 IP별 분당 600회다.
  - 식별자(이메일)의 해시는 `IDENTIFIER_HASH_SECRET` 키의 HMAC-SHA256이다. 키 없는 해시는 흔한 주소 목록으로 되돌릴 수 있다(M5).
  - 초과하면 429, `Retry-After`, `rate_limit.exceeded`다.
  - 테스트 환경에서는 한도를 크게 두고, 레이트 리밋 자체를 확인하는 테스트만 한도를 낮춘다.
- 캐시는 redis-py 위의 작은 cache-aside 도우미(`app.core.cache.Cache`)다. 키 이름공간, 세대, 값의 모양, JSON 직렬화를 담당한다. 지우기는 세대를 올린다(SCAN이 없다). 채우는 사이에 지운 값은 옛 세대에 쓰여 읽히지 않고, 모양(문서 모델의 JSON 스키마 해시)이 바뀐 배포는 다른 키를 쓴다(M5). Valkey에 닿지 못하면 캐시 없이 동작한다(fail-open). 예시는 posts의 공개 목록이다.

### 6.11 관측성, 헬스체크, 설정

- 로그는 structlog JSON이고, 개발 환경에서는 사람이 읽기 좋은 콘솔 형식이다.
- 요청마다 traceId(32자리 16진수)를 붙인다. OpenTelemetry가 켜져 있으면 그 trace id를 쓴다. 모든 로그와 에러 응답의 `meta.traceId`에 들어간다.
- OpenTelemetry는 기본으로 꺼 둔다. 켜면 FastAPI, SQLAlchemy, psycopg, Redis, httpx를 계측하고 Taskiq의 OpenTelemetry 연동을 켜서 OTLP로 내보낸다. 헬스 체크는 span을 만들지 않는다. 제외 URL은 `OTEL_PYTHON_FASTAPI_EXCLUDED_URLS`(없으면 `OTEL_PYTHON_EXCLUDED_URLS`)에 헬스 경로를 더한 값이고, 준비 검사의 DB·Valkey 호출도 계측을 끈 채 돈다(M5).
- 헬스체크는 `/health/live`와 `/health/ready`(DB, Valkey, 스토리지 버킷)다.
- 설정은 pydantic-settings 스키마 하나다. 앱이 시작할 때 검증하고, 틀린 변수를 이름으로 알리고 멈춘다. `.env.example`과 스키마 필드가 일치하는지 `check`가 확인한다.
- 비밀(키, 비밀번호, 계정이 든 `DATABASE_URL`·`REDIS_URL`·`SMTP_URL`)은 `SecretStr`로 받는다. 운영(`APP_ENV=production`)에서는 앱이 스스로 정하는 비밀(`JWT_SECRET`, `IDENTIFIER_HASH_SECRET`, `SEED_ADMIN_PASSWORD`)이 `.env.example`의 값이면 시작하지 않는다(M5).

### 6.12 시드

`setup`과 `db:reset`이 실행하며, 여러 번 실행해도 안전하다.

- 역할 `admin`, `member`
- 관리자 계정: 이메일과 비밀번호는 `.env`의 `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`. 이메일 인증을 마친 상태이고 `admin` 역할을 가진다.
- 예제 글: 관리자가 쓴 글 셋(발행 둘, 초안 하나). 관리자에게 글이 하나도 없을 때만 만든다.

## 7. 계약 변경

M1의 첫 작업으로 반영한다. 계약 테스트, `docs/conventions/jsonapi.md`, `docs/conventions/error-codes.md`를 함께 고친다.

| 대상         | 변경                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| users        | `UserAttributes.email`, `UserAttributes.name`, `UserPublicAttributes.name`을 nullable로 한다. `UserStatus`에 `deleted`를 더한다             |
| audit-logs   | `AuditLogAction` enum(§6.7의 13개)과 `AuditLogTargetType` enum(`users`, `roles`, `posts`)을 만들고, 속성과 필터를 이 enum으로 바꾼다          |
| 실시간       | `RealtimeChannel`(`posts`, `posts:all`), `RealtimeSubscription`, `RealtimeAck` 스키마와 루트 확장 `x-realtime-messages`를 더한다             |
| 실시간       | `SessionRevokedReason`에 `password_changed`, `refresh_token_reused`, `account_deleted`를 더한다                                            |
| 페이지 링크  | 링크 형식을 `url`에서 URI-reference 문자열로 바꾼다(F20)                                                                                     |
| 에러 코드    | `role.last_admin_protected`(422)를 더한다. `auth.oauth_denied`, `auth.oauth_failed`를 더한다(콜백 리다이렉트의 `error` 값으로만 쓴다)       |
| OAuth 설명   | 콜백의 에러 리다이렉트 규칙(§6.2)을 operation 설명에 적는다. PKCE와 `codeChallenge`를 적는 문장은 §12.1 M4를 따른다                          |
| 에러 코드(M5) | `auth.reauthentication_required`(401), `jsonapi.content_too_large`(413), `file.quota_exceeded`(422)를 더한다. 413은 본문을 받는 operation의 에러(`BodyErrors`)에 더한다 |
| posts(M5)    | 글 속성과 생성·수정 속성의 `body`에 `maxLength` 100000                                                                                      |
| 실시간(M5)   | `post.unpublished` 이벤트(`rooms`: `posts`)와 `PostUnpublishedEventDocument`                                                               |
| OAuth(M5)    | `authorize`의 `codeChallenge`에 pattern `^[A-Za-z0-9_-]{43}$`                                                                               |
| 설명(M5)     | `DELETE /me`(재인증), `POST /password-changes`(사용자별 레이트 리밋, 재설정 토큰 삭제), `POST /files`(사용자별 한도)                        |

- `x-realtime-messages`의 형식: `[{ "name": "subscribe", "payload": "RealtimeSubscription", "ack": "RealtimeAck" }, { "name": "unsubscribe", ... }]`
- 룰셋의 공용 스키마 이름 목록에 `RealtimeChannel`, `RealtimeSubscription`, `RealtimeAck`를 더한다. 이 스키마들은 리소스에 속하지 않는다.

## 8. 하네스

### 8.1 명령

`pyproject.toml`의 `[tool.poe.tasks]`에 둔다. 셸 차이를 피하려고 대부분 `tools/`의 Python 함수를 부르는 `script` 태스크로 만든다.

| 명령              | 내용                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup`           | 순서대로 실행한다. 여러 번 실행해도 안전하다: Betterleaks 설치 → `lefthook install` → compose 기동과 준비 대기 → 버킷·CORS 준비 → DB(`app`, `app_test`, `app_e2e`) 생성 → 마이그레이션 → 시드 → FastAPI 공식 skill 복사본 갱신 |
| `dev`             | api, worker, scheduler를 함께 띄운다. api만 리로드한다                                                                                                                |
| `check`           | §8.2                                                                                                                                                                  |
| `fix`             | `ruff format`과 `ruff check --fix`                                                                                                                                    |
| `test`            | pytest(E2E 제외)                                                                                                                                                      |
| `test:e2e`        | §9                                                                                                                                                                    |
| `gen`             | `openapi.json` 내보내기                                                                                                                                               |
| `db:migrate`      | `alembic upgrade head`                                                                                                                                                |
| `db:reset`        | 로컬 `app` DB를 지우고 다시 만든 뒤 마이그레이션과 시드. `localhost`가 아닌 DB에서는 거부한다                                                                         |
| `db:revision`     | Alembic 자동 생성 초안(`db:revision "메시지"`)                                                                                                                        |
| `gen:module`      | §8.7                                                                                                                                                                  |

- 새로 클론한 뒤에는 `uv run poe setup` 한 번이면 된다. `uv run`이 가상환경과 의존성을 먼저 맞춘다.

### 8.2 check

`tools/check`가 단계를 차례로 실행한다. 출력 원칙은 저장소 루트 실행기와 같다: 성공은 한 줄, 실패는 실패한 단계의 출력만.

1. 포맷: `ruff format --check`
2. 린트: `ruff check`
3. 타입: basedpyright
4. 아키텍처: import-linter와 모듈 경계 검사(§4.3)
5. 하네스 검사
   - 파일 크기: 소스 400줄, 테스트 600줄(생성물 제외)
   - 억제 주석: 규칙 코드를 적은 `# noqa: <코드>`와 `# pyright: ignore[<규칙>]`만 허용하고, 바로 뒤에 `# 사유: ...` 주석이 있어야 한다. `# type: ignore`는 쓰지 않는다
   - `.env.example`과 설정 스키마의 일치
   - 메일 템플릿의 로케일 누락
   - AGENTS.md와 CLAUDE.md의 짝, CLAUDE.md 내용, 루트 AGENTS.md 200줄 이하
6. 생성물 최신 여부: `openapi.json`
7. 계약 린트: 룰셋 번들로 `openapi.json` 검사
8. skill 사본: FastAPI skill 복사본이 설치된 fastapi 패키지의 원본과 같은지 본다
9. 테스트: 먼저 DB와 Valkey에 접속해 보고, 실패하면 "`uv run poe setup`을 실행하라"는 안내와 함께 바로 멈춘다

- 가능한 한 실패를 `파일:줄 규칙 — 고치는 방법` 형식으로 낸다. 직접 만든 검사의 메시지는 "대신 이렇게 하라"로 쓴다.
- 단계마다 입력 파일의 해시를 `.cache/check/`에 저장하고, 마지막 성공 이후 입력이 바뀌지 않은 단계는 건너뛴다.
- 빠른 경로(`check --fast`)는 Stop hook이 쓴다. 계약 린트를 뺀 단계를 돌리고, 테스트는 바뀐 파일과 관련된 것만 돌린다.
  - `src/app/modules/<이름>/` 아래가 바뀌면 그 모듈의 `tests/`만 돌린다.
  - 그 밖의 테스트 입력(`src/app/core/`, `tools/`, `migrations/`, 앱 조립 파일, 의존성과 설정 파일)이 바뀌면 전체 테스트를 돌린다.
  - 기준은 마지막 성공 이후 바뀐 파일이다(해시 캐시로 계산).

### 8.3 hooks

모든 hook은 exec form이다: `"command": "uv", "args": ["run", "--directory", "${CLAUDE_PROJECT_DIR}", "--frozen", "python", "-m", "tools.hooks.<이름>"]`. `--directory`가 작업 폴더를 프로젝트 루트로 바꾸므로, 설치하지 않은 `tools` 패키지의 hook 모듈을 부를 수 있다.

| 이벤트                        | 동작                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PostToolUse`(Edit, Write)    | 고친 파일이 `.py`면 그 파일만 포맷하고 자동 수정한 뒤, 남은 린트 오류를 Claude에게 돌려준다                                                                 |
| `Stop`                        | `stop_hook_active`면 통과한다. 아니면 빠른 `check`를 돌린다. 마지막 통과 이후 바뀐 것이 없으면 캐시 덕분에 즉시 통과한다. 실패하면 종료를 막고 요약을 돌려준다 |
| `PreToolUse`(Bash, PowerShell) | 강제 푸시, `--no-verify`, git hook 끄기(`LEFTHOOK=0`, `core.hooksPath`), `localhost`가 아닌 DB를 대상으로 한 명령(주소, `psql -h`), 커밋된 마이그레이션 파일의 삭제, 셸로 `.env` 읽기를 막는다. `bash -c` 같은 감싼 명령도 풀어서 본다 |
| `PreToolUse`(Edit, Write)     | 커밋된 마이그레이션 파일의 수정을 막는다. 커밋됐다는 것을 "어딘가에 적용됐을 수 있음"의 근사로 쓴다                                                          |
| `SessionStart`                | 인프라 기동 여부, 적용 안 된 마이그레이션, 생성물 최신 여부를 요약해 넣는다                                                                                  |

- "이번 턴에 작업 트리가 바뀌었는가"를 따로 기록하지 않고 `check`의 해시 캐시로 판단한다. 기반 설계 §6.4의 의도(바뀐 것이 없으면 통과)와 같다.
- hook 스크립트는 입력 JSON 픽스처로 테스트한다. 출력 JSON 형식은 계획을 쓸 때 공식 레퍼런스로 다시 확인한다.

### 8.4 권한 (`.claude/settings.json`)

- 허용: `uv run poe *`, 읽기 전용 git 명령
- 차단
  - 비밀이 든 `.env`, `.env.local` 읽기. 파일 이름을 정확히 적어서 `.env.example`은 읽을 수 있게 한다
  - 생성물의 Edit·Write: `openapi.json`, `api-style/**`, `uv.lock`, FastAPI skill 복사본
  - 위험한 명령(§8.3과 같은 목록)

### 8.5 git hook과 비밀 스캔

- lefthook은 PyPI 휠로 설치하고 `setup`이 `lefthook install`을 실행한다.
  - pre-commit: 스테이징된 파일의 ruff 포맷(고친 결과를 다시 스테이징), ruff 린트, Betterleaks 스캔
  - pre-push: 전체 `check`
- Betterleaks는 `tools/`의 설치기가 버전과 SHA-256을 고정해 GitHub 릴리스에서 받아 `.cache/tools/`에 둔다. 압축은 Python 표준 라이브러리로 푼다.
- `.betterleaks.toml`은 기본 규칙을 쓴다. 테스트의 가짜 비밀은 줄 끝 `betterleaks:allow` 주석으로 하나씩 허용한다.

### 8.6 생성물

| 생성물                    | 만드는 방법                                 | 표시                                   |
| ------------------------- | ------------------------------------------- | -------------------------------------- |
| `openapi.json`            | `gen`                                       | 루트의 `x-generated`                   |
| `api-style/lint.mjs`      | 저장소의 `pnpm sync`(공유 자산)             | 템플릿 AGENTS.md의 생성물 목록          |
| FastAPI skill 복사본(`.claude/skills/fastapi/`, `.agents/skills/fastapi/`) | `uvx library-skills==0.0.19 --claude --copy --yes --skill fastapi`(`setup`. 사본이 원본과 다를 때만 다시 복사한다) | 원본이 설치된 fastapi 패키지 안에 있다 |
| `uv.lock`                 | `uv add`, `uv lock`                         | uv가 관리한다                          |

모두 `check`가 최신 여부를 확인하고, Claude Code 권한이 직접 수정을 막는다.

### 8.7 생성기, 레시피, skill

- `gen:module <이름>`(복수형 kebab-case, 예: `comments`)
  - `posts`를 복사해 이름을 바꾼다: 파일, 클래스, 테이블, 스키마 이름, 리소스 타입, 권한 상수(`<이름>:create`, `<이름>:manage`), 이벤트 이름, 테스트.
  - 모듈 레지스트리에 등록하고, 새 테이블의 마이그레이션 초안을 만든다.
  - posts만의 도메인 규칙(전이 표, 캐시 예시)은 표시한 자리에 남겨 두고, 고칠 곳을 목록으로 알려 준다.
  - 생성 직후 `check`가 통과해야 한다.
  - 이름과 단수형은 20자 이하다. 이름이 파이썬 예약어·내장 이름, 골든 모듈이 쓰는 이름(author, session 등), 이미 있는 태그나 테이블과 겹치면 아무 파일도 쓰지 않는다. 검사를 모두 마친 뒤에만 쓴다.
  - 골든 모듈은 표시 주석으로 생성기에 알린다: `# gen:module: 빼기`(복사하지 않는 줄), `빼기 시작`·`빼기 끝`(묶음), `그대로`(이름을 바꾸지 않는 줄), `고칠 곳 — 설명`(새 모듈에서 고칠 곳).
  - 계약의 값(에러 코드 `post.invalid_transition`, 감사 행위 `post.deleted_by_admin`)은 새 모듈이 계약에 제 값을 더할 때까지 그대로 쓴다.
  - 생성기 테스트가 가장 긴 이름으로 만든 모듈의 포맷과 린트를 확인한다. 골든 모듈에서 모듈 이름이 든 문자열과 주석은 그만큼 여유를 둔다.
- 레시피(`docs/recipes/*.md`)
  - 모듈 추가, 엔드포인트 추가, 마이그레이션, 실시간 이벤트 추가, 잡 추가, 권한 추가, 메일 템플릿 추가
  - 각 레시피는 "언제, 명령, 고칠 파일, 확인 방법" 순서로 쓴다(`tools/tests/test_recipes.py`가 본다). 실시간 이벤트 추가는 M4에서 쓴다.
- skill: `.claude/skills/add-<레시피>/SKILL.md`는 레시피를 불러오고 생성기를 부르고 `check`로 확인하는 얇은 포장이다. FastAPI 공식 skill은 `uvx library-skills --claude --copy --skill fastapi`로 넣는다. 복사 모드라 Windows에서도 동작한다.
  - `--all`은 fastapi-cli가 가져오는 typer의 skill까지 복사하므로 쓰지 않는다.
  - 사본은 커밋한다. `check`의 skill 사본 단계가 원본과 같은지 보고, Ruff는 마크다운 안의 코드 블록까지 포맷하므로 사본을 Ruff 검사에서 뺀다.

### 8.8 지침 파일과 문서

- 루트 AGENTS.md는 200줄 이하로 쓴다. 명령, 구조 지도, 핵심 규칙, 완료 기준(`uv run poe check`), 문서 링크만 담는다.
- 폴더별 AGENTS.md: `src/app/modules/`(모듈 구조와 경계), `src/app/core/`(도메인을 모른다), `migrations/`(커밋된 파일은 고치지 않는다), `tools/`(하네스 도구). 모두 `@AGENTS.md` 한 줄짜리 CLAUDE.md와 짝을 짓는다.
- `docs/stack.md`에 설치된 버전과 문서 링크를 적고, "기억에 의존하지 말고 설치 버전의 문서를 확인하라"는 규칙을 AGENTS.md에 둔다.
- `docs/architecture.md`에 계층, 모듈, 요청 흐름, 프로세스, 공개 파일 전달을 바꾸는 방법을 적는다.

## 9. 템플릿 테스트

| 계층   | 대상                                                                                                     | 인프라                                                           |
| ------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 단위   | 순수 로직: 권한 판정과 권한 상승 규칙, 전이 표, 쿼리 파서, 페이지 링크, 레이트 리밋 계산, 제공자별 신원 판정 | 없음                                                             |
| 통합   | 모듈 API를 httpx `ASGITransport`로 프로세스 안에서 호출                                                  | 실제 PostgreSQL, Valkey, SeaweedFS, Mailpit. 잡은 InMemoryBroker |
| E2E    | 프로세스 경계를 넘는 흐름                                                                                | api, worker, scheduler를 실제 프로세스로 띄운다                  |

- 통합 테스트 격리(F18)
  - `app_test` DB에 테스트 세션 시작 때 한 번 마이그레이션한다.
  - 테스트마다 바깥 트랜잭션을 열고, 앱의 세션이 SAVEPOINT로 그 안에 들어가게 한 뒤 롤백한다.
  - Valkey는 테스트 전용 DB 번호를 테스트마다 비운다.
  - 스토리지는 테스트마다 다른 키 접두사를 쓴다.
  - Mailpit은 메일을 검사하는 테스트 앞에서 비운다.
- 외부 서비스만 모의로 바꾼다. 카카오와 네이버의 신원 응답 형태는 녹화한 픽스처로 단위 테스트한다.
- E2E(`test:e2e`)
  - `app_e2e` DB로 api, worker, scheduler를 테스트용 포트에 띄우고, `tests/e2e`를 돌린 뒤 내린다.
  - 흐름: 가입 → worker가 인증 메일 발송 → 인증 → 로그인. 글 발행 → 소켓 클라이언트가 `post.published` 수신(worker 발행 포함). presigned 업로드 → 완료 확인 → 다운로드. 모의 OAuth 서버로 소셜 로그인.
- 권한 매트릭스 테스트는 posts에 둔다: (익명, 작성자, 다른 회원, `posts:manage`) × (조회, 초안 조회, 생성, 수정, 삭제, 발행).

## 10. 적합성 스위트

`contract/conformance`에 이번 사이클에서 플랫폼 흐름 테스트를 쓴다.

- 흐름별 파일(`test/flows/`): registration, sessions, passwords, oauth, me, users, roles, permissions, files, posts, audit-logs, realtime, jsonapi
- jsonapi 흐름이 확인하는 규칙: 415/406, include·sort·filter의 400, `fields` 준수, 페이지 링크와 `meta.page`, 에러 문서 형식과 `traceId`
- 응답 검증(F19)
  - openapi-fetch 미들웨어가 모든 응답 본문을 그 operation과 상태 코드의 계약 스키마로 검증한다.
  - 계약에 없는 상태 코드도 실패다.
  - 스키마는 `contract/openapi.yaml`의 components를 Ajv(JSON Schema 2020-12, 형식 검사 포함)에 등록해 쓴다.
- 부수 채널
  - Mailbox: Mailpit API(`GET /api/v1/search?query=to:"주소"`, `GET /api/v1/message/{ID}`, `DELETE /api/v1/messages`). 받는 사람(테스트마다 고유한 이메일)으로 검색하고, 제한 시간 동안 폴링한다. 테스트 파일이 병렬로 돌므로 전체 삭제는 스위트 시작 때 한 번만 한다.
  - `latest(to, { after, linkPath })`: `after`는 그 메일보다 뒤에 받은 메일만(메일함의 시각으로 비교), `linkPath`는 그 경로의 토큰 링크가 든 메일만 본다. 같은 주소로 두 번 보낸 메일과 메일 종류를 가린다. 제목은 백엔드와 로케일마다 문구가 달라 조건으로 쓰지 않는다.
  - OAuthDriver: 백엔드의 `authorize`부터 리다이렉트를 따라가 모의 OAuth 서버의 자동 로그인을 거친다. 가짜 프론트 콜백 주소에 닿으면 멈추고 `code`를 꺼낸다.
  - 카카오와 네이버의 신원 응답 형태를 모의 서버가 흉내 내지 못하면(§13), 적합성의 소셜 로그인 흐름은 구글로만 돌린다. 두 제공자는 템플릿의 단위 테스트가 맡는다.
- 데이터: 테스트마다 무작위 이메일로 사용자를 새로 만든다. DB를 초기화하지 않고 몇 번이든 돌릴 수 있다. 관리자 흐름은 시드된 관리자를 쓰며, 자격 증명은 환경 변수(`CONFORMANCE_ADMIN_EMAIL`, `CONFORMANCE_ADMIN_PASSWORD`)로 받는다.
- 파일: `uploadFile` 도우미가 브라우저처럼 `meta.upload`의 presigned PUT으로 스토리지에 올리고 완료를 알린다. 스토리지의 공개 주소(compose의 `S3_PUBLIC_ENDPOINT_URL`)에 흐름 테스트가 닿아야 한다.
- 글 흐름은 목록을 다른 흐름과 함께 쓰므로 `filter[author]`로 좁혀 본다. 공개 목록 첫 페이지는 쓰기 직후의 반영만 본다.
- 실행: 루트 `pnpm conformance fastapi`
  1. `templates/fastapi`의 compose를 `app` 프로필로 `--build --wait` 기동한다.
  2. 대상 설정과 부수 채널 주소를 환경 변수로 넘겨 Vitest를 돌린다.
  3. 스택을 내린다.

## 11. 템플릿 저장소 변경

- 계약: §7의 변경과 계약 테스트, 규약 문서
- 룰셋(`contract/api-style`)
  - `schema-naming`이 `$ref`로 된 `data`를 따라가게 고친다. 백엔드 생성기는 `data`를 `$ref`로 내보내기 때문이다.
  - 공용 이름 목록에 실시간 스키마 셋을 더한다.
  - esbuild로 한 파일짜리 번들(`dist/lint.mjs`)을 만든다. 번들이 소스와 같은지는 `check:fresh` 같은 검사로 확인한다.
- 공유 자산(`scripts/shared-assets.json`): 번들 파일(`lint.mjs`) 하나만 `templates/fastapi/api-style/`로 복사한다(F23).
- `verify-templates`
  - runner `uv`의 명령 어휘를 `[tool.poe.tasks]` 키로 검사한다(F25).
  - 지침 검사와 함께 파일 탐색을 `git ls-files --cached --others --exclude-standard`로 바꾼다(F24). git 저장소가 아닌 테스트용 임시 폴더에서는 지금처럼 직접 걷는다.
- 문서: `docs/harness/standard.md`에 uv 실행기(poe 태스크)를 적는다. 기반 설계에서 "FastAPI 사이클에서 정한다"고 미룬 곳은 이 문서를 쓰면서 이 문서를 가리키게 고쳤다.
- CI(`.github/workflows/ci.yml`)에 잡을 더한다. action은 커밋 SHA로 고정한다.
  - `fastapi`: uv 설치 → `uv run poe setup` → `check` → `test:e2e` → Docker 이미지 빌드
  - `conformance-fastapi`: `pnpm conformance fastapi`
  - 구조 비교: M1부터 `check` 잡에서 `pnpm spec-compare --subset contract/openapi.yaml templates/fastapi/openapi.json`(구현한 operation만 비교)을 돌리고, M4에서 `--subset`을 뗐다. M4부터 구조 비교는 실시간 선언(`x-realtime-*`)도 계약과 같은지 본다
- 루트 `pnpm check`는 Python과 Docker 없이 돌도록 지금 범위를 유지한다. 템플릿 자체 검사는 CI 잡이 맡는다.

## 12. 마일스톤

마일스톤마다 구현 계획을 하나씩 쓰고 실행한다. 모든 마일스톤이 끝나는 시점에 다음이 통과해야 한다.

- 템플릿의 `uv run poe check`
- 저장소의 `pnpm check`와 CI
- 그때까지 구현한 기능의 적합성 흐름

| #   | 내용                                                                                                                                                                                                                         | 완료 조건                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| M1  | 계약 변경(§7), 룰셋 보강과 번들, 템플릿 골격(설정, 로그, DB, Valkey, compose, Dockerfile), JSON:API 공통 계층, 헬스체크, OpenAPI 내보내기와 계약 린트, 하네스(§8, 단 생성기·레시피·레시피 skill은 M3. FastAPI 공식 skill 사본은 M1), 저장소 연동(§11의 CI 중 `fastapi`, `conformance-fastapi`), 적합성 스위트의 틀(응답 검증 미들웨어, 부수 채널 어댑터). `test:e2e`는 프로세스를 띄워 헬스체크만 확인한다 | `verify-templates`가 fastapi를 통과. 적합성 스모크(헬스체크, `/api/v1` 아래 404의 에러 문서, 415/406)가 FastAPI에서 통과 |
| M2  | users, roles, permissions, 가입과 이메일 인증, 세션(로그인, 갱신, 재사용 감지, 로그아웃, 목록, 폐기), 비밀번호 재설정과 변경, `/me`와 탈퇴, 사용자 관리, 메일과 잡, audit-logs, 레이트 리밋                                  | 해당 적합성 흐름 통과                                                                                          |
| M3  | files(업로드, 완료 확인, 다운로드, 읽기 규칙, 정리 잡), posts(필터, 정렬, include, fields, 페이지, 캐시, 감사), `gen:module`, 레시피와 skill                                                                                  | 해당 적합성 흐름 통과. `gen:module`로 만든 모듈이 `check`를 통과                                               |
| M4  | realtime(티켓, Socket.IO, 구독, 이벤트), 소셜 로그인, OpenTelemetry, `test:e2e`, 구조 비교에서 `--subset` 떼기                                                                                                                | §1.2의 사이클 완료 조건                                                                                       |
| M5  | 보강: §12.1의 "나중" 18건([보강 설계](2026-09-29-fastapi-hardening-design.md))                                                                                                                                              | §1.2의 사이클 완료 조건과 보강 설계 §10의 적합성 흐름                                                          |

### 12.1 마일스톤 사이에 넘긴 일

M1~M5의 계획과 최종 리뷰가 남긴 일이다. 해당 마일스톤 계획에 넣는다.

- M2를 시작하기 전(NestJS가 따라 하기 전에 정한다). M2 계획의 Task 1~2에서 다음과 같이 정했다.
  - POST 본문의 `type` 불일치는 409 `resource.conflict`, 클라이언트가 만든 `id`는 403 `permission.denied`다(JSON:API 1.1 MUST). 계약의 모든 POST가 403과 409를 선언한다. 로그인 없이 부르는 POST에는 `CreateErrors`(403, 409)를, 로그인이 필요한 POST에는 `Conflict`를 더한다(같은 상태를 두 번 넣으면 응답 스키마가 `anyOf`로 겹친다).
  - 같은 절의 MUST인 "관계가 가리키는 리소스가 없으면 404"도 빠져 있어, 관계를 함께 보내는 요청 가운데 404가 없던 `POST /posts`와 `PATCH /me`에 404를 더했다.
  - 에러 문서의 루트 pointer는 RFC 6901대로 `""`다.
  - 에러 우선순위(전역 429 → 415·406 → 본문 JSON 400 → 인증 401·403 → 쿼리 400 → 본문과 경로 검증 → 엄격한 429 → 도메인 에러)와 페이지 링크의 인코딩을 `docs/conventions/jsonapi.md`에 적었다.
  - `filter[`로 시작하지만 `]`로 끝나지 않는 파라미터는 400이다. filter는 별칭(camelCase)으로만 받는다.
- M2. M2 계획에서 다음과 같이 했다.
  - 잡은 `app.core.jobs.Job`으로 선언하고 `create_broker`가 안정된 이름(`task_name`)으로 등록한다. api는 lifespan에서 자기 broker를 만들어 잡을 보낸다(Task 8).
  - `tests/e2e/test_jobs.py`가 Mailpit chaos로 첫 발송을 실패시키고 scheduler가 다시 보낸 메일을 받는다. scheduler는 10초마다 스케줄을 읽는다(Task 21).
  - `pre_bash`가 `LEFTHOOK=0`·`LEFTHOOK_EXCLUDE`·`core.hooksPath`·`lefthook uninstall`, 다른 PC의 `psql -h`·`--host`·`host=`·`PGHOST`, 셸로 `.env` 읽기, `-EncodedCommand`를 막고, `bash -c`·`pwsh -Command`·`cmd /c`·`eval`·`Invoke-Expression`에 넘긴 명령도 같은 규칙으로 본다(Task 20).
  - boto3 클라이언트는 연결 2초, 읽기 5초, 모두 두 번까지 시도한다(Task 20).
  - `Mailbox.latest`에 `after`(메일함의 시각)와 `linkPath`(메일 링크 경로) 조건을 두었다. 제목은 백엔드마다 문구가 달라 쓰지 않는다(Task 22).
  - 모듈 경계 검사가 조립 파일(`src/app/modules/registry.py`, `src/app/main.py`)도 본다(Task 8).
- M3. M3 계획에서 다음과 같이 했다.
  - 스토리지 presign을 SigV4로 해 크기와 타입을 서명에 넣었다. §13의 SeaweedFS 확인 결과다(Task 1).
  - `users/service.py`를 흐름별 패키지(`service/accounts.py`, `profile.py`, `management.py`)로 나눈 뒤 아바타를 넣었다(Task 4~5).
  - `PATCH /me`의 아바타는 `files.attachable_file`로 검사한다. 탈퇴 때 아바타를 풀고, 참조 확인(`files.add_reference_check`)이 남기라고 하지 않은 본인 파일을 지운다(Task 5~6).
  - `PermissionCode`는 정적 enum으로 두고 `test_registry.py`가 등록된 권한과 같은지 본다. `gen:module`이 enum에 코드를 더한다(Task 12, 15).
  - 앱 테스트는 등록된 모듈 목록(권한 수, 태그 목록)에 기대지 않는다(Task 13). 테스트·E2E DB가 없는 리비전(지운 초안)에 있으면 스키마를 비우고 다시 한다(Task 14).
  - 계약의 글 수정·삭제 설명을 줄였다. 골든 모듈의 문장이 가장 긴 모듈 이름(20자)으로 바뀌어도 한 줄(100자)에 들어가야 하기 때문이다(Task 15).
  - `gen:module`은 registry의 import를 `ast`로 읽는다. 마이그레이션 head는 프로젝트 설정(`[tool.alembic]`)으로 만든 Alembic `ScriptDirectory`로 읽는다. 계획 Task 15의 정규식 판은 감싼 import와 merge 리비전에서 깨진다(최종 리뷰).
  - `gen:module`은 이미 있는 테이블과 이름이 겹치는 모듈을 거절한다(최종 리뷰).
  - 공개 목록 캐시는 `include` 말고 다른 쿼리가 없는 요청만 캐시한다. 키는 검증을 마친 `include` 경로를 정렬한 값이다. 쿼리 문자열을 키로 쓰면 검증하지 않는 `fields` 값만 바꿔 키를 끝없이 만들 수 있다(§6.6, 최종 리뷰).
  - `migrate_disposable`은 이 PC에 있고 이름이 `_test`나 `_e2e`로 끝나는 DB만 비운다(최종 리뷰).
  - `PATCH /files/{id}`는 속성과 상관없이 소유자만 한다. 속성이 없는 PATCH도 소유자가 아니면 403이다(최종 리뷰).
- M4. M4 계획에서 다음과 같이 했다.
  - 계약의 `SessionTokens`를 alias로 바꿔 스키마 이름이 따로 생기지 않게 했다. `OAuth_authorize` 설명은 세 제공자 모두 PKCE다.
  - 구글 이메일은 `email_verified`가 참이고 `gmail.com` 주소이거나 `hd`(구글 워크스페이스)가 있어야 검증된 것으로 본다(§14, 구글 가이드). 그 밖의 주소는 구글이 보증하지 않아 메일함 주인이 바뀐 뒤에도 `email_verified`가 참으로 남을 수 있다. 카카오는 그대로 `is_email_valid`와 `is_email_verified`가 모두 필요하고, 네이버는 항상 미검증이다.
  - 소셜 로그인은 BFF가 쥔 PKCE 쌍에 묶는다(로그인 CSRF 방지, RFC 6749 §10.12). BFF가 로그인 시도마다 code verifier를 만들어 시작한 브라우저에 연결해 두고(예: httpOnly 쿠키), `authorize`에 `codeChallenge`(verifier의 S256, base64url 43자)를 필수로 보낸다. 백엔드는 이 challenge를 state(10분), 1회용 코드(60초)와 함께 둔다. BFF는 `POST /sessions`의 `oauthCode` grant에 `codeVerifier`를 함께 보내고, 일치하지 않으면 `auth.oauth_code_invalid`이며 코드는 그걸로 소비된다. BFF는 자기가 verifier를 쥐지 않은 프론트 콜백 `code`를 거부해야 한다(그러지 않으면 공격자가 완성된 콜백 URL을 피해자에게 넘길 수 있다). 백엔드는 여전히 쿠키를 모른다(기반 설계: `Authorization: Bearer`만 안다).
  - 실시간 서버는 api 앱이 `/socket.io`에 붙인다(lifespan에서 만든다). 모듈은 이벤트를 트랜잭션에 넣고(`queue`) 세션이 commit한 뒤에 보낸다. 훅 안(계정 닫기)에서 넣은 이벤트도 부른 쪽의 commit 뒤에 나간다. pub/sub 채널 이름에 Valkey DB 번호를 넣어 개발·테스트·E2E를 나눈다.
  - 골든 모듈 posts에 실시간 이벤트(`events.py`)가 있고, `gen:module`이 이벤트와 채널 이름을 바꾸고 등록부의 `CHANNELS`, `EVENTS`에 더한다. 레시피 "실시간 이벤트 추가"와 그 skill을 더했다.
  - `session.revoked`와 `me.updated`를 보낸다. 역할의 권한이 바뀌거나 역할이 지워지면 roles가 멤버를 훅(`roles.on_members_changed`)으로 넘기고 users가 보낸다.
  - `RedirectOperation`이 JSON:API 밖의 쿼리 파라미터(`redirectUri`, `state`, `code`, `error`)를 선언하고, 콜백 모드는 제공자가 덧붙이는 파라미터를 받아들인다. 3xx 응답에는 본문 스키마를 두지 않는다.
  - 구조 비교에서 `--subset`을 떼고, 실시간 선언(`x-realtime-*`)도 계약과 같은지 본다.
  - python-socketio에는 타입 정보가 없어 쓰는 API만 담은 스텁(`typings/socketio/`)을 두었다.
  - `gen:module`의 테이블 검사는 소스를 바이트로 읽는다(BOM이 있는 파일, M3 최종 재리뷰).
  - 채널 구독의 권한은 구독할 때 본다. 구독한 뒤 권한을 잃거나 계정이 닫혀도 그 연결은 끊기거나 구독을 풀 때까지 받는다. 클라이언트는 `me.updated`(`roles`, `status`)나 `session.revoked`를 받으면 새 티켓으로 다시 붙는다(§1.3, §6.8, 최종 리뷰). M5에서 서버가 그런 연결을 끊게 바꿨다(연결 재검사).
  - 역할 이름을 이미 있는 이름으로 바꾸면서 권한도 바꾸는 요청은 422 `validation.already_taken`이다. 멤버 알림은 이름 검사가 끝난 뒤에 한다(최종 리뷰).
  - 토큰의 해시는 짝이 없는 서로게이트도 인코딩한다(`surrogatepass`). 그런 토큰은 500이 아니라 각 grant의 401이다(최종 리뷰).
  - `codeVerifier`는 RFC 7636 모양(`[A-Za-z0-9._~-]` 43~128자)이어야 한다. 제공자의 에러는 `access_denied`만 `auth.oauth_denied`이고, 나머지는 `auth.oauth_failed`다(최종 리뷰).
  - OpenTelemetry는 헬스 체크 요청과 ASGI send·receive를 span으로 만들지 않는다. 쓰기 전용 발행기와 소켓 테스트 도우미는 쓴 연결을 닫는다(최종 리뷰).
- M5(보강). [보강 설계](2026-09-29-fastapi-hardening-design.md)가 M2~M4의 최종 리뷰가 남긴 "나중" 목록(M2 7건, M3 4건, M4 7건)을 모두 처리했다. 결정은 그 문서의 §2(H1~H18)에 있다.
  - M2: 탈퇴 재인증(H1), 비밀번호 변경 리밋(H2)과 재설정 토큰 삭제(H3), 식별자 해시 HMAC(H4), 자격 증명 URL의 `SecretStr`(H5), 운영의 예시 비밀 거부(H6), id만 싣는 메일 잡(H7)
  - M3: 요청 본문 한도와 글 본문 길이(H8), 사용자별 파일 한도(H9), 관계에서 풀린 파일 정리(H10), 캐시 세대와 모양(H11)
  - M4: 연결 재검사(H12), 발행 취소 이벤트(H13), `codeChallenge` pattern(H14), 구조 비교의 키 순서(H15), 구글 `hd` 적합성 흐름(H16), 매니저의 Valkey 클라이언트(H17), 준비 검사의 span(H18)
  - compose의 app 프로필은 운영 모드라 예시 비밀을 쓰지 못한다. 시드 관리자는 개발 관리자와 다른 이메일(`compose-admin@example.com`)과 비밀번호를 쓴다. 적합성 스택이 개발 DB를 함께 쓰는데 시드는 없는 계정만 만들기 때문이다.
  - 계획과 다르게 한 것(태스크 리뷰): 매니저의 Valkey 클라이언트는 교체된 것을 모아 두었다가 닫지 않고 하나를 다시 쓴다(모아 두면 Valkey 장애 동안 끝없이 쌓인다). 연결 재검사는 도중에 닫힌 연결을 건너뛰고 나머지 연결을 이어서 본다. 요청 본문 한도(1 MiB)는 글 본문 100,000자를 UTF-8이나 BMP 문자의 유니코드 이스케이프로는 담지만, 4바이트 문자를 모두 이스케이프 쌍으로 보내면 넘을 수 있다(그때는 413).

## 13. 계획 단계에서 확인할 것

각 항목은 해당 마일스톤 계획의 첫 스파이크로 확인하고, 결과에 따라 계획을 쓴다.

| 항목                                                                                                                                            | 마일스톤 | 안 되면                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `@redocly/openapi-core`와 플러그인을 esbuild 한 파일로 번들해 `nodejs-wheel-binaries`의 Node로 실행할 수 있는가                                  | M1       | 룰셋 소스를 사본으로 넣고 Node 휠의 npm으로 설치한다                                      |
| FastAPI가 내보낸 스펙이 계약의 스키마 이름, operationId, 브래킷 쿼리 파라미터, `x-` 확장을 재현하고 룰셋을 통과하는가(작은 리소스 하나로)        | M1       | 스키마 이름을 OpenAPI 후처리로 맞추는 방식을 검토한다                                     |
| basedpyright strict가 FastAPI, Pydantic, SQLAlchemy 2.0 typed ORM과 억제 주석 없이 맞는가. 필요한 규칙 조정                                      | M1       | 규칙별로 끄고 사유를 설정 파일에 적는다                                                   |
| Claude Code hook 출력 형식(PostToolUse 피드백, Stop 차단, PreToolUse 거부, SessionStart 컨텍스트)                                                | M1       | 공식 레퍼런스대로 맞춘다                                                                  |
| `uvx library-skills --claude --copy`의 설치 위치와, 복사본 최신 여부를 검사하는 방법                                                             | M1       | skill 복사본을 커밋하지 않고 `setup`에서만 설치한다                                       |
| SeaweedFS(`weed mini`)에서 서명된 `Content-Length`와 다른 크기의 PUT이 거부되는가. S3 API로 한 CORS 설정이 동작하는가                            | M3       | 크기는 완료 확인의 HEAD 검사로만 막고, 그 사실을 문서에 적는다                            |
| taskiq-redis의 broker 종류와 `SmartRetryMiddleware`가 Valkey에서 동작하는가                                                                     | M1       | 다른 broker 종류를 고른다                                                                 |
| 모의 OAuth 서버가 발급자 셋을 한 컨테이너에서 띄우고, 카카오(`kakao_account`)와 네이버(`response`)의 중첩 신원 응답을 흉내 낼 수 있는가          | M4       | 적합성은 구글로만 돌리고, 두 제공자는 단위 테스트로 확인한다                              |
| 네이버의 PKCE 지원 여부                                                                                                                         | M4       | 지원하지 않는 것으로 두고 state만 쓴다                                                    |
| python-socketio `ASGIApp`과 FastAPI lifespan, 쓰기 전용 매니저의 동작                                                                           | M4       | lifespan 연결 방식을 조정한다                                                             |

## 14. 확인한 사실과 출처 (2026-09-26)

| 사실                                                                                                                             | 출처                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Python 3.14.7이 최신 패치다. uvloop는 Windows 휠이 없다                                                                          | https://www.python.org/downloads/release/python-3147/ , https://pypi.org/pypi/uvloop/0.22.1/json                                                             |
| uv 0.12.19가 최신이고, 내장 태스크 실행기는 없다                                                                                 | https://github.com/astral-sh/uv/releases , https://github.com/astral-sh/uv/issues/5903                                                                       |
| poethepoet 0.48.0. `test:e2e`, `db:migrate` 같은 콜론 태스크 이름이 Windows에서 동작함을 직접 확인했다. just와 Make는 콜론 이름을 쓸 수 없다 | https://pypi.org/project/poethepoet/ , https://raw.githubusercontent.com/casey/just/master/GRAMMAR.md                                                         |
| FastAPI 0.141.1. 공식 에이전트 skill이 패키지 안에 있고 `uvx library-skills`로 설치한다(`--claude`, `--copy`)                     | https://pypi.org/project/fastapi/ , https://github.com/fastapi/fastapi/blob/master/fastapi/.agents/skills/fastapi/SKILL.md , https://github.com/tiangolo/library-skills |
| Pydantic 2.13.5, pydantic-settings 2.15.0                                                                                        | https://pypi.org/project/pydantic/ , https://pypi.org/project/pydantic-settings/                                                                             |
| SQLAlchemy 2.1.0이 2026-09-24에 나왔고(다음 날 2.1.1), 2.0.54가 2.0 계열 최신이다. Alembic 1.20.0                                  | https://www.sqlalchemy.org/blog/2026/09/24/sqlalchemy-2.1.0-released/ , https://www.sqlalchemy.org/blog/2026/09/15/sqlalchemy-2.0.54-released/ , https://pypi.org/project/alembic/1.20.0/ |
| psycopg 3.3.6은 활발하고, asyncpg 0.31.0은 유지보수 여력 문제가 열려 있다                                                         | https://www.psycopg.org/psycopg3/docs/news.html , https://github.com/MagicStack/asyncpg/issues/1355                                                          |
| basedpyright 1.40.1(PyPI, `nodejs-wheel-binaries` 의존), pyright 1.1.414, pyrefly 1.3.1, ty는 beta다                              | https://pypi.org/project/basedpyright/ , https://pypi.org/project/pyrefly/ , https://pypi.org/project/ty/                                                    |
| Ruff 0.16.9, import-linter 2.15(layers, independence 계약)                                                                       | https://pypi.org/project/ruff/ , https://import-linter.readthedocs.io/en/latest/contract_types/layers/                                                       |
| pytest 9.1.1. FastAPI 문서의 비동기 테스트는 anyio 플러그인을 쓴다                                                                | https://pypi.org/project/pytest/ , https://fastapi.tiangolo.com/advanced/async-tests/                                                                        |
| FastAPI 문서는 pwdlib(Argon2)와 PyJWT를 쓴다. passlib과 python-jose는 오래 릴리스가 없다                                          | https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/ , https://pypi.org/project/passlib/ , https://pypi.org/project/python-jose/                        |
| structlog 26.1.0, OpenTelemetry SDK 1.45.0, 계측 패키지 0.66b0(beta)                                                             | https://pypi.org/project/structlog/ , https://pypi.org/project/opentelemetry-sdk/#history , https://pypi.org/project/opentelemetry-instrumentation-fastapi/#history |
| lefthook 2.1.14가 PyPI에 플랫폼 휠로 있다(evilmartians/lefthook). `nodejs-wheel-binaries` 24.19.0이 Windows·macOS·Linux 휠로 있다  | https://pypi.org/project/lefthook/ , https://lefthook.dev/installation/python/ , https://github.com/njzjz/nodejs-wheel                                        |
| Betterleaks는 바이너리로만 배포된다                                                                                              | https://github.com/betterleaks/betterleaks                                                                                                                   |
| Taskiq 0.12.6: FastAPI 연동, OpenTelemetry, `SmartRetryMiddleware`. scheduler는 한 인스턴스만 띄우라고 문서가 경고한다. ARQ는 유지보수만 한다 | https://pypi.org/project/taskiq/ , https://pypi.org/project/taskiq-fastapi/ , https://github.com/orgs/taskiq-python/discussions/294 , https://github.com/python-arq/arq/issues/510 |
| python-socketio 5.17.0: `ASGIApp`, WebSocket 전용 전송, `AsyncRedisManager`와 쓰기 전용 모드. OpenTelemetry 계측은 없다           | https://github.com/miguelgrinberg/python-socketio/releases                                                                                                   |
| redis-py 8.1.0. Redis 8.10은 RSALv2·SSPLv1·AGPLv3 삼중 라이선스, Valkey 9.1.2는 BSD-3-Clause                                      | https://github.com/redis/redis-py , https://hub.docker.com/_/redis , https://github.com/valkey-io/valkey                                                     |
| slowapi와 fastapi-cache2는 오래 갱신되지 않았다                                                                                  | https://pypi.org/project/slowapi/ , https://pypi.org/project/fastapi-cache2/                                                                                 |
| aiosmtplib 5.1.3, Mailpit 1.31.2와 메시지 조회·삭제 API                                                                          | https://pypi.org/pypi/aiosmtplib/json , https://hub.docker.com/r/axllent/mailpit                                                                             |
| MinIO 저장소는 보관 처리됐다. SeaweedFS 4.47(Apache-2.0, `weed mini`, S3 CORS·POST 정책·체크섬 처리), RustFS 1.0.0, Garage(AGPLv3) | https://github.com/minio/minio , https://github.com/seaweedfs/seaweedfs/releases/tag/4.47 , https://github.com/seaweedfs/seaweedfs/blob/master/weed/s3api/s3api_bucket_cors_handlers.go , https://github.com/rustfs/rustfs/releases/tag/1.0.0 |
| boto3·botocore 1.43.103. aioboto3는 2025년 10월 이후 릴리스가 없다                                                                | https://pypi.org/project/boto3/ , https://pypi.org/project/aioboto3/                                                                                         |
| navikt/mock-oauth2-server 6.0.3: 다중 발급자, PKCE, 발급자별 클레임                                                              | https://github.com/navikt/mock-oauth2-server/releases , https://github.com/navikt/mock-oauth2-server/pull/130                                                |
| 구글은 OIDC와 PKCE, `email_verified`를 제공한다                                                                                  | https://accounts.google.com/.well-known/openid-configuration , https://developers.google.com/identity/openid-connect/openid-connect                          |
| 카카오는 `is_email_valid`와 `is_email_verified`를 제공하며, 이메일이 없을 수 있다. PKCE 지원은 아래 (M4) 줄을 본다          | https://developers.kakao.com/docs/latest/en/kakaologin/rest-api                                                                                              |
| 네이버 프로필 응답에는 이메일 검증 플래그가 없다                                                                                 | https://github.com/naver/naver-openapi-guide/blob/master/ko/apilist.md                                                                                       |
| httpx-oauth 0.17.0은 구글·카카오·네이버 클라이언트와 PKCE 매개변수를 제공한다                                                    | https://github.com/frankie567/httpx-oauth/releases/tag/v0.17.0 , https://github.com/frankie567/httpx-oauth/blob/master/httpx_oauth/oauth2.py                 |
| (M2) structlog의 rich 예외 출력이 Python 3.14.7(Windows)에서 접근 위반으로 프로세스를 죽인다. 로그와 테스트는 `structlog.dev.plain_traceback`을 쓴다 | 직접 확인(rich `pretty.py`의 `_traverse`)                                                                                                                  |
| (M2) taskiq-redis 1.2.3의 `ListRedisScheduleSource`는 스케줄을 읽을 때마다 지난 분의 예약을 SCAN으로 다시 찾는다. 키 접두사에 콜론이 있으면 지난 분을 찾지 못한다 | `taskiq_redis/list_schedule_source.py`(`get_schedules`, `_parse_time_key`)                                                                                  |
| (M2) Mailpit 1.31.2는 `MP_ENABLE_CHAOS=true`로 띄우면 `PUT /api/v1/chaos`로 SMTP 발신을 일부러 거절한다(`{}`는 되돌린다)          | 직접 확인(E2E)                                                                                                                                              |
| (M3) SeaweedFS 4.47(`weed mini`)에서 boto3의 기본 presign은 SigV2 쿼리 서명이라 `Content-Length`가 서명에 들어가지 않는다(크기가 달라도 PUT이 성공한다). `signature_version="s3v4"`면 `content-length;content-type;host`를 서명하고, 크기나 타입이 다른 PUT은 403이다. S3 API로 건 CORS는 프론트 출처의 preflight를 허용하고 다른 출처는 거절한다 | 직접 확인(스파이크, `src/app/core/tests/test_storage.py`) |
| (M4) 구글·카카오·네이버의 OIDC discovery가 모두 `code_challenge_methods_supported`에 S256을 알린다. 네이버의 PKCE는 OIDC 경로(`/oauth2/authorize`, `/oauth2/token`, scope `openid` 필수)에 있다 | https://accounts.google.com/.well-known/openid-configuration , https://kauth.kakao.com/.well-known/openid-configuration , https://nid.naver.com/.well-known/openid-configuration , https://developers.naver.com/docs/login/devguide/devguide.md (3.5) |
| (M4) 구글의 ID 토큰 검증 가이드는 `email_verified`만으로는 이메일 소유를 보증하지 않는다고 안내한다. `hd`(구글 워크스페이스)가 있거나 주소가 `gmail.com`이어야 신뢰할 수 있다 | https://developers.google.com/identity/gsi/web/guides/verify-google-id-token |
| (M4) httpx-oauth 0.17.0의 카카오·네이버 클라이언트는 주소를 모듈 상수로 고정하고 프로필을 POST로 읽는다. 일반 `OAuth2` 클라이언트는 주소를 받고 PKCE 매개변수를 넘긴다 | `httpx_oauth/clients/kakao.py`, `naver.py`, `oauth2.py` |
| (M4) mock-oauth2-server 6.0.3은 경로로 발급자를 정하고(설정 없이 `/google`, `/kakao`, `/naver`), 인가 주소의 로그인 폼(username, claims)을 받으면 claims를 토큰과 userinfo에 그대로 담는다(중첩 객체도). userinfo는 GET만 받는다. scope에 openid가 없으면 거절한다. 비ASCII 클레임 값은 깨진다. 거부(access_denied)는 만들지 못한다 | 직접 확인(스파이크, `src/app/modules/auth/tests/test_providers.py`) |
| (M4) python-engineio 4.14.0의 `ASGIApp`은 `on_startup`·`on_shutdown`이 없으면 lifespan을 감싼 앱에 넘긴다. python-socketio 5.17.0의 pub/sub 매니저는 이 인스턴스의 연결에 먼저 보내고 Valkey로 다른 인스턴스에 알린다. 수신 태스크는 `shutdown()`으로 멈추지 않는다. 클라이언트의 `sid`는 engine.io의 id이고 서버가 부르는 id는 `get_sid()`다. `ConnectionRefusedError(message, data)`가 `connect_error`의 message와 data가 된다 | `engineio/async_drivers/asgi.py`, `socketio/async_pubsub_manager.py`, `socketio/exceptions.py`, 직접 확인(`src/app/core/tests/test_realtime.py`) |
| (M4) taskiq 0.12.6은 `taskiq[opentelemetry]`로 `OpenTelemetryMiddleware`를 준다. opentelemetry-instrumentation-sqlalchemy 0.66b0에는 타입 정보가 없다 | `taskiq/middlewares/opentelemetry_middleware.py`, 직접 확인(basedpyright) |
| (M4) Ruff는 원소가 하나인 튜플을 끝 쉼표가 있어도 한 줄로 접는다(magic trailing comma가 아니다). 원소 위에 주석을 두면 여러 줄로 남는다 | 직접 확인(`src/app/modules/registry.py`의 `CHANNELS`) |
