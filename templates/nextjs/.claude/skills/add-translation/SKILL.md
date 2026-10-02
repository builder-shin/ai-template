---
name: add-translation
description: ko/en 문구·접근성 이름·ICU 인자와 날짜·숫자 표시를 추가할 때 쓴다.
---

# 번역 추가

1. `docs/recipes/add-translation.md`를 읽는다. 절차의 원본이며 이 skill과 다르면 레시피를 따른다.
2. 설치 문서·namespace → ko·en 카탈로그 → 서버·클라이언트 사용처 → 날짜·숫자·링크 → 계약 에러 → 실제 표시 검사 순서로 고친다.
3. 레시피의 경계·server-only·폼·로딩·번역 규칙을 따른다. 두 언어의 키·ICU 인자와 공통 TIME_ZONE을 맞춘다.
4. 실제 표시·오류·계정 언어·URL·쿠키를 컴포넌트·HTTP·E2E에서 확인한다.
5. 개발 서버를 종료하고 3100·4110을 비운 뒤 `pnpm fix`, `pnpm check`, `pnpm build`, `pnpm test:e2e`를 순서대로 통과시킨다.
