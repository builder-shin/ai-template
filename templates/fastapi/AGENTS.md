# FastAPI 템플릿

JSON:API 규약을 따르는 FastAPI 백엔드다. Python 3.14와 uv를 쓰고, 명령은 `uv run poe <명령>`으로 부른다.

## 명령

| 명령               | 하는 일                                         |
| ------------------ | ----------------------------------------------- |
| `uv run poe setup` | `.env`가 없으면 `.env.example`을 복사한다       |
| `uv run poe fix`   | 린트 자동 수정(`ruff check --fix`)과 포맷       |
| `uv run poe test`  | 테스트(`src`와 `tools`의 `tests/`, E2E 제외)    |

`dev`, `check`, `test:e2e`, `gen`, `db:migrate`, `db:reset`, `db:revision`은 선언만 있다. 부르면 구현할 계획 태스크를 알리고 실패한다.

## 구조

- `src/app/core/`: 도메인을 모르는 기반. 설정은 `config.py`의 `Settings` 하나다.
- `src/app/modules/`: 도메인 모듈. `posts`는 골든 모듈 자리다.
- `tools/`: 하네스 도구. `cli.py`가 poe 명령의 입구이고, `checks/`에 검사가 있다.
- `api-style/lint.mjs`: 저장소가 넣는 API 스타일 룰셋 번들의 사본이다.
- `docs/recipes/`: 작업 절차.

## 규칙

- 설정 필드를 더하거나 빼면 `.env.example`도 같이 고친다.
- 테스트는 대상 코드 옆의 `tests/`에 둔다: `src/app/core/tests/`, `src/app/modules/<이름>/tests/`, `tools/tests/`.
- 생성물은 직접 고치지 않는다: `uv.lock`(`uv add`, `uv lock`), `api-style/lint.mjs`(저장소의 `pnpm sync`).
- 문서, 주석, 도구 메시지는 한국어로, 식별자는 영어로 쓴다.
- 작업을 끝내기 전에 `uv run poe test`를 통과시킨다.
