# 실시간 이벤트 추가

## 언제

쓰기의 결과를 연결된 클라이언트에 바로 알릴 때(목록 새로 고침, 알림). 모두가 구독하는 채널로 보내거나, 권한이 있어야 구독하는 채널로 보내거나, 한 사용자의 룸(`user:{id}`)으로 보낸다.

## 명령

1. 페이로드 모델과 이벤트를 선언하고 service에서 보낸다(아래 "고칠 파일").
2. `uv run poe gen`: `openapi.json`의 `x-realtime-channels`, `x-realtime-events`와 페이로드 스키마를 다시 쓴다.
3. `uv run poe check`.

## 고칠 파일

- `src/app/modules/<모듈>/schemas.py`: 페이로드 문서 모델(`<Resource><Event>EventDocument`). 리소스가 바뀐 이벤트는 `Document[<Resource>Resource]`, 지운 이벤트는 리소스 식별자만 담는다(`data: ResourceIdentifier[...]`).
- `src/app/modules/<모듈>/events.py`
  - 채널: `Channel("<이름>", <구독에 필요한 권한 코드 또는 None>, "<설명>")`, 파일에 `CHANNELS`.
  - 선언: `EventSpec("<단수>.<동사>", (<받는 룸의 계약 표기>, ...), <페이로드 모델>)`, 조건부 룸은 `ConditionalRoom("<룸>", "<조건>")`. 파일에 `EVENTS`.
  - 보내는 함수: `queue(session, 이름, 룸, lambda: document_content(<문서>))`. 룸은 채널 이름이나 `user_room(<사용자 id>)`다.
- `src/app/modules/<모듈>/service.py`: 쓰기의 commit 전에 events의 함수를 부른다.
- `src/app/modules/<모듈>/__init__.py`: `CHANNELS`, `EVENTS`를 내보낸다.
- `src/app/modules/registry.py`: `CHANNELS`, `EVENTS`에 더한다(`gen:module`로 만든 모듈은 이미 더해져 있다).
- 두 백엔드가 함께 보내는 플랫폼 이벤트면 계약(`contract/typespec/src/realtime.tsp`, `main.tsp`의 `x-realtime-*`)에 먼저 더한다. 프로젝트 전용 이벤트는 계약에 없다.

## 규칙

- 이벤트는 `queue`로만 보낸다. commit이 성공한 뒤에 페이로드를 만들어 나가고, rollback하면 버려진다. commit 전에 소켓 서버로 직접 보내지 않는다.
- 이벤트를 넣은 트랜잭션은 `await session.commit()`으로 끝낸다. 이벤트는 그 commit이 보낸다(`EventSession`). `async with session.begin():` 블록이 끝날 때의 commit은 이벤트를 보내지 않고, savepoint(`begin_nested`)를 rollback해도 그 안에서 넣은 이벤트는 버려지지 않는다.
- 룸이 없는 이벤트는 보내지 않는다. 빈 룸 목록을 그대로 넘기면 Socket.IO가 room 전체(모든 클라이언트) 브로드캐스트로 다루므로, 발행기가 보내기 전에 막는다. 조건부 룸(`ConditionalRoom`)의 조건이 모두 거짓이라 보낼 룸이 하나도 남지 않을 수 있다.
- 페이로드는 모듈의 직렬화 함수로 만든 JSON:API 문서다. 초안처럼 볼 권한이 필요한 내용은 그 권한이 있어야 구독하는 채널(예: `posts:all`)이나 본인 룸으로만 보낸다.
- 채널의 권한은 구독할 때 본다. 세션이 폐기되거나 사용자의 역할·상태가 바뀌면 서버가 그 사용자의 연결을 다시 검사해, 권한을 잃은 채널을 구독한 연결을 끊는다(`app.core.realtime.queue_recheck`, realtime 모듈의 `Gateway.recheck`). 새 채널도 `Channel`의 `permission`만 선언하면 이 검사를 받는다. 권한이 바뀌는 새 흐름을 더하면 그 쓰기에서 `queue_recheck`를 부른다.
- 잡에서도 같은 방법이다. 잡의 세션은 commit한 뒤 쓰기 전용 발행기(`JobContext.realtime`)로 보낸다. DB와 상관없는 알림은 `await context.realtime.publish(Event(...))`로 바로 보낸다.
- 한 연결이 여러 룸에 들어 있어도 이벤트는 한 번 받는다.

## 확인

- API 테스트: `publisher: RecordingPublisher` fixture가 보낸 이벤트를 모은다. `publisher.named("<이름>")`의 `rooms`와 `payload`를 본다(예: `posts/tests/test_events.py`).
- 소켓으로 받는지: `app.tests.sockets`의 `serving(app)`과 `connected(url)`로 붙어 `await socket.next("<이름>")`로 기다린다.
- `uv run poe check`가 통과한다.
