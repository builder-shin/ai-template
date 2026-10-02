---
name: add-page
description: ko/en 경로에 Server Component 페이지와 진입 링크를 추가할 때 쓴다.
---

# 페이지 추가

1. `docs/recipes/add-page.md`를 읽는다. 절차의 원본이며 이 skill과 다르면 레시피를 따른다.
2. 설치된 Next 문서 → ko/en → 페이지 → 기능 공개 인터페이스 → 로딩 경계·날짜 → 진입 링크·로그인 보호 순서로 고친다.
3. 레시피의 경계·server-only·폼·로딩·번역 규칙을 따른다.
4. 사용자에게 보이는 동작을 컴포넌트·실제 HTTP 검사로 확인하고 새 흐름은 ko/en E2E에 더한다.
5. 개발 서버를 종료하고 3100·4110을 비운 뒤 `pnpm fix`, `pnpm check`, `pnpm build`, `pnpm test:e2e`를 순서대로 통과시킨다.
