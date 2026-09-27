# migrations

Alembic 마이그레이션이다. 설정은 `pyproject.toml`의 `[tool.alembic]`, 절차는 `docs/recipes/migration.md`에 있다.

- 커밋된 마이그레이션(`versions/`의 파일)은 고치거나 지우지 않는다. 어딘가에 이미 적용됐을 수 있다. 바꿀 것이 있으면 새 리비전을 만든다. Claude Code hook도 고치거나 지우는 것을 막는다.
- 새 리비전은 `uv run poe db:revision "<무엇을 바꾸는지>"`로 만든다. 모델과 개발 DB를 비교한 초안이므로 읽고 고친다. 이름 바꾸기, 데이터 옮기기, enum 값 변경은 자동 생성이 놓친다.
- 초안은 post-write hook이 `ruff format`과 `ruff check --fix`로 정리한다.
- `env.py`는 설정의 `DATABASE_URL`로 동기 연결을 쓴다. 테스트는 `app_test`를 head까지 올린 뒤 돈다.
- 제약 이름은 `app.core.db.NAMING_CONVENTION`을 따른다. 이름을 직접 적지 않는다.
