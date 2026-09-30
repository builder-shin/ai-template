# FastAPI·계약 보정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** web 설계 §12.1에 모은 FastAPI·계약 문제 12건(W1에서 찾은 11건과, 그것을 조사하다 찾은 `users/service/management.py`의 detail 하나)을 `templates/fastapi`와 계약에서 고친다. 목(`contract/mock`)이 따라 하던 동작은 같은 태스크에서 함께 고쳐, 두 백엔드가 계속 같게 동작한다. 구조 비교(`pnpm spec-compare`)는 operation마다 응답 상태 집합을 비교해, 계약과 FastAPI 선언 가운데 한쪽만 고친 상태를 잡는다.

그리고 다음을 통과시킨다.

- `pnpm conformance fastapi`와 `pnpm conformance mock`: 적합성 흐름 14개 파일. 새 흐름으로 테스트가 84개에서 94개가 된다
- 템플릿의 `uv run poe check`와 `uv run poe test:e2e`
- 저장소 `pnpm check`
- 계약과의 구조 비교(`--subset` 없이)

**Architecture:**
- 저장소 도구(Task 1): 구조 비교가 operation마다 응답 상태 집합을 두 방향으로 비교한다. 계약과 FastAPI 선언 가운데 한쪽만 고치면 실패한다.
- 계약 선언(Task 2): `DELETE /me`의 422와 소셜 로그인 리다이렉트의 406을 계약과 FastAPI 선언에 함께 더하고, `PostStatus`와 글 이벤트 문서 셋에 제 설명을 단다. `pnpm gen`과 `uv run poe gen`이 생성물을 다시 만든다.
- 요청 검증과 응답(Task 3~4)
  - 판별 유니온(`SessionGrant`)의 필드 오류는 본문의 실제 위치를 가리키고, 정수(`Int32`, `Int64`)는 strict다.
  - 짝 없는 서로게이트는 500이 아니다. 비밀번호는 surrogatepass로 인코딩하고, 응답은 `\uXXXX`로 이스케이프하고, 역할 설명은 422로 거절한다.
- 인증과 권한(Task 5~7)
  - 모든 401이 `WWW-Authenticate`를 담는다.
  - attributes가 없는 역할 PATCH도 고치기 전 권한을 본다.
  - 만료된 세션은 끝난 세션이다(폐기 수, 인증기, 연결 재검사). 여러 세션을 폐기하는 요청은 폐기한 세션이 없어도 재검사한다.
- 실시간(Task 8): `REALTIME_ALLOWED_ORIGINS`를 브라우저 Origin으로 정규화하고, 페이로드가 하나가 아닌 `subscribe`·`unsubscribe`에 422 ack로 답한다.
- 문서(Task 9): FastAPI·보강·web 설계, JSON:API 규약, 템플릿 문서와 레시피, 목의 "FastAPI와 다른 점"에 보정을 기록한다.

**Tech Stack:** M5와 W1의 스택을 그대로 쓴다. 새 의존성은 없다. FastAPI 템플릿은 Python 3.14, uv 0.12, FastAPI 0.141.1(Starlette 1.7.0), Pydantic 2.13.5, SQLAlchemy 2.0.54, psycopg 3.3.6, pwdlib 0.3.1(argon2-cffi 25.1.0), python-socketio 5.17.0(python-engineio 4.14.0), basedpyright 1.40.1, Ruff 0.16.9, pytest 9.1.1이다. 목과 저장소 도구는 Node 24, pnpm 12.6.0, TypeScript 6.0.3, tsx 4.23.15, Vitest 5.0.1, Hono 4.13.11, Ajv 8.20.0, socket.io와 socket.io-client 4.8.4, openapi-fetch 0.17.0, openapi-typescript 7.13.0, TypeSpec 1.16.0, oasdiff 1.32.1, ESLint 10.11.0, Prettier 3.9.9다.

**Spec:** `docs/superpowers/specs/2026-09-30-nextjs-web-design.md`의 §12.1(W1에서 찾은 FastAPI·계약 문제) (동작 기준: `docs/superpowers/specs/2026-09-26-fastapi-template-design.md`와 `docs/superpowers/specs/2026-09-29-fastapi-hardening-design.md`, 앞 계획: `docs/superpowers/plans/2026-09-29-fastapi-m5.md`, `docs/superpowers/plans/2026-09-30-nextjs-w1.md`). 고치는 방법은 문제마다 조사한 뒤 대화에서 승인했고, 아래 "이 계획에서 정한 것"에 적었다.

## Global Constraints

M5 계획의 FastAPI 규칙과 W1 계획의 목 규칙이 그대로 적용된다. 이 계획에 걸리는 것을 다시 적는다.

저장소 전역

- 버전은 정확히 고정한다. 이 계획은 의존성을 더하지 않는다(`pnpm-lock.yaml`과 `uv.lock`은 그대로다).
- 생성물은 직접 고치지 않는다. `contract/openapi.yaml`, `contract/conformance/src/generated/api.ts`, `contract/mock/src/generated/api.ts`는 저장소 루트의 `pnpm gen`으로, `templates/fastapi/openapi.json`은 템플릿의 `uv run poe gen`으로 만든다. 계약을 고치는 태스크(Task 2)는 그 태스크 안에서 둘 다 돌린다.
- 파일 크기는 소스 400줄, 테스트 600줄 이하다.
- 문서와 주석은 한국어, 식별자는 영어로 쓴다. 커밋 메시지에 AI 태그를 넣지 않고 `--no-verify`를 쓰지 않는다(커밋 전 hook이 포맷, 린트, 비밀 스캔을 돈다).
- 억제 주석에는 사유를 단다(basedpyright는 `# 사유:` 줄, TypeScript는 10자 이상의 설명). 이 계획의 코드에는 억제 주석이 없다.
- 테스트의 가짜 비밀은 줄 끝에 `betterleaks:allow` 주석을 단다. betterleaks는 비밀번호 자리의 짧은 값(`"secret"`, `"\ud800"`)도 잡는다.
- Prettier는 저장소 루트에서 돌린다(`pnpm fix`). 저장소 `pnpm check`와 템플릿 `uv run poe check`는 각각 9단계다.
- 코드 블록의 유니코드 이스케이프(`\ud800`, `\udfff`, `\u2028`, `\ufffd`)는 글자로 바꾸지 않고 그대로 옮긴다. 프로토타입에서 파일 쓰기 도구가 이스케이프를 실제 글자로 바꾼 일이 있었다(`test_media.py`, `test_security.py`).

이 계획에서 더하는 것

- 계약과 FastAPI 선언은 operation마다 같은 응답 상태를 선언한다. Task 1부터 구조 비교가 이것을 본다. 구조 비교(`pnpm spec-compare contract/openapi.yaml templates/fastapi/openapi.json`)는 모든 태스크에서 `--subset` 없이 통과한다.
- 계약과 FastAPI 선언에 같은 operation 설명과 스키마 설명(docstring)을 둔다. 구조 비교는 설명을 보지 않으므로 눈으로 맞춘다.
- FastAPI와 목은 같은 태스크에서 함께 바꾼다. 목이 따라 하던 FastAPI 동작을 고치면 목도 고치고, 옛 동작을 고정하던 목 테스트를 뒤집는다. 남는 차이는 그 커밋에서 목 `AGENTS.md`의 "FastAPI와 다른 점"과 파일 머리 주석에 적는다.
- 새 적합성 흐름은 두 대상(`pnpm conformance fastapi`, `pnpm conformance mock`)에서 모두 통과한다. 고치기 전의 FastAPI에서는 실패해야 한다(목이 이미 맞던 동작은 목에서 처음부터 통과한다). 기존 흐름도 모두 통과한다.
- `pnpm conformance fastapi`는 템플릿의 개발 인프라와 같은 compose 프로젝트를 쓴다. 개발 DB에 마이그레이션과 시드를 하고, 끝나면 개발 인프라도 내린다. 다음 명령 전에 다시 띄운다(사전 준비).
- 흐름은 테스트마다 새 계정을 쓰고 다른 흐름 파일과 병렬로 돈다. 시드 관리자의 상태와 역할은 바꾸지 않는다.

템플릿(`templates/fastapi`)

- 템플릿은 자기 폴더 밖을 참조하지 않는다.
- basedpyright strict, 계층 방향, 모듈 경계를 지킨다. 모듈 사이의 등록은 `registry.py` 한 곳에서 한다. 모듈 경계 검사는 테스트에도 걸린다.
- 에러 우선순위, 인프라 포트, Windows 셀렉터 루프 규칙을 따른다.
- 한글은 E501에서 두 칸으로 센다. 골든 모듈(posts)의 문자열, 주석, docstring은 `gen:module`이 가장 긴 이름(20자)으로 바꿔도 한 줄 100칸 안이어야 한다(`tools/tests/test_genmodule.py`).
- 실시간 이벤트(`queue`)와 연결 재검사(`queue_recheck`)는 commit한 뒤에 나간다.
- 설정의 규칙을 바꾸면 `.env.example`의 주석도 고친다.
- python-socketio에서 새 API를 쓰면 스텁(`typings/socketio/`)에 더한다. 이 계획은 새 API를 쓰지 않는다.
- 문서 모델의 정수는 `int`가 아니라 `Int32`·`Int64`(strict)로 쓴다(Task 3부터). DB에 저장하는 문자열에는 길이 제약을 둔다(Task 9의 레시피 규칙).

목(`contract/mock`)

- 목은 web 템플릿에 사본으로 들어간다. 소스는 자기 패키지 밖을 import하지 않는다(예외는 런타임에 읽는 `contract/openapi.yaml`).
- FastAPI 템플릿과 똑같이 동작한다. 기준은 FastAPI의 코드다. 파일 첫 주석과 함수 주석에 대응하는 FastAPI 파일과 함수를 적는다(예: `errorResponse`는 `error_response`의 짝).
- 요청은 계약으로 검증하고, 계약으로 적을 수 없는 FastAPI 동작만 코드에 둔다. 에러는 `ApiError`와 계약의 `ErrorCode`만, 타입은 생성 타입만 쓴다.
- 시각은 `state.clock`으로 얻는다. 트랜잭션 없이 검사를 모두 마친 뒤 바꾼다.
- 단위 테스트는 실제 목을 쓴다(`app.request`, 실시간은 127.0.0.1의 임시 포트에 띄운 서버와 socket.io-client). 목의 부품을 모킹하지 않는다. 기대값은 FastAPI가 같은 요청에 내는 응답이고, FastAPI 테스트가 다루는 경우는 같은 입력을 쓴다.

## 사전 준비

- M5와 W1의 사전 준비를 그대로 따른다: git, Node 24 이상과 pnpm 12, uv 0.12, Docker와 Compose v2. 저장소 루트에서 `pnpm install`을 마친 상태다.
- 템플릿 폴더(`templates/fastapi`)에서 `uv run poe setup`으로 개발 인프라를 띄우고 `.env`를 채운다. 템플릿 `uv run poe check`의 테스트 단계와 `uv run poe test:e2e`는 이 인프라가 떠 있어야 돈다.
- 개발 인프라의 호스트 포트가 비어 있어야 한다: 25432(PostgreSQL), 26379(Valkey), 28333(SeaweedFS), 21025·28025(Mailpit), 28080(모의 OAuth 서버). 다른 compose 프로젝트가 이 포트를 잡고 있으면 먼저 내린다. 적합성과 E2E는 8000(적합성 스택의 api), 18000(E2E의 api), 4010(목)도 쓴다.
- compose 프로젝트 이름은 `templates/fastapi/.env`의 `COMPOSE_PROJECT_NAME`이 정한다(없으면 폴더 이름 `fastapi`). `uv run poe setup`, 템플릿 폴더의 `docker compose`, `pnpm conformance fastapi`가 모두 이 프로젝트를 쓴다. 지켜야 할 개발 데이터가 있으면 이 값으로 다른 프로젝트를 쓴다.
- `pnpm conformance fastapi`는 끝날 때 개발 인프라도 내린다. 다음 명령 전에 템플릿 폴더에서 `docker compose up -d --wait`로 다시 띄운다.
- 템플릿 `uv run poe check`는 입력이 그대로인 단계를 건너뛴다(`건너뜀`에 적힌다). 모든 단계를 다시 돌리려면 `templates/fastapi/.cache/check`(git이 무시하는 폴더)를 지운다.
- 작업 브랜치는 `fix/fastapi-contract`다(main에서 딴다). web 설계 §12.1과 목(W1)은 main에 있다.

## 파일 구조

```
ai-template/
├── AGENTS.md                               # Task 1: pnpm spec-compare 설명
├── scripts/src/spec-compare/               # Task 1: compare.ts(응답 상태 비교). Task 9: 머리 주석(compare.ts, cli.ts)
├── docs/                                   # Task 9: conventions/jsonapi.md, specs/(FastAPI·보강·web 설계)
├── contract/
│   ├── typespec/src/                       # Task 2: users.tsp(422), auth.tsp(406), posts.tsp·realtime.tsp(설명)
│   ├── typespec/test/                      # Task 2: 선언과 설명의 계약 테스트
│   ├── openapi.yaml                        # Task 2: pnpm gen의 생성물
│   ├── conformance/
│   │   ├── src/generated/api.ts            # Task 2: pnpm gen의 생성물
│   │   └── test/flows/                     # Task 2~6, 8: 흐름과 support.ts(LONE_SURROGATE), sockets.ts(ack)
│   └── mock/
│       ├── AGENTS.md                       # Task 3, 4, 8, 9: FastAPI와 다른 점
│       ├── src/generated/api.ts            # Task 2: pnpm gen의 생성물
│       ├── src/jsonapi/                    # Task 3: 정수 문구와 주석. Task 4: surrogates.ts. Task 5: errors.ts
│       ├── src/modules/                    # Task 6: roles. Task 7: auth, realtime/gateway.ts. Task 8: realtime/gateway.ts
│       ├── src/config.ts                   # Task 8: 주석만
│       └── test/                           # Task 3~8
└── templates/fastapi/
    ├── openapi.json                        # Task 2: uv run poe gen의 생성물
    ├── .env.example                        # Task 8, 9: REALTIME_ALLOWED_ORIGINS 주석
    ├── AGENTS.md, docs/                    # Task 9: architecture.md, recipes/endpoint.md·module.md
    └── src/app/
        ├── core/AGENTS.md                  # Task 9
        ├── core/config.py                  # Task 8: Origins
        ├── core/security.py                # Task 4: surrogatepass
        ├── core/jsonapi/                   # Task 2: operation.py. Task 3: errors.py, models.py. Task 4: media.py. Task 5: errors.py
        ├── tests/sockets.py                # Task 8: docstring
        └── modules/
            ├── auth/                       # Task 7: repository.py, events.py, service/. Task 3~5, 7: 테스트
            ├── users/                      # Task 2: router.py(DELETE_ME). Task 2, 4: 테스트
            ├── posts/                      # Task 2: models.py, schemas.py(설명)
            ├── roles/                      # Task 4: schemas.py. Task 6: router.py, service.py
            ├── files/tests/                # Task 3: 정수 size
            └── realtime/                   # Task 7: gateway.py(docstring). Task 8: gateway.py
```

## 태스크 개요

| #   | 태스크                                                                   | 주로 바꾸는 곳                                                                      |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1   | 구조 비교: operation마다 응답 상태 집합을 비교한다                       | `scripts/src/spec-compare/compare.ts`                                               |
| 2   | 계약: `DELETE /me`의 422, 리다이렉트의 406, 글 상태와 이벤트 문서의 설명 | 계약 `users.tsp`·`auth.tsp`·`posts.tsp`·`realtime.tsp`, FastAPI 선언, 생성물        |
| 3   | grant 필드 오류의 pointer와 strict 정수                                  | `core/jsonapi/errors.py`·`models.py`, 목 `pydantic-messages.ts`                     |
| 4   | 짝 없는 서로게이트를 500 없이 다룬다                                     | `core/security.py`, `core/jsonapi/media.py`, roles `schemas.py`, 목 `surrogates.ts` |
| 5   | 모든 401에 Bearer challenge를 담는다                                     | `core/jsonapi/errors.py`, 목 `jsonapi/errors.ts`                                    |
| 6   | attributes 없는 역할 PATCH도 고치기 전 권한을 본다                       | roles `router.py`, 목 `roles/routes.ts`                                             |
| 7   | 만료된 세션은 끝난 세션이다                                              | auth `repository.py`·`events.py`·`service/`, 목 `modules/auth/`                     |
| 8   | 실시간: Origin 정규화와 페이로드 개수                                    | `core/config.py`, realtime `gateway.py`, 목 `realtime/gateway.ts`                   |
| 9   | 보정을 설계, 규약, 템플릿 문서에 기록한다                                | `docs/`, 템플릿 문서, 목 `AGENTS.md`                                                |

## 이 계획에서 정한 것

문제마다 조사한 뒤 고치는 방법을 골라 대화에서 승인했고, 프로토타입을 만들며 더 정한 것이 있다. 각 태스크 설명에도 적었다.

1. 구조 비교(Task 1)
   - operation마다 응답 상태 집합이 정확히 같아야 한다. 계약에만 있는 상태(`missingStatuses`)와 구현에만 있는 상태(`extraStatuses`)를 모두 알린다. 성공 상태와 에러 상태를 가리지 않는다.
   - 항목은 `<METHOD> <정규화한 경로> <상태>`다(예: `DELETE /api/v1/me 422`). 양쪽에 모두 있는 operation만 비교하고, 한쪽에만 있는 operation은 지금처럼 `missingOperations`·`extraOperations`로만 알린다. 그래서 `--subset`은 구현한 operation의 상태만 본다.
   - 루트 `AGENTS.md`의 `pnpm spec-compare` 설명도 같은 커밋에서 고친다(도구 설명이 동작과 어긋나지 않게).
2. 계약 선언(Task 2)
   - 리다이렉트는 협상에서 빼지 않고 406을 선언한다. 빼려면 core가 auth의 경로를 알아야 하고 목도 바뀐다. 본문이 없어 413·415·422는 선언하지 않는다.
   - FastAPI `DELETE_ME`의 에러는 `(*AUTH_ERRORS, 422, *COMMON_ERRORS)`다. `AUTH_ERRORS + (422,) + COMMON_ERRORS`는 Ruff RUF005에 걸린다. `roles/router.py`의 옛 모양(`… + (422,) + …`)은 그대로 두고, `(422,)` 묶음 상수는 만들지 않는다.
   - `PostStatus`는 머리말만 떼어 설명을 없애지 않고 제 설명을 단다: `글의 상태. draft는 작성자와 posts:manage만 보고, published는 누구나 본다.` `gen:module`이 20자 이름으로 바꿔도 98칸이다(상태 이름을 풀어 쓴 긴 판은 100칸을 넘는다). 글 이벤트 문서 셋은 `<이벤트 이름>의 페이로드. …` 꼴이다. FastAPI docstring도 같은 문장이다.
   - 계약 테스트에 "`/api/` 아래 모든 operation은 406을 선언한다"를 둔다. 이벤트 문서의 설명 테스트는 이벤트를 모은 `realtime.test.ts`에 둔다.
3. 검증 에러의 경계(Task 3)
   - `document_path`는 마지막이 아닌 조각이 객체나 배열을 가리키지 않으면 판별자 태그로 보고 건너뛴다. 태그와 이름이 같은 필드(password grant의 `password`)에 객체나 배열을 보내면 그 grant의 필드 오류가 모두 그 값 아래를 가리킨다(조사가 적은 것보다 조금 넓다). 드문 입력이라 받아들이고 목과의 차이로 적는다. "형제 필드의 문자열 값과 같은 조각은 태그"라는 안은 오탐이 있어(이름이 `permissions`인 역할) 쓰지 않는다.
   - `Int32`·`Int64`에 `Strict()`를 넣는다. 모델 전체 strict와 별칭의 `BeforeValidator`는 쓰지 않는다(확인한 사실). 소수점이나 지수로 쓴 정수(`10.0`, `1e3`)는 FastAPI만 거절한다. JSON Schema의 integer는 그런 수를 받으므로 목이 계약대로이고 FastAPI가 더 엄격하다. `models.py` docstring에 "문서 모델의 정수는 `Int32`·`Int64`"를 적는다.
   - 목의 `typeMessage`는 정수 분기(lax의 "fractional part" 문구)와 그 분기만 쓰던 `value` 인자를 뺀다.
   - 흐름은 `sessions.test.ts`가 아니라 `jsonapi.test.ts`에 둔다. 공통 JSON:API 계층의 규칙이고, 타입 클라이언트가 보내지 못하는 요청을 보낼 `send`가 거기 있고, Task 4·5가 `sessions.test.ts`를 고친다.
4. 짝 없는 서로게이트(Task 4)
   - 제약 없는 문자열은 받는다. 비밀번호는 surrogatepass 바이트로 해시하고 검증해 틀린 비밀번호와 같은 401이다. 응답은 짝 없는 서로게이트를 소문자 `\uXXXX`로 이스케이프한다(목의 `JSON.stringify`와 같은 바이트). 저장하는 역할 설명은 422 `validation.invalid_format`이다. 본문을 파싱할 때 모두 거절하는 안과 응답을 U+FFFD로 바꾸는 안은 쓰지 않는다. 대가로 그런 응답은 I-JSON이 아니다.
   - 응답 이스케이프는 `encode("utf-8", "backslashreplace")` 한 단계다(조사는 인코딩이 실패하면 정규식으로 다시 이스케이프하는 안이었다). 결과 바이트는 같다.
   - 역할 설명의 오류는 `PydanticKnownError("string_unicode")`로 낸다(조사의 `PydanticCustomError`와 달리 pydantic-core의 문구를 복사하지 않는다). 검증기는 `_check_description`으로 이름을 바꾸고 서로게이트, 길이 순서로 본다.
   - 목의 scrypt가 짝 없는 서로게이트를 U+FFFD로 해시하는 차이는 고치지 않고 목 `AGENTS.md`에 적는다. 이 커밋으로 틀린 말이 되는 옛 항목("FastAPI가 500을 내는 자리")을 이것으로 바꾼다.
   - 흐름 다섯은 공용 상수 `LONE_SURROGATE`로 보내고 상태, 코드, pointer만 본다. detail의 바이트는 FastAPI 단위 테스트(`test_media.py`)가 고정한다. 비밀번호 변경 흐름은 새 사용자로 한다.
   - `test_bad_grants`의 `"\ud800"` 비밀번호 줄은 betterleaks가 잡으므로 `betterleaks:allow` 주석을 단다(값이 테스트의 요점이다). Task 3의 `"secret"`은 의미가 없어 `"x"`로 쓴다.
5. 401 challenge(Task 5)
   - 에러 응답을 만드는 한 곳이 challenge 없는 401에 `WWW-Authenticate: Bearer`를 더한다: FastAPI `error_response`(`_with_challenge`), 목 `errorResponse`(`withChallenge`). 목은 조사가 적은 `handleError`가 아니라 FastAPI `error_response`의 짝인 `errorResponse`다(`handleError`는 FastAPI 예외 핸들러의 짝이고 `errorResponse`를 부른다).
   - 이미 있는 challenge는 이름의 대소문자와 관계없이 그대로 둔다(재인증의 step-up). 이름만 다른 두 번째 헤더를 더하지 않는다.
   - `core/access.py`와 `core/access.ts`의 challenge 병합은 남긴다(이제 중복이다).
   - 흐름은 기존 401 단언에 `toMatch(/^Bearer/)`를 더한다. challenge에 매개변수(realm 등)를 붙이는 백엔드도 통과한다.
6. 역할 PATCH(Task 6): 라우터는 늘 서비스를 부르고, attributes가 없으면 빈 속성(FastAPI `RoleUpdateAttributes()`, 목 `{}`)을 넘긴다. 권한 안의 역할은 200이고 바뀐 것, 감사 로그, commit이 없다. 흐름은 admin 역할에 바꿀 속성을 보내지 않으므로 보호가 뚫려도 시드 역할이 바뀌지 않는다.
7. 만료된 세션(Task 7)
   - 살아 있는 세션(폐기되지 않았고 만료되지 않음)의 조건 하나(`_live`)를 목록, 폐기, 인증기(`active_session`)가 함께 쓴다. `revokedCount`와 `session.all_revoked`의 `metadata.revokedCount`는 `GET /sessions`에 보이던 세션 가운데 폐기한 수다. 동작을 덜 바꾸는 안(모두 폐기하고 살아 있던 것만 센다)은 쓰지 않는다.
   - `active_session`은 `now`를 받는다. 부르는 곳은 `session_principal`(인증기, 티켓 연결, 재검사)과 refresh grant(`_refresh`)다. `session_principal`의 시그니처는 그대로다. 목의 `activeSession`·`sessionPrincipal`은 `now`를 받고, 목의 인증기는 한 번 읽은 시각을 토큰 만료와 세션 확인에 함께 쓴다.
   - 판정: 여러 세션을 폐기하는 경로(다른 기기·전체 로그아웃, 비밀번호 재설정·변경, 계정 닫기)는 폐기한 수와 관계없이 그 사용자의 재검사를 넣고, `session.revoked`는 하나 이상 폐기했을 때만 보낸다. 규칙은 FastAPI `events.session_revoked(..., revoked)`와 목 `sessionRevoked(..., revoked)` 한 곳에 둔다. 이것이 없으면 살아 있는 세션이 없을 때 만료 전에 붙은 연결이 남는다. 세션 하나를 폐기하는 경로(`DELETE /sessions/{id}`, refresh token 재사용)는 그대로다(늘 하나다). 404로 끝나는 폐기는 아무것도 commit하지 않아 재검사도 없다.
   - FastAPI의 재검사 테스트는 `auth/tests/test_sessions.py`에 둔다(realtime 테스트는 모듈 경계 때문에 auth의 모델을 import하지 못한다). 목은 `test/realtime-recheck.test.ts`에 같은 경우를 둔다.
   - 계약의 `revokedCount` 설명(조사의 선택 항목)은 고치지 않는다.
8. 실시간(Task 8)
   - 페이로드가 하나가 아닌(없거나 둘 이상) `subscribe`·`unsubscribe`는 틀린 페이로드다: ack `{ok: false}`, 422 `validation.invalid_choice`, `source.pointer` `/channel`이고 룸에 들거나 나가지 않는다. 첫 페이로드만 쓰는 안(클라이언트의 실수를 숨긴다)과 답하지 않는 안(타임아웃까지 기다린다)은 쓰지 않는다.
   - `REALTIME_ALLOWED_ORIGINS`는 거절하지 않고 값마다 브라우저 Origin(`스킴://호스트[:포트]`)으로 정규화한다. `*`, `http://`·`https://`로 시작하지 않는 값(대소문자를 가린다), ASCII가 아닌 호스트는 설정 오류다.
   - 목과 조용히 달라지지 않게, 브라우저가 다르게 적는 호스트(줄여 쓴 IPv4, IPv4를 담은 IPv6, zone id, IPvFuture, `%` 이스케이프, 이름에 쓰지 않는 글자)도 설정 오류이고 IPv6는 줄여 쓴 꼴로 쓴다. 결과는 목과 같은 Origin이거나 설정 오류다. 예외는 올바르지 않은 `xn--` 라벨로, 목만 거절한다(어느 브라우저도 만들지 못하는 호스트라 해가 없다).
   - 문구: 시작 검사는 목과 같은 `http:// 또는 https://로 시작하는 주소여야 한다(현재: …)`다. ASCII가 아닌 호스트(punycode로 적으라고 안내한다)와 읽을 수 없는 Origin은 따로 알린다. 틀린 값이 여럿이면 정렬해서 처음 것을 알린다(목은 입력 순서로 처음 것).
   - 목의 설정은 바꾸지 않는다. 목은 ASCII가 아닌 호스트를 거절하지 않고 WHATWG URL로 punycode로 바꿔 받는다(조사가 "목처럼 거절한다"고 적은 것과 다르다). 차이는 목 `AGENTS.md`와 `src/config.ts` 주석에 적는다.
   - 흐름은 따로 둔 `it`에서 subscribe와 unsubscribe에 페이로드 0개와 2개를 보내고 status, code, `source.pointer`까지 본다. 적합성 `RealtimeClient.ack`는 페이로드를 여럿 받는다.
9. 목의 "FastAPI와 다른 점": 동작을 바꾼 태스크가 그 커밋에서 자기 항목을 고친다(Task 3, 4, 8). Task 9는 목록 전체를 다시 확인한다.
10. 문서(Task 9)
    - 조사가 적은 보강 설계의 위치(§3.4)는 틀렸다. 해당 문장은 §7.1(H12)에 있다. 만료 표기에 더해, Task 7의 판정으로 틀린 말이 된 재검사 조건 목록과 "이미 이벤트를 받은 뒤다" 문장을 고친다.
    - 조사 목록 밖의 틀린 문장도 고친다: FastAPI 설계 §6.1과 템플릿 `docs/architecture.md`의 인증기(`revoked_at`만 본다), 목 `AGENTS.md`의 잡 주기 짝, `posts/service.ts` 오타, 설정 검증이 빡빡하다는 범위, spec-compare의 머리 주석 둘(`cli.ts`, `compare.ts`).
    - 재발 방지 규칙은 템플릿 `docs/recipes/endpoint.md`의 새 "규칙" 절이다: 정수는 `Int32`·`Int64`, DB에 저장하는 문자열에는 길이 제약. 템플릿 `AGENTS.md`와 `recipes/module.md`가 가리킨다. 문서 규칙일 뿐 검사는 없다.
    - web 설계 §8.3과 §8.9의 남은 경계는 목 `AGENTS.md`와 같은 셋이다: `10.0`·`1e3`, 태그와 같은 이름의 grant 필드에 보낸 객체·배열, 본문 인코딩(UTF-16·32, CESU-8 짝, `NaN`·`Infinity`).
    - 하지 않는 선택 항목: 기반 설계의 `revokedCount`와 리다이렉트 문장, web 설계 §8.2의 Origin 설명, 계약의 `revokedCount` 설명. 옛 계획 문서(M2, W1)는 당시 기록이라 고치지 않는다.
11. 적합성으로 보지 않는 것: `DELETE /me`의 422(흐름이 시드 관리자를 지울 위험이 있고 FastAPI 대상은 개발 DB다)와 만료된 세션(FastAPI 대상에 시계 제어가 없다). 계약 테스트, 두 백엔드의 단위 테스트, 구조 비교로 확인한다.

## 확인한 사실

- 구조 비교
  - `scripts/src/spec-compare/breaking.ts`는 `oasdiff breaking --fail-on ERR`다. oasdiff 1.32.1에서 `response-non-success-status-added`, `response-non-success-status-removed`, `response-success-status-added`는 info이고 `response-success-status-removed`만 error다(`pnpm tool oasdiff checks changelog`). 그래서 에러 상태를 한쪽에만 선언해도 통과했다.
  - 보정 전 계약과 FastAPI `openapi.json`은 39개 operation의 응답 상태 집합이 모두 같았다. `DELETE /me`의 422와 리다이렉트의 406은 두 쪽이 함께 빠뜨린 것이다. 두 스펙의 상태 키는 모두 세 자리 문자열이고 `default`, `4XX`, 응답 `$ref`가 없다.
- 적합성 키트는 모든 응답을 계약의 operation과 상태로 검증한다. 계약에 없는 상태는 두 대상 모두 `ContractViolation`(`… 계약에 406 응답이 없다.`)이다. openapi-fetch 0.17.0은 요청의 `headers`를 `set`하므로 클라이언트의 기본 `Accept`를 덮는다.
- 협상 미들웨어(FastAPI `core/jsonapi/negotiation.py`, 목 `src/jsonapi/negotiation.ts`)는 경로로만 거르므로 `/api/` 아래 리다이렉트도 406을 낸다. GET이라 415는 나지 않고, 앱 코드는 503을 내지 않는다.
- TypeSpec 1.16.0: 파일 머리말을 doc comment(`/** */`)로 쓰면 바로 아래 선언의 설명이 된다. `is` 모델은 템플릿(`JsonApi.Document`)의 설명을 물려받고, 자기 doc comment가 있으면 그것을 쓴다.
- Ruff 0.16.9: RUF005는 `AUTH_ERRORS + (422,) + COMMON_ERRORS`를 풀어 쓰라고 한다(`roles/router.py`의 `AUTH_ERRORS + NOT_FOUND + (422,) + COMMON_ERRORS`는 왼쪽이 `+` 식이라 걸리지 않는다). E501은 한글을 두 칸으로 센다.
- Pydantic 2.13.5(pydantic-core 2.46.5)
  - 판별 유니온은 loc에 태그 값을 끼운다. password grant의 이메일 오류는 `("data", "attributes", "password", "email")`이다. 요청 모델의 판별 유니온은 `SessionGrant` 하나이고, 태그와 이름이 같은 필드는 password grant의 `password`와 refresh grant의 `refreshToken`이다.
  - lax `int`는 `"10"`, `" 10 "`, `true`, `10.0`, `1e3`, `"1_0"`을 받고 `10.5`, `"1e3"`을 거절한다. `Strict()`를 더하면 모두 `int_type`(`Input should be a valid integer`)이고 JSON 스키마는 그대로다. 모델 전체의 `strict=True`는 Python 모드에서 enum, UUID, datetime 문자열을 거절하고, 별칭의 `BeforeValidator`는 바깥 `Field(ge=1)`을 JSON 스키마에 새게 한다. 요청 본문의 정수는 `FileCreateAttributes.size` 하나다.
  - 값을 파싱하는 문자열(`Field(max_length=)`, `StringConstraints`, 선택지, 날짜·UUID 형식)은 짝 없는 서로게이트를 `string_unicode`(`Input should be a valid string, unable to parse raw data as a unicode string`)로 거절한다. 제약 없는 `str`과 `json_schema_extra`로만 길이를 적은 역할 설명은 그대로 받는다. `PydanticKnownError("string_unicode")`는 제약 문자열의 오류와 (type, msg, ctx)가 같다.
  - `model_dump_json()`은 짝 없는 서로게이트에 `PydanticSerializationError`를 낸다(`rendering.render`의 빠른 경로). 지금 성공 문서에는 그런 문자열이 들어가지 않는다.
- 짝 없는 서로게이트의 500은 세 곳에서 났다: argon2-cffi 25.1.0(pwdlib 0.3.1)이 비밀번호를 인코딩할 때, Starlette 1.7.0 `JSONResponse.render`가 본문을 `.encode("utf-8")`할 때, psycopg 3.3.6의 문자열 덤퍼가 역할 설명을 저장할 때(`POST`·`PATCH /roles`의 단위 테스트와 흐름에서 500을 확인했다). pwdlib의 `hash`와 `verify`는 `str | bytes`를 받고, 보통 문자열은 surrogatepass 바이트가 UTF-8 바이트와 같아 str로 만든 해시가 그대로 맞는다.
- `json.dumps(…, ensure_ascii=False, …).encode("utf-8", "backslashreplace")`는 서로게이트만 소문자 `\uXXXX`로 쓴다. 입력 16개에서 Node의 `JSON.stringify`와 바이트가 같았고 `json.loads`로 되돌아왔다. 이런 응답은 JSON으로는 맞지만 I-JSON(RFC 7493)은 아니다.
- 입력을 그대로 담는 detail은 셋이다: `require_matching_id`(모든 PATCH의 409), files의 `attachable_file`(아바타·커버의 404), `users/service/management.py`의 `Role {id} does not exist.`(`PATCH /users/{id}`의 404, 조사에서 새로 찾음).
- 계약의 요청 문자열 가운데 제약이 없는 것은 토큰(`token`, `refreshToken`, `code`, `codeVerifier`), 비밀번호(`password`, `currentPassword`), PATCH의 `data.id`와 관계의 id, 파일의 `contentType`이고 모두 비교에만 쓴다. 제약을 `anyOf` 밖에 둔 요청 문자열은 역할 설명 둘(`RoleCreateAttributes`, `RoleUpdateAttributes`)뿐이다(`PaginationLinks`의 `prev`, `next`는 응답 전용이고 `format: uri-reference`다).
- Node 24: `scryptSync`는 짝 없는 서로게이트를 U+FFFD로 바꿔 인코딩한다(`scryptSync('ab\ud800')`와 `scryptSync('ab\ufffd')`가 같다). `JSON.parse`는 `10.0`, `1e3`을 `10`, `1000`으로 읽고, `JSON.stringify(10.0)`은 `10`이다.
- RFC 9110 §15.5.2는 모든 401에 challenge를 요구하고(MUST), RFC 6750 §3은 error 없는 `Bearer`를 허용한다. `error_response`는 예외 핸들러(ApiError, 요청 검증, HTTPException, 예상하지 못한 예외)와 공통 계층의 미들웨어(협상 415·406, 본문 한도 413, 레이트 리밋 429)가 모두 쓴다. Starlette는 헤더 이름을 소문자로 바꾸므로 이름의 대소문자만 다른 challenge를 더하면 헤더가 둘이 되고, 목의 `Headers`는 `Bearer, Bearer error=…`로 합친다.
- access token(15분, 검증 여유 30초)은 세션의 만료를 지금부터 30일 뒤로 늘린 직후에만 발급된다(`issue`는 `open_session`과 `_refresh`에서 `refresh_token_row` 바로 뒤에 불린다). 그래서 `active_session`에 만료 조건을 더해도 HTTP 인증은 바뀌지 않는다. `_refresh`에서 `active_session`까지 오는 토큰은 쓰지 않은 최신 refresh token이고 만료가 세션과 같다. 목도 같다.
- 모듈 경계 검사(`tools/checks/boundaries.py`)는 `src/app/**`의 테스트에도 걸린다. realtime 테스트는 `app.modules.auth.models`를 import할 수 없다.
- python-socketio 5.17.0
  - `AsyncServer`는 처리기를 백그라운드 태스크로 돌리고(`async_handlers=True`) 받은 페이로드를 하나씩 인자로 넘긴다. 인자 수가 맞지 않으면 처리기가 `TypeError`로 끝나고, ack는 처리기가 돌아온 뒤에만 보내므로 오지 않는다.
  - 클라이언트는 데이터가 튜플이면 원소를 하나씩 페이로드로, `None`이면 페이로드 없이 보낸다. 템플릿의 타입 스텁(`typings/socketio/`)에서 `on`은 `Callable[..., Awaitable[Any]]`라 가변 인자 처리기를 받는다.
- python-engineio 4.14.0은 허용 목록에 `*`가 있으면 모든 Origin을 받고, 아니면 Origin 헤더와 글자 그대로 비교한다. 브라우저의 Origin에는 끝의 `/`가 없고, 호스트가 소문자이며, 기본 포트가 없다.
- Origin 정규화의 대조: FastAPI `Origins`와 목의 `loadConfig`에 입력 116개를 넣어 92개가 같았다. FastAPI만 거절한 22개는 목이 WHATWG URL로 바꿔 받는 값이다(ASCII가 아닌 호스트, 줄여 쓴 IPv4, IPv4를 담은 IPv6, `%` 이스케이프, 이름에 쓰지 않는 글자, `http:///x`, 역슬래시). 목만 거절한 2개는 올바르지 않은 punycode 라벨(`xn--a.com`, `xn--.com`)이다. `urlsplit`의 `hostname`과 `port`만 쓰면 `127.1`, `[0:0:0:0:0:0:0:1]` 같은 값이 목과 다른 Origin이 된다. Python 3.14 `ipaddress`는 IPv4를 담은 IPv6를 `::ffff:1.2.3.4`로, WHATWG는 `::ffff:102:304`로 쓴다. Python의 punycode 코덱은 UTS46의 유효성을 재현하지 못한다.
- 적합성 대상은 모든 레이트 리밋을 1,000,000으로 띄운다(FastAPI는 compose의 app 프로필, 목은 `scripts/src/conformance/targets.ts`). `pnpm conformance fastapi`는 작업 트리로 이미지를 다시 빌드한다(`up -d --build --wait`).
- betterleaks는 Python 테스트의 `"password": "secret"`과 `"password": "\ud800"`을 `generic-password`(confidence low)로 잡는다. 적합성 흐름은 상수(`LONE_SURROGATE`)를 써서 걸리지 않는다.

## 검증

- 이 계획의 파일과 명령은 2026-09-30에 Windows 11(Node 24.19.0, pnpm 12.6.0, uv 0.12.5, Python 3.14.7, Docker Compose v2)에서 검증했다. main(d810c9e)의 사본에 태스크 순서대로 재연했고, 태스크 커밋마다 다음이 통과했다.
  - 템플릿 `uv run poe check`(9단계, `.cache/check`를 지우고 건너뛴 단계 없이)
  - 저장소 `pnpm check`(9단계)
  - `pnpm spec-compare contract/openapi.yaml templates/fastapi/openapi.json`(`--subset` 없이)
- 마지막 커밋(Task 9)에서 `pnpm conformance fastapi`와 `pnpm conformance mock`이 각각 14개 파일, 94개 테스트를 통과했고, `uv run poe test:e2e`가 12개를 통과했다. 태스크마다의 전체 흐름 수는 각 태스크의 "검사를 돌린다"에 적었다(프로토타입의 각 태스크 커밋에서 두 대상 모두 통과했다).
- 코드 블록은 태스크 커밋에서 만들었다. 부모 커밋에 각 태스크의 블록을 그대로 옮기면 트리가 태스크 커밋과 같다. 생성물(`contract/openapi.yaml`, 적합성 키트와 목의 `src/generated/api.ts`, `templates/fastapi/openapi.json`)은 Task 2의 명령이 만든다.
- 각 태스크의 "실패하는지 확인한다"와 "통과하는지 확인한다"의 기대 출력은 두 가지를 실제로 돌린 결과다: 부모 커밋에 그 태스크의 테스트(단위 테스트와 흐름)만 얹은 것, 그리고 태스크 커밋. 흐름은 두 대상에서 돌렸다. 목이 이미 맞던 동작은 목 대상에서 부모 커밋에서도 통과한다(Task 3).
- 기대 출력과 다르면 계획을 의심하기 전에 다음부터 확인한다: 인프라 상태(`docker compose ps`, `pnpm conformance fastapi` 뒤에 다시 띄웠는지), 포트, `templates/fastapi/.cache/check`(건너뛴 단계), 버전.

### Task 1: 구조 비교: operation마다 응답 상태 집합을 비교한다

web 설계 §12.1의 계약 문제 둘(`DELETE /me`의 422, 리다이렉트의 406)은 계약과 FastAPI 선언이 함께 빠뜨린 것이라 구조 비교가 보지 못했다. 한쪽만 고쳐도 마찬가지로 통과한다. `breaking.ts`가 돌리는 oasdiff 1.32.1은 성공 상태를 뺀 것만 error로 보고, 에러 상태를 더하거나 뺀 것은 info로 두기 때문이다. 그래서 계약을 고치는 Task 2보다 먼저, 구조 비교가 operation마다 응답 상태 집합을 비교하게 한다.

- `compareSpecs`의 결과(`Comparison`)에 `missingStatuses`(같은 operation에서 계약에만 있는 상태)와 `extraStatuses`(구현에만 있는 상태)를 더한다. 항목은 `<METHOD> <정규화한 경로> <상태>`다(예: `DELETE /api/v1/me 422`, `GET /api/v1/oauth/{}/authorize 406`).
- 집합은 두 방향 모두 정확히 같아야 하고, 성공 상태와 에러 상태를 가리지 않는다. 구현에만 있는 상태는 적합성 클라이언트가 `ContractViolation`으로 거절하고, 계약으로 만든 클라이언트는 그 응답의 타입을 모른다. 계약에만 있는 상태는 구현의 스펙이 계약보다 좁다는 뜻이다.
- 양쪽에 모두 있는 operation만 비교한다(`statusDifferences`). 한쪽에만 있는 operation은 지금처럼 `missingOperations`·`extraOperations`로만 알린다. `--subset`은 구현한 operation만 남긴 계약과 비교하므로 구현한 operation의 상태만 본다.
- `describeComparison`은 차이마다 한 문장을 낸다. 계약에만 있으면 구현도 모두 선언하라고, 구현에만 있으면 계약(`contract/typespec`)에 먼저 선언하거나 구현의 선언에서 빼라고 안내한다. `cli.ts`는 그 문장을 그대로 찍는다.
- `operationKeys`와 `restrictToImplemented`가 따로 쓰던 키 템플릿을 `operationKey`로 모은다. 루트 `AGENTS.md`의 `pnpm spec-compare` 설명에 "operation별 응답 상태"를 넣는다.
- 지금 계약과 FastAPI `openapi.json`은 39개 operation의 상태 집합이 모두 같아 바로 통과한다. 목과 적합성 흐름은 바뀌지 않는다.
- 실패 확인: 부모 커밋의 결과에는 상태 필드가 없다. 새 단위 테스트는 필드가 없어(`expected undefined to deeply equal …`) 실패하고, 문장 테스트는 상태 문장이 없어 실패하고, 결과 전체를 `toEqual`로 보던 부분 비교 테스트도 두 필드가 없어 실패한다(17개 가운데 6개). 한쪽 선언만 고친 스펙(FastAPI에만 `DELETE /me`의 422)을 부모 커밋의 `pnpm spec-compare`는 종료 코드 0으로 통과시킨다.

**Files:**
- Modify: `AGENTS.md`, `scripts/src/spec-compare/compare.ts`
- Test: `scripts/test/spec-compare/compare.test.ts`

**Interfaces:**
- Consumes: M4·M5의 `scripts/src/spec-compare/compare.ts`: `OpenApiLike`, `Comparison`, `normalizePath(path: string): string`, `operationKeys(spec: OpenApiLike): Set<string>`, `restrictToImplemented(contract: OpenApiLike, implementation: OpenApiLike): OpenApiLike`, `compareSpecs(contract: OpenApiLike, implementation: OpenApiLike, options: CompareOptions = {}): Comparison`, `describeComparison(result: Comparison): string[]`. `cli.ts`와 `breaking.ts`는 그대로다
- Produces:
  - `Comparison.missingStatuses: readonly string[]`, `Comparison.extraStatuses: readonly string[]`(항목 `"<METHOD> <정규화한 경로> <상태>"`)
  - `responseStatuses(spec: OpenApiLike): Map<string, Set<string>>`(키는 `operationKeys`와 같다. 응답 선언이 없으면 빈 집합)
  - `statusDifferences(contract: OpenApiLike, implementation: OpenApiLike): Pick<Comparison, "missingStatuses" | "extraStatuses">`(양쪽에 있는 operation만 보고, 결과는 정렬한다)
  - `compareSpecs`가 `...statusDifferences(target, implementation)`을 담는다(`target`은 `--subset`이면 구현한 operation만 남긴 계약). `describeComparison`의 새 문장 둘: `<항목> 응답이 구현 스펙에 없다. …`, `<항목> 응답은 계약에 없다. …`
  - 내부 함수 `operationKey(method: string, path: string): string`, `declaredStatuses(operation: unknown): string[]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`scripts/test/spec-compare/compare.test.ts` 전체를 다음으로 바꾼다.

```ts
import { describe, expect, it } from "vitest";
import {
  compareSpecs,
  describeComparison,
  normalizePath,
  type OpenApiLike,
  reachableSchemas,
  realtimeMismatches,
  restrictToImplemented,
} from "../../src/spec-compare/compare.ts";

const contract: OpenApiLike = {
  paths: {
    "/api/v1/posts": { get: {}, post: {} },
    "/api/v1/posts/{id}": { get: {}, parameters: [] },
  },
  components: { schemas: { PostDocument: {}, ErrorDocument: {} } },
};

describe("compareSpecs", () => {
  it("경로 파라미터 이름이 달라도, 보조 스키마가 더 있어도 통과한다", () => {
    const implementation: OpenApiLike = {
      paths: {
        "/api/v1/posts": { get: {}, post: {} },
        "/api/v1/posts/{post_id}": { get: {} },
      },
      components: { schemas: { PostDocument: {}, ErrorDocument: {}, PostCreateData: {} } },
    };
    expect(describeComparison(compareSpecs(contract, implementation))).toEqual([]);
  });

  it("계약의 스키마가 없으면 이름을 알려 준다", () => {
    const implementation: OpenApiLike = {
      ...contract,
      components: { schemas: { PostDocument: {} } },
    };
    expect(compareSpecs(contract, implementation).missingSchemas).toEqual(["ErrorDocument"]);
  });

  it("빠진 operation과 계약에 없는 operation을 모두 잡는다", () => {
    const implementation: OpenApiLike = {
      ...contract,
      paths: {
        "/api/v1/posts": { get: {} },
        "/api/v1/posts/{id}": { get: {}, delete: {} },
      },
    };
    const result = compareSpecs(contract, implementation);
    expect(result.missingOperations).toEqual(["POST /api/v1/posts"]);
    expect(result.extraOperations).toEqual(["DELETE /api/v1/posts/{}"]);
  });
});

describe("응답 상태", () => {
  const declared: OpenApiLike = {
    paths: {
      "/api/v1/me": { delete: { responses: { "204": {}, "401": {}, "422": {} } } },
      "/api/v1/oauth/{provider}/authorize": {
        get: { responses: { "302": {}, "400": {}, "406": {} } },
      },
      "/api/v1/posts": { get: { responses: { "200": {}, "400": {} } } },
    },
  };

  it("operation마다 상태 집합을 비교하고, 한쪽에만 있는 상태를 양쪽 모두 알려 준다", () => {
    const implementation: OpenApiLike = {
      paths: {
        "/api/v1/me": { delete: { responses: { "204": {}, "401": {} } } },
        "/api/v1/oauth/{name}/authorize": {
          get: { responses: { "302": {}, "400": {}, "404": {}, "406": {} } },
        },
        "/api/v1/posts": { get: { responses: { "400": {}, "200": {} } } },
      },
    };
    const result = compareSpecs(declared, implementation);
    expect(result.missingStatuses).toEqual(["DELETE /api/v1/me 422"]);
    expect(result.extraStatuses).toEqual(["GET /api/v1/oauth/{}/authorize 404"]);
  });

  it("응답 선언이 없는 operation은 상태가 하나도 없는 것으로 본다", () => {
    const implementation: OpenApiLike = {
      paths: { ...declared.paths, "/api/v1/posts": { get: {} } },
    };
    expect(compareSpecs(declared, implementation).missingStatuses).toEqual([
      "GET /api/v1/posts 200",
      "GET /api/v1/posts 400",
    ]);
  });

  it("빠진 operation과 계약에 없는 operation의 상태는 따로 알리지 않는다", () => {
    const implementation: OpenApiLike = {
      paths: {
        "/api/v1/me": { delete: { responses: { "204": {}, "401": {}, "422": {} } } },
        "/api/v1/oauth/{provider}/authorize": {
          get: { responses: { "302": {}, "400": {}, "406": {} } },
        },
        "/api/v1/widgets": { get: { responses: { "200": {} } } },
      },
    };
    const result = compareSpecs(declared, implementation);
    expect(result.missingOperations).toEqual(["GET /api/v1/posts"]);
    expect(result.extraOperations).toEqual(["GET /api/v1/widgets"]);
    expect(result.missingStatuses).toEqual([]);
    expect(result.extraStatuses).toEqual([]);
  });

  it("차이마다 operation과 상태를 담은 문장을 낸다", () => {
    const problems = describeComparison({
      missingSchemas: [],
      missingOperations: [],
      extraOperations: [],
      missingStatuses: ["DELETE /api/v1/me 422"],
      extraStatuses: ["GET /api/v1/oauth/{}/authorize 404"],
      realtimeMismatches: [],
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^DELETE \/api\/v1\/me 422 응답이 구현 스펙에 없다\./);
    expect(problems[1]).toMatch(/^GET \/api\/v1\/oauth\/\{\}\/authorize 404 응답은 계약에 없다\./);
  });
});

describe("normalizePath", () => {
  it("경로 파라미터 이름을 지운다", () => {
    expect(normalizePath("/api/v1/oauth/{provider}/callback")).toBe("/api/v1/oauth/{}/callback");
  });
});

describe("부분 비교(--subset)", () => {
  const referenced: OpenApiLike = {
    paths: {
      "/health/live": {
        get: { responses: { "200": { $ref: "#/components/schemas/HealthReport" } } },
      },
      "/api/v1/posts": {
        get: { responses: { "200": { $ref: "#/components/schemas/PostCollectionDocument" } } },
      },
    },
    components: {
      schemas: {
        HealthReport: { properties: { checks: { $ref: "#/components/schemas/HealthCheck" } } },
        HealthCheck: {},
        PostCollectionDocument: {},
        ErrorCode: {},
      },
    },
  };

  it("구현에 있는 operation만 남기고, 그 operation에서 닿는 스키마만 요구한다", () => {
    const implementation: OpenApiLike = {
      paths: { "/health/live": { get: { responses: { "200": {} } } } },
      components: { schemas: { HealthReport: {} } },
    };
    expect(Object.keys(restrictToImplemented(referenced, implementation).paths ?? {})).toEqual([
      "/health/live",
    ]);
    expect([...reachableSchemas(restrictToImplemented(referenced, implementation))].sort()).toEqual(
      ["HealthCheck", "HealthReport"],
    );
    expect(compareSpecs(referenced, implementation, { subset: true })).toEqual({
      missingSchemas: ["HealthCheck"],
      missingOperations: [],
      extraOperations: [],
      missingStatuses: [],
      extraStatuses: [],
      realtimeMismatches: [],
    });
  });

  it("부분 모드는 구현한 operation의 응답 상태만 비교한다", () => {
    const implementation: OpenApiLike = {
      paths: { "/health/live": { get: { responses: { "200": {}, "503": {} } } } },
      components: { schemas: { HealthReport: {}, HealthCheck: {} } },
    };
    const result = compareSpecs(referenced, implementation, { subset: true });
    expect(result.missingStatuses).toEqual([]);
    expect(result.extraStatuses).toEqual(["GET /health/live 503"]);
  });

  it("부분 모드에서도 계약에 없는 operation은 잡는다", () => {
    const implementation: OpenApiLike = {
      paths: { "/health/live": { get: {} }, "/api/v1/widgets": { get: {} } },
      components: { schemas: { HealthReport: {}, HealthCheck: {} } },
    };
    expect(compareSpecs(referenced, implementation, { subset: true }).extraOperations).toEqual([
      "GET /api/v1/widgets",
    ]);
  });

  it("전체 모드는 지금처럼 모든 operation과 스키마를 요구한다", () => {
    const implementation: OpenApiLike = {
      paths: { "/health/live": { get: {} } },
      components: { schemas: { HealthReport: {}, HealthCheck: {} } },
    };
    const result = compareSpecs(referenced, implementation);
    expect(result.missingOperations).toEqual(["GET /api/v1/posts"]);
    expect(result.missingSchemas).toEqual(["ErrorCode", "PostCollectionDocument"]);
  });
});

describe("실시간 확장", () => {
  const realtime: OpenApiLike = {
    "x-realtime-channels": [{ name: "posts", permission: null, description: "계약의 설명" }],
    "x-realtime-events": [
      { name: "post.created", rooms: ["posts:all"], payload: "PostCreatedEventDocument" },
    ],
    "x-realtime-messages": [
      { name: "subscribe", payload: "RealtimeSubscription", ack: "RealtimeAck" },
    ],
  };

  it("설명이 달라도, 구현의 항목이 더 있어도 통과한다", () => {
    const implementation: OpenApiLike = {
      ...realtime,
      "x-realtime-channels": [
        { name: "posts", permission: null, description: "구현의 설명" },
        { name: "comments", permission: null, description: "프로젝트가 더한 채널" },
      ],
    };
    expect(realtimeMismatches(realtime, implementation)).toEqual([]);
  });

  it("빠졌거나 모양이 다른 항목을 이름으로 알려 준다", () => {
    const implementation: OpenApiLike = {
      "x-realtime-events": [
        { name: "post.created", rooms: ["posts"], payload: "PostCreatedEventDocument" },
      ],
      "x-realtime-messages": realtime["x-realtime-messages"],
    };
    expect(realtimeMismatches(realtime, implementation)).toEqual([
      "x-realtime-channels: posts",
      "x-realtime-events: post.created",
    ]);
  });

  it("부분 모드는 실시간 항목을 보지 않는다", () => {
    expect(compareSpecs(realtime, {}, { subset: true }).realtimeMismatches).toEqual([]);
    expect(compareSpecs(realtime, {}).realtimeMismatches).toHaveLength(3);
  });

  const updated: OpenApiLike = {
    "x-realtime-events": [
      {
        name: "post.updated",
        rooms: ["posts:all", "user:{authorId}"],
        conditionalRooms: [{ room: "posts", when: "published" }],
        payload: "PostUpdatedEventDocument",
      },
    ],
  };

  it("객체의 키 순서가 달라도(안쪽 객체도) 같은 항목으로 본다", () => {
    const implementation: OpenApiLike = {
      "x-realtime-events": [
        {
          payload: "PostUpdatedEventDocument",
          conditionalRooms: [{ when: "published", room: "posts" }],
          rooms: ["posts:all", "user:{authorId}"],
          name: "post.updated",
        },
      ],
    };
    expect(realtimeMismatches(updated, implementation)).toEqual([]);
  });

  it("배열의 순서는 모양의 일부로 본다", () => {
    const implementation: OpenApiLike = {
      "x-realtime-events": [
        {
          name: "post.updated",
          rooms: ["user:{authorId}", "posts:all"],
          conditionalRooms: [{ room: "posts", when: "published" }],
          payload: "PostUpdatedEventDocument",
        },
      ],
    };
    expect(realtimeMismatches(updated, implementation)).toEqual([
      "x-realtime-events: post.updated",
    ]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`scripts`에서): `pnpm exec vitest run test/spec-compare/compare.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× operation마다 상태 집합을 비교하고, 한쪽에만 있는 상태를 양쪽 모두 알려 준다
× 응답 선언이 없는 operation은 상태가 하나도 없는 것으로 본다
× 빠진 operation과 계약에 없는 operation의 상태는 따로 알리지 않는다
× 차이마다 operation과 상태를 담은 문장을 낸다
× 구현에 있는 operation만 남기고, 그 operation에서 닿는 스키마만 요구한다
× 부분 모드는 구현한 operation의 응답 상태만 비교한다
FAIL  test/spec-compare/compare.test.ts > 응답 상태 > operation마다 상태 집합을 비교하고, 한쪽에만 있는 상태를 양쪽 모두 알려 준다
AssertionError: expected undefined to deeply equal [ 'DELETE /api/v1/me 422' ]
Test Files 1 failed (1)
Tests 6 failed | 11 passed (17)
```

- [ ] **Step 3: 저장소 스크립트를 고친다**

`scripts/src/spec-compare/compare.ts` 전체를 다음으로 바꾼다.

```ts
/** 백엔드가 내보낸 OpenAPI가 계약과 같은 이름·경로·응답 상태를 쓰는지 비교한다. 구조 호환은 breaking.ts(oasdiff)가 본다. */

export interface OpenApiLike {
  readonly paths?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly components?: { readonly schemas?: Readonly<Record<string, unknown>> };
  readonly [extension: `x-${string}`]: unknown;
}

export interface Comparison {
  readonly missingSchemas: readonly string[];
  readonly missingOperations: readonly string[];
  readonly extraOperations: readonly string[];
  /** 같은 operation에서 계약에만 있는 응답 상태. 예: "DELETE /api/v1/me 422" */
  readonly missingStatuses: readonly string[];
  /** 같은 operation에서 구현에만 있는 응답 상태. 예: "GET /api/v1/oauth/{}/authorize 406" */
  readonly extraStatuses: readonly string[];
  /** 구현에 없거나 계약과 다른 실시간 항목. 예: "x-realtime-events: post.created" */
  readonly realtimeMismatches: readonly string[];
}

/** 계약의 실시간 확장. 항목마다 name이 있고, 설명(description)을 뺀 나머지가 같아야 한다. */
export const REALTIME_EXTENSIONS = [
  "x-realtime-channels",
  "x-realtime-events",
  "x-realtime-messages",
] as const;

const METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

/** 경로 파라미터 이름을 지운다. 예: /posts/{post_id} → /posts/{} */
export function normalizePath(path: string): string {
  return path.replace(/\{[^}]+\}/g, "{}");
}

/** 두 스펙에서 같은 operation을 짝짓는 키. 예: GET /api/v1/posts/{} */
function operationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

export function operationKeys(spec: OpenApiLike): Set<string> {
  const keys = new Set<string>();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of Object.keys(item).filter((key) => METHODS.has(key))) {
      keys.add(operationKey(method, path));
    }
  }
  return keys;
}

/** operation의 응답 선언(responses)의 키. 응답 선언이 없으면 빈 배열이다. */
function declaredStatuses(operation: unknown): string[] {
  if (typeof operation !== "object" || operation === null) return [];
  const responses = (operation as Record<string, unknown>).responses;
  return typeof responses === "object" && responses !== null ? Object.keys(responses) : [];
}

/** operation마다 선언한 응답 상태의 집합. 키는 operationKeys와 같다. */
export function responseStatuses(spec: OpenApiLike): Map<string, Set<string>> {
  const statuses = new Map<string, Set<string>>();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (METHODS.has(method)) {
        statuses.set(operationKey(method, path), new Set(declaredStatuses(operation)));
      }
    }
  }
  return statuses;
}

const SCHEMA_REF_PREFIX = "#/components/schemas/";

/** 계약에서 구현에 있는 operation만 남긴다. 부분 비교(구현 도중)에 쓴다. components는 그대로 둔다. */
export function restrictToImplemented(
  contract: OpenApiLike,
  implementation: OpenApiLike,
): OpenApiLike {
  const implemented = operationKeys(implementation);
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, item] of Object.entries(contract.paths ?? {})) {
    const kept = Object.fromEntries(
      Object.entries(item).filter(
        ([key]) => !METHODS.has(key) || implemented.has(operationKey(key, path)),
      ),
    );
    if (Object.keys(kept).some((key) => METHODS.has(key))) paths[path] = kept;
  }
  return { ...contract, paths };
}

/** paths에서 `$ref`로 닿는 컴포넌트 스키마 이름. 스키마가 다시 참조하는 것도 따라간다. */
export function reachableSchemas(spec: OpenApiLike): Set<string> {
  const schemas = spec.components?.schemas ?? {};
  const found = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string" && value.startsWith(SCHEMA_REF_PREFIX)) {
        const name = value.slice(SCHEMA_REF_PREFIX.length);
        if (!found.has(name)) {
          found.add(name);
          visit(schemas[name]);
        }
      } else {
        visit(value);
      }
    }
  };
  visit(spec.paths);
  return found;
}

/** 객체의 키를 (안쪽까지) 정렬한 값. 배열의 순서는 그대로 둔다. */
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (typeof value !== "object" || value === null) return value;
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([key, inner]) => [key, sortedKeys(inner)]));
}

/** 항목을 비교할 문자열. 설명은 빼고, 키 순서는 보지 않는다. */
function withoutDescription(item: unknown): string {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return JSON.stringify(sortedKeys(item));
  }
  const kept = Object.entries(item).filter(([key]) => key !== "description");
  return JSON.stringify(sortedKeys(Object.fromEntries(kept)));
}

function nameOf(item: unknown): string {
  const name =
    typeof item === "object" && item !== null ? (item as Record<string, unknown>).name : undefined;
  return typeof name === "string" ? name : JSON.stringify(item);
}

/**
 * 계약의 실시간 항목(채널, 이벤트, 메시지)이 구현에 같은 모양으로 있는가. oasdiff는 이 확장을 보지 않는다.
 * 항목은 이름으로 짝짓고, 설명을 뺀 모양을 객체의 키 순서와 상관없이 비교한다(배열의 순서는 본다).
 * 구현에 더 있는 항목(프로젝트가 더한 모듈의 이벤트)은 괜찮다.
 */
export function realtimeMismatches(contract: OpenApiLike, implementation: OpenApiLike): string[] {
  const mismatches: string[] = [];
  for (const extension of REALTIME_EXTENSIONS) {
    const expected = contract[extension];
    if (!Array.isArray(expected)) continue;
    const actual = implementation[extension];
    const found = new Map(
      (Array.isArray(actual) ? actual : []).map((item: unknown) => [
        nameOf(item),
        withoutDescription(item),
      ]),
    );
    for (const item of expected) {
      if (found.get(nameOf(item)) !== withoutDescription(item)) {
        mismatches.push(`${extension}: ${nameOf(item)}`);
      }
    }
  }
  return mismatches;
}

/**
 * 양쪽에 모두 있는 operation마다 응답 상태 집합이 같은가. 항목 예: "DELETE /api/v1/me 422"
 * oasdiff는 성공 상태를 뺀 것만 깨는 변경(error)으로 보고, 에러 상태를 더하거나 뺀 것은 info로 둔다.
 * 그래서 선언을 한쪽만 고친 것을 여기서 잡는다.
 * 한쪽에만 있는 operation은 missingOperations와 extraOperations가 알리므로 여기서는 보지 않는다.
 */
export function statusDifferences(
  contract: OpenApiLike,
  implementation: OpenApiLike,
): Pick<Comparison, "missingStatuses" | "extraStatuses"> {
  const implemented = responseStatuses(implementation);
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [key, expected] of responseStatuses(contract)) {
    const actual = implemented.get(key);
    if (actual === undefined) continue;
    for (const status of expected) if (!actual.has(status)) missing.push(`${key} ${status}`);
    for (const status of actual) if (!expected.has(status)) extra.push(`${key} ${status}`);
  }
  return { missingStatuses: missing.sort(), extraStatuses: extra.sort() };
}

export interface CompareOptions {
  /** 구현에 있는 operation만 비교한다(구현 도중). 스키마는 그 operation에서 닿는 것만 요구한다. */
  readonly subset?: boolean;
}

/**
 * 계약의 스키마 이름은 모두 구현에 있어야 한다(구현의 보조 스키마가 더 있는 것은 괜찮다).
 * operation 집합은 정확히 같아야 한다. 경로 파라미터 이름은 달라도 된다.
 * 같은 operation은 응답 상태 집합도 정확히 같아야 한다(statusDifferences).
 * 계약의 실시간 항목은 구현에 같은 모양으로 있어야 한다(realtimeMismatches).
 * 부분 모드는 구현에 있는 operation만 남긴 계약과 비교한다. 계약에 없는 operation은 여전히 문제다.
 * 부분 모드는 실시간 항목을 보지 않는다.
 */
export function compareSpecs(
  contract: OpenApiLike,
  implementation: OpenApiLike,
  options: CompareOptions = {},
): Comparison {
  const target =
    options.subset === true ? restrictToImplemented(contract, implementation) : contract;
  const expectedSchemas =
    options.subset === true
      ? [...reachableSchemas(target)]
      : Object.keys(contract.components?.schemas ?? {});
  const implementedSchemas = new Set(Object.keys(implementation.components?.schemas ?? {}));
  const contractOperations = operationKeys(contract);
  const targetOperations = operationKeys(target);
  const implementedOperations = operationKeys(implementation);
  return {
    missingSchemas: expectedSchemas.filter((name) => !implementedSchemas.has(name)).sort(),
    missingOperations: [...targetOperations]
      .filter((key) => !implementedOperations.has(key))
      .sort(),
    extraOperations: [...implementedOperations]
      .filter((key) => !contractOperations.has(key))
      .sort(),
    ...statusDifferences(target, implementation),
    realtimeMismatches: options.subset === true ? [] : realtimeMismatches(contract, implementation),
  };
}

export function describeComparison(result: Comparison): string[] {
  return [
    ...result.missingSchemas.map(
      (name) => `스키마 ${name}가 구현 스펙에 없다. 계약과 같은 이름으로 모델을 만든다.`,
    ),
    ...result.missingOperations.map((key) => `${key}를 구현하지 않았다.`),
    ...result.extraOperations.map(
      (key) =>
        `${key}는 계약에 없다. 플랫폼 기능이면 계약(contract/typespec)에 먼저 추가하고, 프로젝트 전용 기능이면 생성된 프로젝트에서 만든다.`,
    ),
    ...result.missingStatuses.map(
      (item) =>
        `${item} 응답이 구현 스펙에 없다. 계약이 operation에 선언한 응답 상태는 구현도 모두 선언한다.`,
    ),
    ...result.extraStatuses.map(
      (item) =>
        `${item} 응답은 계약에 없다. 백엔드가 실제로 내는 상태면 계약(contract/typespec)에 먼저 선언하고, 아니면 구현의 선언에서 뺀다.`,
    ),
    ...result.realtimeMismatches.map(
      (item) => `${item}가 구현 스펙에 없거나 계약과 다르다. 계약의 실시간 선언과 같게 낸다.`,
    ),
  ];
}
```

- [ ] **Step 4: 문서를 고친다**

`AGENTS.md`를 고친다.

찾을 부분:

```markdown
| `pnpm gen`                                        | 계약을 컴파일하고 적합성 테스트와 목 서버의 타입을 다시 만든다                                                                                                                                                                                                                                    |
| `pnpm sync`                                       | 공유 자산 원본을 템플릿 사본 위치로 복사한다                                                                                                                                                                                                                                                      |
| `pnpm tool <oasdiff\|betterleaks>`                | 버전을 고정한 바이너리를 받아 실행한다                                                                                                                                                                                                                                                            |
| `pnpm spec-compare [--subset] <계약> <구현>`      | 백엔드 스펙이 계약과 이름·경로·실시간 선언이 같고 계약을 깨지 않는지 본다. `--subset`은 구현 도중에 구현한 operation만 비교한다                                                                                                                                                                   |
| `pnpm conformance <대상> [--keep] [흐름 파일...]` | 대상을 띄우고 적합성 흐름 테스트를 돌린 뒤 내린다. `fastapi`는 compose로 띄우고(Docker 필요) 템플릿의 개발 인프라와 같은 compose 프로젝트를 써서 개발 DB에 마이그레이션과 시드를 실행한다(끝나면 개발 인프라도 내려간다). `mock`은 목 서버를 로컬 프로세스로 띄운다. 흐름 파일을 주면 그것만 돈다 |

## 규칙
```

바꿀 내용:

```markdown
| `pnpm gen`                                        | 계약을 컴파일하고 적합성 테스트와 목 서버의 타입을 다시 만든다                                                                                                                                                                                                                                    |
| `pnpm sync`                                       | 공유 자산 원본을 템플릿 사본 위치로 복사한다                                                                                                                                                                                                                                                      |
| `pnpm tool <oasdiff\|betterleaks>`                | 버전을 고정한 바이너리를 받아 실행한다                                                                                                                                                                                                                                                            |
| `pnpm spec-compare [--subset] <계약> <구현>`      | 백엔드 스펙이 계약과 이름·경로·operation별 응답 상태·실시간 선언이 같고 계약을 깨지 않는지 본다. `--subset`은 구현 도중에 구현한 operation만 비교한다                                                                                                                                             |
| `pnpm conformance <대상> [--keep] [흐름 파일...]` | 대상을 띄우고 적합성 흐름 테스트를 돌린 뒤 내린다. `fastapi`는 compose로 띄우고(Docker 필요) 템플릿의 개발 인프라와 같은 compose 프로젝트를 써서 개발 DB에 마이그레이션과 시드를 실행한다(끝나면 개발 인프라도 내려간다). `mock`은 목 서버를 로컬 프로세스로 띄운다. 흐름 파일을 주면 그것만 돈다 |

## 규칙
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run(`scripts`에서): `pnpm exec vitest run test/spec-compare/compare.test.ts`

Expected: 통과한다.

```text
Test Files 1 passed (1)
Tests 17 passed (17)
```

- [ ] **Step 6: 검사를 돌린다**

Run(`templates/fastapi`에서): `uv run poe check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 건너뛴 단계가 있으면 `.cache/check`를 지우고 다시 돌린다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄

Run(저장소 루트에서): `pnpm spec-compare contract/openapi.yaml templates/fastapi/openapi.json`

Expected: 차이 없이 끝난다(종료 코드 0).

Run(저장소 루트에서): `pnpm conformance fastapi`

Expected: 마지막에 `Tests  84 passed (84)`. 끝나면 인프라가 내려가므로 `templates/fastapi`에서 `docker compose up -d --wait`로 다시 올린다.

Run(저장소 루트에서): `pnpm conformance mock`

Expected: 마지막에 `Tests  84 passed (84)`.

- [ ] **Step 7: 커밋한다**

```bash
git add \
  AGENTS.md \
  scripts/src/spec-compare/compare.ts \
  scripts/test/spec-compare/compare.test.ts
git commit -m "feat(spec-compare): compare response status codes per operation"
```


### Task 2: 계약: `DELETE /me`의 422, 리다이렉트의 406, 글 상태와 이벤트 문서의 설명

web 설계 §12.1의 계약 문제 셋. 두 백엔드가 이미 내는 상태를 계약과 FastAPI 선언이 함께 빠뜨렸고, 스키마 설명 넷이 틀렸다. 계약(`contract/typespec/src/`)과 FastAPI 선언을 같이 고치고 생성물을 다시 만든다. Task 1의 상태 비교가 두 쪽을 함께 고치게 한다.

- `DELETE /me`: 마지막 활성 admin의 탈퇴는 M2부터 422 `role.last_admin_protected`다(`users/service/profile.py`가 부르는 `protect_last_admin`). 계약 `users.tsp`의 `Me.delete`에 `UnprocessableEntity`를 더하고 설명 끝에 `마지막 활성 admin은 탈퇴할 수 없다(role.last_admin_protected, 422).`를 붙인다(`roles.tsp` DELETE의 선례). FastAPI `users/router.py`의 `DELETE_ME`는 `errors=(*AUTH_ERRORS, 422, *COMMON_ERRORS)`와 같은 설명이다.
- 리다이렉트: 협상 미들웨어(`core/jsonapi/negotiation.py`)는 `/api/` 아래 모든 요청의 `Accept`를 보므로 authorize와 callback도 406 `jsonapi.not_acceptable`을 낸다. 계약 `auth.tsp`의 두 operation에 `NotAcceptable`을 더한다. FastAPI `core/jsonapi/operation.py`의 `REDIRECT_ERRORS`는 `(400, 404, 406, 429, 500)`이고, 협상 에러가 없다고 적은 주석을 고친다(본문이 없어 415만 없다).
- 설명: `posts.tsp`의 파일 머리말(`/** 골든 모듈. … */`)이 바로 아래 `PostStatus`의 설명이 되었다. 머리말을 `//` 주석으로 바꾸고 `PostStatus`에 `글의 상태. draft는 작성자와 posts:manage만 보고, published는 누구나 본다.`를 단다. `realtime.tsp`의 글 이벤트 문서 셋(`is JsonApi.Document<PostResource>`)은 템플릿의 included 설명을 물려받았으므로 `post.created의 페이로드. 만든 글의 리소스 전체를 담는다.` 꼴의 제 설명을 단다. FastAPI `posts/models.py`의 `PostStatus` docstring(없어서 계약과 달랐다)과 `posts/schemas.py`의 세 docstring도 같은 문장이다. 골든 모듈이라 `gen:module`이 20자 이름으로 바꿔도 한 줄 100칸 안이어야 한다.
- 계약 테스트: `/api/` 아래 모든 operation이 406을 선언한다(`core.test.ts`). 두 리다이렉트의 상태 집합은 정확히 `302, 400, 404, 406, 429, 500`이다. `DELETE /me`에 422가 있다. `PostStatus`와 세 이벤트 문서가 제 설명을 쓴다. FastAPI 테스트는 두 선언(`test_the_contract_shape_of_a_redirect`, 새 `test_leaving_declares_the_last_admin_422`)과 리다이렉트의 406 동작(새 `test_a_redirect_negotiates_the_accept_header`)을 본다.
- 목의 동작은 그대로다. 목의 협상도 `/api/` 전체에 걸려 이미 406을 내고, `DELETE /me`도 이미 422다. `pnpm gen`이 목의 생성 타입만 다시 만든다.
- 적합성 `oauth.test.ts`에 흐름 하나를 더한다: `Accept`에 `ext` 매개변수가 붙은 JSON:API 미디어 타입만 보내면 authorize와 callback이 406이다. 406은 핸들러 앞에서 나므로 state를 만들지 않고 한도도 쓰지 않는다. `DELETE /me`의 422는 흐름을 두지 않는다(시드 관리자를 지울 위험).
- 실패 확인: 두 백엔드는 이미 406을 내지만 계약에 없어서, 새 흐름은 두 대상 모두 `ContractViolation: 계약 위반 1건: GET /api/v1/oauth/{provider}/authorize는 계약에 406 응답이 없다.`로 실패한다. 계약 테스트 다섯과 FastAPI 선언 테스트 둘(기대 목록의 `406`, `422`가 없다)도 실패한다. 리다이렉트의 406 동작 테스트는 부모 커밋에서도 통과한다(선언의 근거를 고정한다).

**Files:**
- Modify: `contract/typespec/src/realtime.tsp`, `contract/typespec/src/resources/auth.tsp`, `contract/typespec/src/resources/posts.tsp`, `contract/typespec/src/resources/users.tsp`, `templates/fastapi/src/app/core/jsonapi/operation.py`, `templates/fastapi/src/app/modules/posts/models.py`, `templates/fastapi/src/app/modules/posts/schemas.py`, `templates/fastapi/src/app/modules/users/router.py`
- Test: `contract/conformance/test/flows/oauth.test.ts`, `contract/typespec/test/accounts.test.ts`, `contract/typespec/test/auth.test.ts`, `contract/typespec/test/core.test.ts`, `contract/typespec/test/posts.test.ts`, `contract/typespec/test/realtime.test.ts`, `contract/typespec/test/spec.ts`, `templates/fastapi/src/app/core/jsonapi/tests/test_redirects.py`, `templates/fastapi/src/app/modules/users/tests/test_me.py`
- Generated(직접 고치지 않는다): `contract/conformance/src/generated/api.ts`, `contract/mock/src/generated/api.ts`, `contract/openapi.yaml`, `templates/fastapi/openapi.json`

**Interfaces:**
- Consumes: Task 1의 `statusDifferences`(계약과 FastAPI 선언의 상태 집합을 맞추게 한다). 계약 `errors.tsp`의 `UnprocessableEntity`, `NotAcceptable`, `AuthErrors`, `CommonErrors`. FastAPI `app.core.jsonapi.operation`의 `Operation`, `AUTH_ERRORS = (401, 403)`, `COMMON_ERRORS`, `REDIRECT_ERRORS`(쓰는 곳은 `auth/router/oauth.py`). 계약 테스트 도우미 `contract/typespec/test/spec.ts`의 `operation(method, path)`, `schema(name)`, `statuses(op)`. 적합성 `src/jsonapi/assertions.ts`의 `MEDIA_TYPE`, `test/flows/support.ts`의 `api`, `codes`, `FRONT_CALLBACK`
- Produces:
  - 계약: `Me.delete(): JsonApi.NoContent | AuthErrors | UnprocessableEntity | CommonErrors`(설명 끝에 `마지막 활성 admin은 탈퇴할 수 없다(role.last_admin_protected, 422).`). `OAuth.authorize`·`OAuth.callback`의 응답에 `| NotAcceptable`(`NotFound` 다음). `PostStatus`와 `PostCreatedEventDocument`·`PostUpdatedEventDocument`·`PostPublishedEventDocument`의 doc comment. `posts.tsp`의 머리말은 `//` 주석이다
  - FastAPI: `REDIRECT_ERRORS = (400, 404, 406, 429, 500)`, `DELETE_ME = Operation(name="delete", status_code=204, errors=(*AUTH_ERRORS, 422, *COMMON_ERRORS), description=…)`, `posts.models.PostStatus`(`StrEnum`)의 docstring, `posts/schemas.py`의 세 이벤트 문서 docstring
  - 계약 테스트 도우미: `test/spec.ts`의 `Schema.description?: string`. `core.test.ts`의 `operations()`가 `path`도 준다
  - 생성물: `contract/openapi.yaml`, `contract/conformance/src/generated/api.ts`, `contract/mock/src/generated/api.ts`, `templates/fastapi/openapi.json`
  - FastAPI 테스트 `test_leaving_declares_the_last_admin_422(app)`(`users/tests/test_me.py`), `test_a_redirect_negotiates_the_accept_header(browser)`(`core/jsonapi/tests/test_redirects.py`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`contract/conformance/test/flows/oauth.test.ts`를 고친다.

(1) 찾을 부분:

```ts
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OAuthProvider, OAuthReturn } from "../../src/side-channels.ts";
import {
  api,
```

바꿀 내용:

```ts
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MEDIA_TYPE } from "../../src/jsonapi/assertions.ts";
import type { OAuthProvider, OAuthReturn } from "../../src/side-channels.ts";
import {
  api,
```

(2) 찾을 부분:

```ts
    expect(missing.status).toBe(404);
  });

  it("codeChallenge가 없거나 형식이 틀리면 400이고, codeVerifier가 안 맞거나 RFC 7636 형식이 아니면 401이며 코드는 그때 이미 쓴다", async () => {
    const redirectUri = encodeURIComponent(FRONT_CALLBACK);
    const queries = [
```

바꿀 내용:

```ts
    expect(missing.status).toBe(404);
  });

  it("authorize와 callback도 Accept를 협상한다: 매개변수가 붙은 JSON:API 미디어 타입만 받으면 406이다", async () => {
    const headers = { Accept: `${MEDIA_TYPE}; ext="https://example.com/ext"` };
    const authorize = await api().GET("/api/v1/oauth/{provider}/authorize", {
      params: {
        path: { provider: "google" },
        query: { redirectUri: FRONT_CALLBACK, codeChallenge: VALID_CODE_CHALLENGE },
      },
      headers,
      redirect: "manual",
    });
    expect(authorize.response.status).toBe(406);
    expect(codes(authorize.error)).toEqual(["jsonapi.not_acceptable"]);
    const callback = await api().GET("/api/v1/oauth/{provider}/callback", {
      params: { path: { provider: "google" }, query: { state: randomUUID() } },
      headers,
      redirect: "manual",
    });
    expect(callback.response.status).toBe(406);
    expect(codes(callback.error)).toEqual(["jsonapi.not_acceptable"]);
  });

  it("codeChallenge가 없거나 형식이 틀리면 400이고, codeVerifier가 안 맞거나 RFC 7636 형식이 아니면 401이며 코드는 그때 이미 쓴다", async () => {
    const redirectUri = encodeURIComponent(FRONT_CALLBACK);
    const queries = [
```

`contract/typespec/test/accounts.test.ts`를 고친다.

찾을 부분:

```ts
    expect(meta?.required).toEqual(["permissions"]);
  });

  it("PATCH /me와 DELETE /me(탈퇴)가 있다", () => {
    expect(requestRef(operation("patch", "/api/v1/me"))).toBe("UserMeUpdateDocument");
    expect(statuses(operation("delete", "/api/v1/me"))).toContain("204");
  });

  it("관리용 목록은 users:read 권한과 필터를 선언한다", () => {
```

바꿀 내용:

```ts
    expect(meta?.required).toEqual(["permissions"]);
  });

  it("PATCH /me와 DELETE /me(탈퇴)가 있고, 마지막 활성 admin의 탈퇴는 422다", () => {
    expect(requestRef(operation("patch", "/api/v1/me"))).toBe("UserMeUpdateDocument");
    const leave = operation("delete", "/api/v1/me");
    expect(statuses(leave)).toContain("204");
    expect(statuses(leave)).toContain("422");
  });

  it("관리용 목록은 users:read 권한과 필터를 선언한다", () => {
```

`contract/typespec/test/auth.test.ts`를 고친다.

찾을 부분:

```ts
    }
  });

  it("제공자는 google, kakao, naver다", () => {
    expect(schema("OAuthProvider").enum).toEqual(["google", "kakao", "naver"]);
  });
```

바꿀 내용:

```ts
    }
  });

  it("authorize와 callback의 Accept도 협상하므로 406을 선언한다(본문이 없어 413·415·422는 없다)", () => {
    for (const path of [
      "/api/v1/oauth/{provider}/authorize",
      "/api/v1/oauth/{provider}/callback",
    ]) {
      expect(statuses(operation("get", path)), path).toEqual([
        "302",
        "400",
        "404",
        "406",
        "429",
        "500",
      ]);
    }
  });

  it("제공자는 google, kakao, naver다", () => {
    expect(schema("OAuthProvider").enum).toEqual(["google", "kakao", "naver"]);
  });
```

`contract/typespec/test/core.test.ts`를 고친다.

(1) 찾을 부분:

```ts
});

/** 계약의 모든 operation을 `메서드 경로`와 함께 돌려준다. */
function operations(): { key: string; method: string; op: Operation }[] {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, op]) => ({
      key: `${method.toUpperCase()} ${path}`,
      method,
      op,
    })),
```

바꿀 내용:

```ts
});

/** 계약의 모든 operation을 `메서드 경로`와 함께 돌려준다. */
function operations(): { key: string; path: string; method: string; op: Operation }[] {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, op]) => ({
      key: `${method.toUpperCase()} ${path}`,
      path,
      method,
      op,
    })),
```

(2) 찾을 부분:

```ts
  });
});

describe("필터", () => {
  it("관계로 거르는 필터는 관련 리소스의 id(uuid)를 받는다", () => {
    const filters = [
```

바꿀 내용:

```ts
  });
});

describe("콘텐츠 협상 (JSON:API 1.1)", () => {
  it("/api/ 아래의 모든 operation은 406을 선언한다(OAuth 리다이렉트도 Accept를 협상한다)", () => {
    const missing = operations()
      .filter(({ path, op }) => path.startsWith("/api/") && !("406" in op.responses))
      .map(({ key }) => key);
    expect(missing).toEqual([]);
  });
});

describe("필터", () => {
  it("관계로 거르는 필터는 관련 리소스의 id(uuid)를 받는다", () => {
    const filters = [
```

`contract/typespec/test/posts.test.ts`를 고친다.

찾을 부분:

```ts
    const tooMany = operation("get", COLLECTION).responses["429"];
    expect(Object.keys(tooMany?.headers ?? {})).toContain("Retry-After");
  });
});

describe("감사 로그 (§4.6)", () => {
```

바꿀 내용:

```ts
    const tooMany = operation("get", COLLECTION).responses["429"];
    expect(Object.keys(tooMany?.headers ?? {})).toContain("Retry-After");
  });

  it("PostStatus의 설명은 글의 상태를 말한다(파일 머리말이 붙지 않는다)", () => {
    const description = schema("PostStatus").description ?? "";
    expect(description).toMatch(/^글의 상태\./);
    expect(description).not.toContain("골든 모듈");
  });
});

describe("감사 로그 (§4.6)", () => {
```

`contract/typespec/test/realtime.test.ts`를 고친다.

찾을 부분:

```ts
    expect(resourceType(schema("PostResource"))).toBe("posts");
  });

  it("공개 채널과 권한이 필요한 채널을 구분한다", () => {
    expect(channels).toEqual([
      expect.objectContaining({ name: "posts", permission: null }),
```

바꿀 내용:

```ts
    expect(resourceType(schema("PostResource"))).toBe("posts");
  });

  it("리소스를 담는 글 이벤트 문서는 제 이벤트를 설명한다(Document 템플릿의 included 설명이 아니다)", () => {
    for (const name of ["post.created", "post.updated", "post.published"]) {
      const payload = events.find((event) => event.name === name)?.payload ?? "";
      const description = schema(payload).description ?? "";
      expect(description, payload).toMatch(
        new RegExp(`^${name.replace(".", "\\.")}의 페이로드\\.`),
      );
      expect(description, payload).not.toContain("included");
    }
  });

  it("공개 채널과 권한이 필요한 채널을 구분한다", () => {
    expect(channels).toEqual([
      expect.objectContaining({ name: "posts", permission: null }),
```

`contract/typespec/test/spec.ts`를 고친다.

찾을 부분:

```ts
  anyOf?: Schema[];
  oneOf?: Schema[];
  $ref?: string;
}

export interface Parameter {
```

바꿀 내용:

```ts
  anyOf?: Schema[];
  oneOf?: Schema[];
  $ref?: string;
  description?: string;
}

export interface Parameter {
```

`templates/fastapi/src/app/core/jsonapi/tests/test_redirects.py`를 고친다.

(1) 찾을 부분:

```python
"""리다이렉트 operation: 302와 Location, JSON:API 밖의 쿼리 파라미터.

콜백은 선언하지 않은 파라미터(제공자가 덧붙이는 것)를 받는다.
"""
```

바꿀 내용:

```python
"""리다이렉트 operation: 302와 Location, JSON:API 밖의 쿼리 파라미터, Accept 협상(406).

콜백은 선언하지 않은 파라미터(제공자가 덧붙이는 것)를 받는다.
"""
```

(2) 찾을 부분:

```python

from app.core.access import install_access
from app.core.jsonapi.install import install_jsonapi
from app.core.jsonapi.openapi import JsonApiApp
from app.core.jsonapi.operation import (
    REDIRECT_ERRORS,
```

바꿀 내용:

```python

from app.core.access import install_access
from app.core.jsonapi.install import install_jsonapi
from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE
from app.core.jsonapi.openapi import JsonApiApp
from app.core.jsonapi.operation import (
    REDIRECT_ERRORS,
```

(3) 찾을 부분:

```python
    assert response.headers["location"] == f"{FRONT}?kind=red"


@pytest.mark.parametrize(
    "params",
    [
```

바꿀 내용:

```python
    assert response.headers["location"] == f"{FRONT}?kind=red"


async def test_a_redirect_negotiates_the_accept_header(browser: httpx.AsyncClient) -> None:
    """협상 미들웨어는 /api/ 아래 모든 요청의 Accept를 본다. 그래서 리다이렉트도 406을 선언한다."""
    accept = f'{JSONAPI_MEDIA_TYPE}; ext="https://example.com/ext"'
    response = await browser.get(
        "/api/v1/doors/red/open", params={"to": FRONT}, headers={"accept": accept}
    )
    assert response.status_code == 406
    [error] = response.json()["errors"]
    assert error["code"] == "jsonapi.not_acceptable"


@pytest.mark.parametrize(
    "params",
    [
```

(4) 찾을 부분:

```python
        "schema": {"type": "string", "format": "uri"},
        "explode": False,
    }
    assert sorted(operation["responses"]) == ["302", "400", "404", "429", "500"]
    assert operation["responses"]["302"] == {
        "description": "Redirection",
        "headers": {"location": {"required": True, "schema": {"type": "string", "format": "uri"}}},
```

바꿀 내용:

```python
        "schema": {"type": "string", "format": "uri"},
        "explode": False,
    }
    assert sorted(operation["responses"]) == ["302", "400", "404", "406", "429", "500"]
    assert operation["responses"]["302"] == {
        "description": "Redirection",
        "headers": {"location": {"required": True, "schema": {"type": "string", "format": "uri"}}},
```

`templates/fastapi/src/app/modules/users/tests/test_me.py`를 고친다.

(1) 찾을 부분:

```python

from app.core.audit import AuditLog
from app.core.db import utc_now
from app.core.storage import Storage
from app.modules.files import File, FileStatus
from app.modules.roles import Role, UserRole
```

바꿀 내용:

```python

from app.core.audit import AuditLog
from app.core.db import utc_now
from app.core.jsonapi.openapi import JsonApiApp
from app.core.storage import Storage
from app.modules.files import File, FileStatus
from app.modules.roles import Role, UserRole
```

(2) 찾을 부분:

```python
            .where(Role.name == "admin")
        )
    assert admins == 1
```

바꿀 내용:

```python
            .where(Role.name == "admin")
        )
    assert admins == 1


async def test_leaving_declares_the_last_admin_422(app: JsonApiApp) -> None:
    """계약처럼 탈퇴 선언에 422(role.last_admin_protected)가 있다."""
    responses = app.openapi()["paths"][ME]["delete"]["responses"]
    assert sorted(responses) == ["204", "400", "401", "403", "406", "422", "429", "500", "503"]
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`contract/typespec`에서): `pnpm exec vitest run test/accounts.test.ts test/auth.test.ts test/core.test.ts test/posts.test.ts test/realtime.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× /api/ 아래의 모든 operation은 406을 선언한다(OAuth 리다이렉트도 Accept를 협상한다)
× PostStatus의 설명은 글의 상태를 말한다(파일 머리말이 붙지 않는다)
× authorize와 callback의 Accept도 협상하므로 406을 선언한다(본문이 없어 413·415·422는 없다)
× PATCH /me와 DELETE /me(탈퇴)가 있고, 마지막 활성 admin의 탈퇴는 422다
× 리소스를 담는 글 이벤트 문서는 제 이벤트를 설명한다(Document 템플릿의 included 설명이 아니다)
FAIL  test/accounts.test.ts > 사용자 (§4.10, §5.6) > PATCH /me와 DELETE /me(탈퇴)가 있고, 마지막 활성 admin의 탈퇴는 422다
AssertionError: expected [ '204', '400', '401', '403', …(4) ] to include '422'
FAIL  test/auth.test.ts > OAuth 리다이렉트 (JSON:API 예외) > authorize와 callback의 Accept도 협상하므로 406을 선언한다(본문이 없어 413·415·422는 없다)
Test Files 5 failed (5)
Tests 5 failed | 56 passed (61)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/core/jsonapi/tests/test_redirects.py src/app/modules/users/tests/test_me.py`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
E       AssertionError: assert ['302', '400'... '429', '500'] == ['302', '400'... '429', '500']
E       AssertionError: assert ['204', '400'...', '429', ...] == ['204', '400'...', '422', ...]
FAILED src/app/core/jsonapi/tests/test_redirects.py::test_the_contract_shape_of_a_redirect
FAILED src/app/modules/users/tests/test_me.py::test_leaving_declares_the_last_admin_422
E       AssertionError: assert ['302', '400'... '429', '500'] == ['302', '400'... '429', '500']
E       AssertionError: assert ['204', '400'...', '429', ...] == ['204', '400'...', '422', ...]
FAILED src/app/core/jsonapi/tests/test_redirects.py::test_the_contract_shape_of_a_redirect
FAILED src/app/modules/users/tests/test_me.py::test_leaving_declares_the_last_admin_422
2 failed, 26 passed in
```

Run(저장소 루트에서): `pnpm conformance fastapi test/flows/oauth.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× authorize와 callback도 Accept를 협상한다: 매개변수가 붙은 JSON:API 미디어 타입만 받으면 406이다
FAIL  test/flows/oauth.test.ts > 소셜 로그인 (fastapi) > authorize와 callback도 Accept를 협상한다: 매개변수가 붙은 JSON:API 미디어 타입만 받으면 406이다
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
× "pnpm recursive run" failed in C:\Users\rootj\.cache\ai-template-
Test Files 1 failed (1)
Tests 1 failed | 12 passed (13)
```

Run(저장소 루트에서): `pnpm conformance mock test/flows/oauth.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× authorize와 callback도 Accept를 협상한다: 매개변수가 붙은 JSON:API 미디어 타입만 받으면 406이다
FAIL  test/flows/oauth.test.ts > 소셜 로그인 (mock) > authorize와 callback도 Accept를 협상한다: 매개변수가 붙은 JSON:API 미디어 타입만 받으면 406이다
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
× "pnpm recursive run" failed in C:\Users\rootj\.cache\ai-template-
Test Files 1 failed (1)
Tests 1 failed | 12 passed (13)
```

- [ ] **Step 3: 계약(TypeSpec)을 고친다**

`contract/typespec/src/realtime.tsp`를 고친다.

찾을 부분:

```typespec
  };
}

model PostCreatedEventDocument is JsonApi.Document<PostResource>;
model PostUpdatedEventDocument is JsonApi.Document<PostResource>;
model PostPublishedEventDocument is JsonApi.Document<PostResource>;

/** 발행을 취소한 글. 초안의 내용이 공개 채널로 나가지 않게 식별자만 담는다. */
```

바꿀 내용:

```typespec
  };
}

/** post.created의 페이로드. 만든 글의 리소스 전체를 담는다. */
model PostCreatedEventDocument is JsonApi.Document<PostResource>;

/** post.updated의 페이로드. 바뀐 뒤 글의 리소스 전체를 담는다. */
model PostUpdatedEventDocument is JsonApi.Document<PostResource>;

/** post.published의 페이로드. 발행한 글의 리소스 전체를 담는다. */
model PostPublishedEventDocument is JsonApi.Document<PostResource>;

/** 발행을 취소한 글. 초안의 내용이 공개 채널로 나가지 않게 식별자만 담는다. */
```

`contract/typespec/src/resources/auth.tsp`를 고친다.

(1) 찾을 부분:

```typespec
      }
    | BadRequest
    | NotFound
    | TooManyRequests
    | InternalServerError;

```

바꿀 내용:

```typespec
      }
    | BadRequest
    | NotFound
    | NotAcceptable
    | TooManyRequests
    | InternalServerError;

```

(2) 찾을 부분:

```typespec
      }
    | BadRequest
    | NotFound
    | TooManyRequests
    | InternalServerError;
}
```

바꿀 내용:

```typespec
      }
    | BadRequest
    | NotFound
    | NotAcceptable
    | TooManyRequests
    | InternalServerError;
}
```

`contract/typespec/src/resources/posts.tsp`를 고친다.

찾을 부분:

```typespec

namespace Platform;

/** 골든 모듈. 새 리소스는 이 파일의 구조를 그대로 따른다. */
union PostStatus {
  "draft",
  "published",
```

바꿀 내용:

```typespec

namespace Platform;

// 골든 모듈. 새 리소스는 이 파일의 구조를 그대로 따른다.

/** 글의 상태. draft는 작성자와 posts:manage만 보고, published는 누구나 본다. */
union PostStatus {
  "draft",
  "published",
```

`contract/typespec/src/resources/users.tsp`를 고친다.

찾을 부분:

```typespec
    | BodyErrors
    | CommonErrors;

  /** 회원 탈퇴. 개인정보를 익명화하고 모든 세션을 폐기한다. 로그인한 지 10분 안의 세션만 할 수 있다. 지났으면 401 auth.reauthentication_required이고, 다시 로그인해 받은 새 세션으로 부른다(refresh로는 풀리지 않는다). */
  @delete
  delete(): JsonApi.NoContent | AuthErrors | CommonErrors;
}

@route("/api/v1/users")
```

바꿀 내용:

```typespec
    | BodyErrors
    | CommonErrors;

  /** 회원 탈퇴. 개인정보를 익명화하고 모든 세션을 폐기한다. 로그인한 지 10분 안의 세션만 할 수 있다. 지났으면 401 auth.reauthentication_required이고, 다시 로그인해 받은 새 세션으로 부른다(refresh로는 풀리지 않는다). 마지막 활성 admin은 탈퇴할 수 없다(role.last_admin_protected, 422). */
  @delete
  delete(): JsonApi.NoContent | AuthErrors | UnprocessableEntity | CommonErrors;
}

@route("/api/v1/users")
```

- [ ] **Step 4: FastAPI core를 고친다**

`templates/fastapi/src/app/core/jsonapi/operation.py`를 고친다.

찾을 부분:

```python
AUTH_ERRORS = (401, 403)
NOT_FOUND = (404,)
CONFLICT = (409,)
# 리다이렉트(RedirectOperation)의 에러. 브라우저가 이동하는 요청이라 협상 에러(406, 415)가 없다.
REDIRECT_ERRORS = (400, 404, 429, 500)
# 모든 POST에 넣는다: 클라이언트가 만든 id는 403, 본문의 type 불일치는 409다(JSON:API 1.1).
# 로그인이 필요한 POST에서 AUTH_ERRORS와 403이 겹쳐도 된다. 응답은 상태마다 하나다.
CREATE_ERRORS = (403, 409)
```

바꿀 내용:

```python
AUTH_ERRORS = (401, 403)
NOT_FOUND = (404,)
CONFLICT = (409,)
# 리다이렉트(RedirectOperation)의 에러. 본문이 없어 415는 없다. 협상 미들웨어가 /api/ 아래
# 모든 요청의 Accept를 보므로 406은 있다.
REDIRECT_ERRORS = (400, 404, 406, 429, 500)
# 모든 POST에 넣는다: 클라이언트가 만든 id는 403, 본문의 type 불일치는 409다(JSON:API 1.1).
# 로그인이 필요한 POST에서 AUTH_ERRORS와 403이 겹쳐도 된다. 응답은 상태마다 하나다.
CREATE_ERRORS = (403, 409)
```

- [ ] **Step 5: FastAPI users 모듈을 고친다**

`templates/fastapi/src/app/modules/users/router.py`를 고친다.

찾을 부분:

```python
DELETE_ME = Operation(
    name="delete",
    status_code=204,
    errors=AUTH_ERRORS + COMMON_ERRORS,
    description=(
        "회원 탈퇴. 개인정보를 익명화하고 모든 세션을 폐기한다. 로그인한 지 10분 안의 세션만 "
        "할 수 있다. 지났으면 401 auth.reauthentication_required이고, 다시 로그인해 받은 새 "
        "세션으로 부른다(refresh로는 풀리지 않는다)."
    ),
)
LIST = CollectionOperation(
```

바꿀 내용:

```python
DELETE_ME = Operation(
    name="delete",
    status_code=204,
    errors=(*AUTH_ERRORS, 422, *COMMON_ERRORS),
    description=(
        "회원 탈퇴. 개인정보를 익명화하고 모든 세션을 폐기한다. 로그인한 지 10분 안의 세션만 "
        "할 수 있다. 지났으면 401 auth.reauthentication_required이고, 다시 로그인해 받은 새 "
        "세션으로 부른다(refresh로는 풀리지 않는다). 마지막 활성 admin은 탈퇴할 수 없다"
        "(role.last_admin_protected, 422)."
    ),
)
LIST = CollectionOperation(
```

- [ ] **Step 6: FastAPI posts 모듈을 고친다**

`templates/fastapi/src/app/modules/posts/models.py`를 고친다.

찾을 부분:

```python
from app.core.db import Base, utc_now


# 글의 상태(계약의 PostStatus). 계약에 설명이 없어 docstring을 두지 않는다.
class PostStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"

```

바꿀 내용:

```python
from app.core.db import Base, utc_now


class PostStatus(StrEnum):
    """글의 상태. draft는 작성자와 posts:manage만 보고, published는 누구나 본다."""

    DRAFT = "draft"
    PUBLISHED = "published"

```

`templates/fastapi/src/app/modules/posts/schemas.py`를 고친다.

찾을 부분:

```python

# 실시간 이벤트의 페이로드(계약의 realtime.tsp). 보내는 곳은 events.py다.
class PostCreatedEventDocument(Document[PostResource]):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""


class PostUpdatedEventDocument(Document[PostResource]):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""


class PostPublishedEventDocument(Document[PostResource]):
    """단건 문서. 포함 리소스가 있으면 리소스 파일에서 included를 덧붙인다."""


class PostUnpublishedEventDocument(JsonApiModel):
```

바꿀 내용:

```python

# 실시간 이벤트의 페이로드(계약의 realtime.tsp). 보내는 곳은 events.py다.
class PostCreatedEventDocument(Document[PostResource]):
    """post.created의 페이로드. 만든 글의 리소스 전체를 담는다."""


class PostUpdatedEventDocument(Document[PostResource]):
    """post.updated의 페이로드. 바뀐 뒤 글의 리소스 전체를 담는다."""


class PostPublishedEventDocument(Document[PostResource]):
    """post.published의 페이로드. 발행한 글의 리소스 전체를 담는다."""


class PostUnpublishedEventDocument(JsonApiModel):
```

- [ ] **Step 7: 생성물을 다시 만든다**

Run(저장소 루트에서): `pnpm gen`

계약을 컴파일하고(`contract/openapi.yaml`) 적합성 키트와 목의 타입을 다시 만든다.

- `contract/openapi.yaml`: `Me_delete`의 설명 끝 문장과 `422` 응답, `OAuth_authorize`·`OAuth_callback`의 `406` 응답, 스키마 넷(`PostStatus`, `PostCreatedEventDocument`, `PostUpdatedEventDocument`, `PostPublishedEventDocument`)의 설명만 바뀐다.
- `contract/conformance/src/generated/api.ts`, `contract/mock/src/generated/api.ts`: 같은 변화가 설명(JSDoc) 다섯 곳과 응답 셋(`Me_delete`의 `422`, 두 리다이렉트의 `406`)으로 들어간다. 두 파일은 바이트까지 같다.

Run(`templates/fastapi`에서): `uv run poe gen`

Expected: `openapi.json을 새로 썼다.`

- `templates/fastapi/openapi.json`: 같은 네 가지가 바뀐다. `Me_delete`의 설명과 `422`, 두 리다이렉트의 `406`, 스키마 넷의 설명이다. `PostStatus`는 전에 설명이 없었고 이제 계약과 같은 문장을 가진다.

올바른 결과: 바뀐 생성물은 이 넷뿐이고, 네 설명은 계약과 `openapi.json`에서 같은 문자열이다(구조 비교는 설명을 보지 않으므로 눈으로 맞춘다). `pnpm run --silent spec-compare contract/openapi.yaml templates/fastapi/openapi.json`은 출력 없이 끝난다. 한쪽만 다시 만들면 Task 1의 비교가 `DELETE /api/v1/me 422 응답이 구현 스펙에 없다. …`처럼 차이마다 한 줄을 찍고 종료 코드 1로 끝난다.

- [ ] **Step 8: 테스트가 통과하는지 확인한다**

Run(`contract/typespec`에서): `pnpm exec vitest run test/accounts.test.ts test/auth.test.ts test/core.test.ts test/posts.test.ts test/realtime.test.ts`

Expected: 통과한다.

```text
Test Files 5 passed (5)
Tests 61 passed (61)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/core/jsonapi/tests/test_redirects.py src/app/modules/users/tests/test_me.py`

Expected: 통과한다.

```text
28 passed in
```

Run(저장소 루트에서): `pnpm conformance fastapi test/flows/oauth.test.ts`

Expected: 새 흐름의 GREEN을 가르는 것은 백엔드가 아니라 계약이다. 두 백엔드의 동작은 그대로이고, 계약과 생성물이 406을 선언한 뒤에 두 대상의 흐름이 통과한다.

```text
Test Files 1 passed (1)
Tests 13 passed (13)
```

Run(저장소 루트에서): `pnpm conformance mock test/flows/oauth.test.ts`

Expected: 새 흐름의 GREEN을 가르는 것은 백엔드가 아니라 계약이다. 두 백엔드의 동작은 그대로이고, 계약과 생성물이 406을 선언한 뒤에 두 대상의 흐름이 통과한다.

```text
Test Files 1 passed (1)
Tests 13 passed (13)
```

- [ ] **Step 9: 검사를 돌린다**

Run(`templates/fastapi`에서): `uv run poe check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 건너뛴 단계가 있으면 `.cache/check`를 지우고 다시 돌린다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄

Run(저장소 루트에서): `pnpm spec-compare contract/openapi.yaml templates/fastapi/openapi.json`

Expected: 차이 없이 끝난다(종료 코드 0).

Run(저장소 루트에서): `pnpm conformance fastapi`

Expected: 마지막에 `Tests  85 passed (85)`. 끝나면 인프라가 내려가므로 `templates/fastapi`에서 `docker compose up -d --wait`로 다시 올린다.

Run(저장소 루트에서): `pnpm conformance mock`

Expected: 마지막에 `Tests  85 passed (85)`.

- [ ] **Step 10: 커밋한다**

```bash
git add \
  contract/conformance/src/generated/api.ts \
  contract/conformance/test/flows/oauth.test.ts \
  contract/mock/src/generated/api.ts \
  contract/openapi.yaml \
  contract/typespec/src/realtime.tsp \
  contract/typespec/src/resources/auth.tsp \
  contract/typespec/src/resources/posts.tsp \
  contract/typespec/src/resources/users.tsp \
  contract/typespec/test/accounts.test.ts \
  contract/typespec/test/auth.test.ts \
  contract/typespec/test/core.test.ts \
  contract/typespec/test/posts.test.ts \
  contract/typespec/test/realtime.test.ts \
  contract/typespec/test/spec.ts \
  templates/fastapi/openapi.json \
  templates/fastapi/src/app/core/jsonapi/operation.py \
  templates/fastapi/src/app/core/jsonapi/tests/test_redirects.py \
  templates/fastapi/src/app/modules/posts/models.py \
  templates/fastapi/src/app/modules/posts/schemas.py \
  templates/fastapi/src/app/modules/users/router.py \
  templates/fastapi/src/app/modules/users/tests/test_me.py
git commit -m "fix(contract): declare DELETE /me's 422 and the OAuth redirects' 406"
```


### Task 3: grant 필드 오류의 pointer와 strict 정수

web 설계 §12.1의 FastAPI 문제 둘. 둘 다 요청 검증의 공통 계층(`core/jsonapi/`)이 계약과 다르게 답했다. 목은 이미 계약대로 답하고 FastAPI와의 차이로 적어 두었다.

- 판별 유니온의 pointer: Pydantic은 판별 유니온(`SessionGrant`)의 loc에 태그 값을 끼운다. `core/jsonapi/errors.py`의 `document_path`는 본문에 없는 조각만 태그로 보고 건너뛰었다. 그래서 태그와 이름이 같은 필드(password grant의 `password`, refresh grant의 `refreshToken`)가 본문에 있으면 틀린 이메일이 `/data/attributes/password/email`을, 숫자 refresh token이 `/data/attributes/refreshToken/refreshToken`을 가리켰다. 이제 마지막이 아닌 조각이 객체나 배열을 가리키지 않으면 건너뛴다. 객체와 배열을 따라가는 경로(`/data/relationships/roles/data/0/id`)는 그대로다. 태그와 이름이 같은 필드에 객체나 배열을 보낸 경우만 그 값 아래를 가리킨다.
- strict 정수: `core/jsonapi/models.py`의 `Int32`·`Int64`에 `Strict()`를 넣는다. Pydantic lax 모드는 `POST /files`의 `size`에 온 `"10"`, `" 10 "`, `true`를 정수로 받았다. 이제 숫자 문자열, 불리언, `json.loads`가 float로 읽는 `10.0`·`1e3`이 모두 422 `validation.invalid_format`(`Input should be a valid integer`)이다. JSON 스키마는 그대로라 `openapi.json`과 계약은 바뀌지 않는다. 모듈 docstring에 "문서 모델의 정수는 `int`가 아니라 `Int32`·`Int64`"를 적는다.
- FastAPI 테스트: 판별 유니온의 pointer를 (attributes, 오류 종류, loc, pointer)로 parametrize하고, 객체·배열 경로(가드), 정수(샘플 widgets의 `size`에 `"10"`, `True`, `10.0`), `Strict()`가 스키마에 새지 않음(가드)을 본다. `test_bad_grants`와 files의 `test_create_checks_the_size_and_type`에 두 경우씩 더한다.
- 목: 두 동작은 이미 계약대로다. `pydantic-messages.ts`의 `typeMessage`에서 lax의 소수 문구(`got a number with a fractional part`)와 그 분기만 쓰던 `value` 인자를 빼, strict 정수와 같은 문구를 낸다. `validation.ts` 머리 주석과 `AGENTS.md`의 "FastAPI와 다른 점"은 남는 두 경계로 바꾼다: `10.0`·`1e3`은 목만 받는다, 태그와 이름이 같은 grant 필드에 객체나 배열을 보내면 FastAPI만 그 아래를 가리킨다.
- 적합성 `jsonapi.test.ts`에 흐름 둘: password grant의 틀린 이메일(`password: "x"`와 함께)과 숫자 `refreshToken`이 본문의 위치를 가리키고, `POST /files`의 `size: "10"`과 `size: true`가 422 `validation.invalid_format`이다. 검증에서 끝나므로 로그인 한도와 파일 한도를 쓰지 않는다.
- 실패 확인: 부모 커밋의 FastAPI는 pointer가 `/data/attributes/password/email`, `/data/attributes/refreshToken/refreshToken`이고, 정수 자리의 문자열과 불리언에 201이다(단위 테스트와 흐름 둘 모두). 목 단위 테스트는 "소수 size"의 문구 하나만 실패하고, 목 대상의 흐름은 처음부터 통과한다.

**Files:**
- Modify: `contract/mock/AGENTS.md`, `contract/mock/src/jsonapi/pydantic-messages.ts`, `contract/mock/src/jsonapi/validation-errors.ts`, `contract/mock/src/jsonapi/validation.ts`, `templates/fastapi/src/app/core/jsonapi/errors.py`, `templates/fastapi/src/app/core/jsonapi/models.py`
- Test: `contract/conformance/test/flows/jsonapi.test.ts`, `contract/mock/test/validation.test.ts`, `templates/fastapi/src/app/core/jsonapi/tests/test_errors.py`, `templates/fastapi/src/app/core/jsonapi/tests/test_openapi.py`, `templates/fastapi/src/app/modules/auth/tests/test_sessions.py`, `templates/fastapi/src/app/modules/files/tests/test_api.py`

**Interfaces:**
- Consumes: `app.core.jsonapi.errors`의 `document_path(body: object, parts: Sequence[int | str]) -> list[int | str]`(`_child`, `_ABSENT`), `validation_error_objects(errors: Sequence[Mapping[str, Any]], body: object = None) -> tuple[int, list[ErrorObject]]`. `app.core.jsonvalue`의 `is_object`, `is_array`. `app.core.jsonapi.models`의 `Int32`, `Int64`(요청에서 쓰는 곳은 `files/schemas.py`의 `FileCreateAttributes.size`). 샘플 `core/jsonapi/tests/sample.py`의 `Size = Annotated[Int32, Field(ge=1, le=100)]`, `widget_document(**attributes)`. 목 `src/jsonapi/pydantic-messages.ts`의 `typeMessage`, `validation-errors.ts`의 `toIssue`. 적합성 `jsonapi.test.ts`의 `send(path, options)`(`method`, `body`, `token`), `support.ts`의 `api`, `newUser`, `problems`
- Produces:
  - `document_path`의 새 규칙: `index < len(parts) - 1 and not (is_object(child) or is_array(child))`이면 그 조각을 건너뛴다(시그니처는 그대로)
  - `Int32 = Annotated[int, Strict(), Field(json_schema_extra={"format": "int32"})]`, `Int64 = Annotated[int, Strict(), Field(json_schema_extra={"format": "int64"})]`
  - 목 `typeMessage(expected: string): string`(인자 `value`와 `integer` 분기를 뺐다. `validation-errors.ts`가 `typeMessage(String(params.type))`로 부른다)
  - FastAPI 테스트: `test_discriminated_union_errors_point_into_the_document`(parametrize), `test_error_pointers_follow_objects_and_arrays`, `test_integers_refuse_strings_booleans_and_floats`, `test_strict_integers_keep_the_contract_schema`. `test_bad_grants`의 `attributes`는 `dict[str, object]`다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`contract/conformance/test/flows/jsonapi.test.ts`를 고친다.

(1) 찾을 부분:

```ts
  MEDIA_TYPE,
} from "../../src/jsonapi/assertions.ts";
import { validateSchema } from "../../src/validation.ts";
import { type ErrorDocument, newUser, PASSWORD, problems, signInAdmin, target } from "./support.ts";

interface Sent {
  readonly status: number;
```

바꿀 내용:

```ts
  MEDIA_TYPE,
} from "../../src/jsonapi/assertions.ts";
import { validateSchema } from "../../src/validation.ts";
import {
  api,
  type ErrorDocument,
  newUser,
  PASSWORD,
  problems,
  signInAdmin,
  target,
} from "./support.ts";

interface Sent {
  readonly status: number;
```

(2) 찾을 부분:

```ts
    expect(problems(clientId.body as ErrorDocument)).toEqual([["permission.denied", "/data/id"]]);
  });

  it("허용하지 않은 include, sort, filter, 페이지 값은 400이고 source.parameter가 그 파라미터다", async () => {
    const { accessToken: token } = await signInAdmin();
    const cases: [string, string, string][] = [
```

바꿀 내용:

```ts
    expect(problems(clientId.body as ErrorDocument)).toEqual([["permission.denied", "/data/id"]]);
  });

  it("판별 유니온(grant)의 필드 오류는 grant 종류와 이름이 같은 필드가 있어도 본문의 위치를 가리킨다", async () => {
    // password grant의 password, refreshToken grant의 refreshToken은 이름이 grant 종류와 같다.
    const login = await api().POST("/api/v1/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: { grantType: "password", email: "bad", password: "x" },
        },
      },
    });
    expect(login.response.status).toBe(422);
    expect(problems(login.error)).toEqual([
      ["validation.invalid_format", "/data/attributes/email"],
    ]);
    // 숫자 refreshToken은 타입 클라이언트가 보내지 못한다.
    const attributes = { grantType: "refreshToken", refreshToken: 5 };
    const refresh = await send("/api/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ data: { type: "sessions", attributes } }),
    });
    expect(refresh.status).toBe(422);
    expect(problems(refresh.body as ErrorDocument)).toEqual([
      ["validation.invalid_format", "/data/attributes/refreshToken"],
    ]);
  });

  it("정수 자리에 숫자 문자열이나 불리언을 보내면 422 validation.invalid_format이다", async () => {
    const { accessToken: token } = await newUser();
    for (const size of ["10", true]) {
      const attributes = { filename: "a.png", contentType: "image/png", size };
      const sent = await send("/api/v1/files", {
        method: "POST",
        body: JSON.stringify({ data: { type: "files", attributes } }),
        token,
      });
      expect(sent.status, String(size)).toBe(422);
      expect(problems(sent.body as ErrorDocument), String(size)).toEqual([
        ["validation.invalid_format", "/data/attributes/size"],
      ]);
    }
  });

  it("허용하지 않은 include, sort, filter, 페이지 값은 400이고 source.parameter가 그 파라미터다", async () => {
    const { accessToken: token } = await signInAdmin();
    const cases: [string, string, string][] = [
```

`contract/mock/test/validation.test.ts`를 고친다.

(1) 찾을 부분:

```ts
  "'audit-logs:read', 'posts:create' or 'posts:manage'";
const DICT = "Input should be a valid dictionary or object to extract fields from";
const STRING = "Input should be a valid string";
const REQUIRED = "Field required";
const NOT_EMAIL = "value is not a valid email address: An email address must have an @-sign.";

```

바꿀 내용:

```ts
  "'audit-logs:read', 'posts:create' or 'posts:manage'";
const DICT = "Input should be a valid dictionary or object to extract fields from";
const STRING = "Input should be a valid string";
const INTEGER = "Input should be a valid integer";
const REQUIRED = "Field required";
const NOT_EMAIL = "value is not a valid email address: An email address must have an @-sign.";

```

(2) 찾을 부분:

```ts
    [
      "소수 size",
      { filename: "a.png", contentType: "image/png", size: 1.5 },
      [
        invalidFormat(
          "/data/attributes/size",
          "Input should be a valid integer, got a number with a fractional part",
        ),
      ],
    ],
    [
      "빈 파일 이름",
```

바꿀 내용:

```ts
    [
      "소수 size",
      { filename: "a.png", contentType: "image/png", size: 1.5 },
      [invalidFormat("/data/attributes/size", INTEGER)],
    ],
    [
      "숫자 문자열 size",
      { filename: "a.png", contentType: "image/png", size: "10" },
      [invalidFormat("/data/attributes/size", INTEGER)],
    ],
    [
      "불리언 size",
      { filename: "a.png", contentType: "image/png", size: true },
      [invalidFormat("/data/attributes/size", INTEGER)],
    ],
    [
      "빈 파일 이름",
```

(3) 찾을 부분:

```ts
      invalidFormat("/data/attributes/email", NOT_EMAIL),
      required("/data/attributes/password"),
    ]);
    // FastAPI는 이 경우 판별자 값(password)과 같은 이름의 필드가 본문에 있어 document_path가
    // /data/attributes/password/email을 가리킨다. 목은 실제 위치를 가리킨다.
    const collided = grant({ grantType: "password", email: "bad", password: "x" });
    expect(await rejected("SessionCreateDocument", collided, 422)).toEqual([
      invalidFormat("/data/attributes/email", NOT_EMAIL),
    ]);
    const oauth = grant({ grantType: "oauthCode", code: 5 });
    expect(await rejected("SessionCreateDocument", oauth, 422)).toEqual([
```

바꿀 내용:

```ts
      invalidFormat("/data/attributes/email", NOT_EMAIL),
      required("/data/attributes/password"),
    ]);
    const collided = grant({ grantType: "password", email: "bad", password: "x" });
    expect(await rejected("SessionCreateDocument", collided, 422)).toEqual([
      invalidFormat("/data/attributes/email", NOT_EMAIL),
    ]);
    const refresh = grant({ grantType: "refreshToken", refreshToken: 5 });
    expect(await rejected("SessionCreateDocument", refresh, 422)).toEqual([
      invalidFormat("/data/attributes/refreshToken"),
    ]);
    const oauth = grant({ grantType: "oauthCode", code: 5 });
    expect(await rejected("SessionCreateDocument", oauth, 422)).toEqual([
```

`templates/fastapi/src/app/core/jsonapi/tests/test_errors.py`를 고친다.

(1) 찾을 부분:

```python
            "source": {"pointer": "/data/attributes/name"},
            "meta": {"params": params},
        }
    ]


```

바꿀 내용:

```python
            "source": {"pointer": "/data/attributes/name"},
            "meta": {"params": params},
        }
    ]


@pytest.mark.parametrize("size", ["10", True, 10.0])
async def test_integers_refuse_strings_booleans_and_floats(
    client: httpx.AsyncClient, size: object
) -> None:
    """Int32·Int64는 strict다. 계약의 integer처럼 숫자 문자열과 불리언을 받지 않고, 소수점으로 쓴
    정수(10.0)도 받지 않는다."""
    response = await client.post("/api/v1/widgets", **jsonapi_body(widget_document(size=size)))
    errors = errors_of(response, 422)
    assert [(error["code"], error["source"], error["detail"]) for error in errors] == [
        (
            "validation.invalid_format",
            {"pointer": "/data/attributes/size"},
            "Input should be a valid integer",
        )
    ]


```

(2) 찾을 부분:

```python
    ]


def test_discriminated_union_errors_point_into_the_document() -> None:
    """판별 유니온은 loc에 태그 값을 끼운다. pointer는 본문에 있는 경로만 따른다."""
    body = {"data": {"type": "sessions", "attributes": {"grantType": "password", "email": "a"}}}
    loc = ("body", "data", "attributes", "password", "password")
    status, [error] = validation_error_objects(
        [{"type": "missing", "loc": loc, "msg": "Field required"}], body
    )
    assert (status, error.code, error.source) == (
        422,
        ErrorCode.VALIDATION_REQUIRED,
        ErrorSource(pointer="/data/attributes/password"),
    )


```

바꿀 내용:

```python
    ]


@pytest.mark.parametrize(
    ("attributes", "error_type", "loc", "pointer"),
    [
        # 태그(password)와 이름이 같은 필드가 본문에 없다.
        (
            {"grantType": "password", "email": "a"},
            "missing",
            ("password", "password"),
            "/data/attributes/password",
        ),
        # 태그와 이름이 같은 필드가 본문에 있다. 그 값은 스칼라라 그 아래로 내려갈 수 없다.
        (
            {"grantType": "password", "email": "nope", "password": "x"},
            "value_error",
            ("password", "email"),
            "/data/attributes/email",
        ),
        (
            {"grantType": "password", "password": "x"},
            "missing",
            ("password", "email"),
            "/data/attributes/email",
        ),
        (
            {"grantType": "password", "email": "a@example.com", "password": 123},
            "string_type",
            ("password", "password"),
            "/data/attributes/password",
        ),
        (
            {"grantType": "refreshToken", "refreshToken": 5},
            "string_type",
            ("refreshToken", "refreshToken"),
            "/data/attributes/refreshToken",
        ),
    ],
)
def test_discriminated_union_errors_point_into_the_document(
    attributes: dict[str, object], error_type: str, loc: tuple[str, ...], pointer: str
) -> None:
    """판별 유니온은 loc에 태그 값을 끼운다. pointer는 본문을 따라 내려갈 수 있는 경로만 따른다."""
    body = {"data": {"type": "sessions", "attributes": attributes}}
    raw = {"type": error_type, "loc": ("body", "data", "attributes", *loc), "msg": "m"}
    status, [error] = validation_error_objects([raw], body)
    assert (status, error.source) == (422, ErrorSource(pointer=pointer))


def test_error_pointers_follow_objects_and_arrays() -> None:
    """태그가 아닌 경로는 객체와 배열을 따라 내려간다. 마지막 조각은 본문에 없어도 남는다."""
    roles = {"data": [{"type": "roles", "id": 5}, {"type": "roles"}]}
    body = {"data": {"type": "users", "relationships": {"roles": roles}}}
    base = ("body", "data", "relationships", "roles", "data")
    raw = [
        {"type": "string_type", "loc": (*base, 0, "id"), "msg": "m"},
        {"type": "missing", "loc": (*base, 1, "id"), "msg": "m"},
    ]
    status, errors = validation_error_objects(raw, body)
    assert (status, [error.source for error in errors]) == (
        422,
        [
            ErrorSource(pointer="/data/relationships/roles/data/0/id"),
            ErrorSource(pointer="/data/relationships/roles/data/1/id"),
        ],
    )


```

`templates/fastapi/src/app/core/jsonapi/tests/test_openapi.py`를 고친다.

찾을 부분:

```python
    assert "x-inline" not in str(spec)


def test_single_value_literal_is_an_enum_and_titles_are_gone(spec: dict[str, Any]) -> None:
    resource = spec["components"]["schemas"]["WidgetResource"]
    assert resource["properties"]["type"] == {"type": "string", "enum": ["widgets"]}
```

바꿀 내용:

```python
    assert "x-inline" not in str(spec)


def test_strict_integers_keep_the_contract_schema(spec: dict[str, Any]) -> None:
    """Int32·Int64의 Strict()는 검증만 엄격하게 한다. JSON 스키마는 계약의 integer 그대로다."""
    schemas = spec["components"]["schemas"]
    assert schemas["PageMeta"]["properties"]["number"] == {"type": "integer", "format": "int32"}
    assert schemas["WidgetCreateAttributes"]["properties"]["size"] == {
        "type": "integer",
        "format": "int32",
        "minimum": 1,
        "maximum": 100,
        "default": 1,
        "description": "생략하면 1.",
    }


def test_single_value_literal_is_an_enum_and_titles_are_gone(spec: dict[str, Any]) -> None:
    resource = spec["components"]["schemas"]["WidgetResource"]
    assert resource["properties"]["type"] == {"type": "string", "enum": ["widgets"]}
```

`templates/fastapi/src/app/modules/auth/tests/test_sessions.py`를 고친다.

찾을 부분:

```python
            "validation.required",
            "/data/attributes/password",
        ),
    ],
)
async def test_bad_grants(
    api: httpx.AsyncClient, attributes: dict[str, str], status: int, code: str, pointer: str | None
) -> None:
    response = await api.post(SESSIONS, **jsonapi_body(grant(**attributes)))
    assert (response.status_code, error_codes(response)) == (status, [code])
```

바꿀 내용:

```python
            "validation.required",
            "/data/attributes/password",
        ),
        # grant 종류와 이름이 같은 필드(password, refreshToken)가 있어도 필드 오류는 본문의 위치다.
        (
            {"grantType": "password", "email": "bad", "password": "x"},
            422,
            "validation.invalid_format",
            "/data/attributes/email",
        ),
        (
            {"grantType": "refreshToken", "refreshToken": 5},
            422,
            "validation.invalid_format",
            "/data/attributes/refreshToken",
        ),
    ],
)
async def test_bad_grants(
    api: httpx.AsyncClient,
    attributes: dict[str, object],
    status: int,
    code: str,
    pointer: str | None,
) -> None:
    response = await api.post(SESSIONS, **jsonapi_body(grant(**attributes)))
    assert (response.status_code, error_codes(response)) == (status, [code])
```

`templates/fastapi/src/app/modules/files/tests/test_api.py`를 고친다.

찾을 부분:

```python
        ),
        ({"size": 0}, "validation.out_of_range", "/data/attributes/size"),
        ({"filename": ""}, "validation.too_short", "/data/attributes/filename"),
    ],
)
async def test_create_checks_the_size_and_type(
```

바꿀 내용:

```python
        ),
        ({"size": 0}, "validation.out_of_range", "/data/attributes/size"),
        ({"filename": ""}, "validation.too_short", "/data/attributes/filename"),
        # 계약의 integer다. 숫자 문자열과 불리언을 정수로 바꾸지 않는다.
        ({"size": "10"}, "validation.invalid_format", "/data/attributes/size"),
        ({"size": True}, "validation.invalid_format", "/data/attributes/size"),
    ],
)
async def test_create_checks_the_size_and_type(
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`contract/mock`에서): `pnpm exec vitest run test/validation.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 파일: 소수 size
FAIL  test/validation.test.ts > 필드 오류는 필드마다 422이고 순서는 모델의 필드 순서다 > 파일: 소수 size
AssertionError: expected [ { status: '422', …(4) } ] to deeply equal [ { status: '422', …(4) } ]
Test Files 1 failed (1)
Tests 1 failed | 45 passed (46)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/core/jsonapi/tests/test_errors.py src/app/core/jsonapi/tests/test_openapi.py src/app/modules/auth/tests/test_sessions.py src/app/modules/files/tests/test_api.py`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
E       AssertionError: {"data":{"type":"widgets","id":"01a0f262-65c6-75cb-82a2-9e778aa3f440","attributes":{"name":"Gear","size":10,"color":"red","createdAt":"2026-09-26T00:00:00Z"},"relationships":{"owner":{"data":{"type":"users","id":"01920000-0000-7000-8000-0000000000aa"}}}}}
E       AssertionError: {"data":{"type":"widgets","id":"01a0f262-6650-7318-803b-575d392981c6","attributes":{"name":"Gear","size":1,"color":"red","createdAt":"2026-09-26T00:00:00Z"},"relationships":{"owner":{"data":{"type":"users","id":"01920000-0000-7000-8000-0000000000aa"}}}}}
E       AssertionError: {"data":{"type":"widgets","id":"01a0f262-665d-7349-beab-d384358903f7","attributes":{"name":"Gear","size":10,"color":"red","createdAt":"2026-09-26T00:00:00Z"},"relationships":{"owner":{"data":{"type":"users","id":"01920000-0000-7000-8000-0000000000aa"}}}}}
E       AssertionError: assert (422, ErrorSo...eter=MISSING)) == (422, ErrorSo...eter=MISSING))
E       AssertionError: assert (422, ErrorSo...eter=MISSING)) == (422, ErrorSo...eter=MISSING))
E       AssertionError: assert (422, ErrorSo...eter=MISSING)) == (422, ErrorSo...eter=MISSING))
E       AssertionError: assert (422, ErrorSo...eter=MISSING)) == (422, ErrorSo...eter=MISSING))
E           AssertionError: assert [{'pointer': ...sword/email'}] == [{'pointer': ...butes/email'}]
11 failed, 75 passed in
```

Run(저장소 루트에서): `pnpm conformance fastapi test/flows/jsonapi.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 판별 유니온(grant)의 필드 오류는 grant 종류와 이름이 같은 필드가 있어도 본문의 위치를 가리킨다
× 정수 자리에 숫자 문자열이나 불리언을 보내면 422 validation.invalid_format이다
FAIL  test/flows/jsonapi.test.ts > JSON:API 규칙 (fastapi) > 판별 유니온(grant)의 필드 오류는 grant 종류와 이름이 같은 필드가 있어도 본문의 위치를 가리킨다
AssertionError: expected [ [ …(2) ] ] to deeply equal [ [ …(2) ] ]
FAIL  test/flows/jsonapi.test.ts > JSON:API 규칙 (fastapi) > 정수 자리에 숫자 문자열이나 불리언을 보내면 422 validation.invalid_format이다
AssertionError: 10: expected 201 to be 422 // Object.is equality
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
× "pnpm recursive run" failed in C:\Users\rootj\.cache\ai-template-
Test Files 1 failed (1)
Tests 2 failed | 7 passed (9)
```

Run(저장소 루트에서): `pnpm conformance mock test/flows/jsonapi.test.ts`

Expected: 통과한다. 목은 처음부터 계약대로 답하므로 목 대상의 새 흐름은 부모 커밋에서도 통과한다(실패는 FastAPI 대상에서 본다):

```text
Test Files 1 passed (1)
Tests 9 passed (9)
```

- [ ] **Step 3: FastAPI core를 고친다**

`templates/fastapi/src/app/core/jsonapi/errors.py`를 고친다.

(1) 찾을 부분:

```python


def document_path(body: object, parts: Sequence[int | str]) -> list[int | str]:
    """Pydantic loc에서 요청 본문에 실제로 있는 경로만 남긴다(마지막 조각은 늘 남긴다).

    판별 유니온(SessionGrant 등)은 loc에 태그 값을 끼워 넣는다. 예를 들어 password grant의
    빠진 password는 ("data", "attributes", "password", "password")다. 본문을 따라가며 없는 조각을
    건너뛰면 /data/attributes/password가 된다.
    """
    path: list[int | str] = []
    node = body
    for index, part in enumerate(parts):
        child = _child(node, part)
        if child is _ABSENT and index < len(parts) - 1:
            continue
        path.append(part)
        node = child
```

바꿀 내용:

```python


def document_path(body: object, parts: Sequence[int | str]) -> list[int | str]:
    """Pydantic loc에서 요청 본문을 따라 내려갈 수 있는 경로만 남긴다(마지막 조각은 늘 남긴다).

    판별 유니온(SessionGrant 등)은 loc에 태그 값을 끼워 넣는다. 예를 들어 password grant의 이메일
    오류는 ("data", "attributes", "password", "email")다. 태그 조각은 본문에 없거나, 태그와 이름이
    같은 필드(password grant의 password)의 스칼라 값을 가리킨다. 그래서 마지막이 아닌 조각이 객체나
    배열을 가리키지 않으면 건너뛴다. 결과는 /data/attributes/email이다. 태그와 이름이 같은 필드에
    객체나 배열을 보내면 태그와 구별하지 못해 그 아래를 가리킨다(드문 경우라 받아들인다).
    """
    path: list[int | str] = []
    node = body
    for index, part in enumerate(parts):
        child = _child(node, part)
        if index < len(parts) - 1 and not (is_object(child) or is_array(child)):
            continue
        path.append(part)
        node = child
```

(2) 찾을 부분:

```python

    - JSON이 아니면 400 jsonapi.invalid_document
    - 본문 오류는 _body_error의 규칙(403, 409, 필드마다 422, 문서 구조 400)을 따른다.
      source.pointer는 RFC 6901이라 문서 전체는 ""다. body(요청 본문)를 주면 본문에 없는 loc
      조각(판별 유니온의 태그)을 뺀다
    - 쿼리 오류는 400 jsonapi.invalid_query, 경로 오류는 404 resource.not_found
    - 둘 이상의 상태가 섞이면 JSON:API 권고대로 가장 일반적인 400을 쓰고 에러 객체는 모두 담는다
    """
```

바꿀 내용:

```python

    - JSON이 아니면 400 jsonapi.invalid_document
    - 본문 오류는 _body_error의 규칙(403, 409, 필드마다 422, 문서 구조 400)을 따른다.
      source.pointer는 RFC 6901이라 문서 전체는 ""다. body(요청 본문)를 주면 본문을 따라 내려갈
      수 없는 loc 조각(판별 유니온의 태그)을 뺀다(document_path)
    - 쿼리 오류는 400 jsonapi.invalid_query, 경로 오류는 404 resource.not_found
    - 둘 이상의 상태가 섞이면 JSON:API 권고대로 가장 일반적인 400을 쓰고 에러 객체는 모두 담는다
    """
```

`templates/fastapi/src/app/core/jsonapi/models.py`를 고친다.

(1) 찾을 부분:

```python
  `T | MISSING`을 직접 쓰지 않는다.
- 스칼라 별칭은 PEP 695 `type` 문이 아니라 일반 대입으로 만든다. `type` 별칭은 Pydantic이
  별도 컴포넌트(`Int32` 등)로 내보내 스키마 이름 규칙을 깬다.
"""

import inspect
```

바꿀 내용:

```python
  `T | MISSING`을 직접 쓰지 않는다.
- 스칼라 별칭은 PEP 695 `type` 문이 아니라 일반 대입으로 만든다. `type` 별칭은 Pydantic이
  별도 컴포넌트(`Int32` 등)로 내보내 스키마 이름 규칙을 깬다.
- 문서 모델의 정수는 `int`가 아니라 `Int32`·`Int64`로 쓴다. `int`는 lax라 "10"과 true를 받는다.
"""

import inspect
```

(2) 찾을 부분:

```python
    Field,
    GetCoreSchemaHandler,
    GetJsonSchemaHandler,
    ValidatorFunctionWrapHandler,
    model_validator,
)
```

바꿀 내용:

```python
    Field,
    GetCoreSchemaHandler,
    GetJsonSchemaHandler,
    Strict,
    ValidatorFunctionWrapHandler,
    model_validator,
)
```

(3) 찾을 부분:

```python
# 사용: `title: Omittable[str] = MISSING`, 널 허용 선택 멤버는 `Omittable[str | None] = MISSING`.
Omittable = Annotated[OmittableT | MISSING, _Omittable()]

Int32 = Annotated[int, Field(json_schema_extra={"format": "int32"})]
Int64 = Annotated[int, Field(json_schema_extra={"format": "int64"})]
# URI-reference(상대 경로 포함). 널을 허용하면 계약처럼 format이 anyOf 밖에 붙는다.
UriReference = Annotated[str, Field(json_schema_extra={"format": "uri-reference"})]
NullableUriReference = Annotated[str | None, Field(json_schema_extra={"format": "uri-reference"})]
```

바꿀 내용:

```python
# 사용: `title: Omittable[str] = MISSING`, 널 허용 선택 멤버는 `Omittable[str | None] = MISSING`.
Omittable = Annotated[OmittableT | MISSING, _Omittable()]

# 정수는 strict다. 계약의 integer처럼 숫자 문자열과 불리언을 받지 않는다. 본문을 json.loads로 읽어
# 소수점이나 지수로 쓴 수(10.0, 1e3)는 float라 이것도 받지 않는다. JSON 스키마는 그대로다.
Int32 = Annotated[int, Strict(), Field(json_schema_extra={"format": "int32"})]
Int64 = Annotated[int, Strict(), Field(json_schema_extra={"format": "int64"})]
# URI-reference(상대 경로 포함). 널을 허용하면 계약처럼 format이 anyOf 밖에 붙는다.
UriReference = Annotated[str, Field(json_schema_extra={"format": "uri-reference"})]
NullableUriReference = Annotated[str | None, Field(json_schema_extra={"format": "uri-reference"})]
```

- [ ] **Step 4: 목을 고친다**

`contract/mock/src/jsonapi/pydantic-messages.ts`를 고친다.

찾을 부분:

```ts
  return snake === tag ? `'${tag}'` : `'${snake}' | '${tag}'`;
}

/** 형이 틀린 값의 메시지. expected는 JSON Schema의 type이다. */
export function typeMessage(expected: string, value: unknown): string {
  switch (expected) {
    case "object":
      return "Input should be a valid dictionary or object to extract fields from";
    case "array":
      return "Input should be a valid list";
    case "integer":
      return typeof value === "number"
        ? "Input should be a valid integer, got a number with a fractional part"
        : "Input should be a valid integer";
    default:
      return `Input should be a valid ${expected}`;
  }
```

바꿀 내용:

```ts
  return snake === tag ? `'${tag}'` : `'${snake}' | '${tag}'`;
}

/**
 * 형이 틀린 값의 메시지. expected는 JSON Schema의 type이다. FastAPI의 정수(Int32·Int64)는 strict라
 * 문자열, 불리언, 소수가 모두 "Input should be a valid integer"다.
 */
export function typeMessage(expected: string): string {
  switch (expected) {
    case "object":
      return "Input should be a valid dictionary or object to extract fields from";
    case "array":
      return "Input should be a valid list";
    default:
      return `Input should be a valid ${expected}`;
  }
```

`contract/mock/src/jsonapi/validation-errors.ts`를 고친다.

찾을 부분:

```ts
    }
    case "type":
      if (params.type === "null") return undefined;
      return { pointer, kind: "type", message: typeMessage(String(params.type), value) };
    case "enum":
      return choice(pointer, Array.isArray(params.allowedValues) ? params.allowedValues : []);
    case "const":
```

바꿀 내용:

```ts
    }
    case "type":
      if (params.type === "null") return undefined;
      return { pointer, kind: "type", message: typeMessage(String(params.type)) };
    case "enum":
      return choice(pointer, Array.isArray(params.allowedValues) ? params.allowedValues : []);
    case "const":
```

`contract/mock/src/jsonapi/validation.ts`를 고친다.

찾을 부분:

```ts
 *   const document = validateDocument("PostCreateDocument", body); // 400, 403, 409, 422
 *
 * 맞추지 않는 차이(목은 계약대로 한다):
 * - Pydantic(lax 모드)은 정수 자리의 숫자 문자열(예: 파일 size "10")을 받는다. 목은 형 오류(422)다.
 * - FastAPI는 판별 유니온의 필드 오류를 판별자 값과 같은 이름의 필드 아래로 가리킨다(예: password
 *   grant의 이메일 오류가 /data/attributes/password/email). 목은 실제 위치(/data/attributes/email)다.
 * - Python json.loads는 UTF-16·32 본문도 읽는다. 목은 UTF-8만 읽는다(브라우저는 UTF-8로 보낸다).
 */

```

바꿀 내용:

```ts
 *   const document = validateDocument("PostCreateDocument", body); // 400, 403, 409, 422
 *
 * 맞추지 않는 차이(목은 계약대로 한다):
 * - 정수 자리에 소수점이나 지수로 쓴 정수(10.0, 1e3)를 FastAPI는 422 validation.invalid_format으로
 *   거절한다(Python json.loads가 float로 읽고 Int32·Int64가 strict다). 목은 받는다. JSON Schema의
 *   integer는 소수부가 0인 수를 받고, JSON.parse도 10.0을 10과 구별하지 못한다. JavaScript
 *   클라이언트는 이런 표기를 보내지 않는다(JSON.stringify(10.0)은 "10"이다).
 * - 판별자 값과 이름이 같은 필드(password grant의 password)에 객체나 배열을 보내면, FastAPI는 그
 *   grant의 필드 오류를 그 값 아래로 가리킨다(예: /data/attributes/password/email). 목은 실제
 *   위치(/data/attributes/email)다. 그 필드가 문자열이면 둘 다 실제 위치다.
 * - Python json.loads는 UTF-16·32 본문도 읽는다. 목은 UTF-8만 읽는다(브라우저는 UTF-8로 보낸다).
 */

```

- [ ] **Step 5: 문서를 고친다**

`contract/mock/AGENTS.md`를 고친다.

찾을 부분:

```markdown
- 끝에 슬래시가 붙은 경로는 목에서 404다(FastAPI/Starlette는 307로 리다이렉트한다).
- GET만 선언한 라우트에 HEAD로 요청하면 목은 200이다(Hono가 GET 처리기로 넘긴다). FastAPI는 404다.
- 이메일 형식은 흔한 경우만 email-validator와 같다(`src/jsonapi/email.ts`).
- 요청 검증의 나머지 몇 가지 경계 — 정수 자리의 숫자 문자열, 판별 유니온 오류의 pointer(예: SessionGrant의 grantType) — 는 FastAPI(Pydantic)의 특이 동작 대신 계약대로 한다(`src/jsonapi/validation.ts`).
```

바꿀 내용:

```markdown
- 끝에 슬래시가 붙은 경로는 목에서 404다(FastAPI/Starlette는 307로 리다이렉트한다).
- GET만 선언한 라우트에 HEAD로 요청하면 목은 200이다(Hono가 GET 처리기로 넘긴다). FastAPI는 404다.
- 이메일 형식은 흔한 경우만 email-validator와 같다(`src/jsonapi/email.ts`).
- 요청 검증의 나머지 두 경계는 FastAPI(Pydantic) 대신 계약대로 한다(`src/jsonapi/validation.ts`). 정수 자리에 소수점이나 지수로 쓴 정수(`10.0`, `1e3`)를 목은 받는다(JSON Schema의 integer, `JSON.parse`가 `10`과 구별하지 못한다). FastAPI는 422 `validation.invalid_format`이다(`json.loads`가 float로 읽고 정수는 strict다). 판별자 값과 이름이 같은 grant 필드(password grant의 `password`)에 객체나 배열을 보내면 FastAPI는 그 grant의 필드 오류를 그 값 아래로 가리키고(`/data/attributes/password/email`) 목은 실제 위치(`/data/attributes/email`)를 가리킨다.
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run(`contract/mock`에서): `pnpm exec vitest run test/validation.test.ts`

Expected: 통과한다.

```text
Test Files 1 passed (1)
Tests 46 passed (46)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/core/jsonapi/tests/test_errors.py src/app/core/jsonapi/tests/test_openapi.py src/app/modules/auth/tests/test_sessions.py src/app/modules/files/tests/test_api.py`

Expected: 통과한다.

```text
86 passed in
```

Run(저장소 루트에서): `pnpm conformance fastapi test/flows/jsonapi.test.ts`

Expected: 가드 테스트 둘(`test_error_pointers_follow_objects_and_arrays`, `test_strict_integers_keep_the_contract_schema`)은 부모 커밋에서도 통과한다. `uv run poe gen`을 다시 돌려도 `openapi.json`은 바뀌지 않는다.

```text
Test Files 1 passed (1)
Tests 9 passed (9)
```

Run(저장소 루트에서): `pnpm conformance mock test/flows/jsonapi.test.ts`

Expected: 가드 테스트 둘(`test_error_pointers_follow_objects_and_arrays`, `test_strict_integers_keep_the_contract_schema`)은 부모 커밋에서도 통과한다. `uv run poe gen`을 다시 돌려도 `openapi.json`은 바뀌지 않는다.

```text
Test Files 1 passed (1)
Tests 9 passed (9)
```

- [ ] **Step 7: 검사를 돌린다**

Run(`templates/fastapi`에서): `uv run poe check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 건너뛴 단계가 있으면 `.cache/check`를 지우고 다시 돌린다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄

Run(저장소 루트에서): `pnpm spec-compare contract/openapi.yaml templates/fastapi/openapi.json`

Expected: 차이 없이 끝난다(종료 코드 0).

Run(저장소 루트에서): `pnpm conformance fastapi`

Expected: 마지막에 `Tests  87 passed (87)`. 끝나면 인프라가 내려가므로 `templates/fastapi`에서 `docker compose up -d --wait`로 다시 올린다.

Run(저장소 루트에서): `pnpm conformance mock`

Expected: 마지막에 `Tests  87 passed (87)`.

- [ ] **Step 8: 커밋한다**

```bash
git add \
  contract/conformance/test/flows/jsonapi.test.ts \
  contract/mock/AGENTS.md \
  contract/mock/src/jsonapi/pydantic-messages.ts \
  contract/mock/src/jsonapi/validation-errors.ts \
  contract/mock/src/jsonapi/validation.ts \
  contract/mock/test/validation.test.ts \
  templates/fastapi/src/app/core/jsonapi/errors.py \
  templates/fastapi/src/app/core/jsonapi/models.py \
  templates/fastapi/src/app/core/jsonapi/tests/test_errors.py \
  templates/fastapi/src/app/core/jsonapi/tests/test_openapi.py \
  templates/fastapi/src/app/modules/auth/tests/test_sessions.py \
  templates/fastapi/src/app/modules/files/tests/test_api.py
git commit -m "fix(fastapi): point grant field errors at the body and make integers strict"
```


### Task 4: 짝 없는 서로게이트를 500 없이 다룬다

web 설계 §12.1의 FastAPI 문제와, 그것을 조사하다 찾은 같은 종류 하나. JSON은 짝 없는 UTF-16 서로게이트(`\ud800`)를 실어 오고, Pydantic은 제약 없는 문자열에 그 값을 그대로 둔다. 그 값을 UTF-8로 엄격하게 인코딩하는 세 곳이 500을 냈다.

- 비밀번호: `core/security.py`의 `hash_password`와 `check_password`(가짜 해시와 진짜 해시의 검증 모두)가 surrogatepass로 인코딩한 바이트(`_password_bytes`)를 pwdlib에 넘긴다. 로그인의 `password`와 비밀번호 변경의 `currentPassword`에 서로게이트가 있으면 틀린 비밀번호와 같은 401 `auth.invalid_credentials`다. 보통 문자열은 바이트가 같아 기존 해시가 그대로 맞는다.
- 응답: `core/jsonapi/media.py`의 `JsonApiResponse.render`를 재정의한다. Starlette와 같은 인자로 `json.dumps`하고 `encode("utf-8", "backslashreplace")`로 인코딩해, 인코딩하지 못하는 글자(서로게이트뿐이다)만 소문자 `\uXXXX`가 된다. 목의 `JSON.stringify`와 같은 바이트이고, 서로게이트가 없는 본문은 Starlette와 같은 바이트다. 이 한 곳이 입력을 담은 detail 셋을 막는다: 모든 PATCH의 `data.id` 불일치 409, 아바타·커버의 없는 파일 404, `PATCH /users/{id}`의 없는 역할 404(`users/service/management.py`, 조사에서 새로 찾음).
- 역할 설명: 계약이 `maxLength`를 `anyOf` 밖에 두어 `roles/schemas.py`가 길이를 검증기로 센다. 그래서 Pydantic이 문자열을 파싱하지 않고, 서로게이트가 PostgreSQL에 저장할 때(psycopg) 500을 냈다. 검증기(`_description_length`에서 `_check_description`으로 이름을 바꾼다)가 길이보다 먼저 서로게이트를 보고 `PydanticKnownError("string_unicode")`를 낸다. 다른 제약 문자열과 같은 422 `validation.invalid_format`이고 JSON 스키마는 그대로다.
- 목: 401, 409, 404는 이미 같다(scrypt가 서로게이트를 U+FFFD로 바꾸고 `JSON.stringify`가 이스케이프한다). 역할 설명만 받아 201이었다. `surrogates.ts`의 `parsesString`이 "anyOf에 문자열 가지가 있고 같은 층에 제약이 있는 스키마"도 파싱하는 문자열로 보게 해 422를 낸다(계약에서 역할 설명 둘뿐이다). `AGENTS.md`의 옛 항목("FastAPI가 500을 내는 자리")을 남는 차이(U+FFFD로 해시)로 바꾼다.
- FastAPI 테스트: `test_security.py`(서로게이트의 해시·검증, str로 만든 해시의 호환), 새 `test_media.py`(Node가 낸 기대 바이트, 서로게이트가 없으면 Starlette와 같은 바이트), `test_errors.py`(detail에 서로게이트가 있어도 409), auth·users·roles의 요청 경우.
- 적합성: `support.ts`의 `LONE_SURROGATE`를 타입 클라이언트로 보내는 흐름 다섯이다. sessions(계정이 있든 없든 401), passwords(`currentPassword`의 401), me(`data.id`의 409와 아바타의 404), users(역할 id의 404), roles(설명의 422). 상태, 코드, pointer만 본다.
- 실패 확인: 부모 커밋의 FastAPI는 다섯 흐름 모두 500이다. 단위 테스트는 argon2, Starlette `render`, psycopg의 `UnicodeEncodeError`와 500으로 실패하고, 서로게이트에 201자를 붙인 설명은 `validation.too_long`이다. 목은 역할 설명 흐름만 201로 실패하고, 목 단위 테스트 둘(설명을 받는다, 고칠 때 `validation.too_long`)이 실패한다.

**Files:**
- Modify: `contract/mock/AGENTS.md`, `contract/mock/src/jsonapi/surrogates.ts`, `templates/fastapi/src/app/core/jsonapi/media.py`, `templates/fastapi/src/app/core/security.py`, `templates/fastapi/src/app/modules/roles/schemas.py`
- Test: `contract/conformance/test/flows/me.test.ts`, `contract/conformance/test/flows/passwords.test.ts`, `contract/conformance/test/flows/roles.test.ts`, `contract/conformance/test/flows/sessions.test.ts`, `contract/conformance/test/flows/support.ts`, `contract/conformance/test/flows/users.test.ts`, `contract/mock/test/surrogates.test.ts`, `templates/fastapi/src/app/core/jsonapi/tests/test_errors.py`, `templates/fastapi/src/app/core/jsonapi/tests/test_media.py`, `templates/fastapi/src/app/core/tests/test_security.py`, `templates/fastapi/src/app/modules/auth/tests/test_passwords.py`, `templates/fastapi/src/app/modules/auth/tests/test_sessions.py`, `templates/fastapi/src/app/modules/roles/tests/test_api.py`, `templates/fastapi/src/app/modules/users/tests/test_admin.py`, `templates/fastapi/src/app/modules/users/tests/test_me.py`

**Interfaces:**
- Consumes: `app.core.security`의 `hash_password(password: str) -> str`, `check_password(password: str, hashed: str | None) -> bool`(pwdlib `PasswordHash.recommended()`인 `_password_hash`, 가짜 해시 `_dummy_hash()`). `app.core.jsonapi.media.JsonApiResponse`(Starlette `JSONResponse`의 서브클래스). roles `schemas.py`의 `RoleDescription`, `DESCRIPTION_MAX`. `app.core.jsonapi.errors`의 `require_matching_id`와 `_VALIDATION_CODES`(없는 종류인 `string_unicode`는 `validation.invalid_format`). Task 3의 `test_bad_grants`. 목 `src/jsonapi/surrogates.ts`의 `parsesString`, `PARSING_KEYWORDS`, `PARSING_FORMATS`, `contract-schemas.ts`의 `forAjv`(`wellFormed` 키워드를 붙인다), `src/json.ts`의 `isRecord`. 적합성 `support.ts`의 `newUser`, `signIn`, `signInAdmin`, `uniqueEmail`, `uniqueName`
- Produces:
  - `app.core.security._password_bytes(password: str) -> bytes`(`password.encode("utf-8", "surrogatepass")`). `hash_password`와 `check_password`(두 verify)가 이 바이트를 pwdlib에 넘긴다(시그니처는 그대로)
  - `JsonApiResponse.render(self, content: Any) -> bytes`(`@override`. Starlette와 같은 인자로 `json.dumps`한 뒤 `encode("utf-8", "backslashreplace")`)
  - roles `_check_description(value: str | None) -> str | None`(옛 `_description_length`). `RoleDescription`은 `AfterValidator(_check_description)`이고 JSON 스키마는 그대로다
  - 목 `parsesString(schema: Readonly<Record<string, unknown>>): boolean`(anyOf에 `type: string` 가지가 있고 같은 층에 제약이 있으면 true), 내부 함수 `constrained(schema)`
  - 적합성 `support.ts`의 `LONE_SURROGATE = "\ud800"`
  - FastAPI 테스트 파일 `core/jsonapi/tests/test_media.py`(새 파일)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`contract/conformance/test/flows/me.test.ts`를 고친다.

(1) 찾을 부분:

```ts
import {
  api,
  codes,
  newUser,
  PASSWORD,
  problems,
```

바꿀 내용:

```ts
import {
  api,
  codes,
  LONE_SURROGATE,
  newUser,
  PASSWORD,
  problems,
```

(2) 찾을 부분:

```ts
          type: "users",
          id: user.userId,
          relationships: { avatar: { data: { type: "files", id: randomUUID() } } },
        },
      },
    });
```

바꿀 내용:

```ts
          type: "users",
          id: user.userId,
          relationships: { avatar: { data: { type: "files", id: randomUUID() } } },
        },
      },
    });
    expect(avatar.response.status).toBe(404);
    expect(problems(avatar.error)).toEqual([
      ["resource.not_found", "/data/relationships/avatar/data"],
    ]);
  });

  it("본문의 id나 아바타 id에 짝 없는 서로게이트가 있어도 같은 409와 404다", async () => {
    // 두 에러의 detail은 id를 그대로 담는다. 응답은 그 글자를 \uXXXX로 이스케이프해야 한다.
    const user = await newUser();
    const mismatch = await user.api.PATCH("/api/v1/me", {
      body: { data: { type: "users", id: LONE_SURROGATE, attributes: { name: "남" } } },
    });
    expect(mismatch.response.status).toBe(409);
    expect(problems(mismatch.error)).toEqual([["resource.conflict", "/data/id"]]);
    const avatar = await user.api.PATCH("/api/v1/me", {
      body: {
        data: {
          type: "users",
          id: user.userId,
          relationships: { avatar: { data: { type: "files", id: LONE_SURROGATE } } },
        },
      },
    });
```

`contract/conformance/test/flows/passwords.test.ts`를 고친다.

(1) 찾을 부분:

```ts
import {
  api,
  codes,
  mailbox,
  NEW_PASSWORD,
  newUser,
```

바꿀 내용:

```ts
import {
  api,
  codes,
  LONE_SURROGATE,
  mailbox,
  NEW_PASSWORD,
  newUser,
```

(2) 찾을 부분:

```ts
    ]);
    await signIn(user);
  });
});
```

바꿀 내용:

```ts
    ]);
    await signIn(user);
  });

  it("현재 비밀번호에 짝 없는 서로게이트가 있어도 틀린 비밀번호와 같은 401이다", async () => {
    const user = await newUser();
    const { error, response } = await user.api.POST("/api/v1/password-changes", {
      body: {
        data: {
          type: "password-changes",
          attributes: { currentPassword: LONE_SURROGATE, newPassword: NEW_PASSWORD },
        },
      },
    });
    expect(response.status).toBe(401);
    expect(problems(error)).toEqual([
      ["auth.invalid_credentials", "/data/attributes/currentPassword"],
    ]);
    await signIn(user);
  });
});
```

`contract/conformance/test/flows/roles.test.ts`를 고친다.

(1) 찾을 부분:

```ts
import { describe, expect, it } from "vitest";
import {
  codes,
  newUser,
  type PermissionCode,
  problems,
```

바꿀 내용:

```ts
import { describe, expect, it } from "vitest";
import {
  codes,
  LONE_SURROGATE,
  newUser,
  type PermissionCode,
  problems,
```

(2) 찾을 부분:

```ts
    });
  });

  it("시스템 역할은 지우지 못하고, admin의 권한은 고치지 못한다", async () => {
    const manager = await signInAdmin();
    const member = await systemRole(manager, "member");
```

바꿀 내용:

```ts
    });
  });

  it("역할 설명에 짝 없는 서로게이트가 있으면 저장하지 않고 422 validation.invalid_format이다", async () => {
    const manager = await signInAdmin();
    const attributes = {
      name: uniqueName("unreadable"),
      description: LONE_SURROGATE,
      permissions: [],
    };
    const { error, response } = await manager.api.POST("/api/v1/roles", {
      body: { data: { type: "roles", attributes } },
    });
    expect(response.status).toBe(422);
    expect(problems(error)).toEqual([
      ["validation.invalid_format", "/data/attributes/description"],
    ]);
  });

  it("시스템 역할은 지우지 못하고, admin의 권한은 고치지 못한다", async () => {
    const manager = await signInAdmin();
    const member = await systemRole(manager, "member");
```

`contract/conformance/test/flows/sessions.test.ts`를 고친다.

(1) 찾을 부분:

```ts
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api, codes, newUser, signIn, target } from "./support.ts";

function refresh(refreshToken: string) {
  return api().POST("/api/v1/sessions", {
```

바꿀 내용:

```ts
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api, codes, LONE_SURROGATE, newUser, signIn, target, uniqueEmail } from "./support.ts";

function refresh(refreshToken: string) {
  return api().POST("/api/v1/sessions", {
```

(2) 찾을 부분:

```ts
    });
    expect(response.status).toBe(401);
    expect(codes(error)).toEqual(["auth.invalid_credentials"]);
  });

  it("refresh token은 한 번만 쓴다. 쓴 것을 다시 쓰면 그 세션을 통째로 폐기한다", async () => {
```

바꿀 내용:

```ts
    });
    expect(response.status).toBe(401);
    expect(codes(error)).toEqual(["auth.invalid_credentials"]);
  });

  it("비밀번호에 짝 없는 서로게이트가 있어도 계정이 있든 없든 틀린 비밀번호와 같은 401이다", async () => {
    const user = await newUser();
    for (const email of [user.email, uniqueEmail("nobody")]) {
      const { error, response } = await api().POST("/api/v1/sessions", {
        body: {
          data: {
            type: "sessions",
            attributes: { grantType: "password", email, password: LONE_SURROGATE },
          },
        },
      });
      expect(response.status, email).toBe(401);
      expect(codes(error), email).toEqual(["auth.invalid_credentials"]);
    }
  });

  it("refresh token은 한 번만 쓴다. 쓴 것을 다시 쓰면 그 세션을 통째로 폐기한다", async () => {
```

`contract/conformance/test/flows/support.ts`를 고친다.

찾을 부분:

```ts
export const PASSWORD = "conformance-password"; // betterleaks:allow 적합성 흐름의 가짜 비밀번호
/** 재설정과 변경으로 바꿀 비밀번호. */
export const NEW_PASSWORD = "conformance-new-password"; // betterleaks:allow 적합성 흐름의 가짜 비밀번호

/** 모든 응답을 계약으로 검증하는 클라이언트. accessToken을 주면 로그인한 요청이다. */
export function api(accessToken?: string): ApiClient {
```

바꿀 내용:

```ts
export const PASSWORD = "conformance-password"; // betterleaks:allow 적합성 흐름의 가짜 비밀번호
/** 재설정과 변경으로 바꿀 비밀번호. */
export const NEW_PASSWORD = "conformance-new-password"; // betterleaks:allow 적합성 흐름의 가짜 비밀번호

/**
 * 짝 없는 서로게이트 하나(U+D800). 타입 클라이언트(JSON.stringify)는 \ud800 이스케이프로 보낸다. 제약
 * 없는 문자열(비밀번호, id)에 넣으면 백엔드는 500이 아니라 같은 요청의 보통 에러로 답해야 한다.
 */
export const LONE_SURROGATE = "\ud800";

/** 모든 응답을 계약으로 검증하는 클라이언트. accessToken을 주면 로그인한 요청이다. */
export function api(accessToken?: string): ApiClient {
```

`contract/conformance/test/flows/users.test.ts`를 고친다.

(1) 찾을 부분:

```ts
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api, codes, newUser, problems, signIn, signInAdmin, target, userWith } from "./support.ts";

type Status = "active" | "deactivated" | "deleted";

```

바꿀 내용:

```ts
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  api,
  codes,
  LONE_SURROGATE,
  newUser,
  problems,
  signIn,
  signInAdmin,
  target,
  userWith,
} from "./support.ts";

type Status = "active" | "deactivated" | "deleted";

```

(2) 찾을 부분:

```ts
    ]);
  });

  it("자기 자신이나 나보다 권한이 큰 사용자는 바꾸지 못하고, 내 권한을 넘는 역할은 주지 못한다", async () => {
    const manager = await userWith(["users:read", "users:manage"]);
    const stronger = await userWith(["roles:manage"]);
```

바꿀 내용:

```ts
    ]);
  });

  it("역할 id에 짝 없는 서로게이트가 있어도 없는 역할과 같은 404다", async () => {
    // 없는 역할의 detail은 id를 그대로 담는다. 응답은 그 글자를 \uXXXX로 이스케이프해야 한다.
    const [manager, user] = await Promise.all([signInAdmin(), newUser()]);
    const { error, response } = await manager.api.PATCH("/api/v1/users/{id}", {
      params: { path: { id: user.userId } },
      body: {
        data: {
          type: "users",
          id: user.userId,
          relationships: { roles: { data: [{ type: "roles", id: LONE_SURROGATE }] } },
        },
      },
    });
    expect(response.status).toBe(404);
    expect(problems(error)).toEqual([["resource.not_found", "/data/relationships/roles/data/0"]]);
  });

  it("자기 자신이나 나보다 권한이 큰 사용자는 바꾸지 못하고, 내 권한을 넘는 역할은 주지 못한다", async () => {
    const manager = await userWith(["users:read", "users:manage"]);
    const stronger = await userWith(["roles:manage"]);
```

`contract/mock/test/surrogates.test.ts`를 고친다.

(1) 찾을 부분:

```ts
      { name: "r", permissions: [LONE] },
      "/data/attributes/permissions/0",
    ],
    ["글 제목", "PostCreateDocument", "posts", { title: LONE, body: "" }, "/data/attributes/title"],
    ["글 본문", "PostCreateDocument", "posts", { title: "t", body: LONE }, "/data/attributes/body"],
    [
```

바꿀 내용:

```ts
      { name: "r", permissions: [LONE] },
      "/data/attributes/permissions/0",
    ],
    [
      "역할 설명(길이 제약이 anyOf 밖에 있다)",
      "RoleCreateDocument",
      "roles",
      { name: "r", description: LONE, permissions: [] },
      "/data/attributes/description",
    ],
    ["글 제목", "PostCreateDocument", "posts", { title: LONE, body: "" }, "/data/attributes/title"],
    ["글 본문", "PostCreateDocument", "posts", { title: "t", body: LONE }, "/data/attributes/body"],
    [
```

(2) 찾을 부분:

```ts
    expect(await errorsOf(await send("RegistrationCreateDocument", body), 422)).toEqual([
      unreadable("/data/attributes/password"),
      unreadable("/data/attributes/name"),
    ]);
  });

```

바꿀 내용:

```ts
    expect(await errorsOf(await send("RegistrationCreateDocument", body), 422)).toEqual([
      unreadable("/data/attributes/password"),
      unreadable("/data/attributes/name"),
    ]);
  });

  it("역할 설명은 고칠 때도 길이 검사보다 먼저 본다", async () => {
    const description = `${LONE}${"d".repeat(201)}`;
    const body = JSON.stringify({ data: { type: "roles", id: ID, attributes: { description } } });
    expect(await errorsOf(await send("RoleUpdateDocument", body), 422)).toEqual([
      unreadable("/data/attributes/description"),
    ]);
  });

```

(3) 찾을 부분:

```ts
      "파일 콘텐츠 타입",
      "FileCreateDocument",
      create("files", { filename: "a.png", contentType: "image/\ud800", size: 1 }),
    ],
    [
      "역할 설명(길이만 따로 센다)",
      "RoleCreateDocument",
      create("roles", { name: "r", description: LONE, permissions: [] }),
    ],
    [
      "관계의 id",
```

바꿀 내용:

```ts
      "파일 콘텐츠 타입",
      "FileCreateDocument",
      create("files", { filename: "a.png", contentType: "image/\ud800", size: 1 }),
    ],
    [
      "관계의 id",
```

`templates/fastapi/src/app/core/jsonapi/tests/test_errors.py`를 고친다.

(1) 찾을 부분:

```python
"""에러 문서: 필드별 422와 포인터, 문서 구조 400, type 불일치 409, 클라이언트 id 403,
/api/ 아래 404, 예상하지 못한 예외의 500."""

import uuid
from typing import Any
```

바꿀 내용:

```python
"""에러 문서: 필드별 422와 포인터, 문서 구조 400, type 불일치 409, 클라이언트 id 403,
/api/ 아래 404, 예상하지 못한 예외의 500, detail의 짝 없는 서로게이트."""

import uuid
from typing import Any
```

(2) 찾을 부분:

```python
        ErrorCode.RESOURCE_CONFLICT,
        "/data/id",
    )


async def test_empty_body_is_400(client: httpx.AsyncClient) -> None:
```

바꿀 내용:

```python
        ErrorCode.RESOURCE_CONFLICT,
        "/data/id",
    )


async def test_a_detail_with_a_lone_surrogate_keeps_its_status() -> None:
    """입력을 그대로 담은 detail(본문의 data.id)에 짝 없는 서로게이트가 있어도 500이
    아니다. 응답은 그 글자를 \\uXXXX로 이스케이프하고, 파싱하면 원래 detail이다."""
    app = sample_app()

    @app.get("/api/v1/echo")
    async def echo() -> None:
        require_matching_id("x\ud800", uuid.UUID(KNOWN_ID))

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.get("/api/v1/echo")
    [error] = errors_of(response, 409)
    assert error["detail"] == f"data.id x\ud800 does not match the resource {KNOWN_ID}."
    assert rb'"detail":"data.id x\ud800 does not match' in response.content


async def test_empty_body_is_400(client: httpx.AsyncClient) -> None:
```

`templates/fastapi/src/app/core/jsonapi/tests/test_media.py`:

```python
"""JSON:API 응답 클래스: Starlette JSONResponse와 같은 바이트, 짝 없는 서로게이트의 이스케이프."""

import json

import pytest
from fastapi.responses import JSONResponse

from app.core.jsonapi.media import JSONAPI_MEDIA_TYPE, JsonApiResponse


def test_lone_surrogates_are_escaped_like_json_stringify() -> None:
    """짝 없는 서로게이트만 소문자 \\uXXXX 이스케이프로 쓴다. 파싱하면 원래 문자열이다.

    요청 JSON은 짝 없는 서로게이트도 실어 오고, 입력을 그대로 담은 detail은 그 글자를
    응답에 싣는다. 기대 바이트는 목(JSON.stringify)이 같은 문서에 내는 바이트다.
    """
    content = {"detail": "data.id x\ud800 한글 \\\udfff", "list": ["\udc00"]}
    response = JsonApiResponse(content)
    expected = r'{"detail":"data.id x\ud800 한글 \\\udfff","list":["\udc00"]}'
    assert response.body == expected.encode()
    assert json.loads(bytes(response.body)) == content
    assert response.headers["content-type"] == JSONAPI_MEDIA_TYPE


@pytest.mark.parametrize(
    "content",
    [
        {"detail": '한글 é 😀 " \\ / \n \t \x01 \x7f \u2028 \ufffd'},
        {"data": [1, 2.5, True, None], "meta": {}},
    ],
)
def test_other_content_keeps_the_starlette_bytes(content: object) -> None:
    """짝 없는 서로게이트가 없으면 Starlette JSONResponse와 같은 바이트다."""
    assert JsonApiResponse(content).body == JSONResponse(content).body
```

`templates/fastapi/src/app/core/tests/test_security.py`를 고친다.

(1) 찾을 부분:

```python

import jwt
import pytest
from pydantic import SecretStr

from app.core.security import (
```

바꿀 내용:

```python

import jwt
import pytest
from pwdlib import PasswordHash
from pydantic import SecretStr

from app.core.security import (
```

(2) 찾을 부분:

```python

def test_missing_hash_never_matches() -> None:
    assert check_password("anything", None) is False


async def test_async_password_functions_hash_and_check_in_a_thread() -> None:
```

바꿀 내용:

```python

def test_missing_hash_never_matches() -> None:
    assert check_password("anything", None) is False


def test_lone_surrogates_are_hashed_and_checked_without_errors() -> None:
    """JSON은 짝 없는 서로게이트(\\ud800)도 실어 온다. 비밀번호는 surrogatepass로 인코딩해 해시하고
    검증한다. 해시가 있든 없든 예외 없이 틀린 비밀번호이고, U+FFFD로 바꾼 값과도 다르다."""
    assert check_password("\ud800", None) is False
    assert check_password("\ud800", hash_password("correct horse")) is False
    hashed = hash_password("horse\ud800")
    assert check_password("horse\ud800", hashed) is True
    assert check_password("horse\ufffd", hashed) is False


def test_hashes_made_from_the_str_still_match() -> None:
    """pwdlib이 str을 UTF-8로 인코딩해 만든 해시(bytes로 넘기기 전의 해시)도 그대로 맞는다."""
    hashed = PasswordHash.recommended().hash("correct horse 한글")
    assert check_password("correct horse 한글", hashed) is True


async def test_async_password_functions_hash_and_check_in_a_thread() -> None:
```

`templates/fastapi/src/app/modules/auth/tests/test_passwords.py`를 고친다.

찾을 부분:

```python
    assert await actions(db) == ["user.password_changed", "session.login_succeeded"]


async def test_change_drops_reset_tokens_asked_for_before_it(
    api: httpx.AsyncClient,
    accounts: Accounts,
```

바꿀 내용:

```python
    assert await actions(db) == ["user.password_changed", "session.login_succeeded"]


async def test_a_current_password_with_a_lone_surrogate_is_a_wrong_password(
    api: httpx.AsyncClient, accounts: Accounts
) -> None:
    """JSON은 짝 없는 서로게이트(\\ud800)도 실어 온다. 500이 아니라 틀린 비밀번호와 같은 401이다."""
    headers = await accounts.sign_in(await accounts.create())
    response = await api.post("/api/v1/password-changes", **jsonapi_body(change("\ud800"), headers))
    assert (response.status_code, error_codes(response)) == (401, ["auth.invalid_credentials"])
    assert error_sources(response) == [{"pointer": "/data/attributes/currentPassword"}]


async def test_change_drops_reset_tokens_asked_for_before_it(
    api: httpx.AsyncClient,
    accounts: Accounts,
```

`templates/fastapi/src/app/modules/auth/tests/test_sessions.py`를 고친다.

찾을 부분:

```python
            "auth.oauth_code_invalid",
            None,
        ),
        ({"email": "a@example.com"}, 422, "validation.required", "/data/attributes/grantType"),
        ({"grantType": "magic"}, 422, "validation.invalid_choice", "/data/attributes/grantType"),
        (
```

바꿀 내용:

```python
            "auth.oauth_code_invalid",
            None,
        ),
        (
            {
                "grantType": "password",
                "email": "a@example.com",
                "password": "\ud800",  # 가짜 비밀번호(짝 없는 서로게이트) betterleaks:allow
            },
            401,
            "auth.invalid_credentials",
            None,
        ),
        ({"email": "a@example.com"}, 422, "validation.required", "/data/attributes/grantType"),
        ({"grantType": "magic"}, 422, "validation.invalid_choice", "/data/attributes/grantType"),
        (
```

`templates/fastapi/src/app/modules/roles/tests/test_api.py`를 고친다.

(1) 찾을 부분:

```python
            "validation.too_long",
            "/data/attributes/description",
        ),
    ],
)
async def test_create_rejects(
```

바꿀 내용:

```python
            "validation.too_long",
            "/data/attributes/description",
        ),
        # DB에 저장할 수 없는 짝 없는 서로게이트는 다른 제약 문자열처럼 길이보다 먼저 거절한다.
        (
            role_document("x", [], description="\ud800"),
            422,
            "validation.invalid_format",
            "/data/attributes/description",
        ),
        (
            role_document("x", [], description="\ud800" + "d" * 201),
            422,
            "validation.invalid_format",
            "/data/attributes/description",
        ),
    ],
)
async def test_create_rejects(
```

(2) 찾을 부분:

```python
    assert response.status_code == 200, response.text
    assert response.json()["data"]["attributes"]["name"] == "chief-editor"
    assert await actions(db) == ["role.created", "role.updated"]


async def test_rename_to_a_taken_name_with_new_permissions_is_rejected(
```

바꿀 내용:

```python
    assert response.status_code == 200, response.text
    assert response.json()["data"]["attributes"]["name"] == "chief-editor"
    assert await actions(db) == ["role.created", "role.updated"]


async def test_update_rejects_a_description_with_a_lone_surrogate(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
    auth = await signed_in(accounts, MANAGER)
    role_id = await create(api, auth, "editor", ["users:read"])
    document = update_document(role_id, description="\ud800")
    response = await api.patch(f"{ROLES}/{role_id}", **jsonapi_body(document, auth))
    assert (response.status_code, error_codes(response)) == (422, ["validation.invalid_format"])
    assert error_sources(response) == [{"pointer": "/data/attributes/description"}]
    assert await actions(db) == ["role.created"]


async def test_rename_to_a_taken_name_with_new_permissions_is_rejected(
```

`templates/fastapi/src/app/modules/users/tests/test_admin.py`를 고친다.

찾을 부분:

```python
            "resource.not_found",
            {"pointer": "/data/relationships/roles/data/1"},
        ),
        (
            target.id,
            update_document(uuid.uuid4(), status="active"),
```

바꿀 내용:

```python
            "resource.not_found",
            {"pointer": "/data/relationships/roles/data/1"},
        ),
        # 없는 역할의 detail은 id를 그대로 담는다. 짝 없는 서로게이트가 있어도 500이 아니다.
        (
            target.id,
            update_document(target.id, roles=["\ud800"]),
            404,
            "resource.not_found",
            {"pointer": "/data/relationships/roles/data/0"},
        ),
        (
            target.id,
            update_document(uuid.uuid4(), status="active"),
```

`templates/fastapi/src/app/modules/users/tests/test_me.py`를 고친다.

찾을 부분:

```python
                    }
                }
            },
            404,
            "resource.not_found",
            "/data/relationships/avatar/data",
```

바꿀 내용:

```python
                    }
                }
            },
            404,
            "resource.not_found",
            "/data/relationships/avatar/data",
        ),
        # 입력을 그대로 담은 detail에 짝 없는 서로게이트가 들어가도 500이 아니라 같은 에러다.
        ({"id": "\ud800"}, 409, "resource.conflict", "/data/id"),
        (
            {"relationships": {"avatar": {"data": {"type": "files", "id": "\ud800"}}}},
            404,
            "resource.not_found",
            "/data/relationships/avatar/data",
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`contract/mock`에서): `pnpm exec vitest run test/surrogates.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 역할 설명(길이 제약이 anyOf 밖에 있다)도 같다
× 역할 설명은 고칠 때도 길이 검사보다 먼저 본다
FAIL  test/surrogates.test.ts > 값을 파싱하는 문자열(길이 제약, 선택지) > 역할 설명(길이 제약이 anyOf 밖에 있다)도 같다
AssertionError: expected 200 to be 422 // Object.is equality
FAIL  test/surrogates.test.ts > 값을 파싱하는 문자열(길이 제약, 선택지) > 역할 설명은 고칠 때도 길이 검사보다 먼저 본다
AssertionError: expected [ { status: '422', …(5) } ] to deeply equal [ { status: '422', …(4) } ]
Test Files 1 failed (1)
Tests 2 failed | 30 passed (32)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/core/jsonapi/tests/test_errors.py src/app/core/jsonapi/tests/test_media.py src/app/core/tests/test_security.py src/app/modules/auth/tests/test_passwords.py src/app/modules/auth/tests/test_sessions.py src/app/modules/roles/tests/test_api.py src/app/modules/users/tests/test_admin.py src/app/modules/users/tests/test_me.py`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
E       AssertionError: {"errors":[{"status":"500","code":"internal.unexpected","title":"Internal Server Error"}],"meta":{"traceId":"cdce5564551fa546cb6357c1c25a3e75"}}
E       UnicodeEncodeError: 'utf-8' codec can't encode character '\ud800' in position 20: surrogates not allowed
E       UnicodeEncodeError: 'utf-8' codec can't encode character '\ud800' in position 0: surrogates not allowed
E       UnicodeEncodeError: 'utf-8' codec can't encode character '\ud800' in position 0: surrogates not allowed
E       UnicodeEncodeError: 'utf-8' codec can't encode character '\ud800' in position 0: surrogates not allowed
E   UnicodeEncodeError: 'utf-8' codec can't encode character '\ud800' in position 0: surrogates not allowed
E       AssertionError: assert (422, ['validation.too_long']) == (422, ['valid...alid_format'])
E   UnicodeEncodeError: 'utf-8' codec can't encode character '\ud800' in position 0: surrogates not allowed
11 failed, 121 passed in
```

Run(저장소 루트에서): `pnpm conformance fastapi test/flows/me.test.ts test/flows/passwords.test.ts test/flows/roles.test.ts test/flows/sessions.test.ts test/flows/users.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 역할 설명에 짝 없는 서로게이트가 있으면 저장하지 않고 422 validation.invalid_format이다
× 현재 비밀번호에 짝 없는 서로게이트가 있어도 틀린 비밀번호와 같은 401이다
× 본문의 id나 아바타 id에 짝 없는 서로게이트가 있어도 같은 409와 404다
× 비밀번호에 짝 없는 서로게이트가 있어도 계정이 있든 없든 틀린 비밀번호와 같은 401이다
× 역할 id에 짝 없는 서로게이트가 있어도 없는 역할과 같은 404다
FAIL  test/flows/me.test.ts > 내 정보 (fastapi) > 본문의 id나 아바타 id에 짝 없는 서로게이트가 있어도 같은 409와 404다
AssertionError: expected 500 to be 409 // Object.is equality
FAIL  test/flows/passwords.test.ts > 비밀번호 (fastapi) > 현재 비밀번호에 짝 없는 서로게이트가 있어도 틀린 비밀번호와 같은 401이다
Test Files 5 failed (5)
Tests 5 failed | 29 passed (34)
```

Run(저장소 루트에서): `pnpm conformance mock test/flows/me.test.ts test/flows/passwords.test.ts test/flows/roles.test.ts test/flows/sessions.test.ts test/flows/users.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 역할 설명에 짝 없는 서로게이트가 있으면 저장하지 않고 422 validation.invalid_format이다
FAIL  test/flows/roles.test.ts > 역할 (mock) > 역할 설명에 짝 없는 서로게이트가 있으면 저장하지 않고 422 validation.invalid_format이다
AssertionError: expected 201 to be 422 // Object.is equality
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
× "pnpm recursive run" failed in C:\Users\rootj\.cache\ai-template-
Test Files 1 failed | 4 passed (5)
Tests 1 failed | 33 passed (34)
```

- [ ] **Step 3: FastAPI core를 고친다**

`templates/fastapi/src/app/core/jsonapi/media.py` 전체를 다음으로 바꾼다.

```python
"""JSON:API 미디어 타입과 응답 클래스."""

import json
from typing import Annotated, Any, TypeVar, override

from fastapi import Body
from fastapi.responses import JSONResponse

JSONAPI_MEDIA_TYPE = "application/vnd.api+json"

BodyT = TypeVar("BodyT")
# 요청 본문 선언. PEP 695 `type JsonApiBody[T] = ...`로 쓰면 FastAPI가 별칭을 풀지 못해
# 본문을 필수 쿼리 파라미터로 잘못 해석한다. TypeVar로 만든 Annotated 별칭만 동작한다.
JsonApiBody = Annotated[BodyT, Body(media_type=JSONAPI_MEDIA_TYPE)]


class JsonApiResponse(JSONResponse):
    """`/api/v1` 아래의 모든 응답(성공과 에러)이 쓰는 응답 클래스.

    FastAPI는 라우트의 `response_class.media_type`을 OpenAPI의 성공 응답과
    `responses=`로 선언한 추가 응답(에러)의 content 키로 쓴다.
    """

    media_type = JSONAPI_MEDIA_TYPE

    @override
    def render(self, content: Any) -> bytes:
        """Starlette JSONResponse와 같은 JSON이다. 짝 없는 서로게이트만 JSON 이스케이프로 쓴다.

        요청 JSON은 짝 없는 서로게이트도 실어 오고, 입력을 그대로 담은 에러 detail
        (data.id 불일치 등)은 그 글자를 응답에 싣는다. UTF-8은 서로게이트를 인코딩하지 못한다.
        backslashreplace는 인코딩하지 못한 글자(서로게이트뿐이다)만 소문자 \\uXXXX로 쓴다.
        서로게이트는 JSON 문자열 안에만 나오므로 파싱하면 원래 문자열이고, 목의
        JSON.stringify와 같은 바이트다.
        """
        text = json.dumps(
            content, ensure_ascii=False, allow_nan=False, indent=None, separators=(",", ":")
        )
        return text.encode("utf-8", "backslashreplace")
```

`templates/fastapi/src/app/core/security.py`를 고친다.

(1) 찾을 부분:

```python

- 비밀번호는 Argon2id로 해시한다(pwdlib 권장 설정). 해시 하나에 수십 밀리초가 걸린다.
  async 코드는 스레드에서 도는 hash_password_async, check_password_async를 쓴다. 그동안
  이벤트 루프는 다른 요청을 처리한다(argon2-cffi는 GIL을 푼다).
- access token은 HS256 JWT이고 sub(사용자 id), sid(세션 id), iat, exp를 담는다. 수명은 15분이다.
- refresh token, 인증·재설정 토큰은 32바이트 무작위 값(base64url 43자)이고, DB에는 SHA-256만 둔다.
- 이메일처럼 추측할 수 있는 식별자는 설정 키의 HMAC-SHA256(identifier_hash)으로 가린다. 키 없는
```

바꿀 내용:

```python

- 비밀번호는 Argon2id로 해시한다(pwdlib 권장 설정). 해시 하나에 수십 밀리초가 걸린다.
  async 코드는 스레드에서 도는 hash_password_async, check_password_async를 쓴다. 그동안
  이벤트 루프는 다른 요청을 처리한다(argon2-cffi는 GIL을 푼다). 해시하고 검증할 때 비밀번호는
  surrogatepass로 인코딩한 바이트다(짝 없는 서로게이트가 있어도 예외가 아니라 틀린 비밀번호다).
- access token은 HS256 JWT이고 sub(사용자 id), sid(세션 id), iat, exp를 담는다. 수명은 15분이다.
- refresh token, 인증·재설정 토큰은 32바이트 무작위 값(base64url 43자)이고, DB에는 SHA-256만 둔다.
- 이메일처럼 추측할 수 있는 식별자는 설정 키의 HMAC-SHA256(identifier_hash)으로 가린다. 키 없는
```

(2) 찾을 부분:

```python
    session_id: uuid.UUID


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


async def hash_password_async(password: str) -> str:
```

바꿀 내용:

```python
    session_id: uuid.UUID


def _password_bytes(password: str) -> bytes:
    """pwdlib에 넘길 비밀번호. surrogatepass로 인코딩한 UTF-8 바이트다.

    JSON은 짝 없는 서로게이트도 실어 오는데 pwdlib(argon2-cffi)의 encode()는 실패한다. 이렇게
    넘기면 그런 비밀번호도 틀린 비밀번호다. 보통 문자열은 바이트가 같아 str로 만든 기존 해시도
    그대로 맞는다.
    """
    return password.encode("utf-8", "surrogatepass")


def hash_password(password: str) -> str:
    return _password_hash.hash(_password_bytes(password))


async def hash_password_async(password: str) -> str:
```

(3) 찾을 부분:

```python
    해시가 없어도 가짜 해시를 검증해 걸리는 시간을 맞춘다. 응답 시간으로 계정이 있는지
    알아낼 수 없게 하기 위해서다.
    """
    if hashed is None:
        _password_hash.verify(password, _dummy_hash())
        return False
    return _password_hash.verify(password, hashed)


async def check_password_async(password: str, hashed: str | None) -> bool:
```

바꿀 내용:

```python
    해시가 없어도 가짜 해시를 검증해 걸리는 시간을 맞춘다. 응답 시간으로 계정이 있는지
    알아낼 수 없게 하기 위해서다.
    """
    secret = _password_bytes(password)
    if hashed is None:
        _password_hash.verify(secret, _dummy_hash())
        return False
    return _password_hash.verify(secret, hashed)


async def check_password_async(password: str, hashed: str | None) -> bool:
```

- [ ] **Step 4: FastAPI roles 모듈을 고친다**

`templates/fastapi/src/app/modules/roles/schemas.py`를 고친다.

(1) 찾을 부분:

```python

from pydantic import AfterValidator, Field, StringConstraints
from pydantic.experimental.missing_sentinel import MISSING
from pydantic_core import PydanticCustomError

from app.core.jsonapi.models import (
    CollectionDocument,
```

바꿀 내용:

```python

from pydantic import AfterValidator, Field, StringConstraints
from pydantic.experimental.missing_sentinel import MISSING
from pydantic_core import PydanticCustomError, PydanticKnownError

from app.core.jsonapi.models import (
    CollectionDocument,
```

(2) 찾을 부분:

```python
    POSTS_MANAGE = "posts:manage"


def _description_length(value: str | None) -> str | None:
    if value is not None and len(value) > DESCRIPTION_MAX:
        raise PydanticCustomError(
            "string_too_long",
            "String should have at most {max_length} characters",
```

바꿀 내용:

```python
    POSTS_MANAGE = "posts:manage"


def _check_description(value: str | None) -> str | None:
    """역할 설명의 제약. Pydantic이 제약 있는 문자열을 보는 순서(서로게이트, 길이)대로 본다.

    길이를 Field 제약이 아니라 여기서 세므로(RoleDescription) Pydantic은 문자열을 파싱하지 않고
    짝 없는 서로게이트도 받는다. 그런 값은 DB에 저장할 수 없으므로 길이보다 먼저, 제약 있는
    문자열과 같은 string_unicode 오류로 거절한다.
    """
    if value is None:
        return None
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        raise PydanticKnownError("string_unicode") from None
    if len(value) > DESCRIPTION_MAX:
        raise PydanticCustomError(
            "string_too_long",
            "String should have at most {max_length} characters",
```

(3) 찾을 부분:

```python
RoleDescription = Annotated[
    str | None,
    Field(json_schema_extra={"maxLength": DESCRIPTION_MAX}),
    AfterValidator(_description_length),
]


```

바꿀 내용:

```python
RoleDescription = Annotated[
    str | None,
    Field(json_schema_extra={"maxLength": DESCRIPTION_MAX}),
    AfterValidator(_check_description),
]


```

- [ ] **Step 5: 목을 고친다**

`contract/mock/src/jsonapi/surrogates.ts` 전체를 다음으로 바꾼다.

```ts
/**
 * 짝 없는 서로게이트(U+D800–U+DFFF 가운데 짝을 이루지 않은 코드 유닛). FastAPI 템플릿이 요청 본문의
 * 짝 없는 서로게이트를 다루는 방식을 목에서 똑같이 낸다.
 *
 * - 본문: Python의 json.loads는 바이트를 surrogatepass로 읽는다. JSON 이스케이프(\ud800)와 UTF-8로
 *   인코딩한 서로게이트 바이트(ED A0 80)가 모두 짝 없는 서로게이트가 된다(decodeBody).
 * - 검증: Pydantic은 값을 파싱하는 문자열(길이·패턴 제약이 있는 문자열, 선택지(enum, Literal), 날짜·UUID)에
 *   짝 없는 서로게이트가 있으면 다른 검사보다 먼저 string_unicode 오류(UNICODE_MESSAGE)를 낸다. 제약을
 *   검증기로 보는 역할 설명도 같다. 제약 없는 문자열(토큰, 비밀번호, id 등)은 그대로 받는다. 계약에서
 *   그런 문자열 스키마에 WELL_FORMED 키워드를 붙여 Ajv가 본다(contract-schemas.ts). 상태와 코드는 다른
 *   오류와 같은 규칙이다: /data/type이면 400 jsonapi.invalid_document, 필드면 422
 *   validation.invalid_format.
 * - 메시지: Pydantic이 오류 메시지에 넣는 입력 값(판별자 값)은 짝 없는 서로게이트 하나가 U+FFFD 셋이
 *   된다(lossy).
 * - 이메일: email-validator는 짝 없는 서로게이트를 안전하지 않은 글자로 알린다(loneSurrogateNames).
 *
 * 맞추지 않는 차이: UTF-8로 인코딩한 서로게이트 바이트 둘이 짝을 이루면(CESU-8) Python에서는 짝 없는
 * 서로게이트 둘이지만 JavaScript 문자열에서는 글자 하나가 된다. 브라우저(fetch, JSON.stringify)는 이런
 * 바이트를 보내지 않는다.
 */

import { isRecord } from "../json.ts";

/** Pydantic이 짝 없는 서로게이트가 든 문자열을 파싱하지 못할 때의 메시지(string_unicode). */
export const UNICODE_MESSAGE =
  "Input should be a valid string, unable to parse raw data as a unicode string";

/** 계약의 문자열 스키마에 붙이는 Ajv 키워드. 값에 짝 없는 서로게이트가 없어야 한다. */
export const WELL_FORMED = "wellFormed";

/** Pydantic이 파싱하는 문자열의 제약 키워드와 형식. */
const PARSING_KEYWORDS = ["minLength", "maxLength", "pattern", "enum", "const"];
const PARSING_FORMATS: ReadonlySet<unknown> = new Set(["date-time", "date", "time", "uuid"]);

/** u 플래그에서 \p{Cs}는 짝 없는 서로게이트에만 맞는다(짝을 이룬 둘은 코드 포인트 하나다). */
const LONE_SURROGATE = /\p{Cs}/gu;

const UTF8 = new TextDecoder("utf-8", { fatal: true });
/** 본문 중간의 조각을 읽는 디코더. 조각 맨 앞의 U+FEFF를 BOM으로 보고 지우지 않는다. */
const UTF8_INNER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function constrained(schema: Readonly<Record<string, unknown>>): boolean {
  return (
    PARSING_KEYWORDS.some((keyword) => keyword in schema) || PARSING_FORMATS.has(schema.format)
  );
}

/**
 * Pydantic이 값을 파싱하는 문자열 스키마인가(WELL_FORMED를 붙일 스키마). 제약이나 형식이 있는 문자열
 * 스키마이고, 널 허용 문자열의 제약을 anyOf 밖에 둔 스키마(역할 설명: anyOf [string, null]과 바깥의
 * maxLength)도 그렇다. 후자는 FastAPI가 검증기로 제약을 보면서 짝 없는 서로게이트를 길이보다 먼저
 * 거절한다(roles/schemas.py). WELL_FORMED는 문자열 값에만 걸리므로 null은 그대로 받는다.
 */
export function parsesString(schema: Readonly<Record<string, unknown>>): boolean {
  if (schema.type === "string") return constrained(schema);
  const branches = schema.anyOf;
  return (
    Array.isArray(branches) &&
    branches.some((branch) => isRecord(branch) && branch.type === "string") &&
    constrained(schema)
  );
}

/** Pydantic(pydantic-core)이 메시지에 넣는 모양: 짝 없는 서로게이트 하나가 U+FFFD 셋이 된다. */
export function lossy(text: string): string {
  return text.replace(LONE_SURROGATE, "\ufffd\ufffd\ufffd");
}

/** 짝 없는 서로게이트들을 email-validator가 알리는 모양(U+D800)으로. 겹치지 않고 정렬돼 있다. */
export function loneSurrogateNames(text: string): string[] {
  const names = new Set<string>();
  for (const [char] of text.matchAll(LONE_SURROGATE)) {
    names.add(`U+${char.charCodeAt(0).toString(16).toUpperCase()}`);
  }
  return [...names].sort();
}

/** bytes[index]부터가 UTF-8로 인코딩한 서로게이트(ED A0..BF 80..BF)면 그 코드 유닛, 아니면 undefined다. */
function encodedSurrogateAt(bytes: Uint8Array, index: number): number | undefined {
  const [first, second = 0, third = 0] = bytes.subarray(index, index + 3);
  if (first !== 0xed || second < 0xa0 || second > 0xbf || third < 0x80 || third > 0xbf) {
    return undefined;
  }
  return 0xd000 | ((second & 0x3f) << 6) | (third & 0x3f);
}

/**
 * 본문 바이트를 Python의 bytes.decode("utf-8", "surrogatepass")처럼 읽는다. 앞의 BOM은 지운다(json.loads의
 * utf-8-sig). 그 밖의 잘못된 UTF-8이 있으면 TypeError를 던진다.
 */
export function decodeBody(bytes: Uint8Array): string {
  let text = "";
  let start = 0;
  for (let index = bytes.indexOf(0xed); index !== -1; index = bytes.indexOf(0xed, index + 1)) {
    const unit = encodedSurrogateAt(bytes, index);
    if (unit === undefined) continue;
    text += (start === 0 ? UTF8 : UTF8_INNER).decode(bytes.subarray(start, index));
    text += String.fromCharCode(unit);
    start = index + 3;
  }
  return text + (start === 0 ? UTF8 : UTF8_INNER).decode(bytes.subarray(start));
}
```

- [ ] **Step 6: 문서를 고친다**

`contract/mock/AGENTS.md`를 고친다.

찾을 부분:

```markdown
- 비밀번호 해시(scrypt), 소셜 로그인 제공자(가짜 OAuth 서버), 스토리지(메모리 버킷)는 개발용이다. 재시작하면 옛 presigned URL은 맞지 않는다.
- 스케줄 잡이 없다. `modules/files/service.ts`의 `purgePending`은 떠 있는 프로세스가 부르지 않아 24시간이 지난 pending 업로드도 계속 사용자 쿼터를 차지한다. 만료된 세션과 토큰도 지우지 않는다(FastAPI는 각각 매일 03:00 UTC, 매시간 정각 잡으로 지운다).
- 공개 글 목록 첫 페이지를 캐시하지 않는다(FastAPI는 `posts/service.ts`가 60초 캐시한다). 그래서 저자 이름 변경처럼 다른 모듈이 일으킨 변화가 목에는 바로 보이고 FastAPI에는 최대 60초 늦게 보인다.
- 짝 없는 서로게이트가 있어도 FastAPI가 500을 내는 자리(Pydantic이 파싱하지 않는 문자열이라 값이 그대로 흘러가다 나중에 막히는 자리)를 목은 정상 처리한다: 로그인의 비밀번호(401), 입력을 그대로 돌려주는 에러 detail(data.id 불일치 409, 파일이 없거나 남의 것이라는 404), 역할 설명 저장(201). 이 FastAPI 문제는 고칠 예정이다(설계 §12.1).
- `REALTIME_ALLOWED_ORIGINS`는 값마다 Origin으로 정규화하고 `*`나 URL이 아닌 값을 설정 오류로 거절한다. FastAPI는 원래 문자열을 그대로 비교해 `*`는 전부 허용으로 본다(값을 검증하지 않는다).
- 본문 인코딩이 다르다: JSON의 `NaN`·`Infinity`는 목에서 400이다(Python의 `json`은 받아들인다). CESU-8로 짝을 이룬 서로게이트 바이트, UTF-16·UTF-32 본문도 Python의 `json.loads`와 다르게 다룬다(`src/jsonapi/validation.ts`, `src/jsonapi/surrogates.ts`).
- snake_case 속성 이름을 FastAPI(`validate_by_name`)는 camelCase와 함께 받지만, 목은 스키마에 없는 속성으로 보고 조용히 버린다(`removeAdditional`). 그 속성이 필수면 422가 난다.
```

바꿀 내용:

```markdown
- 비밀번호 해시(scrypt), 소셜 로그인 제공자(가짜 OAuth 서버), 스토리지(메모리 버킷)는 개발용이다. 재시작하면 옛 presigned URL은 맞지 않는다.
- 스케줄 잡이 없다. `modules/files/service.ts`의 `purgePending`은 떠 있는 프로세스가 부르지 않아 24시간이 지난 pending 업로드도 계속 사용자 쿼터를 차지한다. 만료된 세션과 토큰도 지우지 않는다(FastAPI는 각각 매일 03:00 UTC, 매시간 정각 잡으로 지운다).
- 공개 글 목록 첫 페이지를 캐시하지 않는다(FastAPI는 `posts/service.ts`가 60초 캐시한다). 그래서 저자 이름 변경처럼 다른 모듈이 일으킨 변화가 목에는 바로 보이고 FastAPI에는 최대 60초 늦게 보인다.
- 비밀번호의 짝 없는 서로게이트를 FastAPI는 surrogatepass로 인코딩해 해시하고, 목의 scrypt(`src/core/security.ts`)는 UTF-8로 인코딩하면서 U+FFFD로 대신한다. 그래서 U+FFFD가 든 비밀번호의 그 자리를 짝 없는 서로게이트로 바꿔 로그인하면 목은 통과하고 FastAPI는 401이다.
- `REALTIME_ALLOWED_ORIGINS`는 값마다 Origin으로 정규화하고 `*`나 URL이 아닌 값을 설정 오류로 거절한다. FastAPI는 원래 문자열을 그대로 비교해 `*`는 전부 허용으로 본다(값을 검증하지 않는다).
- 본문 인코딩이 다르다: JSON의 `NaN`·`Infinity`는 목에서 400이다(Python의 `json`은 받아들인다). CESU-8로 짝을 이룬 서로게이트 바이트, UTF-16·UTF-32 본문도 Python의 `json.loads`와 다르게 다룬다(`src/jsonapi/validation.ts`, `src/jsonapi/surrogates.ts`).
- snake_case 속성 이름을 FastAPI(`validate_by_name`)는 camelCase와 함께 받지만, 목은 스키마에 없는 속성으로 보고 조용히 버린다(`removeAdditional`). 그 속성이 필수면 422가 난다.
```

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

Run(`contract/mock`에서): `pnpm exec vitest run test/surrogates.test.ts`

Expected: 통과한다.

```text
Test Files 1 passed (1)
Tests 32 passed (32)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/core/jsonapi/tests/test_errors.py src/app/core/jsonapi/tests/test_media.py src/app/core/tests/test_security.py src/app/modules/auth/tests/test_passwords.py src/app/modules/auth/tests/test_sessions.py src/app/modules/roles/tests/test_api.py src/app/modules/users/tests/test_admin.py src/app/modules/users/tests/test_me.py`

Expected: 통과한다.

```text
132 passed in
```

Run(저장소 루트에서): `pnpm conformance fastapi test/flows/me.test.ts test/flows/passwords.test.ts test/flows/roles.test.ts test/flows/sessions.test.ts test/flows/users.test.ts`

Expected: 가드 셋(`test_hashes_made_from_the_str_still_match`, `test_other_content_keeps_the_starlette_bytes`의 두 경우)은 부모 커밋에서도 통과한다. `openapi.json`은 바뀌지 않는다(역할 설명의 JSON 스키마는 그대로다).

```text
Test Files 5 passed (5)
Tests 34 passed (34)
```

Run(저장소 루트에서): `pnpm conformance mock test/flows/me.test.ts test/flows/passwords.test.ts test/flows/roles.test.ts test/flows/sessions.test.ts test/flows/users.test.ts`

Expected: 가드 셋(`test_hashes_made_from_the_str_still_match`, `test_other_content_keeps_the_starlette_bytes`의 두 경우)은 부모 커밋에서도 통과한다. `openapi.json`은 바뀌지 않는다(역할 설명의 JSON 스키마는 그대로다).

```text
Test Files 5 passed (5)
Tests 34 passed (34)
```

- [ ] **Step 8: 검사를 돌린다**

Run(`templates/fastapi`에서): `uv run poe check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 건너뛴 단계가 있으면 `.cache/check`를 지우고 다시 돌린다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄

Run(저장소 루트에서): `pnpm spec-compare contract/openapi.yaml templates/fastapi/openapi.json`

Expected: 차이 없이 끝난다(종료 코드 0).

Run(저장소 루트에서): `pnpm conformance fastapi`

Expected: 마지막에 `Tests  92 passed (92)`. 끝나면 인프라가 내려가므로 `templates/fastapi`에서 `docker compose up -d --wait`로 다시 올린다.

Run(저장소 루트에서): `pnpm conformance mock`

Expected: 마지막에 `Tests  92 passed (92)`.

- [ ] **Step 9: 커밋한다**

```bash
git add \
  contract/conformance/test/flows/me.test.ts \
  contract/conformance/test/flows/passwords.test.ts \
  contract/conformance/test/flows/roles.test.ts \
  contract/conformance/test/flows/sessions.test.ts \
  contract/conformance/test/flows/support.ts \
  contract/conformance/test/flows/users.test.ts \
  contract/mock/AGENTS.md \
  contract/mock/src/jsonapi/surrogates.ts \
  contract/mock/test/surrogates.test.ts \
  templates/fastapi/src/app/core/jsonapi/media.py \
  templates/fastapi/src/app/core/jsonapi/tests/test_errors.py \
  templates/fastapi/src/app/core/jsonapi/tests/test_media.py \
  templates/fastapi/src/app/core/security.py \
  templates/fastapi/src/app/core/tests/test_security.py \
  templates/fastapi/src/app/modules/auth/tests/test_passwords.py \
  templates/fastapi/src/app/modules/auth/tests/test_sessions.py \
  templates/fastapi/src/app/modules/roles/schemas.py \
  templates/fastapi/src/app/modules/roles/tests/test_api.py \
  templates/fastapi/src/app/modules/users/tests/test_admin.py \
  templates/fastapi/src/app/modules/users/tests/test_me.py
git commit -m "fix(fastapi): handle unpaired surrogates without a 500"
```


### Task 5: 모든 401에 Bearer challenge를 담는다

web 설계 §12.1의 FastAPI 문제. RFC 9110 §15.5.2는 모든 401에 `WWW-Authenticate` challenge를 요구한다. 지금은 인증 의존성(`core/access.py`)만 붙여서, 본문의 자격 증명을 보는 auth 서비스의 401에는 없었다: 로그인의 `auth.invalid_credentials`, refresh의 `auth.token_invalid`·`auth.refresh_token_reused`, 소셜 로그인의 `auth.oauth_code_invalid`, 비밀번호 변경의 틀린 현재 비밀번호.

- `core/jsonapi/errors.py`의 `error_response`가 응답을 만들 때 `_with_challenge`를 거친다. 상태가 401이고 `WWW-Authenticate`가 없으면 `Bearer`를 더한다(API의 인증 방식은 Bearer 하나이고, RFC 6750 §3은 error 없는 challenge를 허용한다). 이미 있으면 이름의 대소문자와 관계없이 그대로 둔다(재인증의 step-up challenge). 401이 아니면 손대지 않는다.
- `error_response`는 모든 예외 핸들러와 공통 계층의 미들웨어가 쓰는 한 곳이라, 헤더 없이 던진 `HTTPException(401)`도 담는다. `core/access.py`의 병합은 그대로 둔다. 계약, 선언, `openapi.json`은 바뀌지 않는다.
- 목도 빠진 헤더를 따라 했다. FastAPI `error_response`의 짝인 `jsonapi/errors.ts`의 `errorResponse`가 같은 규칙의 `withChallenge`를 거친다(`handleError`는 ApiError를 `errorResponse`로 보낸다). 헤더가 없음을 고정하던 `test/passwords.test.ts`의 단언은 `Bearer`로 뒤집는다.
- 테스트: FastAPI `test_every_401_carries_a_challenge`와 목 `errors.test.ts`의 같은 경우다. 헤더 없는 401(`ApiError`, FastAPI는 `HTTPException`도)은 `Bearer`이고, step-up은 이름이 대문자든 소문자든 그 값 하나이고, 403은 헤더가 없다. auth 단위 테스트(틀린 비밀번호와 없는 계정, refresh token 재사용, `test_bad_grants`의 401, 틀린 현재 비밀번호)는 헤더를 본다.
- 적합성: 새 흐름 없이 기존 401 단언 넷에 `toMatch(/^Bearer/)`를 더한다. sessions의 틀린 비밀번호와 재사용, passwords의 틀린 현재 비밀번호, oauth의 틀린 verifier다.
- 실패 확인: 부모 커밋에서는 두 대상 모두 네 단언이 `TypeError: .toMatch() expects to receive a string, but got object`(헤더가 `null`)로 실패한다. FastAPI 단위 테스트는 `KeyError: 'www-authenticate'`와 `(401, []) == (401, ['Bearer'])`로, 목 단위 테스트는 `expected null to be 'Bearer'`로 실패한다.

**Files:**
- Modify: `contract/mock/src/jsonapi/errors.ts`, `templates/fastapi/src/app/core/jsonapi/errors.py`
- Test: `contract/conformance/test/flows/oauth.test.ts`, `contract/conformance/test/flows/passwords.test.ts`, `contract/conformance/test/flows/sessions.test.ts`, `contract/mock/test/errors.test.ts`, `contract/mock/test/passwords.test.ts`, `contract/mock/test/sessions.test.ts`, `templates/fastapi/src/app/core/jsonapi/tests/test_errors.py`, `templates/fastapi/src/app/modules/auth/tests/test_passwords.py`, `templates/fastapi/src/app/modules/auth/tests/test_sessions.py`

**Interfaces:**
- Consumes: `app.core.jsonapi.errors`의 `error_response(scope: Scope, status: int, errors: Sequence[ErrorObject], headers: Mapping[str, str] | None = None) -> JsonApiResponse`와 그 호출처(예외 핸들러, 협상, 본문 한도, 레이트 리밋), `ApiError(…, headers=…)`. 재인증의 step-up challenge(`Bearer error="insufficient_user_authentication", max_age=600`, `core/access.py`). 목 `src/jsonapi/errors.ts`의 `errorResponse(c: Context<AppEnv>, status: ErrorStatus, errors: readonly ErrorObject[], headers?: Readonly<Record<string, string>>): Response`, `handleError`, `ApiError`(`headers` 옵션). Task 3·4의 `test_bad_grants`
- Produces:
  - `app.core.jsonapi.errors._with_challenge(status: int, headers: Mapping[str, str] | None) -> Mapping[str, str] | None`. `error_response`가 응답을 만들 때 거친다(시그니처는 그대로)
  - 목 `withChallenge(status: ErrorStatus, headers: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>>`(비공개). `errorResponse`가 거친다
  - FastAPI 테스트 `test_every_401_carries_a_challenge`(상수 `STEP_UP`). 적합성의 401 단언 넷

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`contract/conformance/test/flows/oauth.test.ts`를 고친다.

찾을 부분:

```ts
    expect(code).not.toBeNull();
    const wrongVerifier = await signInWith(code, `not-${back.codeVerifier}`);
    expect(wrongVerifier.response.status).toBe(401);
    expect(codes(wrongVerifier.error)).toEqual(["auth.oauth_code_invalid"]);
    const rightVerifier = await signInWith(code, back.codeVerifier);
    expect(rightVerifier.response.status).toBe(401);
```

바꿀 내용:

```ts
    expect(code).not.toBeNull();
    const wrongVerifier = await signInWith(code, `not-${back.codeVerifier}`);
    expect(wrongVerifier.response.status).toBe(401);
    expect(wrongVerifier.response.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect(codes(wrongVerifier.error)).toEqual(["auth.oauth_code_invalid"]);
    const rightVerifier = await signInWith(code, back.codeVerifier);
    expect(rightVerifier.response.status).toBe(401);
```

`contract/conformance/test/flows/passwords.test.ts`를 고친다.

찾을 부분:

```ts
    const wrongPassword = "wrong-password"; // betterleaks:allow 틀린 비밀번호
    const wrong = await change(wrongPassword, NEW_PASSWORD);
    expect(wrong.response.status).toBe(401);
    expect(problems(wrong.error)).toEqual([
      ["auth.invalid_credentials", "/data/attributes/currentPassword"],
    ]);
```

바꿀 내용:

```ts
    const wrongPassword = "wrong-password"; // betterleaks:allow 틀린 비밀번호
    const wrong = await change(wrongPassword, NEW_PASSWORD);
    expect(wrong.response.status).toBe(401);
    expect(wrong.response.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect(problems(wrong.error)).toEqual([
      ["auth.invalid_credentials", "/data/attributes/currentPassword"],
    ]);
```

`contract/conformance/test/flows/sessions.test.ts`를 고친다.

(1) 찾을 부분:

```ts
      },
    });
    expect(response.status).toBe(401);
    expect(codes(error)).toEqual(["auth.invalid_credentials"]);
  });

```

바꿀 내용:

```ts
      },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect(codes(error)).toEqual(["auth.invalid_credentials"]);
  });

```

(2) 찾을 부분:

```ts

    const reused = await refresh(user.refreshToken);
    expect(reused.response.status).toBe(401);
    expect(codes(reused.error)).toEqual(["auth.refresh_token_reused"]);
    expect(await meStatus(next?.accessToken ?? "")).toBe(401);
    expect((await refresh(next?.refreshToken ?? "")).response.status).toBe(401);
```

바꿀 내용:

```ts

    const reused = await refresh(user.refreshToken);
    expect(reused.response.status).toBe(401);
    expect(reused.response.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect(codes(reused.error)).toEqual(["auth.refresh_token_reused"]);
    expect(await meStatus(next?.accessToken ?? "")).toBe(401);
    expect((await refresh(next?.refreshToken ?? "")).response.status).toBe(401);
```

`contract/mock/test/errors.test.ts`를 고친다.

(1) 찾을 부분:

```ts
/**
 * 에러 문서: 없는 경로의 404, 예상하지 못한 예외의 500, ApiError의 모양과 헤더.
 * FastAPI 템플릿의 test_errors.py 가운데 공통 계층에 해당하는 경우를 본다.
 */

```

바꿀 내용:

```ts
/**
 * 에러 문서: 없는 경로의 404, 예상하지 못한 예외의 500, ApiError의 모양과 헤더, 401의 challenge.
 * FastAPI 템플릿의 test_errors.py 가운데 공통 계층에 해당하는 경우를 본다.
 */

```

(2) 찾을 부분:

```ts
      },
    ]);
  });
});

describe("errorObject", () => {
```

바꿀 내용:

```ts
      },
    ]);
  });

  it("401은 늘 WWW-Authenticate를 담는다: 없으면 Bearer를 더하고, 있으면(재인증의 step-up) 이름의 대소문자와 관계없이 그것만 둔다", async () => {
    const stepUp = 'Bearer error="insufficient_user_authentication", max_age=600';
    const cases: [ApiError, string | null][] = [
      [new ApiError(401, "auth.invalid_credentials"), "Bearer"],
      [
        new ApiError(401, "auth.reauthentication_required", undefined, {
          headers: { "WWW-Authenticate": stepUp },
        }),
        stepUp,
      ],
      [
        new ApiError(401, "auth.token_invalid", undefined, {
          headers: { "www-authenticate": stepUp },
        }),
        stepUp,
      ],
      [new ApiError(403, "permission.denied"), null],
    ];
    for (const [raised, challenge] of cases) {
      const { app } = testApp();
      app.get("/api/v1/guarded", () => {
        throw raised;
      });
      const response = await app.request("/api/v1/guarded");
      expect(response.status, raised.code).toBe(raised.status);
      expect(response.headers.get("www-authenticate"), raised.code).toBe(challenge);
    }
  });
});

describe("errorObject", () => {
```

`contract/mock/test/passwords.test.ts`를 고친다.

찾을 부분:

```ts
    const reasons = revokedReasons(state, current.userId);
    const token = current.accessToken;
    const wrong = await send(app, "POST", CHANGES, { document: change(WRONG_PASSWORD), token });
    expect(wrong.headers.get("www-authenticate")).toBeNull();
    expect(await errorsOf(wrong, 401)).toEqual([
      {
        status: "401",
```

바꿀 내용:

```ts
    const reasons = revokedReasons(state, current.userId);
    const token = current.accessToken;
    const wrong = await send(app, "POST", CHANGES, { document: change(WRONG_PASSWORD), token });
    expect(wrong.headers.get("www-authenticate")).toBe("Bearer");
    expect(await errorsOf(wrong, 401)).toEqual([
      {
        status: "401",
```

`contract/mock/test/sessions.test.ts`를 고친다.

(1) 찾을 부분:

```ts
      const response = await send(app, "POST", SESSIONS, {
        document: passwordGrant(email, password),
      });
      expect(await errorsOf(response, 401)).toEqual([
        {
          status: "401",
```

바꿀 내용:

```ts
      const response = await send(app, "POST", SESSIONS, {
        document: passwordGrant(email, password),
      });
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect(await errorsOf(response, 401)).toEqual([
        {
          status: "401",
```

(2) 찾을 부분:

```ts
    const reused = await send(app, "POST", SESSIONS, {
      document: refreshGrant(first.refreshToken),
    });
    expect(await errorsOf(reused, 401)).toEqual([
      {
        status: "401",
```

바꿀 내용:

```ts
    const reused = await send(app, "POST", SESSIONS, {
      document: refreshGrant(first.refreshToken),
    });
    expect(reused.headers.get("www-authenticate")).toBe("Bearer");
    expect(await errorsOf(reused, 401)).toEqual([
      {
        status: "401",
```

(3) 찾을 부분:

```ts
    ],
  ])("%j → %i %s", async (attributes, status, code, pointer) => {
    const { app } = testApp();
    const errors = await errorsOf(
      await send(app, "POST", SESSIONS, { document: grant(attributes) }),
      status,
    );
    expect(errors.map((error) => error.code)).toEqual([code]);
    if (pointer !== null) expect(errors[0]?.source).toEqual({ pointer });
  });
```

바꿀 내용:

```ts
    ],
  ])("%j → %i %s", async (attributes, status, code, pointer) => {
    const { app } = testApp();
    const response = await send(app, "POST", SESSIONS, { document: grant(attributes) });
    // 틀린 grant의 401도 challenge를 담는다(RFC 9110). 검증 오류(422)에는 없다.
    expect(response.headers.get("www-authenticate")).toBe(status === 401 ? "Bearer" : null);
    const errors = await errorsOf(response, status);
    expect(errors.map((error) => error.code)).toEqual([code]);
    if (pointer !== null) expect(errors[0]?.source).toEqual({ pointer });
  });
```

`templates/fastapi/src/app/core/jsonapi/tests/test_errors.py`를 고친다.

(1) 찾을 부분:

```python
"""에러 문서: 필드별 422와 포인터, 문서 구조 400, type 불일치 409, 클라이언트 id 403,
/api/ 아래 404, 예상하지 못한 예외의 500, detail의 짝 없는 서로게이트."""

import uuid
from typing import Any
```

바꿀 내용:

```python
"""에러 문서: 필드별 422와 포인터, 문서 구조 400, type 불일치 409, 클라이언트 id 403,
/api/ 아래 404, 예상하지 못한 예외의 500, detail의 짝 없는 서로게이트, 401의 challenge."""

import uuid
from typing import Any
```

(2) 찾을 부분:

```python
    assert response.headers["www-authenticate"] == "Bearer"


async def test_http_413_is_content_too_large() -> None:
    """프레임워크가 내는 413도 jsonapi.content_too_large다."""
    app = sample_app()
```

바꿀 내용:

```python
    assert response.headers["www-authenticate"] == "Bearer"


STEP_UP = 'Bearer error="insufficient_user_authentication", max_age=600'


@pytest.mark.parametrize(
    ("raised", "status", "challenges"),
    [
        (ApiError(401, ErrorCode.AUTH_INVALID_CREDENTIALS), 401, ["Bearer"]),
        (HTTPException(401), 401, ["Bearer"]),
        # 이미 challenge가 있으면(재인증의 step-up) 이름의 대소문자와 관계없이 그것만 둔다.
        (
            ApiError(
                401, ErrorCode.AUTH_REAUTHENTICATION_REQUIRED, headers={"WWW-Authenticate": STEP_UP}
            ),
            401,
            [STEP_UP],
        ),
        (
            ApiError(401, ErrorCode.AUTH_TOKEN_INVALID, headers={"www-authenticate": STEP_UP}),
            401,
            [STEP_UP],
        ),
        (ApiError(403, ErrorCode.PERMISSION_DENIED), 403, []),
    ],
)
async def test_every_401_carries_a_challenge(
    raised: Exception, status: int, challenges: list[str]
) -> None:
    """RFC 9110: 401은 WWW-Authenticate를 담는다(MUST). 인증 의존성을 거치지 않는 401(본문의
    자격 증명이 틀림)도 같다. 없으면 Bearer(RFC 6750)를 더하고, 401이 아니면 더하지 않는다."""
    app = sample_app()

    @app.get("/api/v1/guarded")
    async def guarded() -> None:
        raise raised

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        response = await http.get("/api/v1/guarded")
    assert (response.status_code, response.headers.get_list("www-authenticate")) == (
        status,
        challenges,
    )


async def test_http_413_is_content_too_large() -> None:
    """프레임워크가 내는 413도 jsonapi.content_too_large다."""
    app = sample_app()
```

`templates/fastapi/src/app/modules/auth/tests/test_passwords.py`를 고친다.

찾을 부분:

```python
    )
    assert (wrong.status_code, error_codes(wrong)) == (401, ["auth.invalid_credentials"])
    assert error_sources(wrong) == [{"pointer": "/data/attributes/currentPassword"}]
    response = await api.post("/api/v1/password-changes", **jsonapi_body(change(PASSWORD), current))
    assert response.status_code == 201, response.text
    assert (await api.get("/api/v1/sessions", headers=current)).status_code == 200
```

바꿀 내용:

```python
    )
    assert (wrong.status_code, error_codes(wrong)) == (401, ["auth.invalid_credentials"])
    assert error_sources(wrong) == [{"pointer": "/data/attributes/currentPassword"}]
    assert wrong.headers["www-authenticate"] == "Bearer"
    response = await api.post("/api/v1/password-changes", **jsonapi_body(change(PASSWORD), current))
    assert response.status_code == 201, response.text
    assert (await api.get("/api/v1/sessions", headers=current)).status_code == 200
```

`templates/fastapi/src/app/modules/auth/tests/test_sessions.py`를 고친다.

(1) 찾을 부분:

```python
    for email, password in ((user.email, "wrong-password"), (unknown, PASSWORD)):
        response = await api.post(SESSIONS, **jsonapi_body(password_grant(email, password)))
        assert (response.status_code, error_codes(response)) == (401, ["auth.invalid_credentials"])
    known, missing = await audit_rows(db)
    assert (known.action, known.target_id) == ("session.login_failed", user.id)
    assert (missing.target_type, missing.target_id) == (None, None)
```

바꿀 내용:

```python
    for email, password in ((user.email, "wrong-password"), (unknown, PASSWORD)):
        response = await api.post(SESSIONS, **jsonapi_body(password_grant(email, password)))
        assert (response.status_code, error_codes(response)) == (401, ["auth.invalid_credentials"])
        assert response.headers["www-authenticate"] == "Bearer"
    known, missing = await audit_rows(db)
    assert (known.action, known.target_id) == ("session.login_failed", user.id)
    assert (missing.target_type, missing.target_id) == (None, None)
```

(2) 찾을 부분:

```python
        SESSIONS, **jsonapi_body(grant(grantType="refreshToken", refreshToken=old))
    )
    assert (reused.status_code, error_codes(reused)) == (401, ["auth.refresh_token_reused"])
    after = await api.get(SESSIONS, headers=bearer(second))
    assert (after.status_code, error_codes(after)) == (401, ["auth.token_invalid"])

```

바꿀 내용:

```python
        SESSIONS, **jsonapi_body(grant(grantType="refreshToken", refreshToken=old))
    )
    assert (reused.status_code, error_codes(reused)) == (401, ["auth.refresh_token_reused"])
    assert reused.headers["www-authenticate"] == "Bearer"
    after = await api.get(SESSIONS, headers=bearer(second))
    assert (after.status_code, error_codes(after)) == (401, ["auth.token_invalid"])

```

(3) 찾을 부분:

```python
) -> None:
    response = await api.post(SESSIONS, **jsonapi_body(grant(**attributes)))
    assert (response.status_code, error_codes(response)) == (status, [code])
    if pointer is not None:
        assert error_sources(response) == [{"pointer": pointer}]

```

바꿀 내용:

```python
) -> None:
    response = await api.post(SESSIONS, **jsonapi_body(grant(**attributes)))
    assert (response.status_code, error_codes(response)) == (status, [code])
    # 틀린 grant의 401도 challenge를 담는다(RFC 9110). 검증 오류(422)에는 없다.
    assert response.headers.get("www-authenticate") == ("Bearer" if status == 401 else None)
    if pointer is not None:
        assert error_sources(response) == [{"pointer": pointer}]

```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`contract/mock`에서): `pnpm exec vitest run test/errors.test.ts test/passwords.test.ts test/sessions.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 401은 늘 WWW-Authenticate를 담는다: 없으면 Bearer를 더하고, 있으면(재인증의 step-up) 이름의 대소문자와 관계없이 그것만 둔다
× 틀린 비밀번호와 없는 계정은 똑같이 401이고, 입력한 이메일의 해시만 남긴다
× 토큰을 회전하고, 쓴 토큰을 다시 쓰면 세션을 폐기한다
× {"grantType":"refreshToken","refreshToken":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"} → 401 auth.token_invalid
× {"grantType":"refreshToken","refreshToken":"\ud800"} → 401 auth.token_invalid
× {"grantType":"oauthCode","code":"abc","codeVerifier":"vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv"} → 401 auth.oauth_code_invalid
× 현재 비밀번호를 확인하고, 현재 세션은 남기고 다른 세션은 끝낸다
FAIL  test/errors.test.ts > 예외 > 401은 늘 WWW-Authenticate를 담는다: 없으면 Bearer를 더하고, 있으면(재인증의 step-up) 이름의 대소문자와 관계없이 그것만 둔다
Test Files 3 failed (3)
Tests 7 failed | 35 passed (42)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/core/jsonapi/tests/test_errors.py src/app/modules/auth/tests/test_passwords.py src/app/modules/auth/tests/test_sessions.py`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
E       AssertionError: assert (401, []) == (401, ['Bearer'])
E       AssertionError: assert (401, []) == (401, ['Bearer'])
E       KeyError: 'www-authenticate'
E       KeyError: 'www-authenticate'
E       KeyError: 'www-authenticate'
E       AssertionError: assert None == 'Bearer'
E       AssertionError: assert None == 'Bearer'
E       AssertionError: assert None == 'Bearer'
10 failed, 60 passed in
```

Run(저장소 루트에서): `pnpm conformance fastapi test/flows/oauth.test.ts test/flows/passwords.test.ts test/flows/sessions.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 틀린 비밀번호로는 로그인하지 못한다
× refresh token은 한 번만 쓴다. 쓴 것을 다시 쓰면 그 세션을 통째로 폐기한다
× 현재 비밀번호가 틀리거나 새 비밀번호가 짧으면 바꾸지 않는다
× codeChallenge가 없거나 형식이 틀리면 400이고, codeVerifier가 안 맞거나 RFC 7636 형식이 아니면 401이며 코드는 그때 이미 쓴다
FAIL  test/flows/oauth.test.ts > 소셜 로그인 (fastapi) > codeChallenge가 없거나 형식이 틀리면 400이고, codeVerifier가 안 맞거나 RFC 7636 형식이 아니면 401이며 코드는 그때 이미 쓴다
TypeError: .toMatch() expects to receive a string, but got object
FAIL  test/flows/passwords.test.ts > 비밀번호 (fastapi) > 현재 비밀번호가 틀리거나 새 비밀번호가 짧으면 바꾸지 않는다
FAIL  test/flows/sessions.test.ts > 세션 (fastapi) > 틀린 비밀번호로는 로그인하지 못한다
Test Files 3 failed (3)
Tests 4 failed | 22 passed (26)
```

Run(저장소 루트에서): `pnpm conformance mock test/flows/oauth.test.ts test/flows/passwords.test.ts test/flows/sessions.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 현재 비밀번호가 틀리거나 새 비밀번호가 짧으면 바꾸지 않는다
× 틀린 비밀번호로는 로그인하지 못한다
× refresh token은 한 번만 쓴다. 쓴 것을 다시 쓰면 그 세션을 통째로 폐기한다
× codeChallenge가 없거나 형식이 틀리면 400이고, codeVerifier가 안 맞거나 RFC 7636 형식이 아니면 401이며 코드는 그때 이미 쓴다
FAIL  test/flows/oauth.test.ts > 소셜 로그인 (mock) > codeChallenge가 없거나 형식이 틀리면 400이고, codeVerifier가 안 맞거나 RFC 7636 형식이 아니면 401이며 코드는 그때 이미 쓴다
TypeError: .toMatch() expects to receive a string, but got object
FAIL  test/flows/passwords.test.ts > 비밀번호 (mock) > 현재 비밀번호가 틀리거나 새 비밀번호가 짧으면 바꾸지 않는다
FAIL  test/flows/sessions.test.ts > 세션 (mock) > 틀린 비밀번호로는 로그인하지 못한다
Test Files 3 failed (3)
Tests 4 failed | 22 passed (26)
```

- [ ] **Step 3: FastAPI core를 고친다**

`templates/fastapi/src/app/core/jsonapi/errors.py`를 고친다.

(1) 찾을 부분:

```python
"""모든 예외를 JSON:API 에러 문서(ErrorDocument)로 바꾼다. meta.traceId는 그 요청의 trace id다."""

import re
from collections.abc import Iterable, Mapping, Sequence
```

바꿀 내용:

```python
"""모든 예외를 JSON:API 에러 문서(ErrorDocument)로 바꾼다. meta.traceId는 그 요청의 trace id다.

401 응답은 늘 WWW-Authenticate를 담는다(error_response).
"""

import re
from collections.abc import Iterable, Mapping, Sequence
```

(2) 찾을 부분:

```python
    )


def error_response(
    scope: Scope,
    status: int,
    errors: Sequence[ErrorObject],
    headers: Mapping[str, str] | None = None,
) -> JsonApiResponse:
    meta = ErrorDocumentMeta(trace_id=trace_id_of(scope))
    document = ErrorDocument(errors=list(errors), meta=meta)
    return JsonApiResponse(document.model_dump(mode="json"), status_code=status, headers=headers)


def require_matching_id(document_id: str, resource_id: object) -> None:
```

바꿀 내용:

```python
    )


def _with_challenge(status: int, headers: Mapping[str, str] | None) -> Mapping[str, str] | None:
    """401이면 WWW-Authenticate가 있게 한다(RFC 9110 §15.5.2 MUST).

    인증 의존성을 거치지 않는 401(본문의 자격 증명이 틀린 로그인, 비밀번호 변경 등)도 담는다.
    없으면 Bearer를 더하고(API의 인증 방식은 Bearer 하나다. RFC 6750 §3은 error 없는 Bearer를
    허용한다), 이미 있으면(재인증의 step-up challenge) 이름의 대소문자와 관계없이 그대로 둔다.
    """
    if status != 401 or any(name.lower() == "www-authenticate" for name in headers or {}):
        return headers
    return {**(headers or {}), "WWW-Authenticate": "Bearer"}


def error_response(
    scope: Scope,
    status: int,
    errors: Sequence[ErrorObject],
    headers: Mapping[str, str] | None = None,
) -> JsonApiResponse:
    """에러 문서 응답. 모든 에러 핸들러와 미들웨어가 쓰고, 401은 늘 challenge를 담는다."""
    meta = ErrorDocumentMeta(trace_id=trace_id_of(scope))
    document = ErrorDocument(errors=list(errors), meta=meta)
    content = document.model_dump(mode="json")
    return JsonApiResponse(content, status_code=status, headers=_with_challenge(status, headers))


def require_matching_id(document_id: str, resource_id: object) -> None:
```

- [ ] **Step 4: 목을 고친다**

`contract/mock/src/jsonapi/errors.ts`를 고친다.

(1) 찾을 부분:

```ts
 * - 에러 객체는 status(문자열), code, title(HTTP 이유 문구), detail, source.pointer 또는
 *   source.parameter, meta.params를 이 순서로 담는다. 값이 없는 멤버는 넣지 않는다.
 * - 문서는 { errors, meta: { traceId } }이고 Content-Type은 application/vnd.api+json이다.
 * - 에러 코드는 계약에서 생성한 타입(ErrorCode)만 쓴다. 코드를 더하려면 계약을 고치고 gen한다.
 */

```

바꿀 내용:

```ts
 * - 에러 객체는 status(문자열), code, title(HTTP 이유 문구), detail, source.pointer 또는
 *   source.parameter, meta.params를 이 순서로 담는다. 값이 없는 멤버는 넣지 않는다.
 * - 문서는 { errors, meta: { traceId } }이고 Content-Type은 application/vnd.api+json이다.
 * - 401은 늘 WWW-Authenticate를 담는다(없으면 Bearer).
 * - 에러 코드는 계약에서 생성한 타입(ErrorCode)만 쓴다. 코드를 더하려면 계약을 고치고 gen한다.
 */

```

(2) 찾을 부분:

```ts
  }
}

/** 에러 문서 응답. meta.traceId는 그 요청의 trace id다. */
export function errorResponse(
  c: Context<AppEnv>,
  status: ErrorStatus,
  errors: readonly ErrorObject[],
  headers?: Readonly<Record<string, string>>,
): Response {
  return jsonApiResponse({ errors, meta: { traceId: traceIdOf(c) } }, status, headers);
}

/**
```

바꿀 내용:

```ts
  }
}

/**
 * 401이면 WWW-Authenticate가 있게 한다(RFC 9110 §15.5.2 MUST, FastAPI의 _with_challenge). 인증 검사를
 * 거치지 않는 401(본문의 자격 증명이 틀린 로그인, 비밀번호 변경 등)도 담는다. 없으면 Bearer를 더하고,
 * 이미 있으면(재인증의 step-up challenge) 이름의 대소문자와 관계없이 그대로 둔다.
 */
function withChallenge(
  status: ErrorStatus,
  headers: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  const challenged = Object.keys(headers).some((name) => name.toLowerCase() === "www-authenticate");
  return status !== 401 || challenged ? headers : { ...headers, "WWW-Authenticate": "Bearer" };
}

/**
 * 에러 문서 응답(FastAPI의 error_response). meta.traceId는 그 요청의 trace id다. onError와 공통 계층의
 * 미들웨어가 모두 쓰고, 401은 늘 challenge를 담는다(withChallenge).
 */
export function errorResponse(
  c: Context<AppEnv>,
  status: ErrorStatus,
  errors: readonly ErrorObject[],
  headers?: Readonly<Record<string, string>>,
): Response {
  const document = { errors, meta: { traceId: traceIdOf(c) } };
  return jsonApiResponse(document, status, withChallenge(status, headers));
}

/**
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run(`contract/mock`에서): `pnpm exec vitest run test/errors.test.ts test/passwords.test.ts test/sessions.test.ts`

Expected: 통과한다.

```text
Test Files 3 passed (3)
Tests 42 passed (42)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/core/jsonapi/tests/test_errors.py src/app/modules/auth/tests/test_passwords.py src/app/modules/auth/tests/test_sessions.py`

Expected: 통과한다.

```text
70 passed in
```

Run(저장소 루트에서): `pnpm conformance fastapi test/flows/oauth.test.ts test/flows/passwords.test.ts test/flows/sessions.test.ts`

Expected: 인증 헤더를 바꾸므로 템플릿의 `uv run poe test:e2e`도 돌린다.

```text
Test Files 3 passed (3)
Tests 26 passed (26)
```

Run(저장소 루트에서): `pnpm conformance mock test/flows/oauth.test.ts test/flows/passwords.test.ts test/flows/sessions.test.ts`

Expected: 인증 헤더를 바꾸므로 템플릿의 `uv run poe test:e2e`도 돌린다.

```text
Test Files 3 passed (3)
Tests 26 passed (26)
```

- [ ] **Step 6: 검사를 돌린다**

Run(`templates/fastapi`에서): `uv run poe check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 건너뛴 단계가 있으면 `.cache/check`를 지우고 다시 돌린다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄

Run(저장소 루트에서): `pnpm spec-compare contract/openapi.yaml templates/fastapi/openapi.json`

Expected: 차이 없이 끝난다(종료 코드 0).

Run(저장소 루트에서): `pnpm conformance fastapi`

Expected: 마지막에 `Tests  92 passed (92)`. 끝나면 인프라가 내려가므로 `templates/fastapi`에서 `docker compose up -d --wait`로 다시 올린다.

Run(저장소 루트에서): `pnpm conformance mock`

Expected: 마지막에 `Tests  92 passed (92)`.

Run(`templates/fastapi`에서): `uv run poe test:e2e`

Expected: `12 passed`

- [ ] **Step 7: 커밋한다**

```bash
git add \
  contract/conformance/test/flows/oauth.test.ts \
  contract/conformance/test/flows/passwords.test.ts \
  contract/conformance/test/flows/sessions.test.ts \
  contract/mock/src/jsonapi/errors.ts \
  contract/mock/test/errors.test.ts \
  contract/mock/test/passwords.test.ts \
  contract/mock/test/sessions.test.ts \
  templates/fastapi/src/app/core/jsonapi/errors.py \
  templates/fastapi/src/app/core/jsonapi/tests/test_errors.py \
  templates/fastapi/src/app/modules/auth/tests/test_passwords.py \
  templates/fastapi/src/app/modules/auth/tests/test_sessions.py
git commit -m "fix(fastapi): send a Bearer challenge with every 401"
```


### Task 6: attributes 없는 역할 PATCH도 고치기 전 권한을 본다

web 설계 §12.1의 FastAPI 문제. 권한 상승 금지(F2)의 "고치기 전" 검사는 `roles/service.py`의 `update_role` 첫 줄에 있다. `roles/router.py`는 attributes가 없으면 서비스를 부르지 않아, `roles:manage`만 가진 사람이 attributes 없이 admin 역할을 PATCH하면 200이었다(`attributes: {}`이면 403). 서비스를 건너뛰는 PATCH 라우터는 roles 하나였다.

- 라우터가 늘 서비스를 부르고, attributes가 없으면 `RoleUpdateAttributes()`(모든 필드가 `MISSING`)를 넘긴다. 같은 최적화를 되살리지 않게 까닭을 주석으로 단다. 서비스 docstring에 "고칠 것이 없어도 고치기 전 권한은 본다"를 적는다.
- 결과: 내 권한 밖의 역할은 attributes가 없든 비었든 403 `permission.denied`다. 권한 안의 역할은 200이고 바뀐 것이 없어 flush, 감사 로그, commit이 없다(`if changed:`). 계약과 선언은 바뀌지 않는다.
- 목도 건너뛰기를 따라 했다. `roles/routes.ts`의 `Roles_update`가 `updateRole(…, attributes ?? {})`를 부르고, 머리 주석과 `management.ts`의 `updateRole` 주석을 고친다. 200을 고정하던 `test/roles.test.ts`의 테스트를 뒤집는다(admin 역할은 403, 자기가 만든 권한 안의 역할은 200이고 `updatedAt`과 감사 로그가 그대로다).
- FastAPI 테스트 `test_update_without_changes_still_checks_the_role`은 attributes 없음(`absent`)과 `{}`(`empty`)를 parametrize한다. 기존 `test_update_protects_system_roles_and_limits`와 같은 fixture다.
- 적합성 `roles.test.ts`에 흐름 하나: `roles:read`와 `roles:manage`만 가진 새 사용자가 admin 역할을 attributes 없이, 그리고 `{}`로 PATCH하면 둘 다 403이다. 바꿀 속성을 보내지 않으므로 보호가 뚫려도 시드 역할은 바뀌지 않는다.
- 실패 확인: 부모 커밋에서는 두 대상의 흐름이 첫 요청(attributes 없음)에서 `expected 200 to be 403`으로 실패한다. FastAPI 단위 테스트는 `absent`만 실패하고(200 응답에 `errors`가 없어 `KeyError: 'errors'`), 목 단위 테스트도 `expected 200 to be 403`이다.

**Files:**
- Modify: `contract/mock/src/modules/roles/management.ts`, `contract/mock/src/modules/roles/routes.ts`, `templates/fastapi/src/app/modules/roles/router.py`, `templates/fastapi/src/app/modules/roles/service.py`
- Test: `contract/conformance/test/flows/roles.test.ts`, `contract/mock/test/roles.test.ts`, `templates/fastapi/src/app/modules/roles/tests/test_api.py`

**Interfaces:**
- Consumes: roles `service.update_role(session: AsyncSession, registry: PermissionRegistry, actor: Principal, client: Client, role: Role, attributes: RoleUpdateAttributes) -> Role`(첫 줄이 `_require_within(role_permissions(role, registry), actor)`), `service.get_role`, `schemas.RoleUpdateAttributes`(모든 필드가 `Omittable`), `MISSING`. 목 `src/modules/roles/management.ts`의 `updateRole(state: MockState, actor: Principal, client: Client, role: RoleRow, attributes: RoleUpdateAttributes): RoleRow`, `getRole`. 적합성 `support.ts`의 `userWith`, `codes`, `roles.test.ts`의 `systemRole`
- Produces:
  - roles `router.update_role`이 늘 `service.update_role`을 부른다. attributes가 없으면 `RoleUpdateAttributes()`를 넘긴다(시그니처는 그대로)
  - 목 `Roles_update` 라우트가 `updateRole(state, principal, clientOf(c), found, attributes ?? {})`를 부른다
  - FastAPI 테스트 `test_update_without_changes_still_checks_the_role`(parametrize `absent`, `empty`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`contract/conformance/test/flows/roles.test.ts`를 고친다.

찾을 부분:

```ts
    });
  });

  it("roles:read가 없으면 역할을 보지 못한다", async () => {
    const user = await newUser();
    const { error, response } = await user.api.GET("/api/v1/roles");
```

바꿀 내용:

```ts
    });
  });

  it("내 권한을 넘는 역할은 attributes가 없거나 비어 있어도 고치지 못한다", async () => {
    const manager = await userWith(["roles:read", "roles:manage"]);
    const id = await systemRole(manager, "admin");
    const params = { path: { id } };
    const bare = await manager.api.PATCH("/api/v1/roles/{id}", {
      params,
      body: { data: { type: "roles", id } },
    });
    const empty = await manager.api.PATCH("/api/v1/roles/{id}", {
      params,
      body: { data: { type: "roles", id, attributes: {} } },
    });
    for (const { error, response } of [bare, empty]) {
      expect(response.status).toBe(403);
      expect(codes(error)).toEqual(["permission.denied"]);
    }
  });

  it("roles:read가 없으면 역할을 보지 못한다", async () => {
    const user = await newUser();
    const { error, response } = await user.api.GET("/api/v1/roles");
```

`contract/mock/test/roles.test.ts`를 고친다.

찾을 부분:

```ts
    expect(unchanged.status).toBe(200);
  });

  it("attributes가 없으면 권한도 검사하지 않고 그대로 준다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const admin = roleId(state, "admin");
    expect((await patch(app, manager, admin)).status).toBe(200);
    expect(await codesOf(await patch(app, manager, admin, {}), 403)).toEqual(["permission.denied"]);
  });

  it("본문의 id가 경로와 다르면 409이고, 없는 역할이어도 409가 먼저다", async () => {
```

바꿀 내용:

```ts
    expect(unchanged.status).toBe(200);
  });

  it("attributes가 없거나 비어도 고치기 전 권한을 검사하고, 권한 안의 역할은 그대로 준다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, [...MANAGER]);
    const admin = roleId(state, "admin");
    const id = await create(app, manager, "editor", ["users:read"]);
    const before = state.store.roles.get(id)?.updatedAt;
    for (const attributes of [undefined, {}]) {
      const beyond = await patch(app, manager, admin, attributes);
      expect(await codesOf(beyond, 403)).toEqual(["permission.denied"]);
      expect((await patch(app, manager, id, attributes)).status).toBe(200);
    }
    expect([state.store.roles.get(id)?.updatedAt, actions(state)]).toEqual([
      before,
      ["role.created"],
    ]);
  });

  it("본문의 id가 경로와 다르면 409이고, 없는 역할이어도 409가 먼저다", async () => {
```

`templates/fastapi/src/app/modules/roles/tests/test_api.py`를 고친다.

찾을 부분:

```python
    assert (response.status_code, error_codes(response)) == (status, [code])


async def test_admin_permissions_cannot_change(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
```

바꿀 내용:

```python
    assert (response.status_code, error_codes(response)) == (status, [code])


@pytest.mark.parametrize("extra", [{}, {"attributes": {}}], ids=["absent", "empty"])
async def test_update_without_changes_still_checks_the_role(
    api: httpx.AsyncClient,
    accounts: Accounts,
    db: async_sessionmaker[AsyncSession],
    extra: dict[str, Any],
) -> None:
    """attributes가 없거나 비어도 고치기 전 권한 검사(F2)를 한다. 권한 안의 역할은 그대로 준다."""
    auth = await signed_in(accounts, MANAGER)

    async def patch(role_id: uuid.UUID | str) -> httpx.Response:
        document = {"data": {"type": "roles", "id": str(role_id), **extra}}
        return await api.patch(f"{ROLES}/{role_id}", **jsonapi_body(document, auth))

    beyond = await patch((await role_named(db, ADMIN_ROLE)).id)
    assert (beyond.status_code, error_codes(beyond)) == (403, ["permission.denied"])
    own = await create(api, auth, "editor", ["users:read"])
    same = await patch(own)
    assert same.status_code == 200, same.text
    assert same.json()["data"]["attributes"]["name"] == "editor"
    assert await actions(db) == ["role.created"]


async def test_admin_permissions_cannot_change(
    api: httpx.AsyncClient, accounts: Accounts, db: async_sessionmaker[AsyncSession]
) -> None:
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`contract/mock`에서): `pnpm exec vitest run test/roles.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× attributes가 없거나 비어도 고치기 전 권한을 검사하고, 권한 안의 역할은 그대로 준다
FAIL  test/roles.test.ts > 역할 고치기 > attributes가 없거나 비어도 고치기 전 권한을 검사하고, 권한 안의 역할은 그대로 준다
AssertionError: expected 200 to be 403 // Object.is equality
Test Files 1 failed (1)
Tests 1 failed | 23 passed (24)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/modules/roles/tests/test_api.py`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
E       KeyError: 'errors'
FAILED src/app/modules/roles/tests/test_api.py::test_update_without_changes_still_checks_the_role[absent]
E       KeyError: 'errors'
FAILED src/app/modules/roles/tests/test_api.py::test_update_without_changes_still_checks_the_role[absent]
1 failed, 22 passed in
```

Run(저장소 루트에서): `pnpm conformance fastapi test/flows/roles.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 내 권한을 넘는 역할은 attributes가 없거나 비어 있어도 고치지 못한다
FAIL  test/flows/roles.test.ts > 역할 (fastapi) > 내 권한을 넘는 역할은 attributes가 없거나 비어 있어도 고치지 못한다
AssertionError: expected 200 to be 403 // Object.is equality
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
× "pnpm recursive run" failed in C:\Users\rootj\.cache\ai-template-
Test Files 1 failed (1)
Tests 1 failed | 6 passed (7)
```

Run(저장소 루트에서): `pnpm conformance mock test/flows/roles.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 내 권한을 넘는 역할은 attributes가 없거나 비어 있어도 고치지 못한다
FAIL  test/flows/roles.test.ts > 역할 (mock) > 내 권한을 넘는 역할은 attributes가 없거나 비어 있어도 고치지 못한다
AssertionError: expected 200 to be 403 // Object.is equality
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
× "pnpm recursive run" failed in C:\Users\rootj\.cache\ai-template-
Test Files 1 failed (1)
Tests 1 failed | 6 passed (7)
```

- [ ] **Step 3: FastAPI roles 모듈을 고친다**

`templates/fastapi/src/app/modules/roles/router.py`를 고친다.

(1) 찾을 부분:

```python
    RoleCreateDocument,
    RoleDocument,
    RoleFilter,
    RoleUpdateDocument,
)

```

바꿀 내용:

```python
    RoleCreateDocument,
    RoleDocument,
    RoleFilter,
    RoleUpdateAttributes,
    RoleUpdateDocument,
)

```

(2) 찾을 부분:

```python
) -> Response:
    require_matching_id(document.data.id, role_id)
    role = await service.get_role(session, role_id)
    if document.data.attributes is not MISSING:
        role = await service.update_role(
            session, registry, actor, client, role, document.data.attributes
        )
    return render(RoleDocument(data=service.role_resource(role, registry)))


```

바꿀 내용:

```python
) -> Response:
    require_matching_id(document.data.id, role_id)
    role = await service.get_role(session, role_id)
    # attributes가 없어도 서비스를 부른다. 고치기 전 권한 검사(F2)를 건너뛰면 안 된다.
    attributes = document.data.attributes
    role = await service.update_role(
        session,
        registry,
        actor,
        client,
        role,
        RoleUpdateAttributes() if attributes is MISSING else attributes,
    )
    return render(RoleDocument(data=service.role_resource(role, registry)))


```

`templates/fastapi/src/app/modules/roles/service.py`를 고친다.

찾을 부분:

```python
    role: Role,
    attributes: RoleUpdateAttributes,
) -> Role:
    """역할을 고친다. 고치기 전과 후의 권한이 모두 내 권한 안이어야 한다."""
    _require_within(role_permissions(role, registry), actor)
    changed: list[str] = []
    if attributes.name is not MISSING and attributes.name != role.name:
```

바꿀 내용:

```python
    role: Role,
    attributes: RoleUpdateAttributes,
) -> Role:
    """역할을 고친다. 고치기 전과 후의 권한이 모두 내 권한 안이어야 한다.

    고칠 것이 없어도(attributes가 없는 PATCH는 router가 빈 속성으로 부른다) 고치기 전 권한은 본다.
    """
    _require_within(role_permissions(role, registry), actor)
    changed: list[str] = []
    if attributes.name is not MISSING and attributes.name != role.name:
```

- [ ] **Step 4: 목을 고친다**

`contract/mock/src/modules/roles/management.ts`를 고친다.

찾을 부분:

```ts
  return role;
}

/** 역할을 고친다. 고치기 전과 후의 권한이 모두 내 권한 안이어야 한다. */
export function updateRole(
  state: MockState,
  actor: Principal,
```

바꿀 내용:

```ts
  return role;
}

/**
 * 역할을 고친다. 고치기 전과 후의 권한이 모두 내 권한 안이어야 한다. 고칠 것이 없어도(attributes가 없는
 * PATCH는 routes.ts가 빈 속성으로 부른다) 고치기 전 권한은 본다.
 */
export function updateRole(
  state: MockState,
  actor: Principal,
```

`contract/mock/src/modules/roles/routes.ts`를 고친다.

(1) 찾을 부분:

```ts
 * (management.ts)에 있고, 여기서는 요청을 넘기고 문서를 만든다.
 *
 * - 읽기는 roles:read, 만들기·고치기·지우기는 roles:manage 권한이 있어야 한다.
 * - PATCH 본문의 data.id가 경로와 다르면 409이고, 그다음 역할이 없으면 404다. attributes가 없으면 고치지
 *   않고(권한 검사도 하지 않는다) 역할을 그대로 준다.
 * - 권한 목록은 등록된 권한(core/permissions.ts)을 코드 순으로 준다. 정렬할 수 있는 것은 id뿐이다.
 */

```

바꿀 내용:

```ts
 * (management.ts)에 있고, 여기서는 요청을 넘기고 문서를 만든다.
 *
 * - 읽기는 roles:read, 만들기·고치기·지우기는 roles:manage 권한이 있어야 한다.
 * - PATCH 본문의 data.id가 경로와 다르면 409이고, 그다음 역할이 없으면 404다. attributes가 없으면 빈
 *   속성으로 고친다. 고치기 전 권한 검사는 하고(내 권한을 넘는 역할이면 403), 바뀐 것은 없다.
 * - 권한 목록은 등록된 권한(core/permissions.ts)을 코드 순으로 준다. 정렬할 수 있는 것은 id뿐이다.
 */

```

(2) 찾을 부분:

```ts
    const { id, attributes } = document.data;
    requireMatchingId(id, path.id);
    const found = getRole(state.store, path.id);
    const role =
      attributes === undefined
        ? found
        : updateRole(state, principal, clientOf(c), found, attributes);
    const body: Schemas["RoleDocument"] = { data: roleResource(role) };
    return render(body);
  });
```

바꿀 내용:

```ts
    const { id, attributes } = document.data;
    requireMatchingId(id, path.id);
    const found = getRole(state.store, path.id);
    const role = updateRole(state, principal, clientOf(c), found, attributes ?? {});
    const body: Schemas["RoleDocument"] = { data: roleResource(role) };
    return render(body);
  });
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run(`contract/mock`에서): `pnpm exec vitest run test/roles.test.ts`

Expected: 통과한다.

```text
Test Files 1 passed (1)
Tests 24 passed (24)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/modules/roles/tests/test_api.py`

Expected: 통과한다.

```text
23 passed in
```

Run(저장소 루트에서): `pnpm conformance fastapi test/flows/roles.test.ts`

Expected: `empty` 경우(`attributes: {}`)는 부모 커밋에서도 403이었다. 이 태스크는 attributes가 없는 경우를 같게 만든다.

```text
Test Files 1 passed (1)
Tests 7 passed (7)
```

Run(저장소 루트에서): `pnpm conformance mock test/flows/roles.test.ts`

Expected: `empty` 경우(`attributes: {}`)는 부모 커밋에서도 403이었다. 이 태스크는 attributes가 없는 경우를 같게 만든다.

```text
Test Files 1 passed (1)
Tests 7 passed (7)
```

- [ ] **Step 6: 검사를 돌린다**

Run(`templates/fastapi`에서): `uv run poe check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 건너뛴 단계가 있으면 `.cache/check`를 지우고 다시 돌린다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄

Run(저장소 루트에서): `pnpm spec-compare contract/openapi.yaml templates/fastapi/openapi.json`

Expected: 차이 없이 끝난다(종료 코드 0).

Run(저장소 루트에서): `pnpm conformance fastapi`

Expected: 마지막에 `Tests  93 passed (93)`. 끝나면 인프라가 내려가므로 `templates/fastapi`에서 `docker compose up -d --wait`로 다시 올린다.

Run(저장소 루트에서): `pnpm conformance mock`

Expected: 마지막에 `Tests  93 passed (93)`.

- [ ] **Step 7: 커밋한다**

```bash
git add \
  contract/conformance/test/flows/roles.test.ts \
  contract/mock/src/modules/roles/management.ts \
  contract/mock/src/modules/roles/routes.ts \
  contract/mock/test/roles.test.ts \
  templates/fastapi/src/app/modules/roles/router.py \
  templates/fastapi/src/app/modules/roles/service.py \
  templates/fastapi/src/app/modules/roles/tests/test_api.py
git commit -m "fix(fastapi): check the role's permissions on a PATCH without attributes"
```


### Task 7: 만료된 세션은 끝난 세션이다

web 설계 §12.1의 FastAPI 문제. `GET /sessions`는 살아 있는 세션(폐기되지 않았고 만료되지 않음)만 보여 주는데, `auth/repository.py`의 `revoke_sessions`는 폐기하지 않은 세션을 모두 폐기하고 셌다. 그래서 정리 잡(매일 03:00 UTC)이 아직 지우지 않은 만료 세션까지 `revokedCount`와 감사 로그 `session.all_revoked`의 `metadata.revokedCount`에 들어갔다.

- `_live(user_id, now)`를 목록, 폐기, `active_session`이 함께 쓴다. `revoke_sessions`는 살아 있는 세션만 폐기하고 센다. 부르는 곳은 다른 기기·전체 로그아웃, 비밀번호 재설정·변경, 계정 닫기다.
- `active_session`도 `expires_at > now`를 본다(인자 `now`를 더한다). 인증기, 티켓 연결, 연결 재검사(`session_principal`)와 refresh grant(`_refresh`)가 만료된 세션을 끝난 세션으로 본다. access token은 세션의 만료를 30일 뒤로 늘린 직후에만 발급하므로 HTTP 인증은 바뀌지 않고, 만료 전에 붙은 소켓을 재검사가 끊게 된다.
- 재검사: 지금은 `session.revoked`와 재검사가 함께, 폐기한 세션이 있을 때만 나간다. 만료된 세션을 폐기하지 않으면 살아 있는 세션이 없을 때 그런 소켓이 남는다. 그래서 `auth/events.py`의 `session_revoked`가 폐기한 수(`revoked`)를 받아, 이벤트는 수가 0보다 클 때만 넣고 재검사는 늘 넣는다. 여러 세션을 폐기하는 경로 넷(`service/sessions.py`의 `revoke_sessions`, `service/passwords.py`의 `reset_password`·`change_password`, `service/credentials.py`의 `close_credentials`)은 `if` 없이 수를 넘긴다. 세션 하나를 폐기하는 경로는 그대로다.
- 목도 만료된 세션을 셌다. `auth/sessions.ts`의 `revokeUserSessions`가 살아 있는 세션만 세고, `credentials.ts`의 `activeSession`·`sessionPrincipal`이 `now`를 받아 만료를 보고, `events.ts`의 `sessionRevoked`가 같은 규칙이다. 폐기할 세션이 없는 계정 닫기에 아무것도 보내지 않기를 기대하던 `test/leaving.test.ts`는 재검사를 기대한다.
- 테스트(두 쪽이 같은 경우): 만료된 세션이 섞여도 폐기 수가 2·3이고, 만료된 세션은 폐기되지 않고, 감사 메타데이터가 같다. 인증기가 만료된 세션의 토큰을 401 `auth.token_invalid`로 거절한다. 살아 있는 세션 없이 계정을 닫아도 재검사한다. 전체·다른 기기 로그아웃, 비밀번호 변경, 재설정이 만료된 세션의 소켓을 끊고, `session.revoked`는 `all`에서만 나간다. FastAPI는 세션의 만료를 DB에서 앞당기고, 목은 `testClock`으로 30일을 넘긴다.
- 적합성 흐름은 없다(FastAPI 대상에 시계 제어가 없다). 계약과 `openapi.json`은 바뀌지 않는다.
- 실패 확인: 부모 커밋에서는 만료된 세션까지 폐기하고 센다. 폐기 테스트는 `revokedCount`가 3·4이고(기대 2·3), 소켓 테스트는 만료된 세션까지 폐기되어 실패한다. 인증기는 만료된 세션의 토큰을 받고(FastAPI `DID NOT RAISE ApiError`, 목 200), 살아 있는 세션이 없는 계정 닫기는 재검사를 넣지 않는다(FastAPI `publisher.rechecks`와 목의 로그가 빈 목록).

**Files:**
- Modify: `contract/mock/src/modules/auth/closing.ts`, `contract/mock/src/modules/auth/credentials.ts`, `contract/mock/src/modules/auth/events.ts`, `contract/mock/src/modules/auth/passwords.ts`, `contract/mock/src/modules/auth/sessions.ts`, `contract/mock/src/modules/realtime/gateway.ts`, `templates/fastapi/src/app/modules/auth/events.py`, `templates/fastapi/src/app/modules/auth/repository.py`, `templates/fastapi/src/app/modules/auth/service/credentials.py`, `templates/fastapi/src/app/modules/auth/service/passwords.py`, `templates/fastapi/src/app/modules/auth/service/sessions.py`, `templates/fastapi/src/app/modules/realtime/gateway.py`
- Test: `contract/mock/test/leaving.test.ts`, `contract/mock/test/realtime-recheck.test.ts`, `contract/mock/test/session-management.test.ts`, `contract/mock/test/sessions.test.ts`, `templates/fastapi/src/app/modules/auth/tests/test_authenticate.py`, `templates/fastapi/src/app/modules/auth/tests/test_closing.py`, `templates/fastapi/src/app/modules/auth/tests/test_sessions.py`

**Interfaces:**
- Consumes: auth `repository.py`의 `_live(user_id, now)`, `active_session`, `revoke_sessions(session: AsyncSession, user_id: uuid.UUID, now: datetime, keep: uuid.UUID | None = None) -> int`, `live_sessions_page`. `events.session_revoked`, `app.core.realtime`의 `queue`, `queue_recheck`, `RecordingPublisher`(`rechecks`, `named`). `service.credentials`의 `session_principal`, `close_credentials`, `service.sessions`의 `revoke_sessions`, `_refresh`, `service.passwords`의 `reset_password`, `change_password`. M5의 연결 재검사(`Gateway.recheck`, 제어 채널). 테스트 도우미 `app.tests.sockets`의 `serving`, `connected`, auth의 `tokens.issue`. 목 `auth/sessions.ts`의 `live`, `revokeUserSessions`, `revokeSessions`, `credentials.ts`의 `activeSession`, `sessionPrincipal`, `createAuthenticator`, `events.ts`의 `sessionRevoked`, `passwords.ts`, `closing.ts`, `realtime/gateway.ts`의 `authenticate`, `principalOf`. 목 테스트의 `testClock`, `serving`, `issueAccountToken`
- Produces:
  - `repository._live(user_id: uuid.UUID, now: datetime) -> tuple[ColumnElement[bool], ...]`(파일 위쪽으로 옮기고 목록, 폐기, `active_session`이 함께 쓴다)
  - `repository.active_session(session: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID, now: datetime) -> LoginSession | None`(인자 `now`를 더했다)
  - `repository.revoke_sessions`: 살아 있는 세션만 폐기하고 센다(시그니처는 그대로)
  - `events.session_revoked(session: AsyncSession, user_id: uuid.UUID, reason: SessionRevokedReason, revoked: int = 1) -> None`: `revoked`가 0이면 이벤트 없이 재검사만 넣는다
  - `service.credentials.session_principal(session, registry, user_id, session_id) -> Principal | None`: 시그니처는 그대로다(안에서 `utc_now()`)
  - 목 `activeSession(store: Store, sessionId: string, userId: string, now: Instant): LoginSessionRow | undefined`, `sessionPrincipal(store: Store, userId: string, sessionId: string, now: Instant): Principal | undefined`, `sessionRevoked(realtime: RealtimeHub, userId: string, reason: SessionRevokedReason, revoked = 1): void`
  - 테스트 도우미: `auth/tests/test_sessions.py`의 `expire(sessions, body)`, `revoke(api, body, scope)`, `end_sessions(api, db, user, action)`, `REVOCATIONS`, `NEW_PASSWORD`. 목 `test/realtime-recheck.test.ts`의 `endSessions(served, user, action)`
  - 새 테스트: `test_expired_session_is_rejected`, `test_ending_sessions_drops_the_connection_of_an_expired_session`(`all`, `others`, `password-change`, `password-reset`), `test_closing_without_live_sessions_still_rechecks_the_connections`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`contract/mock/test/leaving.test.ts`를 고친다.

찾을 부분:

```ts
    expect(counts).toEqual([0, 0]);
  });

  it("폐기할 세션이 없으면 session.revoked를 보내지 않는다", async () => {
    const { app, state } = testApp();
    const { userId } = await register(app);
    const log = realtimeLog(state);
    closeAccount(state, userId, "deactivated");
    expect(log).toEqual([]);
  });
});
```

바꿀 내용:

```ts
    expect(counts).toEqual([0, 0]);
  });

  it("폐기할 세션이 없으면 session.revoked를 보내지 않고, 연결은 그래도 다시 검사한다", async () => {
    const { app, state } = testApp();
    const { userId } = await register(app);
    const log = realtimeLog(state);
    closeAccount(state, userId, "deactivated");
    expect(log).toEqual([["recheck", [userId]]]);
  });
});
```

`contract/mock/test/realtime-recheck.test.ts`를 고친다.

(1) 찾을 부분:

```ts
 */

import { describe, expect, it } from "vitest";
import { newUser, send, type SignedIn, signIn, userWith } from "./accounts.ts";
import {
  capturedWarnings,
  connect,
```

바꿀 내용:

```ts
 */

import { describe, expect, it } from "vitest";
import { DAY } from "../src/core/clock.ts";
import { issueAccountToken } from "../src/modules/auth/tokens.ts";
import { newUser, PASSWORD, send, type SignedIn, signIn, userWith } from "./accounts.ts";
import {
  capturedWarnings,
  connect,
```

(2) 찾을 부분:

```ts
  type TestSocket,
  ticketFor,
} from "./sockets.ts";

const SERVER_DISCONNECT = ["disconnect", "io server disconnect"];

/** 이 사용자가 로그인한 연결. */
async function connectAs(served: Serving, user: SignedIn): Promise<TestSocket> {
```

바꿀 내용:

```ts
  type TestSocket,
  ticketFor,
} from "./sockets.ts";
import { testClock } from "./support.ts";

const SERVER_DISCONNECT = ["disconnect", "io server disconnect"];
const NEW_PASSWORD = "brand-new-password"; // betterleaks:allow 테스트용 가짜 비밀번호

/** 이 사용자가 로그인한 연결. */
async function connectAs(served: Serving, user: SignedIn): Promise<TestSocket> {
```

(3) 찾을 부분:

```ts

function logout(served: Serving, user: SignedIn): Promise<Response> {
  return send(served.app, "DELETE", "/api/v1/sessions/current", { token: user.accessToken });
}

/** 역할의 권한을 바꾼다(관리자). */
```

바꿀 내용:

```ts

function logout(served: Serving, user: SignedIn): Promise<Response> {
  return send(served.app, "DELETE", "/api/v1/sessions/current", { token: user.accessToken });
}

/**
 * 세션을 폐기하는 동작: 폐기 scope(all, others), password-change, password-reset. 폐기와 비밀번호 변경은
 * 새로 로그인한 세션으로 하고, 재설정은 저장소에서 발급한 토큰으로 한다.
 */
async function endSessions(served: Serving, user: SignedIn, action: string): Promise<Response> {
  const { app, state } = served;
  if (action === "password-reset") {
    const token = issueAccountToken(state.store, user.userId, "password_reset", state.clock.now());
    const attributes = { token, password: NEW_PASSWORD };
    const document = { data: { type: "password-resets", attributes } };
    return send(app, "POST", "/api/v1/password-resets", { document });
  }
  const current = await signIn(app, user.email);
  if (action === "password-change") {
    const attributes = { currentPassword: PASSWORD, newPassword: NEW_PASSWORD };
    const document = { data: { type: "password-changes", attributes } };
    return send(app, "POST", "/api/v1/password-changes", { document, token: current.accessToken });
  }
  const document = { data: { type: "session-revocations", attributes: { scope: action } } };
  return send(app, "POST", "/api/v1/session-revocations", { document, token: current.accessToken });
}

/** 역할의 권한을 바꾼다(관리자). */
```

(4) 찾을 부분:

```ts
    expect(gone.log).toEqual([revoked, SERVER_DISCONNECT]);
    await kept.settle();
    expect(kept.log).toEqual([revoked]);
  });

  it("계정을 비활성화하면 session.revoked와 me.updated를 받은 뒤 끊긴다", async () => {
```

바꿀 내용:

```ts
    expect(gone.log).toEqual([revoked, SERVER_DISCONNECT]);
    await kept.settle();
    expect(kept.log).toEqual([revoked]);
  });

  // 만료된 세션은 폐기하지도 세지도 않는다. 재검사는 폐기한 세션이 없어도 하고, session.revoked는 폐기한
  // 세션이 있을 때만 보낸다(여기서는 all이 새로 로그인한 세션을 폐기할 때뿐이다). FastAPI는
  // auth/tests/test_sessions.py가 같은 경우를 본다(시계 대신 DB에서 만료를 앞당긴다).
  it.each([
    ["all", [["session.revoked", { meta: { reason: "revoked" } }]]],
    ["others", []],
    ["password-change", []],
    ["password-reset", []],
  ])("%s 뒤 재검사가 만료 전에 그 세션으로 붙은 연결을 끊는다", async (action, announced) => {
    const clock = testClock();
    const served = await serving({}, { clock });
    const expired = await newUser(served.app, served.state);
    const socket = await connectAs(served, expired);
    clock.advance(30 * DAY);
    const response = await endSessions(served, expired, action);
    expect(response.status, await response.clone().text()).toBe(201);
    expect(await socket.disconnected()).toBe("io server disconnect");
    expect(socket.log).toEqual([...announced, SERVER_DISCONNECT]);
    expect(served.state.store.sessions.get(expired.sessionId)?.revokedAt).toBeNull();
  });

  it("계정을 비활성화하면 session.revoked와 me.updated를 받은 뒤 끊긴다", async () => {
```

`contract/mock/test/session-management.test.ts`를 고친다.

(1) 찾을 부분:

```ts
  it.each([
    ["others", 2, true],
    ["all", 3, false],
  ] as const)("scope %s는 %i개를 폐기한다", async (scope, count, currentAlive) => {
    const { app, state } = testApp();
    const current = await newUser(app, state);
    const others = [await signIn(app, current.email), await signIn(app, current.email)];
    const reasons = revokedReasons(state, current.userId);
    const response = await send(app, "POST", REVOCATIONS, {
```

바꿀 내용:

```ts
  it.each([
    ["others", 2, true],
    ["all", 3, false],
  ] as const)("scope %s는 살아 있는 세션 %i개를 폐기한다", async (scope, count, currentAlive) => {
    const clock = testClock();
    const { app, state } = testApp({}, { clock });
    // 만료된 세션은 이미 끝났으므로 폐기하지도 세지도 않는다(GET /sessions에 보이던 세션만 센다).
    const expired = await newUser(app, state);
    clock.advance(30 * DAY);
    const current = await signIn(app, expired.email);
    const others = [await signIn(app, current.email), await signIn(app, current.email)];
    const reasons = revokedReasons(state, current.userId);
    const response = await send(app, "POST", REVOCATIONS, {
```

(2) 찾을 부분:

```ts
    for (const other of others) {
      expect((await send(app, "GET", SESSIONS, { token: other.accessToken })).status).toBe(401);
    }
    expect(reasons()).toEqual([["session.revoked", "revoked"]]);
    const audit = state.store.auditLogs.filter((row) => row.action === "session.all_revoked");
    expect(audit.map((row) => [row.actorId, row.targetId, row.metadata])).toEqual(
```

바꿀 내용:

```ts
    for (const other of others) {
      expect((await send(app, "GET", SESSIONS, { token: other.accessToken })).status).toBe(401);
    }
    expect(state.store.sessions.get(expired.sessionId)?.revokedAt).toBeNull();
    expect(reasons()).toEqual([["session.revoked", "revoked"]]);
    const audit = state.store.auditLogs.filter((row) => row.action === "session.all_revoked");
    expect(audit.map((row) => [row.actorId, row.targetId, row.metadata])).toEqual(
```

`contract/mock/test/sessions.test.ts`를 고친다.

찾을 부분:

```ts
      detail: "The session has ended.",
    });
  });
});

describe("시드 관리자", () => {
```

바꿀 내용:

```ts
      detail: "The session has ended.",
    });
  });

  it("만료된 세션의 토큰도 세션이 끝난 것이다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    // access token은 세션의 만료를 늘린 직후에만 발급하므로 실제로는 세션보다 먼저 만료된다(재검사가
    // 만나는 경우). 그래서 세션의 만료를 저장소에서 앞당긴다.
    const login = state.store.sessions.get(user.sessionId);
    if (login === undefined) throw new Error("세션이 없다");
    login.expiresAt = state.clock.now();
    const ended = await send(app, "GET", SESSIONS, { token: user.accessToken });
    expect((await errorsOf(ended, 401))[0]).toMatchObject({
      code: "auth.token_invalid",
      detail: "The session has ended.",
    });
  });
});

describe("시드 관리자", () => {
```

`templates/fastapi/src/app/modules/auth/tests/test_authenticate.py`를 고친다.

(1) 찾을 부분:

```python
"""인증기: access token의 서명과 만료, 세션 폐기, 사용자 상태를 보고 실제 권한을 계산한다."""

import uuid
from datetime import UTC, datetime, timedelta
```

바꿀 내용:

```python
"""인증기: access token의 서명과 만료, 세션 폐기·만료, 사용자 상태를 보고 실제 권한을 계산한다."""

import uuid
from datetime import UTC, datetime, timedelta
```

(2) 찾을 부분:

```python
    assert await code_of(app, db, header) == "auth.token_invalid"


async def test_inactive_user_is_rejected(
    app: JsonApiApp, db: async_sessionmaker[AsyncSession], accounts: Accounts
) -> None:
```

바꿀 내용:

```python
    assert await code_of(app, db, header) == "auth.token_invalid"


async def test_expired_session_is_rejected(
    app: JsonApiApp, db: async_sessionmaker[AsyncSession], accounts: Accounts
) -> None:
    """만료된 세션도 끝난 세션이다(실시간 연결의 재검사가 같은 규칙을 쓴다).

    access token은 세션의 만료를 늘린 직후에만 발급하므로 실제로는 세션보다 먼저 만료된다.
    그래서 세션의 만료를 DB에서 앞당겨 본다.
    """
    user = await accounts.create()
    header = (await accounts.sign_in(user))["authorization"]
    async with db() as session:
        await session.execute(
            update(LoginSession)
            .where(LoginSession.user_id == user.id)
            .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        await session.commit()
    assert await code_of(app, db, header) == "auth.token_invalid"


async def test_inactive_user_is_rejected(
    app: JsonApiApp, db: async_sessionmaker[AsyncSession], accounts: Accounts
) -> None:
```

`templates/fastapi/src/app/modules/auth/tests/test_closing.py`를 고친다.

(1) 찾을 부분:

```python
"""계정 닫기(users.close_account)에 auth가 등록한 처리: 세션 폐기와 탈퇴 때 토큰 삭제."""

from datetime import timedelta

```

바꿀 내용:

```python
"""계정 닫기(users.close_account)에 auth가 등록한 처리: 세션 폐기, 재검사, 탈퇴 때 토큰 삭제."""

from datetime import timedelta

```

(2) 찾을 부분:

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.db import utc_now
from app.modules import users
from app.modules.auth.models import AccountToken, LoginSession, TokenPurpose
from app.modules.auth.service.credentials import close_credentials
```

바꿀 내용:

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.db import utc_now
from app.core.realtime import RecordingPublisher
from app.modules import users
from app.modules.auth.models import AccountToken, LoginSession, TokenPurpose
from app.modules.auth.service.credentials import close_credentials
```

(3) 찾을 부분:

```python
    db: async_sessionmaker[AsyncSession], accounts: Accounts
) -> None:
    assert await closed(db, accounts, users.Closure.DELETED) == (0, 0)
```

바꿀 내용:

```python
    db: async_sessionmaker[AsyncSession], accounts: Accounts
) -> None:
    assert await closed(db, accounts, users.Closure.DELETED) == (0, 0)


async def test_closing_without_live_sessions_still_rechecks_the_connections(
    db: async_sessionmaker[AsyncSession], accounts: Accounts, publisher: RecordingPublisher
) -> None:
    """폐기할 세션이 없으면 session.revoked는 보내지 않고, 연결은 그래도 다시 검사한다."""
    user = await accounts.create()
    async with db() as session:
        await close_credentials(session, user.id, users.Closure.DEACTIVATED)
        await session.commit()
    assert publisher.named("session.revoked") == []
    assert publisher.rechecks == [(user.id,)]
```

`templates/fastapi/src/app/modules/auth/tests/test_sessions.py`를 고친다.

(1) 찾을 부분:

```python
"""세션: grant 셋, refresh token 회전과 재사용 감지, 목록, 로그아웃, 폐기, 감사 기록."""

import uuid
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.audit import AuditLog
from app.core.config import Settings
from app.core.jsonapi.openapi import JsonApiApp
from app.core.security import identifier_hash
from app.modules.users import UserStatus
from app.tests.accounts import PASSWORD, Accounts, new_email
from app.tests.requests import error_codes, error_sources, jsonapi_body

pytestmark = pytest.mark.anyio

SESSIONS = "/api/v1/sessions"


def grant(**attributes: Any) -> dict[str, Any]:
```

바꿀 내용:

```python
"""세션: grant 셋, refresh token 회전과 재사용 감지, 목록, 로그아웃, 폐기, 감사 기록."""

import asyncio
import uuid
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.modules.auth.service.tokens as tokens
from app.core.audit import AuditLog
from app.core.config import Settings
from app.core.db import utc_now
from app.core.jsonapi.openapi import JsonApiApp
from app.core.realtime import Realtime, RecordingPublisher
from app.core.security import identifier_hash
from app.modules.auth.models import LoginSession, TokenPurpose
from app.modules.users import User, UserStatus
from app.tests.accounts import PASSWORD, Accounts, new_email
from app.tests.requests import error_codes, error_sources, jsonapi_body
from app.tests.sockets import connected, serving

pytestmark = pytest.mark.anyio

SESSIONS = "/api/v1/sessions"
REVOCATIONS = "/api/v1/session-revocations"
NEW_PASSWORD = "brand-new-password"  # betterleaks:allow 테스트 비밀번호


def grant(**attributes: Any) -> dict[str, Any]:
```

(2) 찾을 부분:

```python
async def audit_rows(sessions: async_sessionmaker[AsyncSession]) -> list[AuditLog]:
    async with sessions() as session:
        return list(await session.scalars(select(AuditLog).order_by(AuditLog.created_at)))


async def test_password_grant_issues_tokens_and_records_the_login(
```

바꿀 내용:

```python
async def audit_rows(sessions: async_sessionmaker[AsyncSession]) -> list[AuditLog]:
    async with sessions() as session:
        return list(await session.scalars(select(AuditLog).order_by(AuditLog.created_at)))


async def expire(sessions: async_sessionmaker[AsyncSession], body: dict[str, Any]) -> None:
    """로그인 응답(body)의 세션을 만료된 세션으로 만든다(정리 잡이 아직 지우지 않았다).

    테스트에는 시계 제어가 없어 세션의 만료를 DB에서 앞당긴다.
    """
    async with sessions() as session:
        await session.execute(
            update(LoginSession)
            .where(LoginSession.id == uuid.UUID(body["data"]["id"]))
            .values(expires_at=utc_now() - timedelta(seconds=1))
        )
        await session.commit()


async def revoke(api: httpx.AsyncClient, body: dict[str, Any], scope: str) -> httpx.Response:
    """로그인 응답(body)의 세션으로 다른 기기(others)나 전체(all) 로그아웃을 한다."""
    document = {"data": {"type": "session-revocations", "attributes": {"scope": scope}}}
    return await api.post(REVOCATIONS, **jsonapi_body(document, bearer(body)))


async def end_sessions(
    api: httpx.AsyncClient, db: async_sessionmaker[AsyncSession], user: User, action: str
) -> httpx.Response:
    """세션을 폐기하는 동작: 폐기 scope(all, others), password-change, password-reset.

    폐기와 비밀번호 변경은 새로 로그인한 세션으로 하고, 재설정은 DB에서 발급한 토큰으로 한다.
    """
    assert user.email is not None
    if action == "password-reset":
        async with db() as session:
            token = tokens.issue(session, user.id, TokenPurpose.PASSWORD_RESET, utc_now())
            await session.commit()
        reset = {"token": token, "password": NEW_PASSWORD}
        document = {"data": {"type": "password-resets", "attributes": reset}}
        return await api.post("/api/v1/password-resets", **jsonapi_body(document))
    current = await log_in(api, user.email)
    if action == "password-change":
        change = {"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD}
        document = {"data": {"type": "password-changes", "attributes": change}}
        return await api.post("/api/v1/password-changes", **jsonapi_body(document, bearer(current)))
    return await revoke(api, current, action)


async def test_password_grant_issues_tokens_and_records_the_login(
```

(3) 찾을 부분:

```python
    count: int,
    current_alive: bool,
) -> None:
    user = await accounts.create()
    assert user.email is not None
    current, *others = [await log_in(api, user.email) for _ in range(3)]
    document = {"data": {"type": "session-revocations", "attributes": {"scope": scope}}}
    response = await api.post(
        "/api/v1/session-revocations", **jsonapi_body(document, bearer(current))
    )
    assert response.status_code == 201, response.text
    assert response.json()["data"]["attributes"]["revokedCount"] == count
    assert ((await api.get(SESSIONS, headers=bearer(current))).status_code == 200) is current_alive
    statuses = [(await api.get(SESSIONS, headers=bearer(other))).status_code for other in others]
    assert statuses == [401, 401]
    actions = [log.action for log in await audit_rows(db)]
    assert ("session.all_revoked" in actions) is (scope == "all")
```

바꿀 내용:

```python
    count: int,
    current_alive: bool,
) -> None:
    """폐기하고 세는 것은 GET /sessions에 보이는 살아 있는 세션뿐이다. 만료된 세션은 이미 끝났다."""
    user = await accounts.create()
    assert user.email is not None
    expired, current, *others = [await log_in(api, user.email) for _ in range(4)]
    await expire(db, expired)
    response = await revoke(api, current, scope)
    assert response.status_code == 201, response.text
    assert response.json()["data"]["attributes"]["revokedCount"] == count
    assert ((await api.get(SESSIONS, headers=bearer(current))).status_code == 200) is current_alive
    statuses = [(await api.get(SESSIONS, headers=bearer(other))).status_code for other in others]
    assert statuses == [401, 401]
    async with db() as session:
        stale = await session.get(LoginSession, uuid.UUID(expired["data"]["id"]))
        assert stale is not None
        assert stale.revoked_at is None
    audits = [log.details for log in await audit_rows(db) if log.action == "session.all_revoked"]
    assert audits == ([{"revokedCount": count}] if scope == "all" else [])


@pytest.mark.parametrize(
    ("action", "announced"),
    [("all", 1), ("others", 0), ("password-change", 0), ("password-reset", 0)],
)
async def test_ending_sessions_drops_the_connection_of_an_expired_session(
    app: JsonApiApp,
    api: httpx.AsyncClient,
    accounts: Accounts,
    db: async_sessionmaker[AsyncSession],
    realtime: Realtime,
    publisher: RecordingPublisher,
    action: str,
    announced: int,
) -> None:
    """만료된 세션은 폐기하지도 세지도 않지만, 만료 전에 그 세션으로 붙은 연결은 재검사가 끊는다.

    재검사는 폐기한 세션이 없어도 한다. session.revoked는 폐기한 세션이 있을 때만 보낸다(여기서는
    all이 새로 로그인한 세션을 폐기할 때뿐이다).
    """
    user = await accounts.create()
    assert user.email is not None
    expired = await log_in(api, user.email)
    document: dict[str, Any] = {"data": {"type": "realtime-tickets", "attributes": {}}}
    ticket = await api.post("/api/v1/realtime-tickets", **jsonapi_body(document, bearer(expired)))
    assert ticket.status_code == 201, ticket.text
    auth = {"ticket": ticket.json()["data"]["attributes"]["token"]}
    async with serving(app) as url, connected(url, auth=auth) as socket:
        await asyncio.wait_for(realtime.control.listening.wait(), 5)
        await expire(db, expired)
        response = await end_sessions(api, db, user, action)
        assert response.status_code == 201, response.text
        await socket.next("disconnect")
    async with db() as session:
        stale = await session.get(LoginSession, uuid.UUID(expired["data"]["id"]))
        assert stale is not None
        assert stale.revoked_at is None
    assert len(publisher.named("session.revoked")) == announced
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`contract/mock`에서): `pnpm exec vitest run test/leaving.test.ts test/realtime-recheck.test.ts test/session-management.test.ts test/sessions.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 폐기할 세션이 없으면 session.revoked를 보내지 않고, 연결은 그래도 다시 검사한다
× 만료된 세션의 토큰도 세션이 끝난 것이다
× scope others는 살아 있는 세션 2개를 폐기한다
× scope all는 살아 있는 세션 3개를 폐기한다
× all 뒤 재검사가 만료 전에 그 세션으로 붙은 연결을 끊는다
× others 뒤 재검사가 만료 전에 그 세션으로 붙은 연결을 끊는다
× password-change 뒤 재검사가 만료 전에 그 세션으로 붙은 연결을 끊는다
× password-reset 뒤 재검사가 만료 전에 그 세션으로 붙은 연결을 끊는다
Test Files 4 failed (4)
Tests 8 failed | 47 passed (55)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/modules/auth/tests/test_authenticate.py src/app/modules/auth/tests/test_closing.py src/app/modules/auth/tests/test_sessions.py`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
E       AssertionError: assert [] == [(UUID('01a0f...1f2543f50'),)]
FAILED src/app/modules/auth/tests/test_authenticate.py::test_expired_session_is_rejected
FAILED src/app/modules/auth/tests/test_closing.py::test_closing_without_live_sessions_still_rechecks_the_connections
FAILED src/app/modules/auth/tests/test_sessions.py::test_revocations_end_other_or_all_sessions[others-2-True]
FAILED src/app/modules/auth/tests/test_sessions.py::test_revocations_end_other_or_all_sessions[all-3-False]
FAILED src/app/modules/auth/tests/test_sessions.py::test_ending_sessions_drops_the_connection_of_an_expired_session[all-1]
FAILED src/app/modules/auth/tests/test_sessions.py::test_ending_sessions_drops_the_connection_of_an_expired_session[others-0]
FAILED src/app/modules/auth/tests/test_sessions.py::test_ending_sessions_drops_the_connection_of_an_expired_session[password-change-0]
8 failed, 26 passed in
```

- [ ] **Step 3: FastAPI auth 모듈을 고친다**

`templates/fastapi/src/app/modules/auth/events.py` 전체를 다음으로 바꾼다.

```python
"""auth의 실시간 이벤트(계약의 x-realtime-events).

세션을 폐기하면 그 사용자의 user:{id} 룸에 session.revoked를 보낸다. meta.reason이 사유다.
- logout: 본인이 로그아웃했다(자기 세션을 지운 경우도)
- revoked: 다른 기기에서 이 세션을 지웠거나, 다른 기기·전체 로그아웃
- password_reset, password_changed: 비밀번호를 재설정했거나 바꿨다(바꾸면 현재 세션은 남는다)
- refresh_token_reused: refresh token 재사용이 감지됐다
- account_deactivated, account_deleted: 관리자가 비활성화했거나 탈퇴했다
폐기한 세션이 없으면 보내지 않는다. 같은 사용자의 다른 연결도 받으므로, 클라이언트는 자기 세션이
살아 있는지 확인한다. commit한 뒤에는 폐기한 세션 수와 관계없이 그 사용자의 연결을 다시 검사해
끝난(폐기했거나 만료된) 세션의 연결을 끊는다(queue_recheck).
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jsonapi.rendering import document_content
from app.core.realtime import EventSpec, queue, queue_recheck, user_room
from app.modules.auth.schemas import (
    SessionRevokedEventDocument,
    SessionRevokedEventMeta,
    SessionRevokedReason,
)

REVOKED = "session.revoked"

EVENTS = (EventSpec(REVOKED, ("user:{userId}",), SessionRevokedEventDocument),)


def session_revoked(
    session: AsyncSession, user_id: uuid.UUID, reason: SessionRevokedReason, revoked: int = 1
) -> None:
    """세션을 폐기한 뒤 부른다. revoked는 폐기한 세션 수다(하나를 폐기하는 경로는 1).

    session.revoked는 폐기한 세션이 있을 때만 넣는다. 재검사는 수와 관계없이 넣는다. 폐기할 살아
    있는 세션이 없어도 만료되기 전에 붙은 연결이 남아 있을 수 있기 때문이다.
    """
    if revoked:
        document = SessionRevokedEventDocument(meta=SessionRevokedEventMeta(reason=reason))
        queue(session, REVOKED, [user_room(user_id)], lambda: document_content(document))
    queue_recheck(session, [user_id])
```

`templates/fastapi/src/app/modules/auth/repository.py`를 고친다.

(1) 찾을 부분:

```python
SESSION_DEFAULT_SORT = (SortField(name="lastUsedAt", descending=True),)


async def active_session(
    session: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID
) -> LoginSession | None:
    """폐기되지 않았고 사용자가 활성 상태인 세션. 인증기가 요청마다 부른다."""
    query = (
        select(LoginSession)
        .join(User, User.id == LoginSession.user_id)
        .where(
            LoginSession.id == session_id,
            LoginSession.user_id == user_id,
            LoginSession.revoked_at.is_(None),
            User.status == UserStatus.ACTIVE,
        )
    )
    return await session.scalar(query)
```

바꿀 내용:

```python
SESSION_DEFAULT_SORT = (SortField(name="lastUsedAt", descending=True),)


def _live(user_id: uuid.UUID, now: datetime) -> tuple[ColumnElement[bool], ...]:
    """사용자의 살아 있는 세션: 폐기되지 않았고 만료되지 않았다.

    목록, 폐기, 인증기가 같은 조건을 쓴다. 만료된 세션은 정리 잡이 지우기 전에도 끝난 세션이다.
    """
    return (
        LoginSession.user_id == user_id,
        LoginSession.revoked_at.is_(None),
        LoginSession.expires_at > now,
    )


async def active_session(
    session: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID, now: datetime
) -> LoginSession | None:
    """폐기되지도 만료되지도 않았고 사용자가 활성 상태인 세션. 인증기가 요청마다 부른다."""
    query = (
        select(LoginSession)
        .join(User, User.id == LoginSession.user_id)
        .where(
            LoginSession.id == session_id, *_live(user_id, now), User.status == UserStatus.ACTIVE
        )
    )
    return await session.scalar(query)
```

(2) 찾을 부분:

```python
    return await session.get(LoginSession, session_id)


def _live(user_id: uuid.UUID, now: datetime) -> tuple[ColumnElement[bool], ...]:
    return (
        LoginSession.user_id == user_id,
        LoginSession.revoked_at.is_(None),
        LoginSession.expires_at > now,
    )


async def live_session(
    session: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID, now: datetime
) -> LoginSession | None:
```

바꿀 내용:

```python
    return await session.get(LoginSession, session_id)


async def live_session(
    session: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID, now: datetime
) -> LoginSession | None:
```

(3) 찾을 부분:

```python
async def revoke_sessions(
    session: AsyncSession, user_id: uuid.UUID, now: datetime, keep: uuid.UUID | None = None
) -> int:
    """사용자의 살아 있는 세션을 폐기한다. keep은 남길 세션이다. 폐기한 개수를 돌려준다."""
    query = update(LoginSession).where(
        LoginSession.user_id == user_id, LoginSession.revoked_at.is_(None)
    )
    if keep is not None:
        query = query.where(LoginSession.id != keep)
    revoked = await session.scalars(query.values(revoked_at=now).returning(LoginSession.id))
```

바꿀 내용:

```python
async def revoke_sessions(
    session: AsyncSession, user_id: uuid.UUID, now: datetime, keep: uuid.UUID | None = None
) -> int:
    """사용자의 살아 있는 세션을 폐기한다. keep은 남길 세션이다. 폐기한 개수를 돌려준다.

    만료된 세션은 이미 끝났으므로 폐기하지도 세지도 않는다. 그래서 개수는 GET /sessions에 보이던
    세션 수다.
    """
    query = update(LoginSession).where(*_live(user_id, now))
    if keep is not None:
        query = query.where(LoginSession.id != keep)
    revoked = await session.scalars(query.values(revoked_at=now).returning(LoginSession.id))
```

`templates/fastapi/src/app/modules/auth/service/credentials.py`를 고친다.

(1) 찾을 부분:

```python
"""인증기와 세션 발급.

- access token(JWT, 15분)은 sub(사용자), sid(세션)를 담는다. 인증기는 서명을 검증한 뒤 요청마다
  세션이 폐기되지 않았는지, 사용자가 활성인지 DB에서 본다. 그래서 로그아웃과 폐기는 access token의
  만료를 기다리지 않고 바로 효과를 낸다. 같은 요청에서 역할로 실제 권한도 계산한다.
- refresh token은 32바이트 불투명 토큰(30일)이고 DB에는 SHA-256만 둔다.
"""

```

바꿀 내용:

```python
"""인증기와 세션 발급.

- access token(JWT, 15분)은 sub(사용자), sid(세션)를 담는다. 인증기는 서명을 검증한 뒤 요청마다
  세션이 끝나지(폐기, 만료) 않았는지, 사용자가 활성인지 DB에서 본다. 그래서 로그아웃과 폐기는 access
  token의 만료를 기다리지 않고 바로 효과를 낸다. 같은 요청에서 역할로 실제 권한도 계산한다.
- refresh token은 32바이트 불투명 토큰(30일)이고 DB에는 SHA-256만 둔다.
"""

```

(2) 찾을 부분:

```python
) -> Principal | None:
    """살아 있는 세션의 Principal(실제 권한 포함). 세션이 끝났거나 사용자가 활성이 아니면 None이다.

    인증기와 실시간 연결(티켓)이 같은 규칙으로 본다.
    """
    login = await repository.active_session(session, session_id, user_id)
    if login is None:
        return None
    permissions = await roles.effective_permissions(session, registry, user_id)
```

바꿀 내용:

```python
) -> Principal | None:
    """살아 있는 세션의 Principal(실제 권한 포함). 세션이 끝났거나 사용자가 활성이 아니면 None이다.

    세션이 끝났다는 것은 폐기했거나 만료됐다는 뜻이다. 인증기와 실시간 연결(티켓, 재검사)이 같은
    규칙으로 본다. access token은 세션의 만료를 늘린 직후에만 발급하므로(issue) 세션보다 먼저
    만료된다. 그래서 만료 조건은 HTTP 인증을 바꾸지 않고, 만료 전에 붙은 실시간 연결을 재검사가
    끊게 한다.
    """
    login = await repository.active_session(session, session_id, user_id, utc_now())
    if login is None:
        return None
    permissions = await roles.effective_permissions(session, registry, user_id)
```

(3) 찾을 부분:

```python
    """계정을 닫을 때(users.close_account) 부른다.

    세션을 모두 폐기하고, 탈퇴면 남은 1회용 토큰과 소셜 로그인 연결도 지운다. commit하지 않는다.
    부른 쪽(users)의
    트랜잭션에 들어가고, session.revoked도 그 commit 뒤에 나간다.
    """
    deleted = closure is users.Closure.DELETED
    if await repository.revoke_sessions(session, user_id, utc_now()):
        reason = (
            SessionRevokedReason.ACCOUNT_DELETED
            if deleted
            else SessionRevokedReason.ACCOUNT_DEACTIVATED
        )
        events.session_revoked(session, user_id, reason)
    if deleted:
        await repository.delete_account_tokens(session, user_id)
        await repository.delete_social_accounts(session, user_id)
```

바꿀 내용:

```python
    """계정을 닫을 때(users.close_account) 부른다.

    세션을 모두 폐기하고, 탈퇴면 남은 1회용 토큰과 소셜 로그인 연결도 지운다. commit하지 않는다.
    부른 쪽(users)의 트랜잭션에 들어가고, session.revoked와 연결 재검사도 그 commit 뒤에 나간다.
    """
    deleted = closure is users.Closure.DELETED
    revoked = await repository.revoke_sessions(session, user_id, utc_now())
    reason = (
        SessionRevokedReason.ACCOUNT_DELETED
        if deleted
        else SessionRevokedReason.ACCOUNT_DEACTIVATED
    )
    events.session_revoked(session, user_id, reason, revoked)
    if deleted:
        await repository.delete_account_tokens(session, user_id)
        await repository.delete_social_accounts(session, user_id)
```

`templates/fastapi/src/app/modules/auth/service/passwords.py`를 고친다.

(1) 찾을 부분:

```python
        raise tokens.invalid_token()
    await users.set_password(user, password)
    users.mark_email_verified(user, now)
    if await repository.revoke_sessions(session, user.id, now):
        events.session_revoked(session, user.id, SessionRevokedReason.PASSWORD_RESET)
    await record_audit(
        session,
        AuditLogAction.USER_PASSWORD_RESET,
```

바꿀 내용:

```python
        raise tokens.invalid_token()
    await users.set_password(user, password)
    users.mark_email_verified(user, now)
    revoked = await repository.revoke_sessions(session, user.id, now)
    events.session_revoked(session, user.id, SessionRevokedReason.PASSWORD_RESET, revoked)
    await record_audit(
        session,
        AuditLogAction.USER_PASSWORD_RESET,
```

(2) 찾을 부분:

```python
    now = utc_now()
    await users.set_password(user, new)
    await repository.delete_account_tokens(session, user.id, TokenPurpose.PASSWORD_RESET)
    if await repository.revoke_sessions(session, user.id, now, keep=actor.session_id):
        events.session_revoked(session, user.id, SessionRevokedReason.PASSWORD_CHANGED)
    await record_audit(
        session,
        AuditLogAction.USER_PASSWORD_CHANGED,
```

바꿀 내용:

```python
    now = utc_now()
    await users.set_password(user, new)
    await repository.delete_account_tokens(session, user.id, TokenPurpose.PASSWORD_RESET)
    revoked = await repository.revoke_sessions(session, user.id, now, keep=actor.session_id)
    events.session_revoked(session, user.id, SessionRevokedReason.PASSWORD_CHANGED, revoked)
    await record_audit(
        session,
        AuditLogAction.USER_PASSWORD_CHANGED,
```

`templates/fastapi/src/app/modules/auth/service/sessions.py`를 고친다.

(1) 찾을 부분:

```python
        await session.commit()
        detail = "The refresh token was already used. The session is revoked."
        raise _unauthorized(ErrorCode.AUTH_REFRESH_TOKEN_REUSED, detail)
    if await repository.active_session(session, login.id, login.user_id) is None:
        raise invalid
    row.used_at = now
    login.last_used_at = now
```

바꿀 내용:

```python
        await session.commit()
        detail = "The refresh token was already used. The session is revoked."
        raise _unauthorized(ErrorCode.AUTH_REFRESH_TOKEN_REUSED, detail)
    if await repository.active_session(session, login.id, login.user_id, now) is None:
        raise invalid
    row.used_at = now
    login.last_used_at = now
```

(2) 찾을 부분:

```python
    """others는 현재 세션을 뺀 나머지를, all은 전부 폐기한다. 폐기한 개수를 돌려준다."""
    keep = actor.session_id if scope is SessionRevocationScope.OTHERS else None
    revoked = await repository.revoke_sessions(session, actor.user_id, utc_now(), keep)
    if revoked:
        events.session_revoked(session, actor.user_id, SessionRevokedReason.REVOKED)
    if scope is SessionRevocationScope.ALL:
        await record_audit(
            session,
```

바꿀 내용:

```python
    """others는 현재 세션을 뺀 나머지를, all은 전부 폐기한다. 폐기한 개수를 돌려준다."""
    keep = actor.session_id if scope is SessionRevocationScope.OTHERS else None
    revoked = await repository.revoke_sessions(session, actor.user_id, utc_now(), keep)
    events.session_revoked(session, actor.user_id, SessionRevokedReason.REVOKED, revoked)
    if scope is SessionRevocationScope.ALL:
        await record_audit(
            session,
```

- [ ] **Step 4: FastAPI realtime 모듈을 고친다**

`templates/fastapi/src/app/modules/realtime/gateway.py`를 고친다.

찾을 부분:

```python
- subscribe·unsubscribe: 페이로드는 RealtimeSubscription, ack는 RealtimeAck다. 모르는 채널은
  validation.invalid_choice, 권한이 없으면 permission.denied다. 권한은 구독할 때 DB에서 계산한다.
- 재검사: 세션을 폐기하거나 역할·상태를 바꾸면(auth와 users의 queue_recheck) 제어 채널로
  알림이 온다. 이 인스턴스에 있는 그 사용자의 연결을 다시 검사해, 세션이 끝났거나(폐기, 계정
  비활성화·탈퇴) 구독한 채널의 권한을 잃은 연결을 끊는다. 끊긴 클라이언트는 새 티켓으로 다시
  붙는다(세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독이 permission.denied다).
"""
```

바꿀 내용:

```python
- subscribe·unsubscribe: 페이로드는 RealtimeSubscription, ack는 RealtimeAck다. 모르는 채널은
  validation.invalid_choice, 권한이 없으면 permission.denied다. 권한은 구독할 때 DB에서 계산한다.
- 재검사: 세션을 폐기하거나 역할·상태를 바꾸면(auth와 users의 queue_recheck) 제어 채널로
  알림이 온다. 이 인스턴스에 있는 그 사용자의 연결을 다시 검사해, 세션이 끝났거나(폐기, 만료, 계정
  비활성화·탈퇴) 구독한 채널의 권한을 잃은 연결을 끊는다. 끊긴 클라이언트는 새 티켓으로 다시
  붙는다(세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독이 permission.denied다).
"""
```

- [ ] **Step 5: 목을 고친다**

`contract/mock/src/modules/auth/closing.ts` 전체를 다음으로 바꾼다.

```ts
/**
 * 계정 닫기(users의 closeAccount)에 auth가 등록하는 처리(FastAPI의 auth/service/credentials.py의
 * close_credentials). 등록은 modules/registry.ts가 한다.
 *
 * - 비활성화와 탈퇴 모두 살아 있는 세션을 모두 폐기한다. 폐기한 세션이 있으면 session.revoked를
 *   보내고(사유 account_deactivated, account_deleted), 연결은 폐기한 수와 관계없이 다시 검사한다.
 * - 탈퇴면 남은 1회용 토큰(이메일 인증, 비밀번호 재설정)과 소셜 로그인 연결도 지운다. 그래서 같은
 *   제공자의 같은 사람이 다시 로그인하면 새 계정이 된다. 비활성화는 토큰과 연결을 남긴다(다시 활성화하면
 *   그대로 쓴다).
 */

import type { MockState } from "../../state.ts";
import type { Closure } from "../users/accounts.ts";
import { sessionRevoked } from "./events.ts";
import { deleteSocialAccounts } from "./oauth.ts";
import { revokeUserSessions } from "./sessions.ts";
import { deleteAccountTokens } from "./tokens.ts";

export function closeCredentials(state: MockState, userId: string, closure: Closure): void {
  const deleted = closure === "deleted";
  const revoked = revokeUserSessions(state.store, userId, state.clock.now());
  const reason = deleted ? "account_deleted" : "account_deactivated";
  sessionRevoked(state.realtime, userId, reason, revoked);
  if (deleted) {
    deleteAccountTokens(state.store, userId);
    deleteSocialAccounts(state.store, userId);
  }
}
```

`contract/mock/src/modules/auth/credentials.ts`를 고친다.

(1) 찾을 부분:

```ts
 * - access token(15분)은 불투명한 무작위 문자열이다. 발급할 때 사용자, 세션, 만료 시각을 저장해 두고
 *   요청마다 찾는다. FastAPI의 JWT와 같게 만료는 초 단위로 버리고 30초를 봐준다. 모르는 토큰은
 *   auth.token_invalid, 만료된 토큰은 auth.token_expired(세션이 살아 있는지와 관계없다)다.
 * - 인증기는 요청마다 세션이 폐기되지 않았는지, 사용자가 활성인지 본다. 그래서 로그아웃과 폐기는 access
 *   token의 만료를 기다리지 않고 바로 효과를 낸다(401 auth.token_invalid "The session has ended.").
 *   같은 요청에서 역할로 실제 권한도 계산한다.
 * - refresh token은 32바이트 불투명 토큰(30일)이고 digest만 저장한다.
 */

```

바꿀 내용:

```ts
 * - access token(15분)은 불투명한 무작위 문자열이다. 발급할 때 사용자, 세션, 만료 시각을 저장해 두고
 *   요청마다 찾는다. FastAPI의 JWT와 같게 만료는 초 단위로 버리고 30초를 봐준다. 모르는 토큰은
 *   auth.token_invalid, 만료된 토큰은 auth.token_expired(세션이 살아 있는지와 관계없다)다.
 * - 인증기는 요청마다 세션이 끝나지(폐기, 만료) 않았는지, 사용자가 활성인지 본다. 그래서 로그아웃과
 *   폐기는 access token의 만료를 기다리지 않고 바로 효과를 낸다(401 auth.token_invalid "The session has
 *   ended."). 같은 요청에서 역할로 실제 권한도 계산한다.
 * - refresh token은 32바이트 불투명 토큰(30일)이고 digest만 저장한다.
 */

```

(2) 찾을 부분:

```ts
  return new ApiError(401, code, detail);
}

/** 폐기되지 않았고 사용자가 활성인 세션. 인증기가 요청마다 부른다. */
export function activeSession(
  store: Store,
  sessionId: string,
  userId: string,
): LoginSessionRow | undefined {
  const login = store.sessions.get(sessionId);
  const active = store.users.get(userId)?.status === "active";
  return login?.userId === userId && login.revokedAt === null && active ? login : undefined;
}

/**
 * 살아 있는 세션의 Principal(실제 권한 포함). 세션이 끝났거나 사용자가 활성이 아니면 undefined다.
 * 인증기와 실시간 연결(티켓)이 같은 규칙으로 본다.
 */
export function sessionPrincipal(
  store: Store,
  userId: string,
  sessionId: string,
): Principal | undefined {
  const login = activeSession(store, sessionId, userId);
  if (login === undefined) return undefined;
  return {
    userId,
```

바꿀 내용:

```ts
  return new ApiError(401, code, detail);
}

/** 폐기되지도 만료되지도 않았고 사용자가 활성인 세션. 인증기가 요청마다 부른다. */
export function activeSession(
  store: Store,
  sessionId: string,
  userId: string,
  now: Instant,
): LoginSessionRow | undefined {
  const login = store.sessions.get(sessionId);
  const active = store.users.get(userId)?.status === "active";
  const live = login?.userId === userId && login.revokedAt === null && login.expiresAt > now;
  return live && active ? login : undefined;
}

/**
 * 살아 있는 세션의 Principal(실제 권한 포함). 세션이 끝났거나 사용자가 활성이 아니면 undefined다.
 * 세션이 끝났다는 것은 폐기했거나 만료됐다는 뜻이다. 인증기와 실시간 연결(티켓, 재검사)이 같은 규칙으로
 * 본다. access token은 세션의 만료를 늘린 직후에만 발급하므로(issue) 세션보다 먼저 만료된다. 그래서 만료
 * 조건은 HTTP 인증을 바꾸지 않고, 만료 전에 붙은 실시간 연결을 재검사가 끊게 한다.
 */
export function sessionPrincipal(
  store: Store,
  userId: string,
  sessionId: string,
  now: Instant,
): Principal | undefined {
  const login = activeSession(store, sessionId, userId, now);
  if (login === undefined) return undefined;
  return {
    userId,
```

(3) 찾을 부분:

```ts
  return (token) => {
    const row = state.store.accessTokens.get(digest(token));
    if (row === undefined) throw unauthorized("auth.token_invalid", "The access token is invalid.");
    if (expired(row, state.clock.now())) {
      throw unauthorized("auth.token_expired", "The access token has expired.");
    }
    const principal = sessionPrincipal(state.store, row.userId, row.sessionId);
    if (principal === undefined) throw unauthorized("auth.token_invalid", "The session has ended.");
    return principal;
  };
```

바꿀 내용:

```ts
  return (token) => {
    const row = state.store.accessTokens.get(digest(token));
    if (row === undefined) throw unauthorized("auth.token_invalid", "The access token is invalid.");
    const now = state.clock.now();
    if (expired(row, now)) {
      throw unauthorized("auth.token_expired", "The access token has expired.");
    }
    const principal = sessionPrincipal(state.store, row.userId, row.sessionId, now);
    if (principal === undefined) throw unauthorized("auth.token_invalid", "The session has ended.");
    return principal;
  };
```

`contract/mock/src/modules/auth/events.ts` 전체를 다음으로 바꾼다.

```ts
/**
 * auth의 실시간 이벤트(계약의 x-realtime-events). FastAPI의 auth/events.py와 같다.
 *
 * 세션을 폐기하면 그 사용자의 user:{id} 룸에 session.revoked를 보낸다. meta.reason이 사유다.
 * - logout: 본인이 로그아웃했다(자기 세션을 지운 경우도)
 * - revoked: 다른 기기에서 이 세션을 지웠거나, 다른 기기·전체 로그아웃
 * - refresh_token_reused: refresh token 재사용이 감지됐다
 * - password_reset, password_changed, account_deactivated, account_deleted: 비밀번호와 계정 흐름이 보낸다
 * 폐기한 세션이 없으면 보내지 않는다. 그 사용자의 연결은 폐기한 세션 수와 관계없이 다시 검사해
 * 끝난(폐기했거나 만료된) 세션의 연결을 끊는다.
 */

import { type RealtimeHub, userRoom } from "../../core/realtime.ts";
import type { components } from "../../generated/api.ts";

export type SessionRevokedReason = components["schemas"]["SessionRevokedReason"];
type SessionRevokedEventDocument = components["schemas"]["SessionRevokedEventDocument"];

export const SESSION_REVOKED = "session.revoked";

/**
 * 세션을 폐기한 뒤 부른다. revoked는 폐기한 세션 수다(하나를 폐기하는 경로는 1). session.revoked는 폐기한
 * 세션이 있을 때만 보낸다. 재검사는 수와 관계없이 한다. 폐기할 살아 있는 세션이 없어도 만료되기 전에 붙은
 * 연결이 남아 있을 수 있기 때문이다.
 */
export function sessionRevoked(
  realtime: RealtimeHub,
  userId: string,
  reason: SessionRevokedReason,
  revoked = 1,
): void {
  if (revoked > 0) {
    const payload: SessionRevokedEventDocument = { meta: { reason } };
    realtime.publish({ name: SESSION_REVOKED, rooms: [userRoom(userId)], payload });
  }
  realtime.recheck([userId]);
}
```

`contract/mock/src/modules/auth/passwords.ts`를 고친다.

(1) 찾을 부분:

```ts
  deleteAccountTokens(state.store, user.id, "password_reset");
  setPassword(user, attributes.password, now);
  markEmailVerified(user, now);
  if (revokeUserSessions(state.store, user.id, now) > 0) {
    sessionRevoked(state.realtime, user.id, "password_reset");
  }
  audit(state, "user.password_reset", user.id, client, now);
  return { id: row.id, createdAt: now };
}
```

바꿀 내용:

```ts
  deleteAccountTokens(state.store, user.id, "password_reset");
  setPassword(user, attributes.password, now);
  markEmailVerified(user, now);
  const revoked = revokeUserSessions(state.store, user.id, now);
  sessionRevoked(state.realtime, user.id, "password_reset", revoked);
  audit(state, "user.password_reset", user.id, client, now);
  return { id: row.id, createdAt: now };
}
```

(2) 찾을 부분:

```ts
  const now = state.clock.now();
  setPassword(user, attributes.newPassword, now);
  deleteAccountTokens(state.store, user.id, "password_reset");
  if (revokeUserSessions(state.store, user.id, now, actor.sessionId) > 0) {
    sessionRevoked(state.realtime, user.id, "password_changed");
  }
  audit(state, "user.password_changed", user.id, client, now);
  return now;
}
```

바꿀 내용:

```ts
  const now = state.clock.now();
  setPassword(user, attributes.newPassword, now);
  deleteAccountTokens(state.store, user.id, "password_reset");
  const revoked = revokeUserSessions(state.store, user.id, now, actor.sessionId);
  sessionRevoked(state.realtime, user.id, "password_changed", revoked);
  audit(state, "user.password_changed", user.id, client, now);
  return now;
}
```

`contract/mock/src/modules/auth/sessions.ts`를 고친다.

(1) 찾을 부분:

```ts
    const detail = "The refresh token was already used. The session is revoked.";
    throw unauthorized("auth.refresh_token_reused", detail);
  }
  if (activeSession(store, login.id, login.userId) === undefined) throw invalid();
  row.usedAt = now;
  login.lastUsedAt = now;
  const [token, fresh] = refreshTokenRow(login, now);
```

바꿀 내용:

```ts
    const detail = "The refresh token was already used. The session is revoked.";
    throw unauthorized("auth.refresh_token_reused", detail);
  }
  if (activeSession(store, login.id, login.userId, now) === undefined) throw invalid();
  row.usedAt = now;
  login.lastUsedAt = now;
  const [token, fresh] = refreshTokenRow(login, now);
```

(2) 찾을 부분:

```ts
}

/**
 * 사용자의 폐기하지 않은 세션을 모두 폐기하고 그 개수를 돌려준다(FastAPI의 revoke_sessions). keep은
 * 남길 세션이다. 폐기하지 않은 세션이면 만료됐어도 센다(FastAPI는 정리 잡이 지우기 전까지 남아 있는
 * 세션을 센다). 이벤트는 부른 쪽이 사유를 정해 보낸다.
 */
export function revokeUserSessions(
  store: Store,
```

바꿀 내용:

```ts
}

/**
 * 사용자의 살아 있는 세션을 모두 폐기하고 그 개수를 돌려준다(FastAPI의 revoke_sessions). keep은 남길
 * 세션이다. 만료된 세션은 이미 끝났으므로 폐기하지도 세지도 않는다. 그래서 개수는 GET /sessions에 보이던
 * 세션 수다. 이벤트는 부른 쪽이 사유를 정해 보낸다.
 */
export function revokeUserSessions(
  store: Store,
```

(3) 찾을 부분:

```ts
): number {
  let revoked = 0;
  for (const login of store.sessions.values()) {
    if (login.userId !== userId || login.revokedAt !== null || login.id === keep) continue;
    login.revokedAt = now;
    revoked += 1;
  }
```

바꿀 내용:

```ts
): number {
  let revoked = 0;
  for (const login of store.sessions.values()) {
    if (!live(login, userId, now) || login.id === keep) continue;
    login.revokedAt = now;
    revoked += 1;
  }
```

(4) 찾을 부분:

```ts
): number {
  const keep = scope === "others" ? actor.sessionId : undefined;
  const revoked = revokeUserSessions(state.store, actor.userId, state.clock.now(), keep);
  if (revoked > 0) sessionRevoked(state.realtime, actor.userId, "revoked");
  if (scope === "all") {
    const record: AuditRecord = {
      action: "session.all_revoked",
```

바꿀 내용:

```ts
): number {
  const keep = scope === "others" ? actor.sessionId : undefined;
  const revoked = revokeUserSessions(state.store, actor.userId, state.clock.now(), keep);
  sessionRevoked(state.realtime, actor.userId, "revoked", revoked);
  if (scope === "all") {
    const record: AuditRecord = {
      action: "session.all_revoked",
```

`contract/mock/src/modules/realtime/gateway.ts`를 고친다.

(1) 찾을 부분:

```ts
 *   페이로드는 validation.invalid_choice(422), 권한이 없으면 permission.denied(403)이고 source.pointer는
 *   /channel이다. 권한은 구독할 때 계산한다.
 * - 재검사(recheck): 세션을 폐기하거나 역할·상태를 바꾸면 허브가 알린다. 그 사용자의 연결을 다시 검사해
 *   세션이 끝났거나(폐기, 계정 비활성화·탈퇴) 구독한 채널의 권한을 잃은 연결을 끊는다. 끊긴 클라이언트는
 *   새 티켓으로 다시 붙는다(세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독이
 *   permission.denied다). 목은 프로세스가 하나라 제어 채널 없이 바로 검사한다.
 */
```

바꿀 내용:

```ts
 *   페이로드는 validation.invalid_choice(422), 권한이 없으면 permission.denied(403)이고 source.pointer는
 *   /channel이다. 권한은 구독할 때 계산한다.
 * - 재검사(recheck): 세션을 폐기하거나 역할·상태를 바꾸면 허브가 알린다. 그 사용자의 연결을 다시 검사해
 *   세션이 끝났거나(폐기, 만료, 계정 비활성화·탈퇴) 구독한 채널의 권한을 잃은 연결을 끊는다. 끊긴 클라이언트는
 *   새 티켓으로 다시 붙는다(세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독이
 *   permission.denied다). 목은 프로세스가 하나라 제어 채널 없이 바로 검사한다.
 */
```

(2) 찾을 부분:

```ts
  if (ticket === undefined || ticket === null) return undefined;
  const found = typeof ticket === "string" ? consumeTicket(state, ticket) : undefined;
  const principal =
    found === undefined ? undefined : sessionPrincipal(state.store, found.userId, found.sessionId);
  if (principal === undefined) return refused();
  socket.data.login = { userId: principal.userId, sessionId: principal.sessionId };
  return undefined;
```

바꿀 내용:

```ts
  if (ticket === undefined || ticket === null) return undefined;
  const found = typeof ticket === "string" ? consumeTicket(state, ticket) : undefined;
  const principal =
    found === undefined
      ? undefined
      : sessionPrincipal(state.store, found.userId, found.sessionId, state.clock.now());
  if (principal === undefined) return refused();
  socket.data.login = { userId: principal.userId, sessionId: principal.sessionId };
  return undefined;
```

(3) 찾을 부분:

```ts
function principalOf(state: MockState, socket: RealtimeSocket): Principal | undefined {
  const { login } = socket.data;
  if (login === undefined) return undefined;
  return sessionPrincipal(state.store, login.userId, login.sessionId);
}

function failed(status: 403 | 422, code: ErrorCode, detail: string): RealtimeAck {
```

바꿀 내용:

```ts
function principalOf(state: MockState, socket: RealtimeSocket): Principal | undefined {
  const { login } = socket.data;
  if (login === undefined) return undefined;
  return sessionPrincipal(state.store, login.userId, login.sessionId, state.clock.now());
}

function failed(status: 403 | 422, code: ErrorCode, detail: string): RealtimeAck {
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run(`contract/mock`에서): `pnpm exec vitest run test/leaving.test.ts test/realtime-recheck.test.ts test/session-management.test.ts test/sessions.test.ts`

Expected: 통과한다.

```text
Test Files 4 passed (4)
Tests 55 passed (55)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/modules/auth/tests/test_authenticate.py src/app/modules/auth/tests/test_closing.py src/app/modules/auth/tests/test_sessions.py`

Expected: 통과한다.

```text
34 passed in
```

- [ ] **Step 7: 검사를 돌린다**

Run(`templates/fastapi`에서): `uv run poe check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 건너뛴 단계가 있으면 `.cache/check`를 지우고 다시 돌린다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄

Run(저장소 루트에서): `pnpm spec-compare contract/openapi.yaml templates/fastapi/openapi.json`

Expected: 차이 없이 끝난다(종료 코드 0).

Run(저장소 루트에서): `pnpm conformance fastapi`

Expected: 마지막에 `Tests  93 passed (93)`. 끝나면 인프라가 내려가므로 `templates/fastapi`에서 `docker compose up -d --wait`로 다시 올린다.

Run(저장소 루트에서): `pnpm conformance mock`

Expected: 마지막에 `Tests  93 passed (93)`.

Run(`templates/fastapi`에서): `uv run poe test:e2e`

Expected: `12 passed`

- [ ] **Step 8: 커밋한다**

```bash
git add \
  contract/mock/src/modules/auth/closing.ts \
  contract/mock/src/modules/auth/credentials.ts \
  contract/mock/src/modules/auth/events.ts \
  contract/mock/src/modules/auth/passwords.ts \
  contract/mock/src/modules/auth/sessions.ts \
  contract/mock/src/modules/realtime/gateway.ts \
  contract/mock/test/leaving.test.ts \
  contract/mock/test/realtime-recheck.test.ts \
  contract/mock/test/session-management.test.ts \
  contract/mock/test/sessions.test.ts \
  templates/fastapi/src/app/modules/auth/events.py \
  templates/fastapi/src/app/modules/auth/repository.py \
  templates/fastapi/src/app/modules/auth/service/credentials.py \
  templates/fastapi/src/app/modules/auth/service/passwords.py \
  templates/fastapi/src/app/modules/auth/service/sessions.py \
  templates/fastapi/src/app/modules/auth/tests/test_authenticate.py \
  templates/fastapi/src/app/modules/auth/tests/test_closing.py \
  templates/fastapi/src/app/modules/auth/tests/test_sessions.py \
  templates/fastapi/src/app/modules/realtime/gateway.py
git commit -m "fix(fastapi): treat expired sessions as ended"
```


### Task 8: 실시간: Origin 정규화와 페이로드 개수

web 설계 §12.1의 FastAPI 실시간 문제 둘.

- Origin: `core/config.py`의 `realtime_allowed_origins`는 쉼표로 나누기만 했다. python-engineio는 Origin 헤더를 목록과 글자 그대로 비교하고 `*`를 "모두 허용"으로 읽는다. 그래서 끝에 `/`가 하나 붙은 값(`http://localhost:3000/`)이 모든 브라우저를 조용히 막았고, `*`는 모든 사이트를 받았다. 새 별칭 `Origins`(`CommaSeparated`에 `AfterValidator(_origins)`)가 값마다 브라우저가 보내는 Origin(`스킴://호스트[:포트]`)으로 바꾼다. 경로, 쿼리, 조각, 계정은 떼고, 호스트는 소문자로, 기본 포트(80, 443)는 빼고, IPv6는 줄여 쓴 꼴로 대괄호 안에 쓴다.
- 설정 오류(`load_settings`가 `설정 오류: REALTIME_ALLOWED_ORIGINS — 값이 틀렸다(…).` 한 줄로 멈춘다): `*`, `http://`·`https://`로 시작하지 않는 값(대소문자를 가린다), ASCII가 아닌 호스트(punycode로 적으라고 알린다), 브라우저가 다른 모양으로 보내는 호스트(`127.1` 같은 줄여 쓴 IPv4, IPv4를 담은 IPv6, zone id, `%` 이스케이프, `*.example.com` 같은 이름에 쓰지 않는 글자)다. `.env.example`의 주석에 형식을 적는다.
- 목의 설정은 이미 Origin으로 정규화한다. 그런 호스트는 WHATWG URL로 바꿔 받으므로 목은 바꾸지 않고, 차이를 목 `AGENTS.md`와 `src/config.ts` 주석에 적는다.
- 페이로드 개수: python-socketio는 받은 페이로드를 하나씩 인자로 넘긴다. `realtime/gateway.py`의 `subscribe`·`unsubscribe`는 페이로드를 하나까지만 받아, 둘을 보내면 처리기가 백그라운드 태스크에서 `TypeError`로 끝나고 ack가 오지 않았다. 두 처리기가 `*payloads`로 받고, `_channel`은 개수가 하나가 아니면 None을 준다. 그래서 없거나 둘 이상이면 모르는 채널과 같은 ack `{ok: false}`, 422 `validation.invalid_choice`, `source.pointer` `/channel`이고 룸에 들거나 나가지 않는다.
- 목은 답하지 않는 동작을 따라 했다(경고만 남겼다). `realtime/gateway.ts`의 `handleMessage`가 페이로드가 정확히 하나일 때만 처리하고, 아니면 같은 422로 답한다. 답이 없음을 고정하던 `test/realtime-subscribe.test.ts`의 테스트를 뒤집는다.
- FastAPI 테스트: `test_config.py`에 정규화(`.env.example`의 값, 대문자와 끝의 `/`, `:443`, 계정·경로·쿼리·조각, `[0:0:0:0:0:0:0:1]:80`은 `http://[::1]`)와 거절 11경우(메시지 줄 전체를 비교한다)를, `test_gateway.py`의 parametrize에 페이로드 두 개(구독한 룸이 없는지도 본다)를 더한다. `app/tests/sockets.py`의 `call` docstring에 튜플이 여러 페이로드가 된다고 적는다.
- 적합성: `sockets.ts`의 `ack`가 페이로드를 여럿 받고 `Ack.error`에 `source`를 더한다. `realtime.test.ts`에 흐름 하나: 익명 연결로 subscribe와 unsubscribe에 페이로드 0개와 2개를 보내면 모두 `[false, "422", "validation.invalid_choice", {pointer: "/channel"}]`이다. 0개는 부모 커밋에서도 맞다.
- 실패 확인: 부모 커밋에서는 두 대상 모두 페이로드 두 개의 subscribe에서 ack를 5초 기다리다 `Error: operation has timed out`으로 실패한다(목은 `realtime_message_ignored` 경고를 남긴다). FastAPI 단위 테스트는 정규화(값이 그대로다), 거절 11경우(`DID NOT RAISE SystemExit`), 페이로드 둘(`TimeoutError`)이 실패하고, 목 단위 테스트는 시간 초과로 실패한다.

**Files:**
- Modify: `contract/mock/AGENTS.md`, `contract/mock/src/config.ts`, `contract/mock/src/modules/realtime/gateway.ts`, `templates/fastapi/.env.example`, `templates/fastapi/src/app/core/config.py`, `templates/fastapi/src/app/modules/realtime/gateway.py`
- Test: `contract/conformance/test/flows/realtime.test.ts`, `contract/conformance/test/flows/sockets.ts`, `contract/mock/test/realtime-subscribe.test.ts`, `templates/fastapi/src/app/core/tests/test_config.py`, `templates/fastapi/src/app/modules/realtime/tests/test_gateway.py`, `templates/fastapi/src/app/tests/sockets.py`

**Interfaces:**
- Consumes: `app.core.config`의 `CommaSeparated`(`frozenset[str]`), `Settings.realtime_allowed_origins`, `load_settings()`. `app.core.realtime`의 `cors_allowed_origins=sorted(settings.realtime_allowed_origins)`. realtime `gateway.py`의 `Gateway._channel`, `subscribe`, `unsubscribe`, `_subscribe`, `_unsubscribe`, `_ack`. `app.tests.sockets`의 `SocketClient.call(event, data)`. 목 `src/modules/realtime/gateway.ts`의 `handleMessage`, `failed`, `UNKNOWN_CHANNEL`, `src/config.ts`의 `origin`, `httpUrl`(동작은 그대로). 적합성 `test/flows/sockets.ts`의 `RealtimeClient`, `Ack`
- Produces:
  - `app.core.config.Origins = Annotated[CommaSeparated, AfterValidator(_origins)]`, `Settings.realtime_allowed_origins: Origins`. 내부 `_origin(value: str) -> str`, `_origin_host(host: str, *, bracketed: bool) -> str | None`, `_origins(values: frozenset[str]) -> frozenset[str]`, `_DEFAULT_PORTS`, `_HOST_NAME`, `_NUMBER_LABEL`
  - `Gateway.subscribe(self, sid: str, *payloads: object) -> Any`, `Gateway.unsubscribe(self, sid: str, *payloads: object) -> Any`, `Gateway._channel(self, payloads: Sequence[object]) -> Channel | None`(`_subscribe`·`_unsubscribe`도 `payloads`를 받는다)
  - 목 `handleMessage(args: readonly unknown[], work: (payload: unknown) => RealtimeAck): void`(인자 `message`를 뺐다)
  - 적합성 `RealtimeClient.ack(message: "subscribe" | "unsubscribe", ...payloads: unknown[]): Promise<Ack>`, `Ack.error.source?: { pointer?: string }`
  - FastAPI 테스트 `test_realtime_origins_become_the_origins_browsers_send`, `test_realtime_origins_refuse_what_is_not_a_browser_origin`(상수 `NOT_HTTP`, `NOT_ASCII`, `NOT_AN_ORIGIN`), `test_unknown_channels_and_wrong_payloads_are_invalid_choices`(옛 `test_unknown_channels_are_invalid_choices`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`contract/conformance/test/flows/realtime.test.ts`를 고친다.

찾을 부분:

```ts
        expect([unknown.ok, unknown.error?.code]).toEqual([false, "validation.invalid_choice"]);
      }
      expect(await socket.ack("unsubscribe", { channel: "posts" })).toEqual({ ok: true });
    } finally {
      socket.close();
    }
```

바꿀 내용:

```ts
        expect([unknown.ok, unknown.error?.code]).toEqual([false, "validation.invalid_choice"]);
      }
      expect(await socket.ack("unsubscribe", { channel: "posts" })).toEqual({ ok: true });
    } finally {
      socket.close();
    }
  });

  it("페이로드가 없거나 둘 이상인 subscribe·unsubscribe는 틀린 페이로드라 validation.invalid_choice다", async () => {
    const socket = await RealtimeClient.connect();
    try {
      const posts = { channel: "posts" };
      for (const message of ["subscribe", "unsubscribe"] as const) {
        for (const payloads of [[], [posts, posts]]) {
          const wrong = await socket.ack(message, ...payloads);
          expect([wrong.ok, wrong.error?.status, wrong.error?.code, wrong.error?.source]).toEqual([
            false,
            "422",
            "validation.invalid_choice",
            { pointer: "/channel" },
          ]);
        }
      }
    } finally {
      socket.close();
    }
```

`contract/conformance/test/flows/sockets.ts`를 고친다.

(1) 찾을 부분:

```ts

export interface Ack {
  readonly ok: boolean;
  readonly error?: { readonly status: string; readonly code: string };
}

interface Received {
```

바꿀 내용:

```ts

export interface Ack {
  readonly ok: boolean;
  readonly error?: {
    readonly status: string;
    readonly code: string;
    readonly source?: { readonly pointer?: string };
  };
}

interface Received {
```

(2) 찾을 부분:

```ts
    return this.reason === undefined && this.socket.connected;
  }

  /** subscribe·unsubscribe를 보내고 ack를 받는다. ack는 계약의 RealtimeAck로 검증한다. */
  async ack(message: "subscribe" | "unsubscribe", payload: unknown): Promise<Ack> {
    const ack: unknown = await this.socket.timeout(WAIT_MS).emitWithAck(message, payload);
    const problems = validateSchema("RealtimeAck", ack);
    if (problems.length > 0) throw new ContractViolation(problems);
    return ack as Ack;
```

바꿀 내용:

```ts
    return this.reason === undefined && this.socket.connected;
  }

  /**
   * subscribe·unsubscribe를 보내고 ack를 받는다. ack는 계약의 RealtimeAck로 검증한다. 페이로드는 보통
   * 하나이고, 틀린 메시지를 보내려면 없거나 여럿을 준다.
   */
  async ack(message: "subscribe" | "unsubscribe", ...payloads: unknown[]): Promise<Ack> {
    const ack: unknown = await this.socket.timeout(WAIT_MS).emitWithAck(message, ...payloads);
    const problems = validateSchema("RealtimeAck", ack);
    if (problems.length > 0) throw new ContractViolation(problems);
    return ack as Ack;
```

`contract/mock/test/realtime-subscribe.test.ts`를 고친다.

(1) 찾을 부분:

```ts
import { describe, expect, it } from "vitest";
import { newUser, send, signIn, userWith } from "./accounts.ts";
import { writePost } from "./posts.ts";
import { capturedWarnings, connect, serving, ticketFor } from "./sockets.ts";

const DENIED = {
  ok: false,
```

바꿀 내용:

```ts
import { describe, expect, it } from "vitest";
import { newUser, send, signIn, userWith } from "./accounts.ts";
import { writePost } from "./posts.ts";
import { connect, serving, ticketFor } from "./sockets.ts";

const DENIED = {
  ok: false,
```

(2) 찾을 부분:

```ts
    expect(await socket.call("subscribe")).toEqual(UNKNOWN);
  });

  it("페이로드를 둘 이상 보내면 처리하지도 답하지도 않는다", async () => {
    const warn = capturedWarnings();
    const { url, realtime } = await serving();
    const socket = await connect(url);
    const posts = { channel: "posts" };
    const call = socket.socket.timeout(300).emitWithAck("subscribe", posts, posts);
    await expect(call).rejects.toThrow();
    expect(socket.rooms(realtime)?.has("posts")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "[mock] realtime_message_ignored message=subscribe payloads=2",
    );
  });

  it("ack를 기다리지 않는 메시지도 처리한다", async () => {
```

바꿀 내용:

```ts
    expect(await socket.call("subscribe")).toEqual(UNKNOWN);
  });

  it("페이로드가 둘 이상이면 틀린 페이로드다. 처리하지 않고 validation.invalid_choice로 답한다", async () => {
    const { url, realtime } = await serving();
    const socket = await connect(url);
    const posts = { channel: "posts" };
    expect(await socket.call("subscribe", posts, posts)).toEqual(UNKNOWN);
    expect(socket.rooms(realtime)?.has("posts")).toBe(false);
    expect(await socket.call("subscribe", posts)).toEqual({ ok: true });
    expect(await socket.call("unsubscribe", posts, posts)).toEqual(UNKNOWN);
    expect(socket.rooms(realtime)?.has("posts")).toBe(true);
    expect(await socket.call("unsubscribe")).toEqual(UNKNOWN);
  });

  it("ack를 기다리지 않는 메시지도 처리한다", async () => {
```

`templates/fastapi/src/app/core/tests/test_config.py` 전체를 다음으로 바꾼다.

```python
"""설정을 읽는 경로와 설정 오류 메시지."""

from pathlib import Path

import pytest
from dotenv import dotenv_values

from app.core.config import EXAMPLE_SECRETS, Settings, load_settings

EXAMPLE = Path(__file__).resolve().parents[4] / ".env.example"


@pytest.fixture(autouse=True)
def isolated(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """설정 변수를 모두 지우고, .env가 없는 임시 폴더를 작업 폴더로 둔다."""
    for name in Settings.model_fields:
        monkeypatch.delenv(name.upper(), raising=False)
    monkeypatch.chdir(tmp_path)


def write_dotenv(folder: Path, *, without: str = "") -> None:
    """.env.example을 folder/.env로 옮겨 쓴다. without에 적은 변수의 줄은 뺀다."""
    lines = EXAMPLE.read_text(encoding="utf-8").splitlines()
    kept = [line for line in lines if not (without and line.startswith(f"{without}="))]
    (folder / ".env").write_text("\n".join(kept) + "\n", encoding="utf-8")


def test_example_env_is_a_valid_configuration(tmp_path: Path) -> None:
    write_dotenv(tmp_path)
    settings = load_settings()
    assert settings.app_env == "development"
    assert settings.database_url.get_secret_value() == (
        "postgresql+psycopg://app:app@127.0.0.1:25432/app"
    )
    assert settings.redis_url.get_secret_value() == "redis://127.0.0.1:26379/0"


def test_urls_with_credentials_do_not_show_in_repr(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    write_dotenv(tmp_path)
    monkeypatch.setenv("SMTP_URL", "smtps://mailer:smtp-password@mail.example.com:465")
    shown = repr(load_settings())
    assert "app:app@" not in shown
    assert "smtp-password" not in shown


def test_file_types_are_a_comma_separated_list(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    write_dotenv(tmp_path)
    assert load_settings().file_allowed_types == {
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
    }
    monkeypatch.setenv("FILE_ALLOWED_TYPES", " image/png , text/plain ,,")
    assert load_settings().file_allowed_types == {"image/png", "text/plain"}
    monkeypatch.setenv("FILE_ALLOWED_TYPES", " , ")
    with pytest.raises(SystemExit, match="FILE_ALLOWED_TYPES"):
        load_settings()


def test_realtime_origins_become_the_origins_browsers_send(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """경로, 쿼리, 조각, 계정과 기본 포트는 떼고 호스트는 소문자로 쓴다. 겹치는 값은 하나다."""
    write_dotenv(tmp_path)
    assert load_settings().realtime_allowed_origins == {"http://localhost:3000"}
    monkeypatch.setenv(
        "REALTIME_ALLOWED_ORIGINS", " http://LOCALHOST:3000/, https://web.example.com:443,,"
    )
    assert load_settings().realtime_allowed_origins == {
        "http://localhost:3000",
        "https://web.example.com",
    }
    monkeypatch.setenv(
        "REALTIME_ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:3000/,"
        "https://someone@admin.example.com:8443/login?next=/#top,"
        "http://[0:0:0:0:0:0:0:1]:80,http://127.0.0.1:3000",
    )
    assert load_settings().realtime_allowed_origins == {
        "http://localhost:3000",
        "https://admin.example.com:8443",
        "http://[::1]",
        "http://127.0.0.1:3000",
    }


NOT_HTTP = "http:// 또는 https://로 시작하는 주소여야 한다"
NOT_ASCII = "호스트는 ASCII여야 한다. 국제화 도메인은 punycode(xn--…)로 적는다"
NOT_AN_ORIGIN = "Origin(http[s]://호스트[:포트])으로 읽을 수 없다"


@pytest.mark.parametrize(
    ("value", "reason"),
    [
        ("*", NOT_HTTP),
        ("localhost:3001", NOT_HTTP),
        ("ftp://x.example", NOT_HTTP),
        ("HTTP://localhost:3000", NOT_HTTP),
        ("http://한국.kr", NOT_ASCII),
        ("http://:3000", NOT_AN_ORIGIN),
        ("http://localhost:99999", NOT_AN_ORIGIN),
        ("http://*.example.com", NOT_AN_ORIGIN),
        ("http://127.1", NOT_AN_ORIGIN),
        ("http://[::ffff:127.0.0.1]", NOT_AN_ORIGIN),
        ("http://[fe80::1%25eth0]", NOT_AN_ORIGIN),
    ],
    ids=[
        "any",
        "no-scheme",
        "ftp",
        "upper-case-scheme",
        "non-ascii-host",
        "no-host",
        "port-out-of-range",
        "wildcard-host",
        "short-ipv4",
        "ipv4-mapped-ipv6",
        "ipv6-zone",
    ],
)
def test_realtime_origins_refuse_what_is_not_a_browser_origin(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, value: str, reason: str
) -> None:
    """*, http(s)가 아닌 값, ASCII가 아닌 호스트, 브라우저가 다르게 적는 호스트는 설정 오류다."""
    write_dotenv(tmp_path)
    monkeypatch.setenv("REALTIME_ALLOWED_ORIGINS", f"http://localhost:3000,{value}")
    with pytest.raises(SystemExit) as caught:
        load_settings()
    assert str(caught.value) == (
        f"설정 오류: REALTIME_ALLOWED_ORIGINS — 값이 틀렸다(Value error, {reason}(현재: {value}))."
    )


def test_reports_each_bad_variable_on_its_own_line(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    write_dotenv(tmp_path, without="REDIS_URL")
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/app")
    with pytest.raises(SystemExit) as caught:
        load_settings()
    assert str(caught.value).splitlines() == [
        "설정 오류: APP_ENV — 값이 틀렸다(Input should be 'development', 'test' or 'production').",
        "설정 오류: DATABASE_URL — 값이 틀렸다"
        "(Value error, postgresql+psycopg://로 시작해야 한다).",
        "설정 오류: REDIS_URL — 값이 없다. .env나 환경 변수에 적는다(예시는 .env.example).",
    ]


def test_rejects_a_short_jwt_secret_and_an_unknown_mail_scheme(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    write_dotenv(tmp_path)
    monkeypatch.setenv("JWT_SECRET", "too-short")
    monkeypatch.setenv("SMTP_URL", "http://127.0.0.1:21025")
    with pytest.raises(SystemExit) as caught:
        load_settings()
    assert str(caught.value).splitlines() == [
        "설정 오류: JWT_SECRET — 값이 틀렸다"
        "(Value should have at least 32 items after validation, not 9).",
        "설정 오류: SMTP_URL — 값이 틀렸다"
        "(Value error, smtp:// 또는 smtp+starttls:// 또는 smtps://로 시작해야 한다).",
    ]


def test_production_refuses_the_example_secrets(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    write_dotenv(tmp_path)
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(SystemExit) as caught:
        load_settings()
    reason = "(Value error, 운영(APP_ENV=production)에서는 .env.example의 예시 값을 쓸 수 없다)."
    assert str(caught.value).splitlines() == [
        f"설정 오류: {name} — 값이 틀렸다{reason}"
        for name in ("JWT_SECRET", "IDENTIFIER_HASH_SECRET", "SEED_ADMIN_PASSWORD")
    ]


def test_production_starts_with_its_own_secrets(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    write_dotenv(tmp_path)
    monkeypatch.setenv("APP_ENV", "production")
    for name in EXAMPLE_SECRETS:
        monkeypatch.setenv(name.upper(), f"production-{name}-value-that-is-long-enough")
    assert load_settings().app_env == "production"


def test_example_secrets_are_the_values_in_env_example() -> None:
    example = dotenv_values(EXAMPLE)
    assert {name: example.get(name.upper()) for name in EXAMPLE_SECRETS} == EXAMPLE_SECRETS
```

`templates/fastapi/src/app/modules/realtime/tests/test_gateway.py`를 고친다.

(1) 찾을 부분:

```python
            assert "posts:all" in realtime.server.rooms(socket.sid)


@pytest.mark.parametrize("payload", [{"channel": "secrets"}, {}, "posts", None])
async def test_unknown_channels_are_invalid_choices(app: JsonApiApp, payload: object) -> None:
    async with serving(app) as url, connected(url) as socket:
        for message in ("subscribe", "unsubscribe"):
            ack = await socket.call(message, payload)
```

바꿀 내용:

```python
            assert "posts:all" in realtime.server.rooms(socket.sid)


@pytest.mark.parametrize(
    "payload",
    [{"channel": "secrets"}, {}, "posts", None, ({"channel": "posts"}, {"channel": "posts"})],
    ids=["unknown-channel", "no-channel", "not-an-object", "no-payload", "two-payloads"],
)
async def test_unknown_channels_and_wrong_payloads_are_invalid_choices(
    app: JsonApiApp, realtime: Realtime, payload: object
) -> None:
    """페이로드가 하나가 아니면(없거나 둘 이상) 틀린 페이로드다. 구독하지 않고 422로 답한다."""
    async with serving(app) as url, connected(url) as socket:
        for message in ("subscribe", "unsubscribe"):
            ack = await socket.call(message, payload)
```

(2) 찾을 부분:

```python
            error = ack["error"]
            assert (error["status"], error["code"]) == ("422", "validation.invalid_choice")
            assert error["source"] == {"pointer": "/channel"}


async def test_a_logged_out_session_loses_its_connection(
```

바꿀 내용:

```python
            error = ack["error"]
            assert (error["status"], error["code"]) == ("422", "validation.invalid_choice")
            assert error["source"] == {"pointer": "/channel"}
        assert "posts" not in realtime.server.rooms(socket.sid)


async def test_a_logged_out_session_loses_its_connection(
```

`templates/fastapi/src/app/tests/sockets.py`를 고친다.

찾을 부분:

```python
        return False

    async def call(self, event: str, data: Any) -> Any:
        """메시지를 보내고 서버의 ack를 받는다."""
        return await self.client.call(event, data, timeout=WAIT)


```

바꿀 내용:

```python
        return False

    async def call(self, event: str, data: Any) -> Any:
        """메시지를 보내고 서버의 ack를 받는다.

        python-socketio 클라이언트는 data가 튜플이면 원소를 하나씩 페이로드로 보내고, None이면
        페이로드 없이 보낸다.
        """
        return await self.client.call(event, data, timeout=WAIT)


```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run(`contract/mock`에서): `pnpm exec vitest run test/realtime-subscribe.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 페이로드가 둘 이상이면 틀린 페이로드다. 처리하지 않고 validation.invalid_choice로 답한다
FAIL  test/realtime-subscribe.test.ts > 구독 > 페이로드가 둘 이상이면 틀린 페이로드다. 처리하지 않고 validation.invalid_choice로 답한다
Error: operation has timed out
Test Files 1 failed (1)
Tests 1 failed | 8 passed (9)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/core/tests/test_config.py src/app/modules/realtime/tests/test_gateway.py`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
E       AssertionError: assert frozenset({'h...ple.com:443'}) == {'http://loca....example.com'}
FAILED src/app/core/tests/test_config.py::test_realtime_origins_become_the_origins_browsers_send
FAILED src/app/core/tests/test_config.py::test_realtime_origins_refuse_what_is_not_a_browser_origin[any]
FAILED src/app/core/tests/test_config.py::test_realtime_origins_refuse_what_is_not_a_browser_origin[no-scheme]
FAILED src/app/core/tests/test_config.py::test_realtime_origins_refuse_what_is_not_a_browser_origin[ftp]
FAILED src/app/core/tests/test_config.py::test_realtime_origins_refuse_what_is_not_a_browser_origin[upper-case-scheme]
FAILED src/app/core/tests/test_config.py::test_realtime_origins_refuse_what_is_not_a_browser_origin[non-ascii-host]
FAILED src/app/core/tests/test_config.py::test_realtime_origins_refuse_what_is_not_a_browser_origin[no-host]
13 failed, 22 passed in
```

Run(저장소 루트에서): `pnpm conformance fastapi test/flows/realtime.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 페이로드가 없거나 둘 이상인 subscribe·unsubscribe는 틀린 페이로드라 validation.invalid_choice다
FAIL  test/flows/realtime.test.ts > 실시간 (fastapi) > 페이로드가 없거나 둘 이상인 subscribe·unsubscribe는 틀린 페이로드라 validation.invalid_choice다
Error: operation has timed out
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
× "pnpm recursive run" failed in C:\Users\rootj\.cache\ai-template-
Test Files 1 failed (1)
Tests 1 failed | 8 passed (9)
```

Run(저장소 루트에서): `pnpm conformance mock test/flows/realtime.test.ts`

Expected: 실패한다. 부모 커밋에 이 태스크의 테스트만 얹어 돌린 출력:

```text
× 페이로드가 없거나 둘 이상인 subscribe·unsubscribe는 틀린 페이로드라 validation.invalid_choice다
FAIL  test/flows/realtime.test.ts > 실시간 (mock) > 페이로드가 없거나 둘 이상인 subscribe·unsubscribe는 틀린 페이로드라 validation.invalid_choice다
Error: operation has timed out
Error: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL
× "pnpm recursive run" failed in C:\Users\rootj\.cache\ai-template-
Test Files 1 failed (1)
Tests 1 failed | 8 passed (9)
```

- [ ] **Step 3: FastAPI core를 고친다**

`templates/fastapi/src/app/core/config.py` 전체를 다음으로 바꾼다.

```python
"""앱과 도구의 설정. 환경 변수와 작업 폴더의 `.env`에서 읽는다.

- 비밀(키, 비밀번호, 계정이 든 URL)은 SecretStr로 받는다. repr과 로그에 값이 드러나지 않고,
  쓰는 곳에서 get_secret_value()로 꺼낸다.
- 운영(APP_ENV=production)에서는 앱이 스스로 정하는 비밀이 .env.example의 예시 값이면
  시작하지 않는다.
"""

import ipaddress
import re
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import (
    AfterValidator,
    BeforeValidator,
    Field,
    SecretStr,
    ValidationError,
    ValidationInfo,
    field_validator,
)
from pydantic_core import ErrorDetails
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

NonEmpty = Annotated[str, Field(min_length=1)]
HttpUrl = Annotated[str, Field(pattern=r"^https?://")]
# 레이트 리밋 한도: 한 윈도(분이나 시간) 동안 받는 요청 수
Limit = Annotated[int, Field(ge=1)]


def _comma_separated(value: object) -> object:
    """쉼표로 나눈 목록(예: image/png,image/jpeg). 앞뒤 공백을 지우고 빈 항목은 뺀다."""
    if isinstance(value, str):
        return frozenset(item.strip() for item in value.split(",") if item.strip())
    return value


# 쉼표로 나눈 목록. 환경 변수를 JSON으로 풀지 않는다(NoDecode).
CommaSeparated = Annotated[
    frozenset[str], NoDecode, BeforeValidator(_comma_separated), Field(min_length=1)
]

_DEFAULT_PORTS = {"http": 80, "https": 443}
# 소문자로 바꾼 호스트 이름에 쓰는 글자: 영문자, 숫자, 하이픈, 밑줄, 점
_HOST_NAME = re.compile(r"[a-z0-9_.-]+")
# 브라우저는 마지막 라벨이 숫자(10진수, 0x로 시작하는 16진수)인 호스트를 IPv4 주소로 읽는다
_NUMBER_LABEL = re.compile(r"[0-9]+|0x[0-9a-f]*")


def _origin_host(host: str, *, bracketed: bool) -> str | None:
    """브라우저가 Origin에 적는 호스트. host는 urlsplit의 hostname(소문자, 대괄호를 뗀 값)이다.

    IPv6는 줄여 쓴 꼴로 바꾼다. 브라우저가 다르게 적는 호스트(줄여 쓴 IPv4, IPv4를 담은 IPv6,
    zone id, 이름에 쓰지 않는 글자)는 None이다.
    """
    if bracketed:
        try:
            address = ipaddress.IPv6Address(host)
        except ValueError:
            return None
        if address.ipv4_mapped is not None or address.scope_id is not None:
            return None
        return f"[{address.compressed}]"
    if _HOST_NAME.fullmatch(host) is None:
        return None
    if _NUMBER_LABEL.fullmatch(host.removesuffix(".").rpartition(".")[2]):
        try:
            ipaddress.IPv4Address(host)
        except ValueError:
            return None
    return host


def _origin(value: str) -> str:
    """값 하나를 브라우저가 보내는 Origin(스킴://호스트[:포트])으로 바꾼다.

    경로, 쿼리, 조각, 계정은 떼고, 호스트는 소문자로, 기본 포트(80, 443)는 뺀다. 브라우저가 다른
    모양으로 보내는 호스트(ASCII가 아닌 호스트, 줄여 쓴 IPv4 등)는 고쳐 적도록 거절한다.
    """
    if not value.startswith(("http://", "https://")):
        raise ValueError(f"http:// 또는 https://로 시작하는 주소여야 한다(현재: {value})")
    unreadable = f"Origin(http[s]://호스트[:포트])으로 읽을 수 없다(현재: {value})"
    try:
        parts = urlsplit(value)
        port = parts.port
    except ValueError:
        raise ValueError(unreadable) from None
    hostinfo = parts.netloc.rpartition("@")[2]
    if not hostinfo.isascii():
        raise ValueError(
            f"호스트는 ASCII여야 한다. 국제화 도메인은 punycode(xn--…)로 적는다(현재: {value})"
        )
    host = _origin_host(parts.hostname or "", bracketed=hostinfo.startswith("["))
    if host is None:
        raise ValueError(unreadable)
    if port is None or port == _DEFAULT_PORTS[parts.scheme]:
        return f"{parts.scheme}://{host}"
    return f"{parts.scheme}://{host}:{port}"


def _origins(values: frozenset[str]) -> frozenset[str]:
    """값마다 Origin으로 바꾼다. 틀린 값이 여럿이면 정렬해서 처음 것을 알린다."""
    return frozenset(_origin(value) for value in sorted(values))


# 브라우저 Origin의 목록(쉼표로 구분). python-engineio는 Origin 헤더를 글자 그대로 비교하고 *를
# 모두 허용으로 읽는다. 그래서 값마다 브라우저가 보내는 Origin으로 바꾸고(끝에 /가 붙은 값이 모든
# 브라우저를 막지 않게) *는 거절한다
Origins = Annotated[CommaSeparated, AfterValidator(_origins)]


def _scheme(*schemes: str) -> AfterValidator:
    """계정이 든 URL(SecretStr)의 스킴 검사. SecretStr에는 pattern을 걸 수 없다.

    에러 메시지에 값을 싣지 않는다.
    """

    def check(value: SecretStr) -> SecretStr:
        if not value.get_secret_value().startswith(schemes):
            raise ValueError(f"{' 또는 '.join(schemes)}로 시작해야 한다")
        return value

    return AfterValidator(check)


# .env.example에 적힌 예시 비밀. 운영에서 이 값을 쓰면 시작하지 않는다. 앱이 스스로 정하는 비밀만
# 본다(DB, S3, SMTP, OAuth의 자격 증명은 예시 값이면 그 서비스가 거절한다). 이미지에는
# .env.example이 없어 여기에 둔다. test_config가 .env.example과 같은지 본다.
EXAMPLE_SECRETS = {
    "jwt_secret": "local-development-only-jwt-signing-key",
    "identifier_hash_secret": "local-development-only-identifier-hash-key",
    "seed_admin_password": "admin-password",  # betterleaks:allow 예시 값
}


class Settings(BaseSettings):
    """설정 스키마. 환경 변수 이름은 필드 이름의 대문자(예: DATABASE_URL)이고, 모든 값이 필수다.

    필드를 더하거나 빼면 .env.example도 같이 고친다.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"]
    log_level: Literal["debug", "info", "warning", "error"]
    # DB와 Valkey 주소. 계정과 비밀번호가 들어 있을 수 있어 SecretStr로 받는다
    database_url: Annotated[SecretStr, _scheme("postgresql+psycopg://")]
    redis_url: Annotated[SecretStr, _scheme("redis://", "rediss://")]
    s3_endpoint_url: HttpUrl
    s3_public_endpoint_url: HttpUrl
    s3_region: NonEmpty
    s3_access_key_id: NonEmpty
    s3_secret_access_key: SecretStr
    s3_bucket: NonEmpty
    # 파일 업로드: 최대 크기(바이트)와 허용하는 MIME 타입(쉼표로 구분)
    file_max_size: Annotated[int, Field(ge=1)]
    file_allowed_types: CommaSeparated
    # 한 사용자가 가진 파일(pending과 ready) 크기의 합의 한도(바이트)
    file_user_quota: Annotated[int, Field(ge=1)]
    # access token(JWT, HS256)의 서명 키. 32자 이상
    jwt_secret: Annotated[SecretStr, Field(min_length=32)]
    # 이메일 같은 식별자의 해시(HMAC-SHA256) 키. 32자 이상.
    # 바꾸면 이전 감사 로그의 해시와 이어지지 않는다
    identifier_hash_secret: Annotated[SecretStr, Field(min_length=32)]
    # 메일 서버. smtp://(평문), smtp+starttls://(STARTTLS), smtps://(TLS). 계정은 주소에 넣는다
    smtp_url: Annotated[SecretStr, _scheme("smtp://", "smtp+starttls://", "smtps://")]
    mail_from: NonEmpty
    # 메일 링크의 프론트 주소. 인증·재설정 링크는 여기에 경로와 ?token=을 붙인다
    frontend_url: HttpUrl
    # Socket.IO 연결을 받을 브라우저 Origin(쉼표로 구분). 예: http://localhost:3000
    realtime_allowed_origins: Origins
    # 브라우저가 보는 이 API의 주소. 소셜 로그인 제공자가
    # <API_URL>/api/v1/oauth/<제공자>/callback으로 돌아온다. 제공자 콘솔에 이 콜백 주소를 등록한다
    api_url: HttpUrl
    # 소셜 로그인 뒤 돌아갈 프론트 콜백 주소(쉼표로 구분). authorize의 redirectUri가 이 중
    # 하나와 같아야 한다
    oauth_redirect_uris: CommaSeparated
    # 소셜 로그인 제공자(google, kakao, naver)마다 클라이언트와 주소. 인가 주소는 브라우저가, 토큰과
    # 프로필 주소는 서버가 부른다. 운영 주소는 .env.example의 주석에 있다
    oauth_google_client_id: NonEmpty
    oauth_google_client_secret: SecretStr
    oauth_google_authorize_url: HttpUrl
    oauth_google_token_url: HttpUrl
    oauth_google_profile_url: HttpUrl
    oauth_kakao_client_id: NonEmpty
    oauth_kakao_client_secret: SecretStr
    oauth_kakao_authorize_url: HttpUrl
    oauth_kakao_token_url: HttpUrl
    oauth_kakao_profile_url: HttpUrl
    oauth_naver_client_id: NonEmpty
    oauth_naver_client_secret: SecretStr
    oauth_naver_authorize_url: HttpUrl
    oauth_naver_token_url: HttpUrl
    oauth_naver_profile_url: HttpUrl
    # 시드(python -m app.seed)가 만드는 관리자 계정
    seed_admin_email: NonEmpty
    seed_admin_password: Annotated[SecretStr, Field(min_length=8)]
    # OpenTelemetry. 켜면 트레이스를 OTLP(HTTP)로 보낸다. 서비스 이름에는 역할(api, worker,
    # scheduler)을 붙인다. 로컬 수집기는 compose의 observability 프로필(Grafana LGTM)이다
    otel_enabled: bool
    otel_service_name: NonEmpty
    otel_exporter_otlp_endpoint: HttpUrl
    # 레이트 리밋. 전역과 로그인은 분당, 가입과 메일 요청(인증 메일 재발송, 재설정 요청)과
    # 비밀번호 변경(사용자별)은 시간당
    rate_limit_global: Limit
    rate_limit_login_ip: Limit
    rate_limit_login_identifier: Limit
    rate_limit_registration_ip: Limit
    rate_limit_mail_ip: Limit
    rate_limit_mail_email: Limit
    rate_limit_password_change_user: Limit

    @field_validator(*EXAMPLE_SECRETS)
    @classmethod
    def _no_example_secret_in_production(cls, value: SecretStr, info: ValidationInfo) -> SecretStr:
        """운영에서 .env.example의 예시 비밀을 거절한다. app_env는 첫 필드라 먼저 검증된다."""
        example = EXAMPLE_SECRETS.get(info.field_name or "")
        if info.data.get("app_env") == "production" and value.get_secret_value() == example:
            raise ValueError("운영(APP_ENV=production)에서는 .env.example의 예시 값을 쓸 수 없다")
        return value

    def __init__(self) -> None:
        # 값은 환경 변수와 .env에서 온다. 인자 없는 생성자를 선언해 두면 타입 검사기가
        # 필드마다 키워드 인자를 요구하지 않는다(pydantic의 dataclass_transform).
        super().__init__()


def _describe(error: ErrorDetails) -> str:
    name = "_".join(str(part) for part in error["loc"]).upper()
    if error["type"] == "missing":
        return f"설정 오류: {name} — 값이 없다. .env나 환경 변수에 적는다(예시는 .env.example)."
    return f"설정 오류: {name} — 값이 틀렸다({error['msg']})."


def load_settings() -> Settings:
    """설정을 읽는다. 없거나 틀린 값이 있으면 변수마다 한 줄씩 알리고 멈춘다(SystemExit)."""
    try:
        return Settings()
    except ValidationError as error:
        raise SystemExit("\n".join(_describe(detail) for detail in error.errors())) from None
```

- [ ] **Step 4: FastAPI realtime 모듈을 고친다**

`templates/fastapi/src/app/modules/realtime/gateway.py`를 고친다.

(1) 찾을 부분:

```python
- 연결: auth.ticket이 있으면 티켓을 꺼내 지우고(1회용) 그 연결을 user:{id} 룸에 넣는다. 티켓이
  틀렸거나 만료됐거나 세션이 끝났으면 연결을 거부한다. 클라이언트의 connect_error는 message가
  에러 코드(auth.token_invalid), data가 ErrorObject다. 티켓이 없으면 익명 연결이다.
- subscribe·unsubscribe: 페이로드는 RealtimeSubscription, ack는 RealtimeAck다. 모르는 채널은
  validation.invalid_choice, 권한이 없으면 permission.denied다. 권한은 구독할 때 DB에서 계산한다.
- 재검사: 세션을 폐기하거나 역할·상태를 바꾸면(auth와 users의 queue_recheck) 제어 채널로
  알림이 온다. 이 인스턴스에 있는 그 사용자의 연결을 다시 검사해, 세션이 끝났거나(폐기, 만료, 계정
  비활성화·탈퇴) 구독한 채널의 권한을 잃은 연결을 끊는다. 끊긴 클라이언트는 새 티켓으로 다시
```

바꿀 내용:

```python
- 연결: auth.ticket이 있으면 티켓을 꺼내 지우고(1회용) 그 연결을 user:{id} 룸에 넣는다. 티켓이
  틀렸거나 만료됐거나 세션이 끝났으면 연결을 거부한다. 클라이언트의 connect_error는 message가
  에러 코드(auth.token_invalid), data가 ErrorObject다. 티켓이 없으면 익명 연결이다.
- subscribe·unsubscribe: 페이로드는 RealtimeSubscription 하나, ack는 RealtimeAck다. 모르는 채널이나
  틀린 페이로드(페이로드가 없거나 둘 이상이어도)는 validation.invalid_choice, 권한이 없으면
  permission.denied다. 권한은 구독할 때 DB에서 계산한다.
- 재검사: 세션을 폐기하거나 역할·상태를 바꾸면(auth와 users의 queue_recheck) 제어 채널로
  알림이 온다. 이 인스턴스에 있는 그 사용자의 연결을 다시 검사해, 세션이 끝났거나(폐기, 만료, 계정
  비활성화·탈퇴) 구독한 채널의 권한을 잃은 연결을 끊는다. 끊긴 클라이언트는 새 티켓으로 다시
```

(2) 찾을 부분:

```python
        await self.server.enter_room(sid, user_room(principal.user_id))
        logger.info("realtime_connected", user_id=str(principal.user_id))

    def _channel(self, data: object) -> Channel | None:
        try:
            subscription = RealtimeSubscription.model_validate(data)
        except ValidationError:
            return None
        return self.channels.get(subscription.channel.root)
```

바꿀 내용:

```python
        await self.server.enter_room(sid, user_room(principal.user_id))
        logger.info("realtime_connected", user_id=str(principal.user_id))

    def _channel(self, payloads: Sequence[object]) -> Channel | None:
        """메시지의 페이로드(RealtimeSubscription 하나)가 가리키는 채널.

        페이로드가 하나가 아니거나(없거나 둘 이상) 틀렸거나 모르는 채널이면 None이다.
        """
        if len(payloads) != 1:
            return None
        try:
            subscription = RealtimeSubscription.model_validate(payloads[0])
        except ValidationError:
            return None
        return self.channels.get(subscription.channel.root)
```

(3) 찾을 부분:

```python
        principal = await self._principal(sid)
        return principal is not None and channel.permission in principal.permissions

    async def subscribe(self, sid: str, data: object = None) -> Any:
        with spans.start_as_current_span("realtime.subscribe"):
            return await self._subscribe(sid, data)

    async def _subscribe(self, sid: str, data: object) -> Any:
        channel = self._channel(data)
        if channel is None:
            return _ack(False, ErrorCode.VALIDATION_INVALID_CHOICE, 422, "Unknown channel.")
        if not await self._allowed(sid, channel):
```

바꿀 내용:

```python
        principal = await self._principal(sid)
        return principal is not None and channel.permission in principal.permissions

    async def subscribe(self, sid: str, *payloads: object) -> Any:
        # python-socketio는 받은 페이로드를 하나씩 인자로 넘긴다. 개수를 가리지 않고 받아야 틀린
        # 개수에도 ack로 답한다(인자가 맞지 않으면 처리기가 TypeError로 끝나 ack를 보내지 못한다).
        with spans.start_as_current_span("realtime.subscribe"):
            return await self._subscribe(sid, payloads)

    async def _subscribe(self, sid: str, payloads: Sequence[object]) -> Any:
        channel = self._channel(payloads)
        if channel is None:
            return _ack(False, ErrorCode.VALIDATION_INVALID_CHOICE, 422, "Unknown channel.")
        if not await self._allowed(sid, channel):
```

(4) 찾을 부분:

```python
        await self.server.enter_room(sid, channel.name)
        return _ack(True)

    async def unsubscribe(self, sid: str, data: object = None) -> Any:
        with spans.start_as_current_span("realtime.unsubscribe"):
            return await self._unsubscribe(sid, data)

    async def _unsubscribe(self, sid: str, data: object) -> Any:
        channel = self._channel(data)
        if channel is None:
            return _ack(False, ErrorCode.VALIDATION_INVALID_CHOICE, 422, "Unknown channel.")
        await self.server.leave_room(sid, channel.name)
```

바꿀 내용:

```python
        await self.server.enter_room(sid, channel.name)
        return _ack(True)

    async def unsubscribe(self, sid: str, *payloads: object) -> Any:
        with spans.start_as_current_span("realtime.unsubscribe"):
            return await self._unsubscribe(sid, payloads)

    async def _unsubscribe(self, sid: str, payloads: Sequence[object]) -> Any:
        channel = self._channel(payloads)
        if channel is None:
            return _ack(False, ErrorCode.VALIDATION_INVALID_CHOICE, 422, "Unknown channel.")
        await self.server.leave_room(sid, channel.name)
```

- [ ] **Step 5: 목을 고친다**

`contract/mock/src/config.ts`를 고친다.

찾을 부분:

```ts
   */
  readonly storageAllowedOrigins: readonly string[];
  /**
   * Socket.IO 연결을 받을 브라우저 Origin(REALTIME_ALLOWED_ORIGINS, 쉼표로 구분). 값마다 Origin으로
   * 정규화하고 `*`나 URL이 아닌 값은 설정 오류로 거절한다. FastAPI는 원래 문자열을 그대로 비교해 `*`를
   * 전부 허용으로 본다(값을 검증하지 않는다). Origin 헤더가 없는 연결(브라우저가 아닌 클라이언트)은 늘
   * 받는다.
   */
  readonly realtimeAllowedOrigins: readonly string[];
}
```

바꿀 내용:

```ts
   */
  readonly storageAllowedOrigins: readonly string[];
  /**
   * Socket.IO 연결을 받을 브라우저 Origin(REALTIME_ALLOWED_ORIGINS, 쉼표로 구분). FastAPI(config.py의
   * Origins)처럼 값마다 Origin으로 정규화하고 `*`나 http(s) 주소가 아닌 값은 설정 오류로 거절한다. 호스트는
   * WHATWG URL로 읽어 브라우저가 보낼 모양으로 바꾼다(ASCII가 아닌 호스트는 punycode로, 127.1은
   * 127.0.0.1로). FastAPI는 그렇게 바꿔야 하는 호스트를 설정 오류로 거절한다. Origin 헤더가 없는
   * 연결(브라우저가 아닌 클라이언트)은 늘 받는다.
   */
  readonly realtimeAllowedOrigins: readonly string[];
}
```

`contract/mock/src/modules/realtime/gateway.ts`를 고친다.

(1) 찾을 부분:

```ts
 * - 연결: auth.ticket이 있으면 티켓을 꺼내 지우고(1회용) 그 연결을 user:{id} 룸에 넣는다. 티켓이
 *   틀렸거나 만료됐거나 세션이 끝났으면 연결을 거부한다. 클라이언트의 connect_error는 message가 에러
 *   코드(auth.token_invalid), data가 ErrorObject다. 티켓이 없으면(null도) 익명 연결이다.
 * - subscribe·unsubscribe: 페이로드는 RealtimeSubscription, ack는 RealtimeAck다. 모르는 채널이나 틀린
 *   페이로드는 validation.invalid_choice(422), 권한이 없으면 permission.denied(403)이고 source.pointer는
 *   /channel이다. 권한은 구독할 때 계산한다.
 * - 재검사(recheck): 세션을 폐기하거나 역할·상태를 바꾸면 허브가 알린다. 그 사용자의 연결을 다시 검사해
 *   세션이 끝났거나(폐기, 만료, 계정 비활성화·탈퇴) 구독한 채널의 권한을 잃은 연결을 끊는다. 끊긴 클라이언트는
 *   새 티켓으로 다시 붙는다(세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독이
```

바꿀 내용:

```ts
 * - 연결: auth.ticket이 있으면 티켓을 꺼내 지우고(1회용) 그 연결을 user:{id} 룸에 넣는다. 티켓이
 *   틀렸거나 만료됐거나 세션이 끝났으면 연결을 거부한다. 클라이언트의 connect_error는 message가 에러
 *   코드(auth.token_invalid), data가 ErrorObject다. 티켓이 없으면(null도) 익명 연결이다.
 * - subscribe·unsubscribe: 페이로드는 RealtimeSubscription 하나, ack는 RealtimeAck다. 모르는 채널이나 틀린
 *   페이로드(페이로드가 없거나 둘 이상이어도)는 validation.invalid_choice(422), 권한이 없으면
 *   permission.denied(403)이고 source.pointer는 /channel이다. 권한은 구독할 때 계산한다.
 * - 재검사(recheck): 세션을 폐기하거나 역할·상태를 바꾸면 허브가 알린다. 그 사용자의 연결을 다시 검사해
 *   세션이 끝났거나(폐기, 만료, 계정 비활성화·탈퇴) 구독한 채널의 권한을 잃은 연결을 끊는다. 끊긴 클라이언트는
 *   새 티켓으로 다시 붙는다(세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독이
```

(2) 찾을 부분:

```ts
}

/**
 * 메시지 하나를 처리하고, 클라이언트가 ack를 기다리면 답한다. 페이로드가 없으면 undefined로 처리한다
 * (FastAPI의 data=None). FastAPI의 처리기는 페이로드를 하나만 받아 둘 이상이면 실패하므로(TypeError), 목도
 * 처리하지도 답하지도 않고 경고만 남긴다.
 */
function handleMessage(
  message: keyof ClientMessages,
  args: readonly unknown[],
  work: (payload: unknown) => RealtimeAck,
): void {
  const last = args.at(-1);
  const answer = isAnswer(last) ? last : undefined;
  const payloads = answer === undefined ? args : args.slice(0, -1);
  if (payloads.length > 1) {
    const count = String(payloads.length);
    console.warn(`[mock] realtime_message_ignored message=${message} payloads=${count}`);
    return;
  }
  const ack = work(payloads[0]);
  answer?.(ack);
}

```

바꿀 내용:

```ts
}

/**
 * 메시지 하나를 처리하고, 클라이언트가 ack를 기다리면 답한다. 페이로드는 하나다. 없거나 둘 이상이면 틀린
 * 페이로드라 처리하지 않고 validation.invalid_choice(422)로 답한다(FastAPI의 Gateway._channel).
 */
function handleMessage(args: readonly unknown[], work: (payload: unknown) => RealtimeAck): void {
  const last = args.at(-1);
  const answer = isAnswer(last) ? last : undefined;
  const payloads = answer === undefined ? args : args.slice(0, -1);
  const ack =
    payloads.length === 1
      ? work(payloads[0])
      : failed(422, "validation.invalid_choice", UNKNOWN_CHANNEL);
  answer?.(ack);
}

```

(3) 찾을 부분:

```ts
    const { login } = socket.data;
    if (login !== undefined) void socket.join(userRoom(login.userId));
    socket.on("subscribe", (...args) => {
      handleMessage("subscribe", args, (payload) => subscribe(state, socket, payload));
    });
    socket.on("unsubscribe", (...args) => {
      handleMessage("unsubscribe", args, (payload) => unsubscribe(socket, payload));
    });
  });
}
```

바꿀 내용:

```ts
    const { login } = socket.data;
    if (login !== undefined) void socket.join(userRoom(login.userId));
    socket.on("subscribe", (...args) => {
      handleMessage(args, (payload) => subscribe(state, socket, payload));
    });
    socket.on("unsubscribe", (...args) => {
      handleMessage(args, (payload) => unsubscribe(socket, payload));
    });
  });
}
```

- [ ] **Step 6: FastAPI 템플릿의 설정 파일을 고친다**

`templates/fastapi/.env.example`를 고친다.

찾을 부분:

```bash
SMTP_URL=smtp://127.0.0.1:21025
MAIL_FROM=AI Template <no-reply@example.com>
FRONTEND_URL=http://localhost:3000
# Socket.IO 연결을 받을 브라우저 Origin(쉼표로 구분)
REALTIME_ALLOWED_ORIGINS=http://localhost:3000
# 브라우저가 보는 이 API의 주소. 소셜 로그인 제공자가 <API_URL>/api/v1/oauth/<제공자>/callback으로 돌아온다.
API_URL=http://localhost:8000
```

바꿀 내용:

```bash
SMTP_URL=smtp://127.0.0.1:21025
MAIL_FROM=AI Template <no-reply@example.com>
FRONTEND_URL=http://localhost:3000
# Socket.IO 연결을 받을 브라우저 Origin(스킴://호스트[:포트], 쉼표로 구분). 경로와 끝의 /는 떼고 호스트는 소문자로 읽는다.
# *와 ASCII가 아닌 호스트는 받지 않는다(국제화 도메인은 punycode로 적는다).
REALTIME_ALLOWED_ORIGINS=http://localhost:3000
# 브라우저가 보는 이 API의 주소. 소셜 로그인 제공자가 <API_URL>/api/v1/oauth/<제공자>/callback으로 돌아온다.
API_URL=http://localhost:8000
```

- [ ] **Step 7: 문서를 고친다**

`contract/mock/AGENTS.md`를 고친다.

찾을 부분:

```markdown
- 스케줄 잡이 없다. `modules/files/service.ts`의 `purgePending`은 떠 있는 프로세스가 부르지 않아 24시간이 지난 pending 업로드도 계속 사용자 쿼터를 차지한다. 만료된 세션과 토큰도 지우지 않는다(FastAPI는 각각 매일 03:00 UTC, 매시간 정각 잡으로 지운다).
- 공개 글 목록 첫 페이지를 캐시하지 않는다(FastAPI는 `posts/service.ts`가 60초 캐시한다). 그래서 저자 이름 변경처럼 다른 모듈이 일으킨 변화가 목에는 바로 보이고 FastAPI에는 최대 60초 늦게 보인다.
- 비밀번호의 짝 없는 서로게이트를 FastAPI는 surrogatepass로 인코딩해 해시하고, 목의 scrypt(`src/core/security.ts`)는 UTF-8로 인코딩하면서 U+FFFD로 대신한다. 그래서 U+FFFD가 든 비밀번호의 그 자리를 짝 없는 서로게이트로 바꿔 로그인하면 목은 통과하고 FastAPI는 401이다.
- `REALTIME_ALLOWED_ORIGINS`는 값마다 Origin으로 정규화하고 `*`나 URL이 아닌 값을 설정 오류로 거절한다. FastAPI는 원래 문자열을 그대로 비교해 `*`는 전부 허용으로 본다(값을 검증하지 않는다).
- 본문 인코딩이 다르다: JSON의 `NaN`·`Infinity`는 목에서 400이다(Python의 `json`은 받아들인다). CESU-8로 짝을 이룬 서로게이트 바이트, UTF-16·UTF-32 본문도 Python의 `json.loads`와 다르게 다룬다(`src/jsonapi/validation.ts`, `src/jsonapi/surrogates.ts`).
- snake_case 속성 이름을 FastAPI(`validate_by_name`)는 camelCase와 함께 받지만, 목은 스키마에 없는 속성으로 보고 조용히 버린다(`removeAdditional`). 그 속성이 필수면 422가 난다.
- 설정 검증이 FastAPI보다 빡빡하다: `OAUTH_REDIRECT_URIS`의 각 값은 http(s) 주소여야 하고 `SEED_ADMIN_EMAIL`은 이메일 형식이어야 한다. FastAPI는 값을 그대로 받는다(각각 CommaSeparated, 빈 문자열만 아니면 되는 문자열).
```

바꿀 내용:

```markdown
- 스케줄 잡이 없다. `modules/files/service.ts`의 `purgePending`은 떠 있는 프로세스가 부르지 않아 24시간이 지난 pending 업로드도 계속 사용자 쿼터를 차지한다. 만료된 세션과 토큰도 지우지 않는다(FastAPI는 각각 매일 03:00 UTC, 매시간 정각 잡으로 지운다).
- 공개 글 목록 첫 페이지를 캐시하지 않는다(FastAPI는 `posts/service.ts`가 60초 캐시한다). 그래서 저자 이름 변경처럼 다른 모듈이 일으킨 변화가 목에는 바로 보이고 FastAPI에는 최대 60초 늦게 보인다.
- 비밀번호의 짝 없는 서로게이트를 FastAPI는 surrogatepass로 인코딩해 해시하고, 목의 scrypt(`src/core/security.ts`)는 UTF-8로 인코딩하면서 U+FFFD로 대신한다. 그래서 U+FFFD가 든 비밀번호의 그 자리를 짝 없는 서로게이트로 바꿔 로그인하면 목은 통과하고 FastAPI는 401이다.
- `REALTIME_ALLOWED_ORIGINS`는 두 쪽 모두 값마다 Origin(스킴://호스트[:포트])으로 정규화하고 `*`와 http(s) 주소가 아닌 값을 설정 오류로 거절한다. 다만 목은 호스트를 WHATWG URL로 읽어 브라우저가 보낼 모양으로 바꿔 받고(ASCII가 아닌 호스트는 punycode로, `127.1`은 `127.0.0.1`로), FastAPI(`core/config.py`의 `Origins`)는 그렇게 바꿔야 하는 호스트를 설정 오류로 거절한다. 반대로 `xn--` 라벨이 올바른 punycode인지는 목만 본다(`http://xn--a.com`은 목에서 설정 오류, FastAPI에서는 어느 브라우저와도 맞지 않는 값).
- 본문 인코딩이 다르다: JSON의 `NaN`·`Infinity`는 목에서 400이다(Python의 `json`은 받아들인다). CESU-8로 짝을 이룬 서로게이트 바이트, UTF-16·UTF-32 본문도 Python의 `json.loads`와 다르게 다룬다(`src/jsonapi/validation.ts`, `src/jsonapi/surrogates.ts`).
- snake_case 속성 이름을 FastAPI(`validate_by_name`)는 camelCase와 함께 받지만, 목은 스키마에 없는 속성으로 보고 조용히 버린다(`removeAdditional`). 그 속성이 필수면 422가 난다.
- 설정 검증이 FastAPI보다 빡빡하다: `OAUTH_REDIRECT_URIS`의 각 값은 http(s) 주소여야 하고 `SEED_ADMIN_EMAIL`은 이메일 형식이어야 한다. FastAPI는 값을 그대로 받는다(각각 CommaSeparated, 빈 문자열만 아니면 되는 문자열).
```

- [ ] **Step 8: 테스트가 통과하는지 확인한다**

Run(`contract/mock`에서): `pnpm exec vitest run test/realtime-subscribe.test.ts`

Expected: 통과한다.

```text
Test Files 1 passed (1)
Tests 9 passed (9)
```

Run(`templates/fastapi`에서): `uv run pytest -q src/app/core/tests/test_config.py src/app/modules/realtime/tests/test_gateway.py`

Expected: 통과한다.

```text
35 passed in
```

Run(저장소 루트에서): `pnpm conformance fastapi test/flows/realtime.test.ts`

Expected: 실시간과 설정을 바꾸므로 템플릿의 `uv run poe test:e2e`도 돌린다. 개발 `.env`의 `REALTIME_ALLOWED_ORIGINS`가 새 규칙에 맞지 않으면(예: `*`) 앱이 설정 오류로 시작하지 않는다(`.env.example`과 compose의 값은 맞다).

```text
Test Files 1 passed (1)
Tests 9 passed (9)
```

Run(저장소 루트에서): `pnpm conformance mock test/flows/realtime.test.ts`

Expected: 실시간과 설정을 바꾸므로 템플릿의 `uv run poe test:e2e`도 돌린다. 개발 `.env`의 `REALTIME_ALLOWED_ORIGINS`가 새 규칙에 맞지 않으면(예: `*`) 앱이 설정 오류로 시작하지 않는다(`.env.example`과 compose의 값은 맞다).

```text
Test Files 1 passed (1)
Tests 9 passed (9)
```

- [ ] **Step 9: 검사를 돌린다**

Run(`templates/fastapi`에서): `uv run poe check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 건너뛴 단계가 있으면 `.cache/check`를 지우고 다시 돌린다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄

Run(저장소 루트에서): `pnpm spec-compare contract/openapi.yaml templates/fastapi/openapi.json`

Expected: 차이 없이 끝난다(종료 코드 0).

Run(저장소 루트에서): `pnpm conformance fastapi`

Expected: 마지막에 `Tests  94 passed (94)`. 끝나면 인프라가 내려가므로 `templates/fastapi`에서 `docker compose up -d --wait`로 다시 올린다.

Run(저장소 루트에서): `pnpm conformance mock`

Expected: 마지막에 `Tests  94 passed (94)`.

Run(`templates/fastapi`에서): `uv run poe test:e2e`

Expected: `12 passed`

- [ ] **Step 10: 커밋한다**

```bash
git add \
  contract/conformance/test/flows/realtime.test.ts \
  contract/conformance/test/flows/sockets.ts \
  contract/mock/AGENTS.md \
  contract/mock/src/config.ts \
  contract/mock/src/modules/realtime/gateway.ts \
  contract/mock/test/realtime-subscribe.test.ts \
  templates/fastapi/.env.example \
  templates/fastapi/src/app/core/config.py \
  templates/fastapi/src/app/core/tests/test_config.py \
  templates/fastapi/src/app/modules/realtime/gateway.py \
  templates/fastapi/src/app/modules/realtime/tests/test_gateway.py \
  templates/fastapi/src/app/tests/sockets.py
git commit -m "fix(fastapi): normalize realtime origins and answer multi-payload subscribes"
```


### Task 9: 보정을 설계, 규약, 템플릿 문서에 기록한다

Task 1~8의 보정을 설계, 규약, 템플릿 문서에 적는다. 조사의 "스펙 영향" 목록에서 시작하되, 문장은 모두 지금 코드를 읽어 확인하고 코드와 다르면 코드를 따른다.

- FastAPI 설계(`2026-09-26-fastapi-template-design.md`): 머리말의 상태, §5.2(리다이렉트의 406, 응답의 서로게이트 이스케이프, 모든 401의 challenge, pointer, strict 정수, 짝 없는 서로게이트의 규칙), §6.1(인증기는 `revoked_at`과 `expires_at`을 본다, 만료된 세션과 `revokedCount`, 비밀번호의 surrogatepass), §6.3(attributes가 없거나 빈 PATCH도 고치기 전을 검사한다), §6.8(Origin 정규화, 페이로드 하나, 폐기한 세션이 없어도 재검사, 끝난 세션에 만료), §7 표의 "(보정)" 세 줄, §11(구조 비교의 상태 집합), §12.1의 "보정" 묶음.
- 보강 설계 §7.1(H12): 여러 세션을 폐기하는 요청은 `session.revoked` 없이도 재검사한다, 세션이 끝났다는 것은 폐기나 만료다, 이벤트 없이 재검사하면 알림 없이 끊긴다. 조사가 적은 §3.4에는 해당 문장이 없다.
- web 설계: 머리말(보정 완료, 다음 단계는 W2), §8.3과 §8.9(보정으로 같아진 경계와 남은 경계 셋, U+FFFD 해시, Origin 차이), §12.1의 항목마다 **해결:**과 새로 찾은 `users/service/management.py` 항목.
- `docs/conventions/jsonapi.md`(NestJS도 따를 백엔드 공통 규칙): 리다이렉트의 406, 짝 없는 서로게이트의 공통 규칙(제약 있는 문자열은 형식 오류, 제약 없는 문자열은 받아서 비교, 응답은 `\uXXXX`, 저장하는 문자열에는 제약), 정수 규칙, pointer는 실제 위치, 401은 늘 `WWW-Authenticate`, 실시간의 페이로드 하나·재검사·Origin 형식. `docs/conventions/error-codes.md`는 바꿀 문장이 없다.
- 템플릿 문서: `docs/architecture.md`(인증기, 에러 응답을 만드는 한 곳, 정수·문자열 규칙, Origin, 구독, 재검사), `docs/recipes/endpoint.md`의 새 "## 규칙" 절(정수는 `Int32`·`Int64`, DB에 저장하는 문자열에는 길이 제약, 검증기로 길이를 세는 필드), `docs/recipes/module.md`, 템플릿 `AGENTS.md`, `src/app/core/AGENTS.md`(`security.py`, `config.py`, `jsonapi/`), `.env.example` 주석(`http(s)://`로 좁힌다).
- 목 `AGENTS.md`의 "FastAPI와 다른 점": Task 3·4·8이 고친 항목은 두고, 틀린 셋(잡 주기의 짝, `posts/service.py` 오타, 설정 검증이 빡빡하다는 범위)을 고친다. 지우지 않은 만료 세션도 두 쪽 모두 끝난 세션으로 본다고 더한다.
- `scripts/src/spec-compare/cli.ts`와 `compare.ts`의 머리 주석에 응답 상태와 실시간 선언의 비교를 적는다(동작은 그대로다).
- 실패 확인: 없다. 문서와 주석만 바꾸는 태스크라 새 테스트가 없다. 대신 `pnpm check`(지침과 포맷), 템플릿 `uv run poe check`(레시피의 절 순서 검사 포함), 구조 비교가 통과하는지 본다.

**Files:**
- Modify: `contract/mock/AGENTS.md`, `docs/conventions/jsonapi.md`, `docs/superpowers/specs/2026-09-26-fastapi-template-design.md`, `docs/superpowers/specs/2026-09-29-fastapi-hardening-design.md`, `docs/superpowers/specs/2026-09-30-nextjs-web-design.md`, `scripts/src/spec-compare/cli.ts`, `scripts/src/spec-compare/compare.ts`, `templates/fastapi/.env.example`, `templates/fastapi/AGENTS.md`, `templates/fastapi/docs/architecture.md`, `templates/fastapi/docs/recipes/endpoint.md`, `templates/fastapi/docs/recipes/module.md`, `templates/fastapi/src/app/core/AGENTS.md`

**Interfaces:**
- Consumes: Task 1~8의 코드와 동작(문장마다 지금 코드로 확인한다). 조사의 "스펙 영향" 목록
- Produces:
  - FastAPI 설계: 머리말의 상태, §5.2, §6.1, §6.3, §6.8, §7 표의 "(보정)" 세 줄, §11의 구조 비교, §12.1의 "보정(2026-09-30)" 묶음
  - 보강 설계 §7.1(H12)의 재검사 문장. web 설계의 머리말, §8.3, §8.9, §12.1(항목마다 **해결:**, 새 항목 `users/service/management.py`)
  - `docs/conventions/jsonapi.md`: 리다이렉트의 406, 짝 없는 서로게이트와 정수의 규칙, pointer, 401의 `WWW-Authenticate`, 실시간의 페이로드·재검사·Origin
  - 템플릿: `docs/architecture.md`, `docs/recipes/endpoint.md`의 "## 규칙"(레시피 절 순서는 `언제, 명령, 고칠 파일, 규칙, 확인`), `docs/recipes/module.md`, `AGENTS.md`, `src/app/core/AGENTS.md`, `.env.example`의 주석
  - 목 `contract/mock/AGENTS.md`의 "FastAPI와 다른 점"(세 항목을 고치고 만료 세션 한 문장을 더한다)
  - `scripts/src/spec-compare/cli.ts`와 `compare.ts`의 머리 주석(동작 변경 없음)

- [ ] **Step 1: FastAPI core를 고친다**

`templates/fastapi/src/app/core/AGENTS.md` 전체를 다음으로 바꾼다.

```markdown
# src/app/core

도메인을 모르는 기반이다. 모든 모듈이 쓴다.

- `config.py`: 설정 스키마 `Settings` 하나. 값은 환경 변수와 `.env`에서 온다. 비밀(키, 비밀번호, 계정이 든 URL)은 `SecretStr`로 받아 쓰는 곳에서만 `.get_secret_value()`로 꺼낸다. `load_settings()`는 틀린 값을 변수마다 한 줄씩 알리고 멈춘다. 운영(`APP_ENV=production`)에서는 앱이 스스로 정하는 비밀(`JWT_SECRET`, `IDENTIFIER_HASH_SECRET`, `SEED_ADMIN_PASSWORD`)이 `.env.example`의 예시 값이면 시작하지 않는다. `REALTIME_ALLOWED_ORIGINS`는 값마다 브라우저가 보내는 Origin으로 바꾸고 `*`는 거절한다(`Origins`).
- `logging.py`: structlog 설정과 traceId 미들웨어.
- `db.py`: 비동기 엔진, 세션 팩토리, 모델의 기반 `Base`(제약 이름 규칙 포함), 요청 세션 `SessionDep`, 모델 시각의 기본값 `utc_now`.
- `redis.py`: Valkey 클라이언트와 요청 의존성 `RedisDep`.
- `storage.py`: 스토리지(`Storage`, 요청에서는 `StorageDep`). presigned 업로드·다운로드 URL(SigV4라 선언한 타입과 크기만 올라간다), 크기 확인(HEAD), 삭제, 버킷 확인. 네트워크 호출은 스레드에서 돈다.
- `cache.py`: cache-aside 도우미(`Cache(redis, namespace, shape)`). `get_or_set`으로 만들거나 꺼내고, 원본이 바뀌면 commit한 뒤 `clear`로 세대를 올려 지운다. `shape`(모양)은 캐시하는 문서 모델의 JSON 스키마 해시(`schema_shape`)로, 응답 모양이 바뀐 배포가 옛 모양의 값을 읽지 않게 한다. Valkey에 닿지 못하면 캐시 없이 만든다. 예시는 posts의 공개 목록 첫 페이지다.
- `jsonvalue.py`: JSON 값 좁히기(`is_object`, `is_array`).
- `security.py`: 비밀번호 해시(Argon2id. 비밀번호는 `surrogatepass`로 인코딩한 바이트로 해시하고 검증해, 짝 없는 서로게이트도 예외가 아니라 틀린 비밀번호다), access token(JWT) 발급과 검증, 1회용 토큰과 SHA-256(`digest`, 무작위 토큰용). 이메일처럼 추측할 수 있는 식별자는 `identifier_hash`(설정의 키로 HMAC-SHA256)로 가린다. async 코드는 비밀번호를 스레드에서 도는 `hash_password_async`, `check_password_async`로 다룬다.
- `permissions.py`: 권한(`Permission`)과 레지스트리(`PermissionRegistry`). 권한은 모듈이 내보내고 `app.modules.registry`가 모은다.
- `clients.py`: 요청을 보낸 쪽(IP, User-Agent). `ClientDep`으로 받는다.
- `ratelimit.py`: 레이트 리밋(Valkey 고정 윈도). 엄격한 한도는 service가 `enforce(redis, Limit(...), 대상)`로 걸고, IP별 전역 한도는 미들웨어가 건다.
- `jobs.py`: 잡 선언(`Job`), 등록(`register`), 잡의 문맥(`JobContext`, `JOB_CONTEXT`), 보내기(`JobQueue`, `JobsDep`).
- `realtime.py`: Socket.IO 서버(`create_realtime`, `/socket.io`의 `RealtimeEndpoint`), 발행기(api는 `ServerPublisher`, worker와 scheduler는 쓰기 전용 `RedisPublisher`, 테스트는 `RecordingPublisher`), commit 뒤에 이벤트를 보내는 세션(`EventSession`, `queue`), 채널·이벤트·메시지 선언(`Channel`, `EventSpec`, `MessageSpec`)과 그 OpenAPI 확장(`realtime_openapi`).
- `realtime_pubsub.py`: 실시간의 Valkey pub/sub 도우미. python-socketio 매니저가 Valkey 클라이언트를 하나만 만들어 다시 쓰고 닫을 때 닫게 한다(`TrackedRedisManager`). 연결 재검사를 인스턴스 사이에 알리는 제어 채널(`ControlChannel`)을 둔다. 모듈은 `app.core.realtime.queue_recheck`로 넣는다.
- `telemetry.py`: OpenTelemetry. 기본으로 꺼 두고 `OTEL_ENABLED=true`면 트레이스를 OTLP로 보낸다. 요청, SQLAlchemy·psycopg, Valkey, httpx, Taskiq를 계측하고, 수동 span은 `tracer(이름)`으로 만든다.
- `mail.py`: 메일 템플릿 렌더링(`MailTemplates`, 로케일이 없으면 ko)과 SMTP 발송(`send`). 메일은 모듈의 잡이 id를 받아 잡 안에서 만들고 보낸다(예: `auth/jobs.py`).
- `audit.py`: 감사 로그 테이블(`AuditLog`)과 기록(`record_audit`), 계약의 행위·대상 어휘(`AuditLogAction`, `AuditLogTargetType`). 여러 모듈이 기록하고 읽기 API(audit_logs 모듈)가 users를 포함하므로 core에 둔다.
- `access.py`: 인증과 권한 검사. 인증기와 레지스트리는 `install_access`로 앱에 건다. 라우트 선언의 `auth`, `permission`을 라우터가 강제하고, 엔드포인트는 `PrincipalDep`, `OptionalPrincipalDep`으로 주체를 받는다. 되돌릴 수 없는 동작은 `require_recent_login(principal, now)`으로 최근 로그인(10분 안, `RECENT_LOGIN`)을 요구하고, 아니면 401 `auth.reauthentication_required`다.
- `jsonapi/`: JSON:API 공통 계층(문서 모델, 에러, 협상, 라우트 선언, 쿼리 파서, 렌더링, OpenAPI 후처리). 에러 응답은 모두 `errors.py`의 `error_response`가 만들고 401에는 늘 `WWW-Authenticate`를 담는다. 응답 클래스(`media.py`의 `JsonApiResponse`)는 짝 없는 서로게이트를 `\uXXXX`로 이스케이프한다. 쓰는 법은 `docs/architecture.md`, 예시는 `jsonapi/tests/sample.py`.

## 규칙

- `app.modules`를 import하지 않는다(import-linter 계약 `core-knows-no-modules`). 모듈의 기능을 불러야 하면 core에 등록 지점(콜백, 레지스트리)을 두고 모듈이 등록한다.
- 도메인 용어(사용자, 글, 역할 등)를 넣지 않는다. 도메인은 `src/app/modules/`에 둔다.
- 설정 필드를 더하거나 빼면 `.env.example`도 같이 고친다(하네스 검사 `env-example`).
- boto3 호출은 블로킹이다. 요청을 처리하는 코드에서는 `asyncio.to_thread`로 넘긴다.
- 테스트는 `core/tests/`와 `core/jsonapi/tests/`에 둔다. core의 테스트는 `app.main`을 import하지 않는다. `app.main`은 모듈을 거쳐 `app.modules`를 import하게 되고, import-linter는 간접 import도 센다.
```

- [ ] **Step 2: 저장소 스크립트를 고친다**

`scripts/src/spec-compare/cli.ts`를 고친다.

찾을 부분:

```ts

/**
 * 사용법: pnpm spec-compare [--subset] <계약 파일> <구현 스펙 파일>
 * 이름·경로 비교와 breaking 검사(oasdiff)를 모두 돌린다. --subset은 구현에 있는 operation만 비교한다.
 */
const args = process.argv.slice(2);
const subset = args.includes("--subset");
```

바꿀 내용:

```ts

/**
 * 사용법: pnpm spec-compare [--subset] <계약 파일> <구현 스펙 파일>
 * 이름·경로·operation별 응답 상태·실시간 선언 비교(compare.ts)와 breaking 검사(oasdiff)를 모두 돌린다.
 * --subset은 구현에 있는 operation만 비교한다.
 */
const args = process.argv.slice(2);
const subset = args.includes("--subset");
```

`scripts/src/spec-compare/compare.ts`를 고친다.

찾을 부분:

```ts
/** 백엔드가 내보낸 OpenAPI가 계약과 같은 이름·경로·응답 상태를 쓰는지 비교한다. 구조 호환은 breaking.ts(oasdiff)가 본다. */

export interface OpenApiLike {
  readonly paths?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
```

바꿀 내용:

```ts
/** 백엔드가 내보낸 OpenAPI가 계약과 같은 이름·경로·응답 상태·실시간 선언을 쓰는지 비교한다. 구조 호환은 breaking.ts(oasdiff)가 본다. */

export interface OpenApiLike {
  readonly paths?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
```

- [ ] **Step 3: FastAPI 템플릿의 설정 파일을 고친다**

`templates/fastapi/.env.example`를 고친다.

찾을 부분:

```bash
SMTP_URL=smtp://127.0.0.1:21025
MAIL_FROM=AI Template <no-reply@example.com>
FRONTEND_URL=http://localhost:3000
# Socket.IO 연결을 받을 브라우저 Origin(스킴://호스트[:포트], 쉼표로 구분). 경로와 끝의 /는 떼고 호스트는 소문자로 읽는다.
# *와 ASCII가 아닌 호스트는 받지 않는다(국제화 도메인은 punycode로 적는다).
REALTIME_ALLOWED_ORIGINS=http://localhost:3000
# 브라우저가 보는 이 API의 주소. 소셜 로그인 제공자가 <API_URL>/api/v1/oauth/<제공자>/callback으로 돌아온다.
```

바꿀 내용:

```bash
SMTP_URL=smtp://127.0.0.1:21025
MAIL_FROM=AI Template <no-reply@example.com>
FRONTEND_URL=http://localhost:3000
# Socket.IO 연결을 받을 브라우저 Origin(http(s)://호스트[:포트], 쉼표로 구분). 경로와 끝의 /는 떼고 호스트는 소문자로 읽는다.
# *와 ASCII가 아닌 호스트는 받지 않는다(국제화 도메인은 punycode로 적는다).
REALTIME_ALLOWED_ORIGINS=http://localhost:3000
# 브라우저가 보는 이 API의 주소. 소셜 로그인 제공자가 <API_URL>/api/v1/oauth/<제공자>/callback으로 돌아온다.
```

- [ ] **Step 4: 문서를 고친다**

`contract/mock/AGENTS.md`를 고친다.

찾을 부분:

```markdown
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
```

바꿀 내용:

```markdown
- access token은 JWT가 아닌 불투명한 문자열이다. 만료는 세션 응답의 `accessTokenExpiresAt`, `refreshTokenExpiresAt`으로 본다.
- 메일은 요청 안에서 바로 보관함에 들어가고(FastAPI는 요청 뒤 잡으로 보낸다) 텍스트 본문만 있다.
- 비밀번호 해시(scrypt), 소셜 로그인 제공자(가짜 OAuth 서버), 스토리지(메모리 버킷)는 개발용이다. 재시작하면 옛 presigned URL은 맞지 않는다.
- 스케줄 잡이 없다. `modules/files/service.ts`의 `purgePending`은 떠 있는 프로세스가 부르지 않아 24시간이 지난 pending 업로드도 계속 사용자 쿼터를 차지한다. 만료된 세션과 토큰도 지우지 않는다(FastAPI는 pending 파일을 매시간 정각에, 만료된 토큰과 끝난 세션을 매일 03:00 UTC에 잡으로 지운다). 지우지 않은 만료 세션도 두 쪽 모두 끝난 세션으로 본다.
- 공개 글 목록 첫 페이지를 캐시하지 않는다(FastAPI는 `posts/service.py`가 60초 캐시한다). 그래서 저자 이름 변경처럼 다른 모듈이 일으킨 변화가 목에는 바로 보이고 FastAPI에는 최대 60초 늦게 보인다.
- 비밀번호의 짝 없는 서로게이트를 FastAPI는 surrogatepass로 인코딩해 해시하고, 목의 scrypt(`src/core/security.ts`)는 UTF-8로 인코딩하면서 U+FFFD로 대신한다. 그래서 U+FFFD가 든 비밀번호의 그 자리를 짝 없는 서로게이트로 바꿔 로그인하면 목은 통과하고 FastAPI는 401이다.
- `REALTIME_ALLOWED_ORIGINS`는 두 쪽 모두 값마다 Origin(스킴://호스트[:포트])으로 정규화하고 `*`와 http(s) 주소가 아닌 값을 설정 오류로 거절한다. 다만 목은 호스트를 WHATWG URL로 읽어 브라우저가 보낼 모양으로 바꿔 받고(ASCII가 아닌 호스트는 punycode로, `127.1`은 `127.0.0.1`로), FastAPI(`core/config.py`의 `Origins`)는 그렇게 바꿔야 하는 호스트를 설정 오류로 거절한다. 반대로 `xn--` 라벨이 올바른 punycode인지는 목만 본다(`http://xn--a.com`은 목에서 설정 오류, FastAPI에서는 어느 브라우저와도 맞지 않는 값).
- 본문 인코딩이 다르다: JSON의 `NaN`·`Infinity`는 목에서 400이다(Python의 `json`은 받아들인다). CESU-8로 짝을 이룬 서로게이트 바이트, UTF-16·UTF-32 본문도 Python의 `json.loads`와 다르게 다룬다(`src/jsonapi/validation.ts`, `src/jsonapi/surrogates.ts`).
- snake_case 속성 이름을 FastAPI(`validate_by_name`)는 camelCase와 함께 받지만, 목은 스키마에 없는 속성으로 보고 조용히 버린다(`removeAdditional`). 그 속성이 필수면 422가 난다.
- 두 설정은 목의 검증이 FastAPI보다 빡빡하다: `OAUTH_REDIRECT_URIS`의 각 값은 http(s) 주소여야 하고 `SEED_ADMIN_EMAIL`은 이메일 형식이어야 한다. FastAPI는 값을 그대로 받는다(각각 CommaSeparated, 빈 문자열만 아니면 되는 문자열).
- 끝에 슬래시가 붙은 경로는 목에서 404다(FastAPI/Starlette는 307로 리다이렉트한다).
- GET만 선언한 라우트에 HEAD로 요청하면 목은 200이다(Hono가 GET 처리기로 넘긴다). FastAPI는 404다.
- 이메일 형식은 흔한 경우만 email-validator와 같다(`src/jsonapi/email.ts`).
```

`docs/conventions/jsonapi.md`를 고친다.

(1) 찾을 부분:

```markdown

- `/api/v1` 아래의 모든 요청·응답 본문은 JSON:API 문서다. 미디어 타입은 `application/vnd.api+json` 하나만 쓴다.
- 예외는 두 가지다.
  - OAuth 리다이렉트(`/api/v1/oauth/{provider}/authorize`, `/callback`): 본문 없이 302로 응답한다. 허용하지 않은 `redirectUri`, 없거나 형식이 틀린 `codeChallenge`, 없거나 만료된 `state`는 400 `jsonapi.invalid_query`(`source.parameter`)다. `POST /sessions`의 `oauthCode` grant는 `codeVerifier`가 있어야 한다. 콜백은 제공자가 덧붙이는 쿼리 파라미터를 받아들인다.
  - 헬스체크(`/health/live`, `/health/ready`): API 밖에 있고 `application/json`으로 응답한다.
- 확장(Atomic Operations 등)과 프로필은 쓰지 않는다.

```

바꿀 내용:

```markdown

- `/api/v1` 아래의 모든 요청·응답 본문은 JSON:API 문서다. 미디어 타입은 `application/vnd.api+json` 하나만 쓴다.
- 예외는 두 가지다.
  - OAuth 리다이렉트(`/api/v1/oauth/{provider}/authorize`, `/callback`): 본문 없이 302로 응답한다. `Accept` 협상은 다른 요청과 같아서 406 `jsonapi.not_acceptable`이 있다(본문이 없어 415는 없다). 허용하지 않은 `redirectUri`, 없거나 형식이 틀린 `codeChallenge`, 없거나 만료된 `state`는 400 `jsonapi.invalid_query`(`source.parameter`)다. `POST /sessions`의 `oauthCode` grant는 `codeVerifier`가 있어야 한다. 콜백은 제공자가 덧붙이는 쿼리 파라미터를 받아들인다.
  - 헬스체크(`/health/live`, `/health/ready`): API 밖에 있고 `application/json`으로 응답한다.
- 확장(Atomic Operations 등)과 프로필은 쓰지 않는다.

```

(2) 찾을 부분:

```markdown
- `id`는 UUIDv7 문자열이다. 권한(`permissions`)만 권한 코드를 id로 쓴다.
- 속성과 관계 이름은 camelCase다.
- 문자열의 `maxLength`(계약과 각 백엔드 스키마)는 유니코드 코드 포인트 수다(JSON Schema, Pydantic과 같다). JavaScript의 `.length`(UTF-16 코드 유닛 수)와 다르므로, NestJS와 목 서버는 코드 포인트 수로 길이를 센다.
- 관계 전용 엔드포인트(`/relationships/...`)는 두지 않는다. 관계는 리소스를 `PATCH`해서 바꾸고, 관계의 `self` 링크도 내보내지 않는다.
- 생성은 201과 문서, 삭제는 204로 응답한다. 비동기로 처리하는 생성(인증 메일 재발송, 비밀번호 재설정 요청)은 계정이 있는지 드러내지 않도록 항상 202다.
- CRUD가 아닌 동작도 리소스로 표현한다. 예: 로그인은 `POST /sessions`, 글 발행은 `PATCH /posts/{id}`로 `status: "published"`.
```

바꿀 내용:

```markdown
- `id`는 UUIDv7 문자열이다. 권한(`permissions`)만 권한 코드를 id로 쓴다.
- 속성과 관계 이름은 camelCase다.
- 문자열의 `maxLength`(계약과 각 백엔드 스키마)는 유니코드 코드 포인트 수다(JSON Schema, Pydantic과 같다). JavaScript의 `.length`(UTF-16 코드 유닛 수)와 다르므로, NestJS와 목 서버는 코드 포인트 수로 길이를 센다.
- 요청 문자열에는 짝 없는 UTF-16 서로게이트(JSON의 `\ud800` 같은 이스케이프)가 올 수 있다. 500을 내지 않고 이렇게 다룬다.
  - 제약(길이, 패턴, 선택지, 날짜·UUID·이메일 같은 형식)이 있는 문자열은 형식 오류다. 길이 같은 다른 검사보다 먼저 본다. 필드는 422 `validation.invalid_format`, `data.type`은 400 `jsonapi.invalid_document`다.
  - 제약 없는 문자열(토큰, 비밀번호, id)은 받아서 비교한다. 맞지 않으면 틀린 값과 같은 에러다(예: 비밀번호는 401 `auth.invalid_credentials`, 경로와 다른 `data.id`는 409, 없는 관계는 404).
  - 그런 값을 응답에 담으면(입력을 그대로 담은 에러 `detail`) `\uXXXX`(소문자 16진)로 이스케이프한다. JavaScript `JSON.stringify`와 같은 바이트다.
  - 그래서 계약에서 저장하는 문자열에는 제약(`maxLength` 등)을 두고, 제약 없는 문자열은 비교에만 쓴다.
- 정수(`type: integer`) 자리에는 JSON 숫자로 쓴 정수만 받는다. 숫자 문자열(`"10"`)과 불리언은 422 `validation.invalid_format`이다. 소수점이나 지수로 쓴 정수(`10.0`, `1e3`)는 FastAPI가 422로 거절하고 목은 받으므로, 클라이언트는 정수 표기로 보낸다.
- 관계 전용 엔드포인트(`/relationships/...`)는 두지 않는다. 관계는 리소스를 `PATCH`해서 바꾸고, 관계의 `self` 링크도 내보내지 않는다.
- 생성은 201과 문서, 삭제는 204로 응답한다. 비동기로 처리하는 생성(인증 메일 재발송, 비밀번호 재설정 요청)은 계정이 있는지 드러내지 않도록 항상 202다.
- CRUD가 아닌 동작도 리소스로 표현한다. 예: 로그인은 `POST /sessions`, 글 발행은 `PATCH /posts/{id}`로 `status: "published"`.
```

(3) 찾을 부분:

```markdown
- 에러 응답은 `{ "errors": [...], "meta": { "traceId": "..." } }`이다.
- 에러 객체는 `status`(문자열), `code`, `title`, `detail`, `source.pointer` 또는 `source.parameter`, `meta.params`를 담는다.
- `source.pointer`는 RFC 6901 JSON Pointer다. 요청 문서 전체는 빈 문자열 `""`이다(`"/"`는 이름이 빈 문자열인 멤버를 가리킨다).
- 필드 검증 오류는 필드마다 에러 객체 하나를 만들어 422로 응답한다.
- JSON:API 1.1이 반드시(MUST) 쓰라는 상태를 따른다.
  - 요청 본문의 `type`이 엔드포인트의 리소스와 다르면 409 `resource.conflict`다(POST와 PATCH 모두). PATCH는 `id`가 경로의 리소스와 달라도 409다. `/api/v1/me`는 로그인한 사용자의 id가 경로의 리소스다.
  - 생성 요청(POST)에 클라이언트가 만든 `id`가 있으면 403 `permission.denied`다. 클라이언트가 만든 id는 받지 않는다.
```

바꿀 내용:

```markdown
- 에러 응답은 `{ "errors": [...], "meta": { "traceId": "..." } }`이다.
- 에러 객체는 `status`(문자열), `code`, `title`, `detail`, `source.pointer` 또는 `source.parameter`, `meta.params`를 담는다.
- `source.pointer`는 RFC 6901 JSON Pointer다. 요청 문서 전체는 빈 문자열 `""`이다(`"/"`는 이름이 빈 문자열인 멤버를 가리킨다).
- 필드 검증 오류는 필드마다 에러 객체 하나를 만들어 422로 응답한다. `source.pointer`는 본문에서 그 값의 실제 위치다. 판별 유니온(`SessionGrant`)의 필드 오류도 판별자 값을 경로에 넣지 않는다(password grant의 이메일 오류는 `/data/attributes/email`).
- 401 응답은 늘 `WWW-Authenticate`를 담는다(RFC 9110 §15.5.2). 값은 `Bearer`이고, 재인증 요구(`auth.reauthentication_required`)만 RFC 9470의 step-up challenge(`Bearer error="insufficient_user_authentication", max_age=600`)다. 본문의 자격 증명이 틀린 401(로그인, refresh token, 소셜 로그인 코드, 비밀번호 변경)도 같다.
- JSON:API 1.1이 반드시(MUST) 쓰라는 상태를 따른다.
  - 요청 본문의 `type`이 엔드포인트의 리소스와 다르면 409 `resource.conflict`다(POST와 PATCH 모두). PATCH는 `id`가 경로의 리소스와 달라도 409다. `/api/v1/me`는 로그인한 사용자의 id가 경로의 리소스다.
  - 생성 요청(POST)에 클라이언트가 만든 `id`가 있으면 403 `permission.denied`다. 클라이언트가 만든 id는 받지 않는다.
```

(4) 찾을 부분:

```markdown
- `x-realtime-events`의 `rooms`는 그 이벤트를 늘 받는 룸이다. `user:{userId}`와 `user:{authorId}`는 해당 사용자(글 이벤트는 작성자)의 `user:{id}` 룸이다. `conditionalRooms`는 조건이 맞을 때만 받는 룸이고 `{ room, when }` 꼴이다. `when`은 `published`(바뀐 뒤 글이 발행 상태)와 `wasPublished`(지우기 전 글이 발행 상태였음) 둘 중 하나다.
- 발행된 글을 초안으로 돌리면 공개 채널(`posts`)은 `post.unpublished`를 받는다. 페이로드는 리소스 식별자뿐이다(초안의 내용이 공개 채널로 나가지 않는다). `posts:all`과 작성자 룸은 `post.updated`(전체 문서)를 받는다.
- 페이로드도 JSON:API 문서이고 `components.schemas`에 있다. 그래서 프론트엔드는 같은 생성 과정으로 이벤트 타입을 얻는다.
- 클라이언트가 보내는 메시지는 `x-realtime-messages`에 적는다. `subscribe`와 `unsubscribe`는 페이로드 `RealtimeSubscription`(`{ channel }`)을 보내고, 서버는 ack `RealtimeAck`로 답한다. 성공이면 `{ ok: true }`, 실패면 `{ ok: false, error }`이고 `error`는 에러 객체다(권한 없음 403 `permission.denied`, 모르는 채널이나 틀린 페이로드 422 `validation.invalid_choice`, `source.pointer`는 `/channel`).
- 채널 권한은 구독할 때 본다. 세션이 폐기되거나(`session.revoked`) 역할이나 상태가 바뀌면(`me.updated`의 `changed`에 `roles`나 `status`) 서버가 그 사용자의 연결을 다시 검사해, 세션이 끝났거나 구독한 채널의 권한을 잃은 연결을 끊는다. 끊긴 클라이언트는 새 티켓으로 다시 붙는다. 세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독 ack가 `permission.denied`다.
- 연결: 전송은 WebSocket만 받는다. 브라우저 연결의 Origin은 허용 목록으로 본다. 로그인한 연결은 `auth.ticket`에 티켓(`POST /realtime-tickets`, 30초, 1회용)을 넣는다. 티켓이 틀렸거나 만료됐거나 세션이 끝났으면 연결을 거부하고, `connect_error`의 message는 `auth.token_invalid`, data는 에러 객체(`status` "401")다. 티켓이 없으면 익명 연결이다.
- 이벤트는 쓰기가 commit된 뒤에 나간다. 한 연결이 여러 룸에 있어도 한 번 받는다. `session.revoked`는 그 사용자의 모든 연결이 받으므로(페이로드에 세션 id가 없다) 클라이언트는 자기 세션이 살아 있는지 확인한다. `me.updated`의 `changed`는 `roles`(역할을 받거나 잃음, 가진 역할의 권한이 바뀌거나 역할이 지워짐), `status`(관리자가 상태를 바꿈), `profile`(이름, 로케일, 아바타)이다.

## 메일 링크
```

바꿀 내용:

```markdown
- `x-realtime-events`의 `rooms`는 그 이벤트를 늘 받는 룸이다. `user:{userId}`와 `user:{authorId}`는 해당 사용자(글 이벤트는 작성자)의 `user:{id}` 룸이다. `conditionalRooms`는 조건이 맞을 때만 받는 룸이고 `{ room, when }` 꼴이다. `when`은 `published`(바뀐 뒤 글이 발행 상태)와 `wasPublished`(지우기 전 글이 발행 상태였음) 둘 중 하나다.
- 발행된 글을 초안으로 돌리면 공개 채널(`posts`)은 `post.unpublished`를 받는다. 페이로드는 리소스 식별자뿐이다(초안의 내용이 공개 채널로 나가지 않는다). `posts:all`과 작성자 룸은 `post.updated`(전체 문서)를 받는다.
- 페이로드도 JSON:API 문서이고 `components.schemas`에 있다. 그래서 프론트엔드는 같은 생성 과정으로 이벤트 타입을 얻는다.
- 클라이언트가 보내는 메시지는 `x-realtime-messages`에 적는다. `subscribe`와 `unsubscribe`는 페이로드 `RealtimeSubscription`(`{ channel }`) 하나를 보내고, 서버는 ack `RealtimeAck`로 답한다. 성공이면 `{ ok: true }`, 실패면 `{ ok: false, error }`이고 `error`는 에러 객체다(권한 없음 403 `permission.denied`, 모르는 채널이나 틀린 페이로드 422 `validation.invalid_choice`, `source.pointer`는 `/channel`). 페이로드가 없거나 둘 이상이어도 틀린 페이로드다. 서버는 이때도 ack로 답한다.
- 채널 권한은 구독할 때 본다. 세션이 폐기되거나(`session.revoked`) 역할이나 상태가 바뀌면(`me.updated`의 `changed`에 `roles`나 `status`) 서버가 그 사용자의 연결을 다시 검사해, 세션이 끝났거나(폐기, 만료) 구독한 채널의 권한을 잃은 연결을 끊는다. 여러 세션을 폐기하는 요청(다른 기기·전체 로그아웃, 비밀번호 변경·재설정, 계정 비활성화·탈퇴)은 폐기한 세션이 없어 `session.revoked`를 보내지 않아도 다시 검사한다. 만료되기 전에 붙은 연결이 남아 있을 수 있기 때문이다. 끊긴 클라이언트는 새 티켓으로 다시 붙는다. 세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독 ack가 `permission.denied`다.
- 연결: 전송은 WebSocket만 받는다. 브라우저 연결의 Origin은 허용 목록으로 본다. 허용 목록의 값은 브라우저가 보내는 Origin 꼴(`스킴://호스트[:포트]`. 경로와 끝의 `/`가 없고, 호스트는 소문자이며, 기본 포트를 적지 않는다)이고, Origin 헤더와 글자 그대로 비교한다. 백엔드는 설정 값을 이 꼴로 정규화하고, `*`(모두 허용)와 http(s)가 아닌 값은 설정 오류로 거절한다. 로그인한 연결은 `auth.ticket`에 티켓(`POST /realtime-tickets`, 30초, 1회용)을 넣는다. 티켓이 틀렸거나 만료됐거나 세션이 끝났으면 연결을 거부하고, `connect_error`의 message는 `auth.token_invalid`, data는 에러 객체(`status` "401")다. 티켓이 없으면 익명 연결이다.
- 이벤트는 쓰기가 commit된 뒤에 나간다. 한 연결이 여러 룸에 있어도 한 번 받는다. `session.revoked`는 그 사용자의 모든 연결이 받으므로(페이로드에 세션 id가 없다) 클라이언트는 자기 세션이 살아 있는지 확인한다. `me.updated`의 `changed`는 `roles`(역할을 받거나 잃음, 가진 역할의 권한이 바뀌거나 역할이 지워짐), `status`(관리자가 상태를 바꿈), `profile`(이름, 로케일, 아바타)이다.

## 메일 링크
```

`docs/superpowers/specs/2026-09-26-fastapi-template-design.md`를 고친다.

(1) 찾을 부분:

```markdown
# FastAPI 템플릿 설계 (하위 프로젝트 1)

- 작성일: 2026-09-26
- 상태: 승인됨. 마일스톤 M1~M5 구현 완료(§1.2의 완료 조건 통과)
- 상위 문서: [기반 설계](2026-09-26-ai-template-foundation-design.md)
  - 이 문서는 기반 설계 §10에서 사이클 1로 미룬 결정을 내리고, `templates/fastapi`와 이번 사이클의 저장소 변경을 설계한다.
  - 기반 설계의 규칙은 그대로 따른다: 플랫폼 기능(§4), API 규약(§5), 하네스(§6), 인프라(§7). 이 문서는 그 규칙을 구현하는 방법과 계약 변경을 정한다.
```

바꿀 내용:

```markdown
# FastAPI 템플릿 설계 (하위 프로젝트 1)

- 작성일: 2026-09-26
- 상태: 승인됨. 마일스톤 M1~M5 구현 완료(§1.2의 완료 조건 통과). web 사이클의 W1에서 찾은 문제를 보정했다(2026-09-30, §12.1의 "보정")
- 상위 문서: [기반 설계](2026-09-26-ai-template-foundation-design.md)
  - 이 문서는 기반 설계 §10에서 사이클 1로 미룬 결정을 내리고, `templates/fastapi`와 이번 사이클의 저장소 변경을 설계한다.
  - 기반 설계의 규칙은 그대로 따른다: 플랫폼 기능(§4), API 규약(§5), 하네스(§6), 인프라(§7). 이 문서는 그 규칙을 구현하는 방법과 계약 변경을 정한다.
```

(2) 찾을 부분:

```markdown
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
```

바꿀 내용:

```markdown
  - 406 `jsonapi.not_acceptable`: `Accept`에 JSON:API 미디어 타입이 있는데, 그 인스턴스 모두에 `profile` 밖의 매개변수가 붙어 있을 때
  - 413 `jsonapi.content_too_large`: 요청 본문이 1 MiB(1,048,576바이트)를 넘을 때. 협상(415·406) 다음, 본문 JSON 검사 앞이다. `Content-Length`가 넘으면 본문을 읽지 않고, 길이를 알리지 않은 본문은 읽으면서 센다(M5).
  - `Accept`가 없거나 JSON:API 미디어 타입을 담지 않으면(예: `*/*`) 통과한다.
  - 협상은 `/api/` 아래 모든 요청에 걸린다. 본문이 없는 소셜 로그인 리다이렉트(`authorize`, `callback`)도 406을 내므로 선언한다(§7, 보정).
- 응답은 `application/vnd.api+json` 전용 응답 클래스로 보낸다. 이 클래스는 짝 없는 서로게이트를 `\uXXXX`(소문자 16진)로 이스케이프한다. 입력을 그대로 담은 에러 detail(`data.id` 불일치, 없는 관계의 id)이 그런 글자를 싣는데 UTF-8은 이를 인코딩하지 못하기 때문이다. 결과는 목의 `JSON.stringify`와 같은 바이트다(보정).
- 모든 예외는 `ErrorDocument`와 `meta.traceId`로 바꾼다.
  - 도메인 예외는 코드, 상태, 영어 detail, `source`, `meta.params`를 담는 예외 클래스 하나로 표현한다.
  - 401 응답은 늘 `WWW-Authenticate`를 담는다(RFC 9110 §15.5.2). 에러 응답을 만드는 한 곳(`error_response`)이 challenge가 없는 401에 `Bearer`를 더한다. 그래서 인증 의존성을 거치지 않는 401(로그인, refresh, 소셜 로그인 코드, 비밀번호 변경의 틀린 자격 증명)도 담고, 재인증의 step-up challenge(RFC 9470, §6.4)는 그대로 둔다(보정).
  - Pydantic 검증 오류는 필드마다 에러 객체를 만들어 422로 돌려준다. `source.pointer`(예: `/data/attributes/title`)를 채우고, 오류 종류를 `validation.required`, `validation.too_short` 등으로 바꾼다.
    - pointer는 본문의 실제 위치다. 판별 유니온(`SessionGrant`)은 loc에 태그 값을 끼우므로 그 조각을 뺀다(password grant의 이메일 오류는 `/data/attributes/email`). 태그와 이름이 같은 필드(password grant의 `password`)에 객체나 배열을 보낸 경우만 그 값 아래를 가리킨다(보정).
    - 정수(`Int32`, `Int64`)는 strict다. 계약의 integer처럼 숫자 문자열과 불리언을 받지 않는다(`validation.invalid_format`). 본문을 `json.loads`로 읽으므로 소수점이나 지수로 쓴 정수(`10.0`, `1e3`)도 float라 받지 않는다. JSON 스키마는 그대로다(보정).
    - 짝 없는 서로게이트: 제약(길이, 패턴, 선택지, 형식)이 있는 문자열은 Pydantic이 다른 검사보다 먼저 `validation.invalid_format`으로 거절한다. 제약 없는 문자열(토큰, 비밀번호, id)은 받아서 비교하므로 틀린 값과 같은 에러다. 길이를 검증기로 세는 역할 설명은 그 검증기가 먼저 거절한다(보정).
  - JSON이 아니거나 문서 구조가 틀리면 400 `jsonapi.invalid_document`다.
  - JSON:API 1.1이 반드시 쓰라는 상태를 따른다: 본문의 `type` 불일치는 409 `resource.conflict`, 생성 요청의 클라이언트가 만든 `id`는 403 `permission.denied`, 관계가 가리키는 리소스가 없으면 404 `resource.not_found`다. 요청 문서 전체를 가리키는 pointer는 `""`다.
  - 예상하지 못한 예외는 500 `internal.unexpected`다. 원인은 로그에만 남긴다.
```

(3) 찾을 부분:

```markdown
### 6.1 인증과 세션

- access token은 JWT(HS256, 15분)이고 `sub`(사용자 id)와 `sid`(세션 id)를 담는다.
- 인증이 필요한 요청마다 서명을 검증하고, 세션이 살아 있는지(세션 행의 `revoked_at`)를 DB에서 확인한다.
  - 요청마다 사용자와 역할을 DB에서 읽으므로(§6.3) 같은 조회로 확인한다. Valkey에 폐기 목록을 따로 두지 않는다.
  - 그래서 로그아웃과 폐기가 access token 만료를 기다리지 않고 즉시 효과를 낸다.
- refresh token
```

바꿀 내용:

```markdown
### 6.1 인증과 세션

- access token은 JWT(HS256, 15분)이고 `sub`(사용자 id)와 `sid`(세션 id)를 담는다.
- 인증이 필요한 요청마다 서명을 검증하고, 세션이 살아 있는지(세션 행의 `revoked_at`과 `expires_at`)를 DB에서 확인한다.
  - 요청마다 사용자와 역할을 DB에서 읽으므로(§6.3) 같은 조회로 확인한다. Valkey에 폐기 목록을 따로 두지 않는다.
  - 그래서 로그아웃과 폐기가 access token 만료를 기다리지 않고 즉시 효과를 낸다.
- refresh token
```

(4) 찾을 부분:

```markdown
| `account_deactivated`  | 관리자가 계정을 비활성화했다                           |
| `account_deleted`      | 탈퇴했다                                               |

- 비밀번호가 없는 계정(소셜 전용)은 `password` grant와 비밀번호 변경에서 `auth.invalid_credentials`를 받는다. 이메일이 없는 계정에는 재설정 메일을 보내지 않는다. 재설정 요청 자체는 계정 존재와 무관하게 늘 202다.
- 비밀번호를 바꾸면(`POST /password-changes`) 남은 재설정 토큰을 지운다. 비밀번호 변경에는 사용자별 엄격한 레이트 리밋이 있다(§6.10, M5).

### 6.2 소셜 로그인
```

바꿀 내용:

```markdown
| `account_deactivated`  | 관리자가 계정을 비활성화했다                           |
| `account_deleted`      | 탈퇴했다                                               |

- 만료된 세션은 정리 잡이 지우기 전에도 끝난 세션이다. `GET /sessions`, 폐기, 인증기가 같은 조건(폐기되지 않았고 만료되지 않음)을 쓴다. 그래서 다른 기기·전체 로그아웃의 `revokedCount`(전체 로그아웃이면 감사 로그 `session.all_revoked`의 `metadata.revokedCount`도)는 목록에 보이던 세션 가운데 폐기한 수다(보정).
- 비밀번호가 없는 계정(소셜 전용)은 `password` grant와 비밀번호 변경에서 `auth.invalid_credentials`를 받는다. 이메일이 없는 계정에는 재설정 메일을 보내지 않는다. 재설정 요청 자체는 계정 존재와 무관하게 늘 202다.
- 비밀번호는 `surrogatepass`로 인코딩한 바이트로 해시하고 검증한다. 그래서 짝 없는 서로게이트가 든 비밀번호(로그인의 `password`, 비밀번호 변경의 `currentPassword`)도 500이 아니라 틀린 비밀번호와 같은 401 `auth.invalid_credentials`다. 새 비밀번호는 길이 제약이 있어 422다(보정).
- 비밀번호를 바꾸면(`POST /password-changes`) 남은 재설정 토큰을 지운다. 비밀번호 변경에는 사용자별 엄격한 레이트 리밋이 있다(§6.10, M5).

### 6.2 소셜 로그인
```

(5) 찾을 부분:

```markdown
  - `member`는 가입할 때 자동으로 부여된다. 권한은 고칠 수 있지만 삭제할 수 없다.
  - 시스템 역할을 삭제하거나 `admin`의 권한을 고치려 하면 `role.system_role_protected`다.
- 권한 상승 금지(F2). 위반은 모두 `permission.denied`다.
  - 자기 권한을 넘는 역할은 만들거나, 고치거나, 부여하거나, 회수하지 못한다. 기준은 "역할의 권한이 내 실제 권한의 부분집합인가"이고, 수정은 고치기 전과 후 모두 검사한다.
  - 자기보다 권한이 큰 사용자(그 사용자의 실제 권한이 내 권한의 부분집합이 아닌 경우)의 역할과 상태를 바꾸지 못한다.
  - 자기 자신의 역할과 상태는 바꾸지 못한다.
- 마지막 활성 admin의 admin 역할 회수, 비활성화, 탈퇴는 새 코드 `role.last_admin_protected`(422)로 막는다.
```

바꿀 내용:

```markdown
  - `member`는 가입할 때 자동으로 부여된다. 권한은 고칠 수 있지만 삭제할 수 없다.
  - 시스템 역할을 삭제하거나 `admin`의 권한을 고치려 하면 `role.system_role_protected`다.
- 권한 상승 금지(F2). 위반은 모두 `permission.denied`다.
  - 자기 권한을 넘는 역할은 만들거나, 고치거나, 부여하거나, 회수하지 못한다. 기준은 "역할의 권한이 내 실제 권한의 부분집합인가"이고, 수정은 고치기 전과 후 모두 검사한다. `attributes`가 없거나 빈 PATCH도 고치기 전을 검사한다(보정).
  - 자기보다 권한이 큰 사용자(그 사용자의 실제 권한이 내 권한의 부분집합이 아닌 경우)의 역할과 상태를 바꾸지 못한다.
  - 자기 자신의 역할과 상태는 바꾸지 못한다.
- 마지막 활성 admin의 admin 역할 회수, 비활성화, 탈퇴는 새 코드 `role.last_admin_protected`(422)로 막는다.
```

(6) 찾을 부분:

```markdown
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
```

바꿀 내용:

```markdown
### 6.8 실시간

- Socket.IO 서버는 `/socket.io/`에 있고 WebSocket 전송만 허용한다. 연결의 Origin은 설정의 허용 목록으로 검사한다.
  - 허용 목록(`REALTIME_ALLOWED_ORIGINS`)은 값마다 브라우저가 보내는 Origin(`스킴://호스트[:포트]`)으로 정규화한다. 경로와 끝의 `/`, 쿼리, 조각, 계정은 떼고, 호스트는 소문자로, 기본 포트(80, 443)는 뺀다.
  - `*`, http(s)가 아닌 값, 브라우저가 다른 모양으로 보내는 호스트(ASCII가 아닌 호스트, 줄여 쓴 IPv4 등)는 설정 오류다. python-engineio가 Origin 헤더를 글자 그대로 비교하고 `*`를 모두 허용으로 읽기 때문이다(보정).
- 티켓(`POST /realtime-tickets`)은 Valkey에 30초 두는 1회용 값이고, 사용자 id와 세션 id를 담는다.
- 접속할 때 `auth.ticket`이 있으면 티켓을 꺼내 지우고, 세션이 살아 있으면 그 연결을 `user:{id}` 룸에 넣는다. 티켓이 없으면 익명 연결이다. 티켓이 틀렸거나 만료됐거나 세션이 끝났으면 연결을 거부한다. `connect_error`의 message는 `auth.token_invalid`, data는 에러 객체다.
- 클라이언트 메시지(F22)
  - `subscribe`와 `unsubscribe`, 페이로드는 `RealtimeSubscription`(`{ "channel": "posts" }`) 하나다.
  - ack는 `RealtimeAck`로, 성공이면 `{ "ok": true }`다. 실패면 `{ "ok": false, "error": ErrorObject }`이고, 권한이 없으면 `permission.denied`, 모르는 채널이면 `validation.invalid_choice`다.
  - 익명 연결은 `posts`만 구독할 수 있다. `posts:all`에는 `posts:manage`가 필요하다. 권한은 구독할 때 DB에서 계산한다.
  - 연결 재검사(M5): 세션을 폐기하거나 사용자의 역할·상태가 바뀌면(`session.revoked`, `me.updated`의 `roles`·`status`) commit한 뒤 Valkey pub/sub 제어 채널(`<pub/sub 채널>:control`)로 사용자 id를 알린다. 여러 세션을 폐기하는 요청(다른 기기·전체 로그아웃, 비밀번호 변경·재설정, 계정 닫기)은 폐기할 살아 있는 세션이 없어 `session.revoked`를 보내지 않아도 알린다. 만료되기 전에 붙은 연결이 남아 있을 수 있기 때문이다(보정). api 인스턴스마다 자기 연결(`user:{id}` 룸의 참가자)만 다시 검사해, 세션이 끝났거나(폐기, 만료) 구독한 채널의 권한을 잃은 연결을 끊는다. 사용자별 소켓 id를 인스턴스 밖에 기록하지 않는다. 끊긴 클라이언트는 새 티켓으로 다시 붙는다.
  - ack의 에러 객체는 권한 없음 403, 모르는 채널이나 틀린 페이로드 422이고 `source.pointer`는 `/channel`이다. 페이로드가 없거나 둘 이상이어도 틀린 페이로드다. python-socketio는 받은 페이로드를 하나씩 인자로 넘기므로, 처리기는 개수와 상관없이 받아 ack로 답한다(보정).
- api는 `AsyncRedisManager`로 인스턴스 사이에 이벤트를 전파한다. worker와 scheduler는 쓰기 전용 매니저로 이벤트를 보낸다. 매니저는 Valkey 클라이언트를 하나만 만들어 다시 쓰고 닫을 때 닫는다(python-socketio는 발행이 실패하거나 수신을 다시 시작할 때마다 새로 만든다, M5).
- 이벤트 페이로드는 모듈의 직렬화 함수로 만든 JSON:API 문서다.
- 이벤트는 쓰기가 commit된 뒤에 나간다. 모듈이 트랜잭션에 넣고(`queue`) 세션이 commit한 뒤에 페이로드를 만들어 보낸다. 한 연결이 여러 룸에 있어도 한 번 받는다.
```

(7) 찾을 부분:

```markdown
| 실시간(M5)   | `post.unpublished` 이벤트(`rooms`: `posts`)와 `PostUnpublishedEventDocument`                                                               |
| OAuth(M5)    | `authorize`의 `codeChallenge`에 pattern `^[A-Za-z0-9_-]{43}$`                                                                               |
| 설명(M5)     | `DELETE /me`(재인증), `POST /password-changes`(사용자별 레이트 리밋, 재설정 토큰 삭제), `POST /files`(사용자별 한도)                        |

- `x-realtime-messages`의 형식: `[{ "name": "subscribe", "payload": "RealtimeSubscription", "ack": "RealtimeAck" }, { "name": "unsubscribe", ... }]`
- 룰셋의 공용 스키마 이름 목록에 `RealtimeChannel`, `RealtimeSubscription`, `RealtimeAck`를 더한다. 이 스키마들은 리소스에 속하지 않는다.
```

바꿀 내용:

```markdown
| 실시간(M5)   | `post.unpublished` 이벤트(`rooms`: `posts`)와 `PostUnpublishedEventDocument`                                                               |
| OAuth(M5)    | `authorize`의 `codeChallenge`에 pattern `^[A-Za-z0-9_-]{43}$`                                                                               |
| 설명(M5)     | `DELETE /me`(재인증), `POST /password-changes`(사용자별 레이트 리밋, 재설정 토큰 삭제), `POST /files`(사용자별 한도)                        |
| users(보정)  | `DELETE /me`에 422(`role.last_admin_protected`)를 선언하고 설명에 적는다. 동작은 M2부터 422였다                                              |
| OAuth(보정)  | `authorize`와 `callback`에 406을 선언한다. 협상 미들웨어가 `/api/` 아래 모든 요청의 `Accept`를 본다                                          |
| 설명(보정)   | `PostStatus`에 제 설명을 단다(`posts.tsp`의 파일 머리말은 `//` 주석으로 바꿔 붙지 않게 한다). 글 이벤트 문서 셋(`PostCreatedEventDocument`, `PostUpdatedEventDocument`, `PostPublishedEventDocument`)에 제 이벤트의 설명을 단다 |

- `x-realtime-messages`의 형식: `[{ "name": "subscribe", "payload": "RealtimeSubscription", "ack": "RealtimeAck" }, { "name": "unsubscribe", ... }]`
- 룰셋의 공용 스키마 이름 목록에 `RealtimeChannel`, `RealtimeSubscription`, `RealtimeAck`를 더한다. 이 스키마들은 리소스에 속하지 않는다.
```

(8) 찾을 부분:

```markdown
- CI(`.github/workflows/ci.yml`)에 잡을 더한다. action은 커밋 SHA로 고정한다.
  - `fastapi`: uv 설치 → `uv run poe setup` → `check` → `test:e2e` → Docker 이미지 빌드
  - `conformance-fastapi`: `pnpm conformance fastapi`
  - 구조 비교: M1부터 `check` 잡에서 `pnpm spec-compare --subset contract/openapi.yaml templates/fastapi/openapi.json`(구현한 operation만 비교)을 돌리고, M4에서 `--subset`을 뗐다. M4부터 구조 비교는 실시간 선언(`x-realtime-*`)도 계약과 같은지 본다
- 루트 `pnpm check`는 Python과 Docker 없이 돌도록 지금 범위를 유지한다. 템플릿 자체 검사는 CI 잡이 맡는다.

## 12. 마일스톤
```

바꿀 내용:

```markdown
- CI(`.github/workflows/ci.yml`)에 잡을 더한다. action은 커밋 SHA로 고정한다.
  - `fastapi`: uv 설치 → `uv run poe setup` → `check` → `test:e2e` → Docker 이미지 빌드
  - `conformance-fastapi`: `pnpm conformance fastapi`
  - 구조 비교: M1부터 `check` 잡에서 `pnpm spec-compare --subset contract/openapi.yaml templates/fastapi/openapi.json`(구현한 operation만 비교)을 돌리고, M4에서 `--subset`을 뗐다. M4부터 구조 비교는 실시간 선언(`x-realtime-*`)도 계약과 같은지 본다. 보정부터는 operation마다 응답 상태 집합도 같은지 본다(`--subset`이면 구현한 operation만). oasdiff는 성공 상태를 뺀 것만 breaking으로 보므로, 에러 상태를 한쪽에만 선언해도 통과했다
- 루트 `pnpm check`는 Python과 Docker 없이 돌도록 지금 범위를 유지한다. 템플릿 자체 검사는 CI 잡이 맡는다.

## 12. 마일스톤
```

(9) 찾을 부분:

```markdown

### 12.1 마일스톤 사이에 넘긴 일

M1~M5의 계획과 최종 리뷰가 남긴 일이다. 해당 마일스톤 계획에 넣는다.

- M2를 시작하기 전(NestJS가 따라 하기 전에 정한다). M2 계획의 Task 1~2에서 다음과 같이 정했다.
  - POST 본문의 `type` 불일치는 409 `resource.conflict`, 클라이언트가 만든 `id`는 403 `permission.denied`다(JSON:API 1.1 MUST). 계약의 모든 POST가 403과 409를 선언한다. 로그인 없이 부르는 POST에는 `CreateErrors`(403, 409)를, 로그인이 필요한 POST에는 `Conflict`를 더한다(같은 상태를 두 번 넣으면 응답 스키마가 `anyOf`로 겹친다).
```

바꿀 내용:

```markdown

### 12.1 마일스톤 사이에 넘긴 일

M1~M5의 계획과 최종 리뷰가 남긴 일이다. 해당 마일스톤 계획에 넣는다. 사이클 뒤에 고친 것은 마지막의 "보정"이다.

- M2를 시작하기 전(NestJS가 따라 하기 전에 정한다). M2 계획의 Task 1~2에서 다음과 같이 정했다.
  - POST 본문의 `type` 불일치는 409 `resource.conflict`, 클라이언트가 만든 `id`는 403 `permission.denied`다(JSON:API 1.1 MUST). 계약의 모든 POST가 403과 409를 선언한다. 로그인 없이 부르는 POST에는 `CreateErrors`(403, 409)를, 로그인이 필요한 POST에는 `Conflict`를 더한다(같은 상태를 두 번 넣으면 응답 스키마가 `anyOf`로 겹친다).
```

(10) 찾을 부분:

```markdown
  - `gen:module`의 테이블 검사는 소스를 바이트로 읽는다(BOM이 있는 파일, M3 최종 재리뷰).
  - 채널 구독의 권한은 구독할 때 본다. 구독한 뒤 권한을 잃거나 계정이 닫혀도 그 연결은 끊기거나 구독을 풀 때까지 받는다. 클라이언트는 `me.updated`(`roles`, `status`)나 `session.revoked`를 받으면 새 티켓으로 다시 붙는다(§1.3, §6.8, 최종 리뷰). M5에서 서버가 그런 연결을 끊게 바꿨다(연결 재검사).
  - 역할 이름을 이미 있는 이름으로 바꾸면서 권한도 바꾸는 요청은 422 `validation.already_taken`이다. 멤버 알림은 이름 검사가 끝난 뒤에 한다(최종 리뷰).
  - 토큰의 해시는 짝이 없는 서로게이트도 인코딩한다(`surrogatepass`). 그런 토큰은 500이 아니라 각 grant의 401이다(최종 리뷰).
  - `codeVerifier`는 RFC 7636 모양(`[A-Za-z0-9._~-]` 43~128자)이어야 한다. 제공자의 에러는 `access_denied`만 `auth.oauth_denied`이고, 나머지는 `auth.oauth_failed`다(최종 리뷰).
  - OpenTelemetry는 헬스 체크 요청과 ASGI send·receive를 span으로 만들지 않는다. 쓰기 전용 발행기와 소켓 테스트 도우미는 쓴 연결을 닫는다(최종 리뷰).
- M5(보강). [보강 설계](2026-09-29-fastapi-hardening-design.md)가 M2~M4의 최종 리뷰가 남긴 "나중" 목록(M2 7건, M3 4건, M4 7건)을 모두 처리했다. 결정은 그 문서의 §2(H1~H18)에 있다.
```

바꿀 내용:

```markdown
  - `gen:module`의 테이블 검사는 소스를 바이트로 읽는다(BOM이 있는 파일, M3 최종 재리뷰).
  - 채널 구독의 권한은 구독할 때 본다. 구독한 뒤 권한을 잃거나 계정이 닫혀도 그 연결은 끊기거나 구독을 풀 때까지 받는다. 클라이언트는 `me.updated`(`roles`, `status`)나 `session.revoked`를 받으면 새 티켓으로 다시 붙는다(§1.3, §6.8, 최종 리뷰). M5에서 서버가 그런 연결을 끊게 바꿨다(연결 재검사).
  - 역할 이름을 이미 있는 이름으로 바꾸면서 권한도 바꾸는 요청은 422 `validation.already_taken`이다. 멤버 알림은 이름 검사가 끝난 뒤에 한다(최종 리뷰).
  - 토큰의 해시는 짝이 없는 서로게이트도 인코딩한다(`surrogatepass`). 그런 토큰은 500이 아니라 각 grant의 401이다(최종 리뷰). 보정에서 같은 원칙을 비밀번호, 응답 본문, 역할 설명으로 넓혔다(§5.2, §6.1).
  - `codeVerifier`는 RFC 7636 모양(`[A-Za-z0-9._~-]` 43~128자)이어야 한다. 제공자의 에러는 `access_denied`만 `auth.oauth_denied`이고, 나머지는 `auth.oauth_failed`다(최종 리뷰).
  - OpenTelemetry는 헬스 체크 요청과 ASGI send·receive를 span으로 만들지 않는다. 쓰기 전용 발행기와 소켓 테스트 도우미는 쓴 연결을 닫는다(최종 리뷰).
- M5(보강). [보강 설계](2026-09-29-fastapi-hardening-design.md)가 M2~M4의 최종 리뷰가 남긴 "나중" 목록(M2 7건, M3 4건, M4 7건)을 모두 처리했다. 결정은 그 문서의 §2(H1~H18)에 있다.
```

(11) 찾을 부분:

```markdown
  - 에이전트용 규칙과 레시피(AGENTS.md, `docs/recipes/`)를 M5의 실제 코드(식별자 해시, `Cache`와 `require_recent_login`의 시그니처, 파일 참조 확인)에 맞췄다. 잡·메일 레시피는 `service.py` 하나뿐인 모듈에서 순환 import가 나던 안내를 고쳐, 잡이 부르는 작업과 잡을 보내는 서비스를 다른 파일에 두게 했다(최종 리뷰).
  - 제어 채널의 수신(`ControlChannel._listen`)은 Valkey 오류가 아닌 예외에도 죽지 않고 로그를 남긴 뒤 같은 backoff로 다시 구독한다(최종 리뷰).
  - 연결 재검사(`Gateway._still_allowed`)를 끝내지 못하면(예: DB 장애) 그 연결은 끊지 않고 남긴다(fail-open, 최종 리뷰).

## 13. 계획 단계에서 확인할 것

```

바꿀 내용:

```markdown
  - 에이전트용 규칙과 레시피(AGENTS.md, `docs/recipes/`)를 M5의 실제 코드(식별자 해시, `Cache`와 `require_recent_login`의 시그니처, 파일 참조 확인)에 맞췄다. 잡·메일 레시피는 `service.py` 하나뿐인 모듈에서 순환 import가 나던 안내를 고쳐, 잡이 부르는 작업과 잡을 보내는 서비스를 다른 파일에 두게 했다(최종 리뷰).
  - 제어 채널의 수신(`ControlChannel._listen`)은 Valkey 오류가 아닌 예외에도 죽지 않고 로그를 남긴 뒤 같은 backoff로 다시 구독한다(최종 리뷰).
  - 연결 재검사(`Gateway._still_allowed`)를 끝내지 못하면(예: DB 장애) 그 연결은 끊지 않고 남긴다(fail-open, 최종 리뷰).
- 보정(2026-09-30). web 사이클의 W1(목 서버)에서 목을 FastAPI와 맞추다 찾은 11건([web 설계](2026-09-30-nextjs-web-design.md) §12.1)과, 그것을 조사하다 찾은 같은 종류 하나를 고쳤다. 목과 적합성 흐름도 같은 동작으로 맞췄다.
  - 검증 에러: 판별 유니온(`SessionGrant`)의 필드 오류가 본문의 실제 위치를 가리킨다. 정수(`Int32`, `Int64`)는 strict라 숫자 문자열과 불리언을 받지 않는다(§5.2).
  - 짝 없는 서로게이트의 500: 비밀번호는 `surrogatepass`로 인코딩해 해시하고 검증한다(401, §6.1). 응답 클래스가 짝 없는 서로게이트를 `\uXXXX`로 이스케이프한다(§5.2). 입력을 담은 detail 셋(`require_matching_id`의 409, `files.attachable_file`의 404, 조사에서 새로 찾은 `users/service/management.py`의 없는 역할 404)이 응답을 인코딩하다 500이었다. 역할 설명은 PostgreSQL에 저장하다 500이었고 이제 422다.
  - 모든 401에 `WWW-Authenticate`(§5.2). 로그인, refresh, 소셜 로그인 코드, 비밀번호 변경의 401에 없었다.
  - 실시간: `REALTIME_ALLOWED_ORIGINS`를 Origin으로 정규화하고 `*`를 거절한다. 페이로드가 하나가 아닌 `subscribe`·`unsubscribe`는 422 ack다(전에는 처리기가 `TypeError`로 끝나 ack가 없었다, §6.8).
  - 만료된 세션은 끝난 세션이다. `revokedCount`가 만료된 세션을 세지 않고, 인증기·티켓 연결·재검사가 만료를 본다. 여러 세션을 폐기하는 요청은 폐기한 세션이 없어도 재검사한다(§6.1, §6.8).
  - `attributes`가 없는 `PATCH /roles/{id}`가 서비스를 건너뛰어 고치기 전 권한 검사(F2)를 하지 않았다(§6.3).
  - 계약: `DELETE /me`의 422, 리다이렉트의 406, `PostStatus`와 글 이벤트 문서의 설명(§7). FastAPI 선언도 함께 고쳤다.
  - 구조 비교가 operation마다 응답 상태 집합을 본다(§11). 이제 계약과 FastAPI 선언 가운데 한쪽만 고치면 실패한다.
  - 목과 남은 차이(소수점·지수로 쓴 정수, 판별자와 이름이 같은 grant 필드에 객체·배열을 보냈을 때의 pointer 등)는 `contract/mock/AGENTS.md`의 "FastAPI와 다른 점"에 있다.

## 13. 계획 단계에서 확인할 것

```

`docs/superpowers/specs/2026-09-29-fastapi-hardening-design.md`를 고친다.

찾을 부분:

```markdown
- 다음 이벤트를 보낼 때 그 사용자의 연결을 다시 검사한다.
  - `session.revoked`(사유와 상관없이)
  - `me.updated`의 `changed`에 `roles`나 `status`가 있을 때
- 검사는 연결마다 한다. 연결의 세션이 끝났거나, 구독한 채널 가운데 권한을 잃은 것이 있으면 그 연결을 끊는다. 판정은 연결과 구독 때와 같다(`auth.session_principal`, 채널의 권한).
- 인스턴스 사이
  - 이벤트를 보낼 때(commit 뒤) Valkey pub/sub의 제어 채널(실시간 채널 이름 + `:control`)에 사용자 id를 보낸다. worker와 scheduler의 쓰기 전용 발행기도 보낸다.
  - api 인스턴스마다 제어 채널을 듣는다. 자기 인스턴스에 있는 그 사용자의 연결(`user:{id}` 룸의 참가자)만 검사한다.
  - 사용자별 소켓 id를 인스턴스 밖에 기록하지 않는다. 인스턴스가 죽어도 치울 기록이 남지 않는다.
- 끊는 이유를 따로 보내지 않는다. 같은 인스턴스라면 클라이언트는 이미 `session.revoked`나 `me.updated`를 받은 뒤다(commit 훅이 이벤트를 다 보낸 뒤에 재검사를 알린다). 이벤트와 제어 메시지는 서로 다른 pub/sub 연결로 가므로, 다른 인스턴스로 릴레이될 때는 어느 쪽이 먼저 닿을지 약속하지 않는다. 끊기면 새 티켓으로 다시 붙는다. 세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독 ack가 `permission.denied`다.
- 채널에서만 빼고 연결을 두는 방식은 쓰지 않는다. 클라이언트가 구독이 풀린 것을 알 수 없기 때문이다.
- 상위 문서 §1.3의 두 항목(세션을 폐기할 때 소켓 끊기, 권한을 잃은 연결 내보내기)과 §6.8의 알려진 한계가 없어진다.

```

바꿀 내용:

```markdown
- 다음 이벤트를 보낼 때 그 사용자의 연결을 다시 검사한다.
  - `session.revoked`(사유와 상관없이)
  - `me.updated`의 `changed`에 `roles`나 `status`가 있을 때
- 여러 세션을 폐기하는 요청(다른 기기·전체 로그아웃, 비밀번호 변경·재설정, 계정 비활성화·탈퇴)은 폐기할 살아 있는 세션이 없어 `session.revoked`를 보내지 않아도 검사한다. 만료되기 전에 그 세션으로 붙은 연결이 남아 있을 수 있기 때문이다(2026-09-30 보정).
- 검사는 연결마다 한다. 연결의 세션이 끝났거나(폐기, 만료), 구독한 채널 가운데 권한을 잃은 것이 있으면 그 연결을 끊는다. 판정은 연결과 구독 때와 같다(`auth.session_principal`, 채널의 권한).
- 인스턴스 사이
  - 이벤트를 보낼 때(commit 뒤) Valkey pub/sub의 제어 채널(실시간 채널 이름 + `:control`)에 사용자 id를 보낸다. worker와 scheduler의 쓰기 전용 발행기도 보낸다.
  - api 인스턴스마다 제어 채널을 듣는다. 자기 인스턴스에 있는 그 사용자의 연결(`user:{id}` 룸의 참가자)만 검사한다.
  - 사용자별 소켓 id를 인스턴스 밖에 기록하지 않는다. 인스턴스가 죽어도 치울 기록이 남지 않는다.
- 끊는 이유를 따로 보내지 않는다. 같은 인스턴스라면 클라이언트는 이미 `session.revoked`나 `me.updated`를 받은 뒤다(commit 훅이 이벤트를 다 보낸 뒤에 재검사를 알린다). 폐기한 세션이 없어 이벤트 없이 검사하면 알림 없이 끊긴다. 이벤트와 제어 메시지는 서로 다른 pub/sub 연결로 가므로, 다른 인스턴스로 릴레이될 때는 어느 쪽이 먼저 닿을지 약속하지 않는다. 끊기면 새 티켓으로 다시 붙는다. 세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독 ack가 `permission.denied`다.
- 채널에서만 빼고 연결을 두는 방식은 쓰지 않는다. 클라이언트가 구독이 풀린 것을 알 수 없기 때문이다.
- 상위 문서 §1.3의 두 항목(세션을 폐기할 때 소켓 끊기, 권한을 잃은 연결 내보내기)과 §6.8의 알려진 한계가 없어진다.

```

`docs/superpowers/specs/2026-09-30-nextjs-web-design.md`를 고친다.

(1) 찾을 부분:

```markdown
# Next.js web 템플릿 설계 (하위 프로젝트 2)

- 작성일: 2026-09-30
- 상태: 승인됨(2026-09-30). W1(목 서버) 구현 완료
- 상위 문서: [기반 설계](2026-09-26-ai-template-foundation-design.md)
  - 이 문서는 기반 설계 §10에서 사이클 2로 미룬 결정을 내리고, `templates/nextjs`, 목 서버(`contract/mock`), 이번 사이클의 저장소 변경을 설계한다.
  - 기반 설계의 규칙은 그대로 따른다: 플랫폼 기능(§4), API 규약(§5), 하네스(§6), 인프라와 품질(§7).
  - 백엔드의 동작 기준은 [FastAPI 설계](2026-09-26-fastapi-template-design.md)와 [보강 설계](2026-09-29-fastapi-hardening-design.md)다. 목 서버는 그 동작을 따른다.
- 구현 계획: [W1](../plans/2026-09-30-nextjs-w1.md)
- 다음 단계: FastAPI·계약 보정(§12.1) 뒤 W2(web 뼈대)

## 1. 목표와 범위

```

바꿀 내용:

```markdown
# Next.js web 템플릿 설계 (하위 프로젝트 2)

- 작성일: 2026-09-30
- 상태: 승인됨(2026-09-30). W1(목 서버) 구현 완료. W1에서 찾은 FastAPI·계약 문제는 보정했다(2026-09-30, §12.1)
- 상위 문서: [기반 설계](2026-09-26-ai-template-foundation-design.md)
  - 이 문서는 기반 설계 §10에서 사이클 2로 미룬 결정을 내리고, `templates/nextjs`, 목 서버(`contract/mock`), 이번 사이클의 저장소 변경을 설계한다.
  - 기반 설계의 규칙은 그대로 따른다: 플랫폼 기능(§4), API 규약(§5), 하네스(§6), 인프라와 품질(§7).
  - 백엔드의 동작 기준은 [FastAPI 설계](2026-09-26-fastapi-template-design.md)와 [보강 설계](2026-09-29-fastapi-hardening-design.md)다. 목 서버는 그 동작을 따른다.
- 구현 계획: [W1](../plans/2026-09-30-nextjs-w1.md)
- 다음 단계: W2(web 뼈대)

## 1. 목표와 범위

```

(2) 찾을 부분:

```markdown

- 요청 문서는 `openapi.yaml`의 JSON Schema로 Ajv(2020-12)가 검증한다. 실패는 `validation.*` 코드와 JSON pointer로 옮긴다.
- 계약이 바뀌면 목의 검증도 저절로 따라간다.
- 옮긴 결과는 적합성 스위트에서 FastAPI의 동작과 같음을 확인했다. 몇 가지 경계(정수 자리의 숫자 문자열, 판별 유니온 오류의 pointer, UTF-16·32 본문과 CESU-8로 짝을 이룬 서로게이트 바이트)는 FastAPI(Pydantic, Python의 `json`)의 특이 동작 대신 계약대로 한다. 전체 목록은 §8.9다.

### 8.4 데이터와 토큰

```

바꿀 내용:

```markdown

- 요청 문서는 `openapi.yaml`의 JSON Schema로 Ajv(2020-12)가 검증한다. 실패는 `validation.*` 코드와 JSON pointer로 옮긴다.
- 계약이 바뀌면 목의 검증도 저절로 따라간다.
- 옮긴 결과는 적합성 스위트에서 FastAPI의 동작과 같음을 확인했다. W1 때 목이 FastAPI를 따르지 않고 계약과 규약대로 하던 두 경계(정수 자리의 숫자 문자열, 판별 유니온 오류의 pointer)는 FastAPI를 보정해 같아졌다(§12.1).
- 남은 경계 셋은 FastAPI(Pydantic, Python의 `json`)의 동작을 흉내 내지 않고 계약과 규약대로 한다. 전체 목록은 §8.9다.
  - 정수 자리에 소수점이나 지수로 쓴 정수(`10.0`, `1e3`): 목은 받고(JSON Schema의 integer이고, `JSON.parse`가 `10`과 구별하지 못한다) FastAPI는 422다(strict 정수). JavaScript 클라이언트는 이런 표기를 보내지 않는다.
  - 판별자 값과 이름이 같은 grant 필드(password grant의 `password`)에 객체나 배열을 보냈을 때: FastAPI는 그 grant의 필드 오류를 그 값 아래(`/data/attributes/password/email`)로 가리키고, 목은 실제 위치(`/data/attributes/email`)로 가리킨다.
  - 본문 인코딩: Python의 `json.loads`와 다르게 다룬다. UTF-16·32 본문은 목이 읽지 않고(UTF-8만 읽는다), CESU-8로 짝을 이룬 서로게이트 바이트는 목에서 글자 하나가 되며(Python은 짝 없는 서로게이트 둘), JSON의 `NaN`·`Infinity`는 목에서 400이다.

### 8.4 데이터와 토큰

```

(3) 찾을 부분:

```markdown

### 8.9 FastAPI와 다른 점 (요약)

- access token은 불투명한 문자열(JWT 아님)이고, 비밀번호 해시(scrypt)·소셜 로그인 제공자·스토리지는 개발용이다(재시작하면 옛 presigned URL이 맞지 않는다).
- 메일은 요청 안에서 바로 보관함에 들어간다(FastAPI는 요청 뒤 잡으로 보낸다).
- 요청 검증의 몇 가지 경계(§8.3)는 FastAPI(Pydantic)를 그대로 흉내 내지 않고 계약대로 한다.
- 전체 목록은 `contract/mock/AGENTS.md`의 "FastAPI와 다른 점"이다.

## 9. 하네스
```

바꿀 내용:

```markdown

### 8.9 FastAPI와 다른 점 (요약)

- access token은 불투명한 문자열(JWT 아님)이고, 비밀번호 해시(scrypt)·소셜 로그인 제공자·스토리지는 개발용이다(재시작하면 옛 presigned URL이 맞지 않는다). 비밀번호의 짝 없는 서로게이트는 U+FFFD로 바꿔 해시한다(FastAPI는 `surrogatepass`로 인코딩한다).
- 메일은 요청 안에서 바로 보관함에 들어간다(FastAPI는 요청 뒤 잡으로 보낸다).
- 요청 검증의 남은 경계 셋(§8.3: 소수점·지수로 쓴 정수, grant 필드에 객체·배열을 보냈을 때의 pointer, 본문 인코딩)은 FastAPI(Pydantic)를 그대로 흉내 내지 않고 계약대로 한다.
- `REALTIME_ALLOWED_ORIGINS`는 두 쪽 모두 브라우저 Origin으로 정규화하고 `*`를 거절한다. 다만 브라우저가 다른 모양으로 보내는 호스트(ASCII가 아닌 호스트 등)를 목은 그 모양으로 바꿔 받고, FastAPI는 설정 오류로 거절한다.
- 전체 목록은 `contract/mock/AGENTS.md`의 "FastAPI와 다른 점"이다.

## 9. 하네스
```

(4) 찾을 부분:

```markdown

### 12.1 W1에서 찾은 FastAPI·계약 문제

W1에서 목을 FastAPI와 맞추면서 찾았다. W2를 시작하기 전에 보정한다(다음 단계).

- FastAPI: 검증 에러의 pointer가 필드 이름이 grant 종류와 같으면 어긋난다(password grant: `/data/attributes/password/email`, `/data/attributes/password/password`. refresh grant: `/data/attributes/refreshToken/refreshToken`). `core/jsonapi/errors.py`의 `document_path`.
- FastAPI: 짝 없는 서로게이트가 500을 낸다. 로그인의 `password`·`currentPassword`(Argon2 검증이 `UnicodeEncodeError`), 입력을 그대로 돌려주는 에러 응답(`data.id` 불일치 409 detail, 파일의 "존재하지 않거나 내 것이 아니다" detail), 아마 역할 설명 저장(PostgreSQL)도 같다.
- FastAPI: 자격 증명이 틀린 401 응답에 `WWW-Authenticate`가 없다(RFC 9110은 모든 401에 요구한다).
- FastAPI: `REALTIME_ALLOWED_ORIGINS`를 검증하지 않는다(끝의 슬래시 하나가 모든 브라우저를 조용히 거부하고, `*`는 전부 허용한다).
- FastAPI: 실시간 `subscribe`·`unsubscribe`에 페이로드를 둘 이상 보내면 백그라운드 태스크에서 `TypeError`가 나고 ack가 오지 않는다.
- FastAPI: 정수 필드에 `"size": "10"`처럼 숫자 문자열을 받아들인다(Pydantic lax 모드). 계약은 integer다.
- FastAPI: `revokedCount`가 `GET /sessions`에는 보이지 않는 만료된 세션까지 센다.
- FastAPI: `attributes` 없는 `PATCH /roles/{id}`는 권한 검사를 건너뛰고 200을 주는데, `attributes: {}`는 403이다.
- 계약: `DELETE /me`가 422 `role.last_admin_protected`를 줄 수 있는데 operation은 422를 선언하지 않는다.
- 계약: 리다이렉트 operation(`oauth`의 authorize, callback)이 JSON:API 협상이 낼 수 있는 406을 선언하지 않는다.
- 계약 문서: `PostStatus` 스키마의 설명이 `posts.tsp` 파일 머리말이고, 글 이벤트 문서 셋(`PostCreatedEventDocument`, `PostUpdatedEventDocument`, `PostPublishedEventDocument`)은 범용 Document 설명을 그대로 쓴다.

## 13. 계획 단계에서 확인할 것

```

바꿀 내용:

```markdown

### 12.1 W1에서 찾은 FastAPI·계약 문제

W1에서 목을 FastAPI와 맞추면서 찾았다. W2를 시작하기 전에 모두 보정했다(2026-09-30). 목이 따라 하던 동작은 목도 함께 고쳤고, 두 대상에서 확인할 수 있는 것은 적합성 흐름을 더했다. 기록은 [FastAPI 설계](2026-09-26-fastapi-template-design.md) §12.1의 "보정"이다.

- FastAPI: 검증 에러의 pointer가 필드 이름이 grant 종류와 같으면 어긋난다(password grant: `/data/attributes/password/email`, `/data/attributes/password/password`. refresh grant: `/data/attributes/refreshToken/refreshToken`). `core/jsonapi/errors.py`의 `document_path`. **해결:** loc에 끼운 판별자 태그를 빼고 본문의 실제 위치를 가리킨다. 그 필드에 객체나 배열을 보낸 경우만 남는다(§8.3).
- FastAPI: 짝 없는 서로게이트가 500을 낸다. 로그인의 `password`·`currentPassword`(Argon2 검증이 `UnicodeEncodeError`), 입력을 그대로 돌려주는 에러 응답(`data.id` 불일치 409 detail, 파일의 "존재하지 않거나 내 것이 아니다" detail), 아마 역할 설명 저장(PostgreSQL)도 같다. **해결:** 비밀번호는 `surrogatepass`로 인코딩해 해시하고 검증한다(틀린 비밀번호와 같은 401). 응답 클래스가 짝 없는 서로게이트를 `\uXXXX`로 이스케이프한다(목의 `JSON.stringify`와 같은 바이트). 역할 설명 저장도 500이었고 이제 422 `validation.invalid_format`이다. 받던 목도 422로 바꿨다.
- FastAPI(보정하며 찾음): `PATCH /users/{id}`의 없는 역할 detail(`users/service/management.py:72`의 `Role {id} does not exist.`)도 입력을 그대로 담아, 역할 id에 짝 없는 서로게이트가 있으면 500이었다. **해결:** 위의 응답 이스케이프로 404 그대로다.
- FastAPI: 자격 증명이 틀린 401 응답에 `WWW-Authenticate`가 없다(RFC 9110은 모든 401에 요구한다). **해결:** 에러 응답을 만드는 한 곳이 challenge가 없는 401에 `Bearer`를 더한다. 목도 같다.
- FastAPI: `REALTIME_ALLOWED_ORIGINS`를 검증하지 않는다(끝의 슬래시 하나가 모든 브라우저를 조용히 거부하고, `*`는 전부 허용한다). **해결:** 값마다 브라우저 Origin(`스킴://호스트[:포트]`)으로 정규화하고, `*`, http(s)가 아닌 값, 브라우저가 다른 모양으로 보내는 호스트는 설정 오류다(남은 차이는 §8.9).
- FastAPI: 실시간 `subscribe`·`unsubscribe`에 페이로드를 둘 이상 보내면 백그라운드 태스크에서 `TypeError`가 나고 ack가 오지 않는다. **해결:** 페이로드가 하나가 아니면 틀린 페이로드라 422 `validation.invalid_choice` ack다. 답하지 않던 목도 같게 바꿨다.
- FastAPI: 정수 필드에 `"size": "10"`처럼 숫자 문자열을 받아들인다(Pydantic lax 모드). 계약은 integer다. **해결:** 정수(`Int32`, `Int64`)가 strict다(JSON 스키마는 그대로). 숫자 문자열과 불리언은 422다. 소수점이나 지수로 쓴 정수는 FastAPI만 거절한다(§8.3).
- FastAPI: `revokedCount`가 `GET /sessions`에는 보이지 않는 만료된 세션까지 센다. **해결:** 폐기와 계수는 살아 있는 세션만 한다. 인증기, 티켓 연결, 연결 재검사도 만료된 세션을 끝난 세션으로 보고, 여러 세션을 폐기하는 요청은 폐기한 세션이 없어도 재검사한다. 목도 같다.
- FastAPI: `attributes` 없는 `PATCH /roles/{id}`는 권한 검사를 건너뛰고 200을 주는데, `attributes: {}`는 403이다. **해결:** 늘 서비스를 불러 고치기 전 권한을 검사한다(내 권한 밖의 역할이면 둘 다 403). 목도 같다.
- 계약: `DELETE /me`가 422 `role.last_admin_protected`를 줄 수 있는데 operation은 422를 선언하지 않는다. **해결:** 계약과 FastAPI 선언에 422를 더했다.
- 계약: 리다이렉트 operation(`oauth`의 authorize, callback)이 JSON:API 협상이 낼 수 있는 406을 선언하지 않는다. **해결:** 계약과 FastAPI 선언(`REDIRECT_ERRORS`)에 406을 더했다. 구조 비교(`pnpm spec-compare`)도 이제 operation마다 응답 상태 집합을 비교해, 계약과 FastAPI 선언 가운데 한쪽만 고치면 실패한다.
- 계약 문서: `PostStatus` 스키마의 설명이 `posts.tsp` 파일 머리말이고, 글 이벤트 문서 셋(`PostCreatedEventDocument`, `PostUpdatedEventDocument`, `PostPublishedEventDocument`)은 범용 Document 설명을 그대로 쓴다. **해결:** 파일 머리말을 `//` 주석으로 바꾸고, `PostStatus`와 세 이벤트 문서에 제 설명을 달았다. FastAPI의 docstring도 같은 문장이다.

## 13. 계획 단계에서 확인할 것

```

`templates/fastapi/AGENTS.md`를 고친다.

찾을 부분:

```markdown
### JSON:API

- `/api/v1` 아래 응답은 JSON:API 문서다. 에러는 `ApiError(상태, ErrorCode.<코드>, 영어 detail)`로 던지고, 에러 코드는 `ErrorCode`(계약의 목록)만 쓴다.
- 문서 모델은 제네릭(`Document[...]`)을 라우트에 직접 쓰지 않고 계약과 같은 이름의 서브클래스를 쓴다. 선택 필드는 `Omittable[T] = MISSING`이다.
- 라우트는 `JsonApiRouter.route(메서드, 경로, 선언, response_model=...)`로 만든다. 선언(`Operation`, 컬렉션은 `CollectionOperation`)이 operationId, 에러 응답, 쿼리 허용 목록(include, fields, sort, filter)을 함께 정한다. 쿼리는 `Depends(선언)`으로 받고, 응답은 `render()`로, 페이지는 `pagination()`으로, 포함 리소스는 `load_included()`로 만든다.
- POST 선언에는 `CREATE_ERRORS`(403, 409), PATCH 선언에는 `CONFLICT`(409)를 넣는다(JSON:API 1.1). PATCH 핸들러는 `require_matching_id()`로 본문의 id가 경로의 리소스와 같은지 본다.

```

바꿀 내용:

```markdown
### JSON:API

- `/api/v1` 아래 응답은 JSON:API 문서다. 에러는 `ApiError(상태, ErrorCode.<코드>, 영어 detail)`로 던지고, 에러 코드는 `ErrorCode`(계약의 목록)만 쓴다.
- 문서 모델은 제네릭(`Document[...]`)을 라우트에 직접 쓰지 않고 계약과 같은 이름의 서브클래스를 쓴다. 선택 필드는 `Omittable[T] = MISSING`이다. 정수는 `int`가 아니라 `Int32`·`Int64`(strict)로 쓰고, DB에 저장하는 문자열에는 길이 제약을 둔다(이유는 [엔드포인트 추가](docs/recipes/endpoint.md)의 규칙).
- 라우트는 `JsonApiRouter.route(메서드, 경로, 선언, response_model=...)`로 만든다. 선언(`Operation`, 컬렉션은 `CollectionOperation`)이 operationId, 에러 응답, 쿼리 허용 목록(include, fields, sort, filter)을 함께 정한다. 쿼리는 `Depends(선언)`으로 받고, 응답은 `render()`로, 페이지는 `pagination()`으로, 포함 리소스는 `load_included()`로 만든다.
- POST 선언에는 `CREATE_ERRORS`(403, 409), PATCH 선언에는 `CONFLICT`(409)를 넣는다(JSON:API 1.1). PATCH 핸들러는 `require_matching_id()`로 본문의 id가 경로의 리소스와 같은지 본다.

```

`templates/fastapi/docs/architecture.md`를 고친다.

(1) 찾을 부분:

```markdown
- 의존은 한쪽으로만 흐른다. 반대 방향이 필요하면 등록으로 뒤집는다. 계정을 닫을 때(비활성화, 탈퇴) users가 부를 처리를 auth가 `users.on_account_closed`로, 역할의 권한이 바뀌거나 역할이 지워질 때 그 멤버에게 알릴 처리를 users가 `roles.on_members_changed`로 등록한다(등록은 `registry.py`).
- files는 다른 모듈을 모른다. 소유자가 아닌 사람이 파일을 읽게 할 규칙(`files.add_read_rule`)과, 탈퇴 때 남길 파일을 가리는 참조 확인(`files.add_reference_check`)을 users와 posts가 등록한다.
- 감사 로그 테이블과 기록 함수는 core(`app.core.audit`)에 있다. 여러 모듈이 기록하고, 읽기 API(audit_logs)가 users를 포함하기 때문이다.
- 인증기는 요청마다 access token의 서명을 검증하고, 세션이 살아 있는지(`revoked_at`)와 사용자, 역할을 DB에서 읽는다. 그래서 폐기와 권한 변경이 곧바로 효과를 낸다.

## 요청 흐름

```

바꿀 내용:

```markdown
- 의존은 한쪽으로만 흐른다. 반대 방향이 필요하면 등록으로 뒤집는다. 계정을 닫을 때(비활성화, 탈퇴) users가 부를 처리를 auth가 `users.on_account_closed`로, 역할의 권한이 바뀌거나 역할이 지워질 때 그 멤버에게 알릴 처리를 users가 `roles.on_members_changed`로 등록한다(등록은 `registry.py`).
- files는 다른 모듈을 모른다. 소유자가 아닌 사람이 파일을 읽게 할 규칙(`files.add_read_rule`)과, 탈퇴 때 남길 파일을 가리는 참조 확인(`files.add_reference_check`)을 users와 posts가 등록한다.
- 감사 로그 테이블과 기록 함수는 core(`app.core.audit`)에 있다. 여러 모듈이 기록하고, 읽기 API(audit_logs)가 users를 포함하기 때문이다.
- 인증기는 요청마다 access token의 서명을 검증하고, 세션이 살아 있는지(폐기되지도 만료되지도 않았는지: `revoked_at`, `expires_at`)와 사용자, 역할을 DB에서 읽는다. 그래서 폐기와 권한 변경이 곧바로 효과를 낸다.

## 요청 흐름

```

(2) 찾을 부분:

```markdown
5. 라우트 선언(`Operation`, `CollectionOperation`)이 쿼리 파라미터를 파싱한다. 선언에 없는 파라미터, 허용하지 않은 include·sort, 틀린 filter·page는 400이다.
6. router는 service를 부르고, service가 트랜잭션을 연다(`SessionDep`의 세션으로 commit). repository가 DB를 읽고 쓴다.
7. router는 문서 모델을 만들어 `render()`로 응답한다. 에러는 `ApiError(상태, ErrorCode.<코드>, 영어 detail)`를 던지면 에러 문서(`meta.traceId` 포함)가 된다. 예상하지 못한 예외는 500 에러 문서다.

`/health/live`, `/health/ready`(`src/app/health.py`)는 JSON:API가 아니라 `application/json`이다. Socket.IO는 같은 api 프로세스의 `/socket.io/`에서 받는다(아래 "실시간").

```

바꿀 내용:

```markdown
5. 라우트 선언(`Operation`, `CollectionOperation`)이 쿼리 파라미터를 파싱한다. 선언에 없는 파라미터, 허용하지 않은 include·sort, 틀린 filter·page는 400이다.
6. router는 service를 부르고, service가 트랜잭션을 연다(`SessionDep`의 세션으로 commit). repository가 DB를 읽고 쓴다.
7. router는 문서 모델을 만들어 `render()`로 응답한다. 에러는 `ApiError(상태, ErrorCode.<코드>, 영어 detail)`를 던지면 에러 문서(`meta.traceId` 포함)가 된다. 예상하지 못한 예외는 500 에러 문서다.
   에러 문서는 한 곳(`error_response`)에서 만든다. 401이면 `WWW-Authenticate: Bearer`를 더하고(이미 challenge를 넣었으면 그대로 둔다), 응답 클래스(`JsonApiResponse`)는 짝 없는 서로게이트를 `\uXXXX`로 이스케이프한다. 그래서 detail이 요청의 값을 그대로 담아도(예: `require_matching_id`) 500이 나지 않는다.

`/health/live`, `/health/ready`(`src/app/health.py`)는 JSON:API가 아니라 `application/json`이다. Socket.IO는 같은 api 프로세스의 `/socket.io/`에서 받는다(아래 "실시간").

```

(3) 찾을 부분:

```markdown

라우트 선언 하나에서 operationId, 에러 응답, 쿼리 파라미터(OpenAPI)와 쿼리 파서가 함께 나온다. 전체 예시는 테스트 전용 샘플 `src/app/core/jsonapi/tests/sample.py`다.

1. 문서 모델: `app.core.jsonapi.models`의 제네릭(`ResourceWithRelationships`, `Document`, `CollectionDocument`, `CreateDocument` 등)을 상속해 계약과 같은 이름의 클래스를 만든다. 선택 필드는 `Omittable[T] = MISSING`이다.
2. 선언: `Operation(name=..., errors=..., include=..., fields=..., permission=...)`이나 `CollectionOperation(..., sort=..., filter=<FilterModel>)`. 에러 묶음은 `COMMON_ERRORS`, `BODY_ERRORS`, `AUTH_ERRORS`, `NOT_FOUND`, `CONFLICT`, `CREATE_ERRORS`다.
   - POST는 `CREATE_ERRORS`(클라이언트가 만든 id 403, type 불일치 409)를, PATCH는 `CONFLICT`(type·id 불일치 409)를 반드시 넣는다. 빠지면 라우트를 달 때 `ValueError`가 난다.
   - PATCH 핸들러는 `require_matching_id(document.data.id, 경로의 id)`로 본문의 id를 확인한다. 관계가 가리키는 리소스가 없으면 404이므로, 관계를 받는 선언에는 `NOT_FOUND`도 넣는다.
```

바꿀 내용:

```markdown

라우트 선언 하나에서 operationId, 에러 응답, 쿼리 파라미터(OpenAPI)와 쿼리 파서가 함께 나온다. 전체 예시는 테스트 전용 샘플 `src/app/core/jsonapi/tests/sample.py`다.

1. 문서 모델: `app.core.jsonapi.models`의 제네릭(`ResourceWithRelationships`, `Document`, `CollectionDocument`, `CreateDocument` 등)을 상속해 계약과 같은 이름의 클래스를 만든다. 선택 필드는 `Omittable[T] = MISSING`이다. 정수는 `Int32`·`Int64`(strict)로 쓰고, DB에 저장하는 문자열에는 길이 제약을 둔다([엔드포인트 추가](recipes/endpoint.md)의 규칙).
2. 선언: `Operation(name=..., errors=..., include=..., fields=..., permission=...)`이나 `CollectionOperation(..., sort=..., filter=<FilterModel>)`. 에러 묶음은 `COMMON_ERRORS`, `BODY_ERRORS`, `AUTH_ERRORS`, `NOT_FOUND`, `CONFLICT`, `CREATE_ERRORS`다.
   - POST는 `CREATE_ERRORS`(클라이언트가 만든 id 403, type 불일치 409)를, PATCH는 `CONFLICT`(type·id 불일치 409)를 반드시 넣는다. 빠지면 라우트를 달 때 `ValueError`가 난다.
   - PATCH 핸들러는 `require_matching_id(document.data.id, 경로의 id)`로 본문의 id를 확인한다. 관계가 가리키는 리소스가 없으면 404이므로, 관계를 받는 선언에는 `NOT_FOUND`도 넣는다.
```

(4) 찾을 부분:

```markdown

## 실시간

Socket.IO 서버(`app.core.realtime`)가 api 프로세스의 `/socket.io/`에서 WebSocket 연결만 받는다. 브라우저 연결의 Origin은 `REALTIME_ALLOWED_ORIGINS`로 본다.

- 연결: 로그인한 브라우저는 BFF가 받은 티켓(`POST /realtime-tickets`, 30초, 1회용)을 `auth.ticket`으로 보낸다. 서버는 티켓을 꺼내 지우고, 세션이 살아 있으면 그 연결을 `user:{id}` 룸에 넣는다. 틀린 티켓(ASCII가 아닌 값 포함)은 연결을 거부한다(`connect_error`의 message `auth.token_invalid`, data 에러 객체). 티켓이 없으면 익명 연결이다(realtime 모듈의 `gateway.py`).
- 구독: `subscribe`와 `unsubscribe`에 `{ channel }`을 보내고 ack(`RealtimeAck`)를 받는다. 채널은 모듈이 선언한다(`Channel`, posts는 `posts`와 `posts:all`). 권한이 필요한 채널은 구독할 때 DB에서 권한을 계산한다.
- 연결 재검사: 세션을 폐기하거나(`session.revoked`) 역할·상태를 바꾸면(`me.updated`의 `roles`, `status`) 모듈이 `queue_recheck(session, 사용자 id)`를 넣고, commit한 뒤에 발행기가 제어 채널(`<pub/sub 채널>:control`, `app.core.realtime_pubsub.ControlChannel`)로 알린다. api 인스턴스마다 제어 채널을 듣다가, 자기 인스턴스에 있는 그 사용자의 연결(`user:{id}` 룸의 참가자)을 다시 검사해 세션이 끝났거나 구독한 채널의 권한을 잃은 연결을 끊는다(realtime 모듈의 `Gateway.recheck`). 사용자별 소켓 id를 인스턴스 밖에 기록하지 않는다. 끊긴 클라이언트는 새 티켓으로 다시 붙는다. 세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독이 `permission.denied`다. 제어 채널을 듣지 못한 동안(Valkey 장애)의 알림은 잃는다. 연결 하나를 다시 검사하다 끝내지 못하면(예: DB 장애) 그 연결은 끊지 않고 남겨 두고(fail-open) 나머지 연결을 이어서 검사한다.
- 발행: 모듈이 쓰기의 commit 전에 `queue(session, 이름, 룸, 페이로드를 만드는 함수)`로 넣으면, 세션(`EventSession`)이 commit이 성공한 뒤 페이로드를 만들어 발행기로 보낸다. rollback하면 버려지고, 발행에 실패해도 요청은 성공한다. 계정 닫기 같은 훅 안에서 넣은 이벤트도 부른 쪽의 commit 뒤에 나간다. 룸이 없는 이벤트는 보내지 않는다(빈 룸 목록을 그대로 넘기면 Socket.IO가 room 전체 브로드캐스트로 다루기 때문이다).
- 인스턴스 사이: api의 발행기는 이 인스턴스의 연결에 보내고 Valkey pub/sub으로 다른 인스턴스에 알린다. python-socketio 매니저는 발행이 실패하거나 수신을 다시 시작할 때마다 Valkey 클라이언트를 새로 만든다. `TrackedRedisManager`는 클라이언트를 하나만 만들어 다시 쓰고(redis-py가 다시 연결한다) 닫을 때 닫는다. worker와 scheduler는 소켓 서버가 아니라 쓰기 전용 발행기(`JobContext.realtime`)로 보낸다. pub/sub 채널 이름에는 Valkey DB 번호를 넣어 개발, 테스트, E2E를 나눈다.
- 계약: 채널, 이벤트, 메시지는 계약의 `x-realtime-channels`, `x-realtime-events`, `x-realtime-messages`와 같다. 앱이 `openapi.json`에 이 확장과 페이로드 스키마를 내고(`realtime_openapi`), 저장소의 구조 비교(`pnpm spec-compare`)가 계약과 같은지 본다.
```

바꿀 내용:

```markdown

## 실시간

Socket.IO 서버(`app.core.realtime`)가 api 프로세스의 `/socket.io/`에서 WebSocket 연결만 받는다. 브라우저 연결의 Origin은 `REALTIME_ALLOWED_ORIGINS`로 본다. python-engineio는 Origin 헤더를 목록과 글자 그대로 비교하고 `*`를 모두 허용으로 읽으므로, 설정(`app.core.config`의 `Origins`)이 값마다 브라우저가 보내는 Origin(`스킴://호스트[:포트]`)으로 바꾼다. 경로와 끝의 `/`, 쿼리, 조각, 계정은 떼고, 호스트는 소문자로, 기본 포트(80, 443)는 뺀다. `*`, http(s)가 아닌 값, 브라우저가 다른 모양으로 보내는 호스트(ASCII가 아닌 호스트, 줄여 쓴 IPv4 등)는 설정 오류다. 국제화 도메인은 punycode(`xn--…`)로 적는다.

- 연결: 로그인한 브라우저는 BFF가 받은 티켓(`POST /realtime-tickets`, 30초, 1회용)을 `auth.ticket`으로 보낸다. 서버는 티켓을 꺼내 지우고, 세션이 살아 있으면 그 연결을 `user:{id}` 룸에 넣는다. 틀린 티켓(ASCII가 아닌 값 포함)은 연결을 거부한다(`connect_error`의 message `auth.token_invalid`, data 에러 객체). 티켓이 없으면 익명 연결이다(realtime 모듈의 `gateway.py`).
- 구독: `subscribe`와 `unsubscribe`에 페이로드 `{ channel }` 하나를 보내고 ack(`RealtimeAck`)를 받는다. 페이로드가 없거나 둘 이상이면 모르는 채널처럼 422 `validation.invalid_choice`(`source.pointer` `/channel`) ack다. python-socketio는 페이로드를 하나씩 인자로 넘기므로 처리기는 `*payloads`로 받는다(인자가 맞지 않으면 처리기가 `TypeError`로 끝나 ack를 보내지 못한다). 채널은 모듈이 선언한다(`Channel`, posts는 `posts`와 `posts:all`). 권한이 필요한 채널은 구독할 때 DB에서 권한을 계산한다.
- 연결 재검사: 세션을 폐기하거나(`session.revoked`) 역할·상태를 바꾸면(`me.updated`의 `roles`, `status`) 모듈이 `queue_recheck(session, 사용자 id)`를 넣고, commit한 뒤에 발행기가 제어 채널(`<pub/sub 채널>:control`, `app.core.realtime_pubsub.ControlChannel`)로 알린다. 여러 세션을 폐기하는 요청(다른 기기·전체 로그아웃, 비밀번호 변경·재설정, 계정 닫기)은 폐기한 세션이 없어도 재검사를 넣는다(auth의 `events.session_revoked`). 만료되기 전에 붙은 연결이 남아 있을 수 있기 때문이다. api 인스턴스마다 제어 채널을 듣다가, 자기 인스턴스에 있는 그 사용자의 연결(`user:{id}` 룸의 참가자)을 다시 검사해 세션이 끝났거나(폐기, 만료) 구독한 채널의 권한을 잃은 연결을 끊는다(realtime 모듈의 `Gateway.recheck`). 사용자별 소켓 id를 인스턴스 밖에 기록하지 않는다. 끊긴 클라이언트는 새 티켓으로 다시 붙는다. 세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독이 `permission.denied`다. 제어 채널을 듣지 못한 동안(Valkey 장애)의 알림은 잃는다. 연결 하나를 다시 검사하다 끝내지 못하면(예: DB 장애) 그 연결은 끊지 않고 남겨 두고(fail-open) 나머지 연결을 이어서 검사한다.
- 발행: 모듈이 쓰기의 commit 전에 `queue(session, 이름, 룸, 페이로드를 만드는 함수)`로 넣으면, 세션(`EventSession`)이 commit이 성공한 뒤 페이로드를 만들어 발행기로 보낸다. rollback하면 버려지고, 발행에 실패해도 요청은 성공한다. 계정 닫기 같은 훅 안에서 넣은 이벤트도 부른 쪽의 commit 뒤에 나간다. 룸이 없는 이벤트는 보내지 않는다(빈 룸 목록을 그대로 넘기면 Socket.IO가 room 전체 브로드캐스트로 다루기 때문이다).
- 인스턴스 사이: api의 발행기는 이 인스턴스의 연결에 보내고 Valkey pub/sub으로 다른 인스턴스에 알린다. python-socketio 매니저는 발행이 실패하거나 수신을 다시 시작할 때마다 Valkey 클라이언트를 새로 만든다. `TrackedRedisManager`는 클라이언트를 하나만 만들어 다시 쓰고(redis-py가 다시 연결한다) 닫을 때 닫는다. worker와 scheduler는 소켓 서버가 아니라 쓰기 전용 발행기(`JobContext.realtime`)로 보낸다. pub/sub 채널 이름에는 Valkey DB 번호를 넣어 개발, 테스트, E2E를 나눈다.
- 계약: 채널, 이벤트, 메시지는 계약의 `x-realtime-channels`, `x-realtime-events`, `x-realtime-messages`와 같다. 앱이 `openapi.json`에 이 확장과 페이로드 스키마를 내고(`realtime_openapi`), 저장소의 구조 비교(`pnpm spec-compare`)가 계약과 같은지 본다.
```

`templates/fastapi/docs/recipes/endpoint.md`를 고친다.

찾을 부분:

```markdown
- 권한이 새로 필요하면 [권한 추가](permission.md), 요청 밖에서 할 일이 있으면 [잡 추가](job.md)를 따른다.
- `tests/`: `api`와 `accounts` fixture로 성공, 권한 없음(403), 없음(404), 틀린 본문(422)을 확인한다.

## 확인

- `uv run poe check`가 통과한다.
```

바꿀 내용:

```markdown
- 권한이 새로 필요하면 [권한 추가](permission.md), 요청 밖에서 할 일이 있으면 [잡 추가](job.md)를 따른다.
- `tests/`: `api`와 `accounts` fixture로 성공, 권한 없음(403), 없음(404), 틀린 본문(422)을 확인한다.

## 규칙

- 문서 모델의 정수는 `int`가 아니라 `Int32`·`Int64`(`app.core.jsonapi.models`)로 쓴다. 두 별칭은 strict라 계약의 integer처럼 숫자 문자열(`"10"`)과 불리언을 422 `validation.invalid_format`으로 거절한다. `int`는 lax라 둘을 정수로 바꿔 받는다.
- DB에 저장하는 문자열 필드에는 길이 제약(`Field(max_length=...)`, `StringConstraints(max_length=...)`)을 둔다. 제약이 있는 문자열만 Pydantic이 값을 파싱해 짝 없는 서로게이트(JSON의 `\ud800`)를 422 `validation.invalid_format`으로 거절한다. 제약 없는 `str`은 그 값을 그대로 받고, 저장할 때 psycopg가 UTF-8로 인코딩하지 못해 500이 난다. 제약 없는 문자열은 비교에만 쓴다(토큰, id, 허용 목록과 맞춰 보는 파일의 `contentType`).
- 계약 모양 때문에 길이를 `json_schema_extra`와 검증기로 따로 세는 필드(널 허용 문자열의 `maxLength`가 `anyOf` 밖에 있는 경우)는 Pydantic이 파싱하지 않는다. 그 검증기가 길이보다 먼저 짝 없는 서로게이트를 `string_unicode`로 거절한다(`roles/schemas.py`의 `RoleDescription`).

## 확인

- `uv run poe check`가 통과한다.
```

`templates/fastapi/docs/recipes/module.md`를 고친다.

찾을 부분:

```markdown

## 고칠 파일

- `models.py`, `schemas.py`: 속성과 관계. 복사한 title, body, status, author, coverImage는 posts의 것이다. 문서 모델의 이름은 `<단수 Pascal>Resource`, `<단수 Pascal>Document` 꼴을 유지한다.
- `policies.py`: 보기와 고치기 규칙, 상태 전이 표. 상태가 없는 리소스면 전이 표와 status를 지운다.
- `service.py`: 유스케이스. 공개 목록 캐시는 예시다. 필요 없으면 지운다.
- 에러 코드와 감사 행위: 생성 직후에는 posts의 값(`post.invalid_transition`, `post.deleted_by_admin`, 감사 대상 `posts`)을 그대로 쓴다. 새 값을 `ErrorCode`(`app.core.jsonapi.error_codes`), `AuditLogAction`·`AuditLogTargetType`(`app.core.audit`)에 더한 뒤 바꾸고, 테스트의 기대값도 바꾼다.
```

바꿀 내용:

```markdown

## 고칠 파일

- `models.py`, `schemas.py`: 속성과 관계. 복사한 title, body, status, author, coverImage는 posts의 것이다. 문서 모델의 이름은 `<단수 Pascal>Resource`, `<단수 Pascal>Document` 꼴을 유지한다. 새 속성은 [엔드포인트 추가](endpoint.md)의 규칙(정수는 `Int32`·`Int64`, 저장하는 문자열에는 길이 제약)을 따른다.
- `policies.py`: 보기와 고치기 규칙, 상태 전이 표. 상태가 없는 리소스면 전이 표와 status를 지운다.
- `service.py`: 유스케이스. 공개 목록 캐시는 예시다. 필요 없으면 지운다.
- 에러 코드와 감사 행위: 생성 직후에는 posts의 값(`post.invalid_transition`, `post.deleted_by_admin`, 감사 대상 `posts`)을 그대로 쓴다. 새 값을 `ErrorCode`(`app.core.jsonapi.error_codes`), `AuditLogAction`·`AuditLogTargetType`(`app.core.audit`)에 더한 뒤 바꾸고, 테스트의 기대값도 바꾼다.
```

- [ ] **Step 5: 검사를 돌린다**

Run(`templates/fastapi`에서): `uv run poe check`

Expected: `check 통과: 9단계`로 시작하는 한 줄. 건너뛴 단계가 있으면 `.cache/check`를 지우고 다시 돌린다.

Run(저장소 루트에서): `pnpm check`

Expected: `check 통과: 9단계`로 시작하는 한 줄

Run(저장소 루트에서): `pnpm spec-compare contract/openapi.yaml templates/fastapi/openapi.json`

Expected: 차이 없이 끝난다(종료 코드 0).

Run(저장소 루트에서): `pnpm conformance fastapi`

Expected: 마지막에 `Tests  94 passed (94)`. 끝나면 인프라가 내려가므로 `templates/fastapi`에서 `docker compose up -d --wait`로 다시 올린다.

Run(저장소 루트에서): `pnpm conformance mock`

Expected: 마지막에 `Tests  94 passed (94)`.

- [ ] **Step 6: 커밋한다**

```bash
git add \
  contract/mock/AGENTS.md \
  docs/conventions/jsonapi.md \
  docs/superpowers/specs/2026-09-26-fastapi-template-design.md \
  docs/superpowers/specs/2026-09-29-fastapi-hardening-design.md \
  docs/superpowers/specs/2026-09-30-nextjs-web-design.md \
  scripts/src/spec-compare/cli.ts \
  scripts/src/spec-compare/compare.ts \
  templates/fastapi/.env.example \
  templates/fastapi/AGENTS.md \
  templates/fastapi/docs/architecture.md \
  templates/fastapi/docs/recipes/endpoint.md \
  templates/fastapi/docs/recipes/module.md \
  templates/fastapi/src/app/core/AGENTS.md
git commit -m "docs: record the FastAPI and contract corrections"
```
