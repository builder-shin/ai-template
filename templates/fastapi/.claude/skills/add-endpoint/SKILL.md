---
name: add-endpoint
description: 이미 있는 모듈에 API 엔드포인트를 더하거나 요청·응답 모양을 바꿀 때 쓴다(글 좋아요, 목록 필터 같은 것).
---

# 엔드포인트 추가

1. `docs/recipes/endpoint.md`를 읽는다. 절차의 원본이다. 이 skill과 다르면 레시피를 따른다.
2. 레시피의 "고칠 파일" 순서(문서 모델 → 선언과 라우트 → 서비스 → 테스트)로 고친다.
3. `uv run poe gen`으로 `openapi.json`을 다시 쓴다.
4. `uv run poe check`를 통과시킨다. 실패하면 출력의 고치는 방법대로 고친다.
