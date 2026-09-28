# 잡 추가

## 언제

요청 안에서 기다리지 않을 일(메일, 외부 API 호출, 무거운 처리)이나 주기 작업(정리, 집계)을 더할 때.

## 명령

1. 잡을 선언하고 등록한다(아래 "고칠 파일").
2. `uv run poe dev`: api, worker, scheduler를 함께 띄워 직접 보낸다. worker의 로그에 잡 이름이 찍힌다.
3. `uv run poe check`.

## 고칠 파일

- `src/app/modules/<모듈>/jobs.py`
  - 함수: `async def <동사>(<인자>, context: JobContext = JOB_CONTEXT) -> None`. 인자는 JSON으로 오갈 수 있는 값(원시 값, Pydantic 모델)만 쓴다. 설정, DB 세션(`context.sessions()`), 스토리지는 `context`로 받는다.
  - 선언: `<이름> = Job("<모듈>.<동사구>", <함수>)`. 주기 작업은 `cron="0 * * * *"`(UTC)을 더한다. 파일 끝에 `JOBS = (<이름>, ...)`.
- `src/app/modules/<모듈>/__init__.py`: `JOBS`를 내보낸다.
- `src/app/modules/registry.py`: `JOBS`에 `*<모듈>.JOBS`를 더한다.
- 요청에서 보낼 때: 라우터가 `jobs: JobsDep`을 받아 서비스에 넘기고, 서비스가 commit한 뒤 `await jobs.enqueue(<잡>, <인자>)`로 보낸다.

## 규칙

- 잡 이름은 큐의 task_name이다. 큐에 남은 잡이 길을 잃으므로 배포한 뒤에는 바꾸지 않는다.
- 실패하면 worker가 재시도한다. 같은 잡이 두 번 돌아도 결과가 같게 쓴다.
- 정리 잡처럼 DB를 읽고 지우는 잡은 로직을 서비스 함수로 두고 잡은 그 함수를 부른다(예: `files.jobs.purge_pending`).

## 확인

- 잡 함수를 테스트에서 직접 부른다: `await <함수>(..., context=JobContext(settings=infra, sessions=db, storage=storage))`.
- API 테스트에서는 테스트 앱의 잡 큐가 잡을 그 자리에서 실행한다.
- 잡 이름이 겹치면 `src/app/tests/test_registry.py`가 실패한다.
- `uv run poe check`가 통과한다.
