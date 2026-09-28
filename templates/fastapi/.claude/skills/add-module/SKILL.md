---
name: add-module
description: 새 리소스(테이블과 JSON:API 엔드포인트)를 모듈로 더할 때 쓴다. 댓글, 카테고리, 주문 같은 기능을 더할 때다. gen:module로 골든 모듈 posts를 복사하고 레시피대로 고친다.
---

# 모듈 추가

1. `docs/recipes/module.md`를 읽는다. 절차의 원본이다. 이 skill과 다르면 레시피를 따른다.
2. `uv run poe gen:module <영어 복수형 kebab-case 이름>`을 실행한다. 실패하면 메시지대로 이름을 바꾼다.
3. 출력 끝의 "고칠 곳" 목록과 다음 할 일을 할 일 목록으로 삼아 레시피의 "고칠 파일"대로 고친다.
4. `uv run poe check`를 통과시킨다. 실패하면 출력의 고치는 방법대로 고친다.
