# 권한 추가

## 언제

새 행동을 역할로 막을 때(예: 글 고정은 `posts:pin`이 있어야 한다).

## 명령

1. 권한을 선언하고 등록한다(아래 "고칠 파일").
2. `uv run poe gen`: `PermissionCode`가 `openapi.json`에 들어간다.
3. `uv run poe check`.

## 고칠 파일

- `src/app/modules/<모듈>/permissions.py`: `<이름> = Permission("<리소스>:<행동>", "<영어 설명>", "<그룹>")`을 만들고 `PERMISSIONS`에 더한다. 코드는 kebab-case 리소스와 행동이다.
- `src/app/modules/roles/schemas.py`: `PermissionCode`에 같은 코드를 더한다. `src/app/tests/test_registry.py`가 `PermissionCode`와 등록된 권한이 같은지 본다.
- 권한으로 막는 곳
  - 라우트 전체: 선언에 `permission=<이름>.code`를 둔다. 없으면 403이다.
  - 조건에 따라(작성자이거나 관리 권한): `policies.py`에서 `<이름>.code in viewer.permissions`로 판정한다(posts의 `manages`).
- 가입한 사람이 받을 권한이면 `src/app/modules/roles/service.py`의 `SYSTEM_ROLES`에서 member의 권한에 더한다. 시드는 없는 역할만 만들므로 이미 있는 DB의 member 역할은 바뀌지 않는다. 로컬은 `uv run poe db:reset`, 운영은 역할 API(`PATCH /api/v1/roles/{id}`)로 더한다.
- admin 역할은 등록된 모든 권한을 계산해 가지므로 고치지 않는다.

## 확인

- 권한이 있는 계정과 없는 계정으로 요청해 성공과 403을 본다: `await accounts.create(permissions={"<코드>"})`.
- `uv run poe check`가 통과한다.
