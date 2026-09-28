---
name: add-realtime-event
description: 쓰기의 결과를 연결된 클라이언트에 Socket.IO 이벤트로 바로 알릴 때(채널이나 사용자 룸으로 보내기) 쓴다.
---

# 실시간 이벤트 추가

1. `docs/recipes/realtime-event.md`를 읽는다. 절차의 원본이다. 이 skill과 다르면 레시피를 따른다.
2. 모듈의 `schemas.py`에 페이로드 모델을, `events.py`에 채널과 이벤트 선언과 보내는 함수를 둔다.
3. service가 commit 전에 `queue`로 넣게 하고, 공개 인터페이스와 `registry.py`의 `CHANNELS`, `EVENTS`에 더한다.
4. `publisher` fixture로 보낸 이벤트의 룸과 페이로드를 보는 테스트를 쓴다.
5. `uv run poe gen`과 `uv run poe check`를 통과시킨다. 실패하면 출력의 고치는 방법대로 고친다.
