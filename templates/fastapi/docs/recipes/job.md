# 잡 추가

## 언제

요청 안에서 기다리지 않을 일(메일, 외부 API 호출, 무거운 처리)이나 주기 작업(정리, 집계)을 더할 때.

## 명령

1. 잡을 선언하고 등록한다(아래 "고칠 파일").
2. `uv run poe dev`: api, worker, scheduler를 함께 띄워 직접 보낸다. worker의 로그에 잡 이름이 찍힌다.
3. `uv run poe check`.

## 고칠 파일

- `src/app/modules/<모듈>/jobs.py`
  - 함수: `async def <동사>(<인자>, context: JobContext = JOB_CONTEXT) -> None`. 인자는 id뿐이다. 메일 주소, 렌더한 메일, 토큰, 비밀번호 같은 개인정보와 비밀은 싣지 않고 잡 안에서 읽거나 만든다(재시도 데이터가 Valkey에 남는다). 설정, DB 세션(`context.sessions()`), 스토리지, 실시간 발행기(`context.realtime`)는 `context`로 받는다.
  - 선언: `<이름> = Job("<모듈>.<동사구>", <함수>)`. 주기 작업은 `cron="0 * * * *"`(UTC)을 더한다. 파일 끝에 `JOBS = (<이름>, ...)`.
- `src/app/modules/<모듈>/__init__.py`: `JOBS`를 내보낸다.
- `src/app/modules/registry.py`: `JOBS`에 `*<모듈>.JOBS`를 더한다.
- 요청에서 보낼 때: 라우터가 `jobs: JobsDep`을 받아 서비스에 넘기고, 서비스가 commit한 뒤 `await jobs.enqueue(<잡>, <인자>)`로 보낸다. DB에 쓰지 않은 요청도 커밋한다. 테스트는 잡을 그 자리에서 같은 연결로 돌리므로, 트랜잭션이 열려 있으면 잡이 만든 것(발급한 토큰 등)까지 요청과 함께 롤백된다.

## 규칙

- 잡 이름은 큐의 task_name이다. 큐에 남은 잡이 길을 잃으므로 배포한 뒤에는 바꾸지 않는다.
- 실패하면 worker가 재시도한다. 같은 잡이 두 번 돌아도 결과가 같게 쓴다.
- 정리 잡처럼 DB를 읽고 지우는 잡은 로직을 서비스 함수로 두고 잡은 그 함수를 부른다(예: `files.jobs.purge_pending`). 이건 그 서비스 파일이 잡을 보내지 않을(`jobs.py`를 import하지 않을) 때만 쓴다.
- 잡을 보내는 서비스(`jobs.py`의 `Job`을 import하는 파일)와 잡이 부르는 작업은 다른 파일에 둔다. `jobs.py`는 그 작업의 파일만 import한다(예: `auth/jobs.py`는 `auth/service/mails.py`만 부르고, 잡을 보내는 `auth/service/accounts.py`·`passwords.py`는 import하지 않는다). `service.py` 하나뿐인 모듈(`gen:module` 기본)에서 그 서비스가 잡도 보낸다면, 잡이 부르는 작업은 `service.py`가 아니라 새 파일에 둔다. 같은 파일이 둘 다 하면(잡을 보내려고 `jobs.py`를 import하는 파일을 `jobs.py`가 다시 import하면) `ImportError: cannot import name ... from partially initialized module`로 죽는다(`docs/recipes/mail-template.md`도 같은 규칙).

## 확인

- 잡 함수를 테스트에서 직접 부른다: `await <함수>(..., context=JobContext(settings=infra, sessions=db, storage=storage, realtime=publisher))`.
- API 테스트에서는 테스트 앱의 잡 큐가 잡을 그 자리에서 실행한다.
- 잡 이름이 겹치면 `src/app/tests/test_registry.py`가 실패한다.
- `uv run poe check`가 통과한다.
