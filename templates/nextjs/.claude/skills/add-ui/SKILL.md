---
name: add-ui
description: 고정 shadcn CLI로 Base UI 부품을 추가하고 기능 화면에서 조합할 때 쓴다.
---

# UI 부품 추가

1. `docs/recipes/add-ui.md`를 읽는다. 절차의 원본이며 이 skill과 다르면 레시피를 따른다.
2. components 설정·고정 CLI info → docs·설치 → 소스·의존성·lockfile 검토 → ko/en → 기능 조합·공개 index → 역할·키보드·props 검사 순서로 고친다.
3. 레시피의 경계·server-only·폼·로딩·번역 규칙을 따른다. 공식 skill의 latest 명령은 `pnpm exec shadcn`으로 바꾼다.
4. 새 의존성은 레시피의 공개 시각 확인과 exact pin을 따른다. `pnpm install --frozen-lockfile`로 확인한다.
5. 개발 서버를 종료하고 3100·4110을 비운 뒤 `pnpm fix`, `pnpm check`, `pnpm build`, `pnpm test:e2e`를 순서대로 통과시킨다.
