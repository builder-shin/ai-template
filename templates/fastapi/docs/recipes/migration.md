# 마이그레이션

## 언제

SQLAlchemy 모델(`src/app/modules/<모듈>/models.py`)을 더하거나 고쳐 테이블 구조가 바뀔 때.

## 명령

1. `uv run poe db:revision "<무엇을 바꾸는지>"`: 모델과 로컬 DB를 비교해 `migrations/versions/`에 초안을 만든다.
2. 초안을 읽고 고친다. 자동 생성은 이름 바꾸기, 데이터 옮기기, enum 값 변경을 놓친다.
3. `uv run poe db:migrate`: 로컬 `app` DB에 적용한다.
4. `uv run poe check`: 테스트는 `app_test` DB를 head까지 마이그레이션한 뒤 돈다.

## 고칠 파일

- `src/app/modules/<모듈>/models.py`
- `migrations/versions/`의 새 초안

## 규칙

- 커밋된 마이그레이션은 고치거나 지우지 않는다. 어딘가에 이미 적용됐을 수 있다. 바꿀 것이 있으면 새 리비전을 만든다.
- 로컬 DB를 처음 상태로 되돌리려면 `uv run poe db:reset`을 쓴다. `localhost`가 아닌 DB에서는 거부한다.

## 확인

- `uv run poe db:migrate`가 성공한다.
- `uv run poe check`가 통과한다.
