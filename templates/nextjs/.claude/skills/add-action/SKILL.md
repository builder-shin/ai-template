---
name: add-action
description: 기능에 쓰기 Server Action과 제출 폼·오류 결과를 추가할 때 쓴다.
---

# Server Action 추가

1. `docs/recipes/add-action.md`를 읽는다. 절차의 원본이며 이 skill과 다르면 레시피를 따른다.
2. 설치 문서·계약 → 결과 타입 → 실제 목 RED → Action·오류·경로 갱신 → ko/en·폼 → 공개 index·페이지 순서로 고친다.
3. 레시피의 경계·server-only·폼·로딩·번역 규칙을 따른다. 429의 retryAfter도 보존한다.
4. 레시피의 같은 Vitest 명령으로 GREEN을 확인하고 실제 SSR 폼의 JS 없는 제출·오류·이동을 검사한다.
5. 개발 서버를 종료하고 3100·4110을 비운 뒤 `pnpm fix`, `pnpm check`, `pnpm build`, `pnpm test:e2e`를 순서대로 통과시킨다.
