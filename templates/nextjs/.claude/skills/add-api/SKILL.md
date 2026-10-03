---
name: add-api
description: TypeSpec 계약과 실제 목 핸들러를 함께 확장하고 web에 연결할 때 쓴다.
---

# 계약 확장

`gen.config.json`으로 백엔드 OpenAPI를 선택한 프로젝트의 web 타입은 백엔드 선언을 따르므로 먼저 백엔드 OpenAPI를 내보내며, TypeSpec·목 수정은 대역만 바꾼다.

1. `docs/recipes/change-contract.md`를 읽는다. 절차의 원본이며 이 skill과 다르면 레시피를 따른다.
2. 규약·기존 선언·핸들러 → 실제 목 RED → TypeSpec → format·pnpm gen → 목 수기 핸들러 → GREEN → web 연결 순서로 고친다.
3. 레시피의 경계·server-only·폼·로딩·번역 규칙을 따른다. 계약 원본은 TypeSpec이며 생성 타입을 직접 고치지 않는다.
4. 레시피의 같은 목 테스트 명령으로 GREEN을 확인하고 기존 읽기·쓰기·이벤트도 검사한다. 수정한 목 파일은 레시피의 명령으로 따로 포맷한다.
5. 개발 서버를 종료하고 3100·4110을 비운 뒤 `pnpm fix`, `pnpm check`, `pnpm build`, `pnpm test:e2e`를 순서대로 통과시킨다.
