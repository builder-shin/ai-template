# tools

하네스 도구다. 운영 이미지에 들어가지 않는다. 템플릿 루트를 작업 폴더로 두고 실행한다(`uv run poe <명령>`, hook은 `uv run --directory <프로젝트>`).

- `cli.py`: poe 명령의 입구. 새 명령은 `pyproject.toml`의 `[tool.poe.tasks]`에 이 파일의 함수를 부르는 script 태스크로 더한다. poe는 반환값을 버리므로 실패는 `SystemExit`로 알린다.
- `check/`: check 실행기. 단계 목록은 `steps.py`, 입력 해시 캐시는 `cache.py`, 빠른 경로의 테스트 선택은 `selection.py`.
- `checks/`: 하네스 검사. check의 architecture, harness, skills 단계가 `python -m tools.checks <그룹>`으로 돌린다.
- `hooks/`: Claude Code hook(`.claude/settings.json`이 부른다).
- `infra.py`: compose 기동, DB와 버킷 준비, 테스트 전 사전 확인.
- `processes.py`, `dev.py`, `e2e.py`: 여러 프로세스를 함께 띄우고 내린다(`dev`, `test:e2e`, `e2e:serve`). `e2e:serve`의 받은 명령만 `POE_PWD`(호출한 폴더)에서 실행한다.
- `genmodule/`: 모듈 생성기(`gen:module`). 이름 규칙은 `names.py`, 소스 바꾸기와 골든 모듈의 표시는 `transform.py`, 검사·쓰기·등록은 `generate.py`.
- `binaries.py`: 외부 바이너리(Betterleaks) 설치기. `githooks.py`: lefthook 설치. `openapi_export.py`: `openapi.json` 내보내기.

## 규칙

- 검사와 도구의 메시지는 한국어로 쓰고, 문제는 `파일:줄 규칙 — 고치는 방법` 한 줄로 알린다.
- 자식 프로세스에는 `PYTHONUTF8=1`을 넘기고 출력은 UTF-8로 읽는다. Windows 파이프의 기본 인코딩은 cp949라 한국어와 "—"를 쓰지 못한다. poe와 check는 `PYTHONUTF8=1`을 이미 주므로, 도구 모듈을 직접 돌릴 때만 이 값을 준다.
- 플랫폼별 값은 `os.name`과 `getattr`로 고른다. `sys.platform`으로 가르면 다른 플랫폼의 basedpyright가 그 분기를 도달할 수 없는 코드로 잡는다.
- 무거운 라이브러리(boto3 등)를 쓰는 모듈은 명령 함수 안에서 import한다. `check`와 hook이 느려지지 않게 한다.
- 테스트는 `tools/tests/`에 두고 임시 폴더로 확인한다.
