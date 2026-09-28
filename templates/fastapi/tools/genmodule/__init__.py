"""모듈 생성기(`uv run poe gen:module <이름>`): 골든 모듈 posts를 복사해 새 모듈을 만들고 등록한다.

- 이름은 영어 복수형 kebab-case다(예: comments, blog-posts). 단수형은 규칙으로 만들고(categories →
  category, boxes → box), 규칙과 다르면 `--singular`로 끝 단어의 단수형을 준다.
- 바꾸는 것: 식별자(snake, Pascal, UPPER), 문자열과 주석(리소스 type, 경로, 권한 코드는 kebab),
  테이블과 제약 이름(snake). 속성 post(api.post)와 문자열 "POST"는 HTTP 메서드라 그대로 둔다.
- 골든 모듈의 표시(`gen:module:` 뒤의 말)
  - `빼기`: 그 줄을 복사하지 않는다. `빼기 시작`부터 `빼기 끝`까지는 묶음으로 뺀다(시드 예제 등).
  - `그대로`: 그 줄을 바꾸지 않는다(계약의 에러 코드와 감사 행위처럼 다른 곳에 정의된 값).
  - `고칠 곳 — 설명`: 바꾸되, 끝에 고칠 곳 목록으로 알린다.
- 등록: registry.py(ROUTERS, PERMISSIONS, 파일 규칙), main.py의 TAGS, roles의 PermissionCode.
- 마이그레이션 초안: posts 테이블을 만드는 리비전을 복사해 이름을 바꾸고 지금의 head 뒤에 잇는다.
  리비전 폴더와 head는 Alembic이 pyproject.toml의 [tool.alembic] 설정으로 읽는다.
- 이름, 겹치는 식별자와 테이블, 등록 위치, head를 먼저 모두 검사하고 문제가 없을 때만 파일을
  쓴다. 쓴 뒤 ruff로 정리하고 openapi.json을 다시 쓴다. 만든 모듈은 고치지 않아도
  `uv run poe check`를 통과한다. 만든 이름(단수형 포함)을 한 줄로 알린다.

파일: names(이름 규칙과 바꾸기), transform(파이썬 소스와 표시), generate(검사, 쓰기, 등록, 명령).
"""
