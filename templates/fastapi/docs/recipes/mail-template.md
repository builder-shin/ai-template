# 메일 템플릿 추가

## 언제

모듈이 사용자에게 메일을 보낼 때(알림, 초대 등).

## 명령

1. 템플릿과 메일을 만드는 함수를 쓰고, 서비스에서 보낸다(아래 "고칠 파일").
2. `uv run poe dev`로 띄워 보내 보고 Mailpit(http://127.0.0.1:28025)에서 받은 메일을 본다.
3. `uv run poe check`.

## 고칠 파일

- `src/app/modules/<모듈>/templates/<로케일>/<메일>.subject.txt`, `.txt`, `.html`: 로케일(`ko`, `en`)마다 세 파일을 모두 둔다. 변수는 Jinja(`{{ name }}`)로 쓰고, 넘기지 않은 변수를 쓰면 렌더링이 실패한다. `.html`만 이스케이프한다.
- 메일을 만드는 함수: `TEMPLATES = MailTemplates(<모듈 폴더> / "templates")`를 두고 `TEMPLATES.render("<메일>", locale=user.locale, to=user.email, <변수>=...)`로 `Mail`을 만든다(예: `auth/service/mails.py`). 링크는 설정의 `FRONTEND_URL`에 경로를 붙인다.
- 서비스: commit한 뒤 `await jobs.enqueue(SEND_MAIL, <메일>)`로 보낸다. 요청은 SMTP를 기다리지 않고, 실패하면 worker가 재시도한다.

## 규칙

- 받는 사람의 로케일이 `ko`, `en`이 아니면 `ko`로 보낸다.
- 메일 주소 같은 개인정보는 로그와 감사 기록에 남기지 않는다.

## 확인

- check의 `harness` 단계(mail-template 검사)가 로케일마다 세 파일이 있는지 본다.
- 테스트는 실제로 보내고 `mailbox` fixture(Mailpit)로 읽는다: `[mail] = await mailbox.wait_for(<받는 사람>)`.
- `uv run poe check`가 통과한다.
