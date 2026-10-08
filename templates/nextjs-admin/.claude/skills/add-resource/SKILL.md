---
name: add-resource
description: 관리 앱에 새 JSON:API 리소스의 메뉴·목록·상세·폼을 추가할 때 쓴다.
---

# 리소스 추가

1. `docs/recipes/add-resource.md`를 읽는다. 절차의 원본이며 이 skill과 다르면 레시피를 따른다.
2. 계약의 목록·쓰기 operation을 확인하고 `pnpm gen:resource <type>`으로 선언·ko/en·등록 초안을 만든다. 기존 리소스는 덮지 않고 직접 수정한다.
3. 골든 `src/resources/posts/resource.ts`와 `actions.ts`를 읽고 레시피 순서대로 권한·열·필터·관계·입력·문구를 검토한다. 글 골든에는 작성·수정 폼이 없다.
4. 필드·동작은 해당 레시피를 따른다. 생성 타입을 직접 고치거나 범용 화면 전체를 바꾸지 않는다. 실제 목·DOM·권한 검사를 더한다.
5. `pnpm check`, `pnpm build`, `pnpm test:e2e`를 차례로 통과시키고 시작한 서버를 종료한다.
