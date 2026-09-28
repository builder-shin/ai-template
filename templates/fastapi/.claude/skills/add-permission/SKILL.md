---
name: add-permission
description: 새 행동을 역할과 권한으로 막을 때 쓴다. 권한 코드를 선언하고 PermissionCode와 라우트 선언에 더한다.
---

# 권한 추가

1. `docs/recipes/permission.md`를 읽는다. 절차의 원본이다. 이 skill과 다르면 레시피를 따른다.
2. 모듈의 `permissions.py`와 `roles/schemas.py`의 `PermissionCode`에 같은 코드를 더한다.
3. 라우트 선언의 `permission=`이나 `policies.py`의 판정에서 쓰고, `uv run poe gen`을 돌린다.
4. `uv run poe check`를 통과시킨다. 실패하면 출력의 고치는 방법대로 고친다.
