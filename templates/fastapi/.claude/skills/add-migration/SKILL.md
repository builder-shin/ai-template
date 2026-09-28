---
name: add-migration
description: SQLAlchemy 모델을 더하거나 고쳐 DB 테이블 구조가 바뀔 때 쓴다. 마이그레이션 초안을 만들고 적용한다.
---

# 마이그레이션

1. `docs/recipes/migration.md`를 읽는다. 절차의 원본이다. 이 skill과 다르면 레시피를 따른다.
2. `uv run poe db:revision "<무엇을 바꾸는지>"`로 초안을 만들고, 초안을 읽어 자동 생성이 놓친 것을 고친다.
3. `uv run poe db:migrate`로 로컬 DB에 적용한다.
4. `uv run poe check`를 통과시킨다. 실패하면 출력의 고치는 방법대로 고친다.
