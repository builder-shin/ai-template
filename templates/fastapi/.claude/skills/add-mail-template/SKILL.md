---
name: add-mail-template
description: 모듈이 사용자에게 메일(알림, 초대 등)을 보내게 할 때 쓴다. ko, en 템플릿을 만들고 mail.send 잡으로 보낸다.
---

# 메일 템플릿 추가

1. `docs/recipes/mail-template.md`를 읽는다. 절차의 원본이다. 이 skill과 다르면 레시피를 따른다.
2. 모듈의 `templates/<ko|en>/<메일>.subject.txt`, `.txt`, `.html`을 만든다.
3. `MailTemplates.render`로 메일을 만들고 서비스가 commit한 뒤 `SEND_MAIL`로 보낸다.
4. `uv run poe check`를 통과시킨다. 실패하면 출력의 고치는 방법대로 고친다.
