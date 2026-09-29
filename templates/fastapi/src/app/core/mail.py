"""메일: 모듈의 템플릿으로 만들고, 잡(mail.send)이 SMTP로 보낸다.

- 템플릿은 메일을 보내는 모듈의 `templates/<로케일>/<이름>.subject.txt`, `.txt`, `.html`이다.
  로케일(ko, en)마다 세 파일이 모두 있어야 한다(check의 mail-template 검사). 받는 사람의 로케일이
  없으면 ko를 쓴다. 템플릿에 없는 변수를 쓰면 렌더링이 실패한다(StrictUndefined).
- 서비스는 `MailTemplates.render`로 메일을 만들고 `JobsDep`으로 `SEND_MAIL`을 보낸다. 응답은 SMTP를
  기다리지 않고, 보내다 실패하면 worker가 재시도한다.
- SMTP_URL: `smtp://호스트:포트`(평문), `smtp+starttls://`(STARTTLS), `smtps://`(TLS).
  계정이 있으면 `smtps://사용자:비밀번호@호스트:포트`처럼 주소에 넣는다(퍼센트 인코딩).
"""

from dataclasses import dataclass
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import unquote, urlsplit

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from pydantic import BaseModel

from app.core.config import Settings
from app.core.jobs import JOB_CONTEXT, Job, JobContext

LOCALES = ("ko", "en")
DEFAULT_LOCALE = "ko"
SMTP_TIMEOUT = 10.0  # 초
_DEFAULT_PORTS = {"smtp": 25, "smtp+starttls": 587, "smtps": 465}


class Mail(BaseModel):
    """보낼 메일 하나. 잡 인자로 오간다."""

    to: str
    subject: str
    text: str
    html: str


class MailTemplates:
    """모듈 하나의 메일 템플릿 폴더(`<모듈>/templates`)."""

    def __init__(self, folder: Path) -> None:
        # .html만 이스케이프한다. .txt는 사람이 읽는 평문이라 그대로 쓴다.
        self._environment = Environment(
            loader=FileSystemLoader(folder),
            autoescape=select_autoescape(["html"], default=False),
            undefined=StrictUndefined,
            keep_trailing_newline=True,
        )

    def render(self, template: str, /, *, locale: str, to: str, **context: object) -> Mail:
        """메일 template(예: verify_email)을 locale로 만든다. 모르는 로케일은 ko다.

        context는 템플릿 변수다. 템플릿 이름은 위치 인자라 변수 이름(name 등)과 겹치지 않는다.
        """
        chosen = locale if locale in LOCALES else DEFAULT_LOCALE

        def part(kind: str) -> str:
            return self._environment.get_template(f"{chosen}/{template}{kind}").render(context)

        return Mail(
            to=to,
            subject=" ".join(part(".subject.txt").split()),
            text=part(".txt"),
            html=part(".html"),
        )


def _message(settings: Settings, mail: Mail) -> EmailMessage:
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = mail.to
    message["Subject"] = mail.subject
    message.set_content(mail.text)
    message.add_alternative(mail.html, subtype="html")
    return message


@dataclass(frozen=True, slots=True)
class SmtpServer:
    hostname: str
    port: int
    username: str | None
    password: str | None
    use_tls: bool
    start_tls: bool


def smtp_server(smtp_url: str) -> SmtpServer:
    """SMTP_URL → 접속 정보. 포트가 없으면 방식의 기본 포트(25, 587, 465)다."""
    url = urlsplit(smtp_url)
    return SmtpServer(
        hostname=url.hostname or "localhost",
        port=url.port or _DEFAULT_PORTS[url.scheme],
        username=unquote(url.username) if url.username else None,
        password=unquote(url.password) if url.password else None,
        use_tls=url.scheme == "smtps",
        start_tls=url.scheme == "smtp+starttls",
    )


async def send(settings: Settings, mail: Mail) -> None:
    """SMTP_URL의 서버로 보낸다. 실패하면 예외다(잡이 재시도한다)."""
    server = smtp_server(settings.smtp_url.get_secret_value())
    await aiosmtplib.send(
        _message(settings, mail),
        hostname=server.hostname,
        port=server.port,
        username=server.username,
        password=server.password,
        use_tls=server.use_tls,
        start_tls=server.start_tls,
        timeout=SMTP_TIMEOUT,
    )


async def send_mail(mail: Mail, context: JobContext = JOB_CONTEXT) -> None:
    await send(context.settings, mail)


SEND_MAIL = Job("mail.send", send_mail)
