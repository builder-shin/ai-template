# FastAPI 템플릿

JSON:API 규약을 따르는 FastAPI 백엔드다. Python 3.14와 uv를 쓰고, 명령은 `uv run poe <명령>`으로 부른다.

## 명령

| 명령                | 하는 일                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `uv run poe setup`  | `.env`가 없으면 `.env.example`을 복사한다                                  |
| `uv run poe check`  | 완료 기준. 포맷, 린트, 타입, 아키텍처, 하네스 검사, 테스트를 차례로 돌린다 |
| `uv run poe fix`    | 포맷과 린트 자동 수정                                                      |
| `uv run poe test`   | 테스트(`src`와 `tools`의 `tests/`, E2E 제외)                               |

- `check`는 성공하면 한 줄, 실패하면 실패한 단계의 출력과 `check 실패: <단계>`만 보여 준다. 입력 파일이 마지막 성공 때와 같은 단계는 건너뛴다(`.cache/check/`).
- 직접 만든 검사는 `파일:줄 규칙 — 고치는 방법` 한 줄씩 알린다. 고치는 방법대로 고친다.
- `check --fast`는 Stop hook이 쓰는 빠른 경로다. 바뀐 모듈의 테스트만 돌린다.
- `dev`, `test:e2e`, `gen`, `db:migrate`, `db:reset`, `db:revision`은 선언만 있다. 부르면 구현할 계획 태스크를 알리고 실패한다.

## 구조

- `src/app/core/`: 도메인을 모르는 기반. 설정은 `config.py`의 `Settings` 하나다.
- `src/app/modules/`: 도메인 모듈. `posts`는 골든 모듈 자리다.
- `tools/`: 하네스 도구. `cli.py`가 poe 명령의 입구이고, `check/`가 check 실행기, `checks/`에 검사가 있다.
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
- 설정 필드를 더하거나 빼면 `.env.example`도 같이 고친다.
- 테스트는 대상 코드 옆의 `tests/`에 둔다: `src/app/core/tests/`, `src/app/modules/<이름>/tests/`, `tools/tests/`.
- 생성물은 직접 고치지 않는다: `uv.lock`(`uv add`, `uv lock`), `api-style/lint.mjs`(저장소의 `pnpm sync`).
- 문서, 주석, 도구 메시지는 한국어로, 식별자는 영어로 쓴다.
- 작업을 끝내기 전에 `uv run poe check`를 통과시킨다.
