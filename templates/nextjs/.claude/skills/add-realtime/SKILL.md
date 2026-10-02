---
name: add-realtime
description: 기존 실시간 채널을 구독하거나 새 채널의 타입·listener를 연결할 때 쓴다.
---

# 실시간 구독 추가

1. `docs/recipes/add-realtime.md`를 읽는다. 절차의 원본이며 이 skill과 다르면 레시피를 따른다.
2. 계약·생성 타입 → RED → 기능 구독 → ko/en 안내 → 새 채널의 공통 listener·Provider → 공개 index·화면 순서로 고친다.
3. 레시피의 경계·server-only·폼·로딩·번역 규칙을 따른다. 공통 연결과 router.refresh를 쓰며 클라이언트 데이터 캐시는 만들지 않는다.
4. 레시피의 Vitest 명령으로 GREEN을 확인한다. 두 컨텍스트의 목록 반영·세션 폐기도 확인한다.
5. 개발 서버를 종료하고 3100·4110을 비운 뒤 `pnpm fix`, `pnpm check`, `pnpm build`, `pnpm test:e2e`를 순서대로 통과시킨다.
