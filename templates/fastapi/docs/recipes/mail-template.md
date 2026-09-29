# 메일 템플릿 추가

## 언제

모듈이 사용자에게 메일을 보낼 때(알림, 초대 등).

## 명령

1. 템플릿, 메일을 보내는 함수, 그 잡을 쓰고, 서비스에서 잡을 보낸다(아래 "고칠 파일").
2. `uv run poe dev`로 띄워 보내 보고 Mailpit(http://127.0.0.1:28025)에서 받은 메일을 본다.
3. `uv run poe check`.

## 고칠 파일

- `src/app/modules/<모듈>/templates/<로케일>/<메일>.subject.txt`, `.txt`, `.html`: 로케일(`ko`, `en`)마다 세 파일을 모두 둔다. 변수는 Jinja(`{{ name }}`)로 쓰고, 넘기지 않은 변수를 쓰면 렌더링이 실패한다. `.html`만 이스케이프한다.
- 메일을 보내는 함수: 잡을 보내는 서비스와 다른 파일에 둔다(`service/mails.py`, `service.py` 하나뿐인 모듈은 그와 나란한 `mails.py`). `TEMPLATES = MailTemplates(<모듈 폴더> / "templates")`를 둔다. 함수는 `(context: JobContext, <id>)`를 받아 `context.sessions()`로 받는 사람을 읽고, 보낼 조건을 다시 본 뒤 `TEMPLATES.render("<메일>", locale=user.locale, to=user.email, <변수>=...)`로 만들어 `await send(context.settings, mail)`로 보낸다(예: `auth/service/mails.py`). 토큰이 필요하면 발급해 commit한 뒤에 보낸다. 링크는 설정의 `FRONTEND_URL`에 경로를 붙인다.
- 잡(`jobs.py`): 위 파일만 import한다(잡을 보내는 서비스는 import하지 않는다). `SEND_<메일>_MAIL = Job("<모듈>.send_<메일>_mail", <잡 함수>)`로 선언하고 모듈의 `JOBS`에 더한다. 잡 함수는 id와 `context: JobContext = JOB_CONTEXT`를 받는다(예: `auth/jobs.py`).
- 서비스(요청을 처리하는, 메일을 보내는 함수와는 다른 파일): commit한 뒤 `jobs.py`의 `SEND_<메일>_MAIL`을 import해 `await jobs.enqueue(SEND_<메일>_MAIL, <id>)`로 보낸다. 요청은 SMTP를 기다리지 않고, 실패하면 worker가 재시도한다.

## 규칙

- 받는 사람의 로케일이 `ko`, `en`이 아니면 `ko`로 보낸다.
- 메일 주소 같은 개인정보는 로그와 감사 기록에 남기지 않는다.
- 잡 인자에는 id만 넘긴다. 메일 주소, 렌더한 메일, 토큰을 넘기면 처리할 때까지 큐(Valkey)에 남는다.
- 메일을 보내는 함수와 그 잡을 보내는 서비스가 같은 파일이면, 서비스가 `jobs.py`를 import하고 `jobs.py`가 그 파일을 다시 import해 `ImportError: cannot import name ... from partially initialized module`로 죽는다(`docs/recipes/job.md`도 같은 규칙).

## 확인

- check의 `harness` 단계(mail-template 검사)가 로케일마다 세 파일이 있는지 본다.
- 테스트는 실제로 보내고 `mailbox` fixture(Mailpit)로 읽는다: `[mail] = await mailbox.wait_for(<받는 사람>)`.
- `uv run poe check`가 통과한다.
