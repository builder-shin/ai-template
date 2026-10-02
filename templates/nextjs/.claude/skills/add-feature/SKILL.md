---
name: add-feature
description: 골든 posts를 복사해 새 기능과 화면·번역·테스트를 추가할 때 쓴다.
---

# 기능 추가

1. `docs/recipes/add-feature.md`를 읽는다. 절차의 원본이며 이 skill과 다르면 레시피를 따른다.
2. `pnpm gen:feature <복수형 이름>`을 실행하고 출력한 고칠 곳을 확인한다.
3. 레시피의 파일 순서로 계약·목 → 생성 타입 → 기능 → ko/en → 화면·진입 링크 → 테스트를 맞춘다.
4. 새 계약이 있으면 `pnpm gen`한다. 레시피의 경계·server-only·폼·로딩·번역 규칙을 따른다.
5. 개발 서버를 종료하고 3100·4110을 비운 뒤 `pnpm fix`, `pnpm check`, `pnpm build`, `pnpm test:e2e`를 순서대로 통과시킨다.
