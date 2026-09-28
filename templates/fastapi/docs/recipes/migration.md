# 마이그레이션

## 언제

SQLAlchemy 모델(`src/app/modules/<모듈>/models.py`)을 더하거나 고쳐 테이블 구조가 바뀔 때. 새 모듈은 `uv run poe gen:module`이 초안을 함께 만든다([모듈 추가](module.md)).

## 명령

1. `uv run poe db:revision "<무엇을 바꾸는지>"`: 모델과 로컬 DB를 비교해 `migrations/versions/`에 초안을 만든다.
2. 초안을 읽고 고친다. 자동 생성은 이름 바꾸기, 데이터 옮기기, enum 값 변경을 놓친다.
3. `uv run poe db:migrate`: 로컬 `app` DB에 적용한다.
4. `uv run poe check`: 테스트는 `app_test` DB를 head까지 마이그레이션한 뒤 돈다. `app_test`가 지금 없는 리비전(지운 초안, 다른 브랜치의 리비전)에 있으면 스키마를 비우고 처음부터 다시 한다.

## 고칠 파일

- `src/app/modules/<모듈>/models.py`
- `migrations/versions/`의 새 초안

## 규칙

- 커밋된 마이그레이션은 고치거나 지우지 않는다. 어딘가에 이미 적용됐을 수 있다. 바꿀 것이 있으면 새 리비전을 만든다.
- 커밋하지 않은 초안(`gen:module`이 만든 것 포함)은 지우고 다시 만들어도 된다. 로컬 `app` DB에 이미 적용했으면 지우기 전에 `uv run alembic downgrade -1`로 내린다.
- 로컬 DB를 처음 상태로 되돌리려면 `uv run poe db:reset`을 쓴다. `localhost`가 아닌 DB에서는 거부한다.

## 확인

- `uv run poe db:migrate`가 성공한다.
- `uv run poe check`가 통과한다.
