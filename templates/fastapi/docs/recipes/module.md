# 모듈 추가

## 언제

새 리소스(테이블과 JSON:API 엔드포인트)를 더할 때. 이미 있는 모듈에 엔드포인트만 더하면 [엔드포인트 추가](endpoint.md)를 따른다.

## 명령

1. `uv run poe gen:module <이름>`: 이름은 영어 복수형 kebab-case다(예: `comments`, `blog-posts`). 끝 단어의 단수형이 규칙(categories → category, boxes → box, comments → comment)과 다르면 `--singular <단수형>`을 붙인다.
   - 골든 모듈 `posts`를 `src/app/modules/<이름>/`으로 복사하고 이름을 바꾼다. 식별자, 리소스 type, 경로, 권한(`<이름>:create`, `<이름>:manage`), 테이블, 테스트가 바뀐다.
   - 등록한다: `src/app/modules/registry.py`(라우터, 권한, 파일 읽기 규칙과 참조 확인), `src/app/main.py`의 `TAGS`, `roles/schemas.py`의 `PermissionCode`.
   - `migrations/versions/`에 새 테이블의 초안을 만든다. posts 테이블을 복사한 것이다.
   - 이름이 파이썬 예약어·내장 이름이나 골든 모듈이 쓰는 이름(author, session 등)과 겹치면 아무 파일도 쓰지 않고 멈춘다. 다른 이름을 쓴다.
2. 출력 끝의 "고칠 곳" 목록과 다음 할 일을 따라 고친다(아래 "고칠 파일").
3. 모델을 고쳤으면 마이그레이션 초안을 다시 만든다: 초안 파일을 지우고 `uv run poe db:revision "<이름> 테이블"`. 초안을 로컬 DB에 이미 적용했으면(`db:migrate`) 지우기 전에 `uv run alembic downgrade -1`로 내린다. [마이그레이션](migration.md)
4. `uv run poe db:migrate`, `uv run poe gen`, `uv run poe check`.

## 고칠 파일

- `models.py`, `schemas.py`: 속성과 관계. 복사한 title, body, status, author, coverImage는 posts의 것이다. 문서 모델의 이름은 `<단수 Pascal>Resource`, `<단수 Pascal>Document` 꼴을 유지한다.
- `policies.py`: 보기와 고치기 규칙, 상태 전이 표. 상태가 없는 리소스면 전이 표와 status를 지운다.
- `service.py`: 유스케이스. 공개 목록 캐시는 예시다. 필요 없으면 지운다.
- 에러 코드와 감사 행위: 생성 직후에는 posts의 값(`post.invalid_transition`, `post.deleted_by_admin`, 감사 대상 `posts`)을 그대로 쓴다. 새 값을 `ErrorCode`(`app.core.jsonapi.models`), `AuditLogAction`·`AuditLogTargetType`(`app.core.audit`)에 더한 뒤 바꾸고, 테스트의 기대값도 바꾼다.
- `permissions.py`: 권한 설명. 가입한 사람이 쓰게 하려면 [권한 추가](permission.md)를 따른다.
- `src/app/modules/registry.py`: 커버 이미지를 쓰지 않으면 이 모듈의 파일 읽기 규칙과 참조 확인 줄을 지운다(모델, 서비스, 라우터의 coverImage도 지운다).
- 문서, 주석, API 설명(`description`): 골든 모듈은 글을 설명한다.
- `tests/`: 바꾼 규칙에 맞게 고친다. 권한 매트릭스(`test_permissions.py`)는 새 규칙의 표로 바꾼다.

## 확인

- `uv run poe check`가 통과한다. 생성 직후에도 통과한다.
- `openapi.json`에 새 경로(`/api/v1/<이름>`)와 태그가 있다.
