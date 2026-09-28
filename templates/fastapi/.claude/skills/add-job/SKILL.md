---
name: add-job
description: 요청 밖에서 할 일(메일, 외부 API 호출, 무거운 처리)이나 주기 작업(정리, 집계)을 백그라운드 잡으로 더할 때 쓴다.
---

# 잡 추가

1. `docs/recipes/job.md`를 읽는다. 절차의 원본이다. 이 skill과 다르면 레시피를 따른다.
2. 모듈의 `jobs.py`에 잡을 선언하고, 공개 인터페이스와 `registry.py`의 `JOBS`에 더한다.
3. 잡 함수를 직접 부르는 테스트를 쓴다.
4. `uv run poe check`를 통과시킨다. 실패하면 출력의 고치는 방법대로 고친다.
